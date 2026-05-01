"""
Google Calendar integration for attaching Google Meet links to events
synced from Practice Better.

Auth model: Service Account with Domain-Wide Delegation (DWD).
The SA impersonates each practitioner (subject) to watch and patch events
on their calendar without per-user OAuth.

Flow:
    1. `register_watch(calendar_email)` -> Google sends push notifications to
       our webhook whenever the calendar changes. We persist channel metadata
       + sync_token in MongoDB collection `calendar_watches`.
    2. `handle_push(channel_id, resource_id)` -> called by our FastAPI webhook.
       Does an incremental `events.list(syncToken=...)` to pull changed events.
    3. For each changed event whose summary starts with MEET_EVENT_SUMMARY_PREFIX
       and has no conferenceData yet -> `attach_meet(calendar_email, event_id)`.
       Returns the generated Meet URL.
    4. `renew_watch(calendar_email)` -> stop + re-register before channel expiry.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
MEET_PREFIX_ENV = "MEET_EVENT_SUMMARY_PREFIX"
KEY_PATH_ENV = "GOOGLE_SERVICE_ACCOUNT_KEY_PATH"
WATCH_TOKEN_ENV = "GOOGLE_CALENDAR_WATCH_TOKEN"
CONSULTANT_MAP_ENV = "PB_CONSULTANT_CALENDAR_MAP"
WEBHOOK_PATH = "/api/google/calendar-webhook"


def _backend_base_url() -> str:
    """Backend public base URL for webhook callbacks.
    We reuse FRONTEND_URL since the same host serves /api through ingress.
    """
    url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not url:
        raise RuntimeError("FRONTEND_URL env var required for Google Calendar watch webhook URL")
    return url


def _load_credentials(subject_email: str) -> service_account.Credentials:
    """Create DWD-impersonating credentials for the given calendar owner."""
    key_path = os.environ.get(KEY_PATH_ENV)
    if not key_path or not os.path.exists(key_path):
        raise RuntimeError(f"Service account key not found at {key_path!r}")
    creds = service_account.Credentials.from_service_account_file(
        key_path, scopes=SCOPES, subject=subject_email
    )
    return creds


def _calendar_service(subject_email: str):
    """Return a google-api-python-client Calendar service for the subject.
    Blocking — call via `asyncio.to_thread` from async code.
    """
    return build("calendar", "v3", credentials=_load_credentials(subject_email), cache_discovery=False)


def consultant_calendar_map() -> dict[str, str]:
    raw = os.environ.get(CONSULTANT_MAP_ENV, "{}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in %s env var", CONSULTANT_MAP_ENV)
        return {}


def watch_token() -> str:
    return os.environ.get(WATCH_TOKEN_ENV, "")


def meet_prefix() -> str:
    return os.environ.get(MEET_PREFIX_ENV, "").strip()


# ---------------------------------------------------------------------------
# Watch lifecycle (sync wrappers — run inside to_thread)
# ---------------------------------------------------------------------------
def _sync_register_watch(calendar_email: str, webhook_url: str, token: str) -> dict[str, Any]:
    service = _calendar_service(calendar_email)
    channel_id = f"pb-meet-{uuid.uuid4().hex}"
    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
        "token": token,
    }
    resp = service.events().watch(calendarId=calendar_email, body=body).execute()
    # Grab an initial syncToken so future incrementals work.
    sync_token = _sync_bootstrap_sync_token(service, calendar_email)
    return {
        "channel_id": channel_id,
        "resource_id": resp.get("resourceId"),
        "expiration_ms": int(resp.get("expiration", 0)) if resp.get("expiration") else None,
        "sync_token": sync_token,
    }


def _sync_bootstrap_sync_token(service, calendar_email: str) -> Optional[str]:
    """Initial full-list just to acquire a nextSyncToken for incrementals.
    NOTE: syncToken cannot be used alongside request filters (like showDeleted,
    singleEvents, q, timeMin/Max). We call with NO filters so future incrementals
    work unrestricted.
    """
    page_token = None
    next_sync_token: Optional[str] = None
    while True:
        resp = service.events().list(
            calendarId=calendar_email,
            maxResults=2500,
            pageToken=page_token,
        ).execute()
        page_token = resp.get("nextPageToken")
        if not page_token:
            next_sync_token = resp.get("nextSyncToken")
            break
    return next_sync_token


def _sync_stop_channel(calendar_email: str, channel_id: str, resource_id: str) -> None:
    service = _calendar_service(calendar_email)
    try:
        service.channels().stop(body={"id": channel_id, "resourceId": resource_id}).execute()
    except HttpError as e:
        # 404 means already stopped — treat as success.
        if getattr(e, "status_code", None) == 404 or "Channel" in str(e):
            logger.info("Channel %s already stopped or unknown", channel_id)
            return
        raise


def _sync_list_events_incremental(calendar_email: str, sync_token: str) -> tuple[list[dict], Optional[str], bool]:
    """Returns (events, new_sync_token, needs_full_resync).
    If Google returns 410 Gone, caller must re-bootstrap (full list) to get a fresh syncToken.
    """
    service = _calendar_service(calendar_email)
    page_token = None
    events: list[dict] = []
    next_sync_token: Optional[str] = None
    while True:
        try:
            resp = service.events().list(
                calendarId=calendar_email,
                syncToken=sync_token,
                pageToken=page_token,
            ).execute()
        except HttpError as e:
            if getattr(e, "status_code", 0) == 410 or "410" in str(e):
                return [], None, True
            raise
        events.extend(resp.get("items", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            next_sync_token = resp.get("nextSyncToken")
            break
    return events, next_sync_token, False


def _sync_attach_meet(calendar_email: str, event_id: str) -> Optional[str]:
    """Patch an event to add conferenceData.createRequest with Google Meet.
    Returns the Meet URL, or None if Google couldn't create it.
    """
    service = _calendar_service(calendar_email)
    request_id = f"pb-meet-{uuid.uuid4().hex[:16]}"
    body = {
        "conferenceData": {
            "createRequest": {
                "requestId": request_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }
    }
    resp = service.events().patch(
        calendarId=calendar_email,
        eventId=event_id,
        body=body,
        conferenceDataVersion=1,
        sendUpdates="none",
    ).execute()
    return _extract_meet_url(resp)


def _extract_meet_url(event: dict) -> Optional[str]:
    conf = event.get("conferenceData") or {}
    # hangoutLink is the top-level convenience field for Meet events
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for entry in conf.get("entryPoints", []) or []:
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            return entry["uri"]
    return None


# ---------------------------------------------------------------------------
# Public async helpers (thin wrappers)
# ---------------------------------------------------------------------------
async def register_watch(calendar_email: str) -> dict[str, Any]:
    webhook_url = f"{_backend_base_url()}{WEBHOOK_PATH}"
    token = watch_token()
    return await asyncio.to_thread(_sync_register_watch, calendar_email, webhook_url, token)


async def stop_watch(calendar_email: str, channel_id: str, resource_id: str) -> None:
    await asyncio.to_thread(_sync_stop_channel, calendar_email, channel_id, resource_id)


async def list_events_incremental(calendar_email: str, sync_token: str):
    return await asyncio.to_thread(_sync_list_events_incremental, calendar_email, sync_token)


async def bootstrap_sync_token(calendar_email: str) -> Optional[str]:
    def _do():
        service = _calendar_service(calendar_email)
        return _sync_bootstrap_sync_token(service, calendar_email)
    return await asyncio.to_thread(_do)


async def attach_meet(calendar_email: str, event_id: str) -> Optional[str]:
    return await asyncio.to_thread(_sync_attach_meet, calendar_email, event_id)


def is_pb_meet_event(event: dict) -> bool:
    """Does this event's summary match our target naming convention?"""
    prefix = meet_prefix()
    if not prefix:
        return False
    summary = (event.get("summary") or "").strip()
    return summary.startswith(prefix)


def event_has_meet(event: dict) -> bool:
    return bool(_extract_meet_url(event))


def expiration_dt(expiration_ms: Optional[int]) -> Optional[datetime]:
    if not expiration_ms:
        return None
    return datetime.fromtimestamp(expiration_ms / 1000, tz=timezone.utc)
