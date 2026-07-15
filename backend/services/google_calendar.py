"""
Google Calendar event sink for portal-created bookings.

The portal is the SOLE creator of events. Each booking:
 1. creates a Meet SPACE via the Meet REST API (NOT Calendar's conferenceData.createRequest)
    with Host Management ON + auto-recording ON. App-created spaces are the key move: only
    spaces this app creates can be member-managed — the members/COHOST API returns 403 on
    Calendar-minted conferences (verified 2026-07-09).
 2. grants the assigned director the formal COHOST role on that space (best-effort), so they
    run their own call with Host Management ON org-wide.
 3. inserts the calendar event on the director's calendar with the space attached as a
    native Meet conference (conferenceData + conferenceDataVersion=1 → normal "Join" chip).

Auth: the same service_account.json as Drive, via domain-wide delegation impersonating a
single Workspace user (GOOGLE_CALENDAR_SUBJECT) that has write access to every director
calendar. That user owns every space, so recordings/transcripts land in their Drive.
Meet-space creation requires impersonating a real Workspace user — a bare service account
can't mint Meet conferences.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
_DEFAULT_KEY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "service_account.json")


def _key_path() -> str:
    return os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", _DEFAULT_KEY_PATH)


def _subject_email() -> str:
    """Workspace user the SA impersonates. Defaults to the same user Drive impersonates."""
    return (
        os.environ.get("GOOGLE_CALENDAR_SUBJECT")
        or os.environ.get("GOOGLE_DRIVE_IMPERSONATE_USER")
        or "drjason@drshumard.com"
    )


def is_configured() -> bool:
    """True if the service-account key file is present (calendar ops can be attempted)."""
    return os.path.exists(_key_path())


def _service():
    """Build a Calendar v3 client. Blocking — call via asyncio.to_thread."""
    creds = service_account.Credentials.from_service_account_file(
        _key_path(), scopes=SCOPES, subject=_subject_email()
    )
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _extract_meet_url(event: dict) -> Optional[str]:
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for entry in (event.get("conferenceData") or {}).get("entryPoints", []) or []:
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            return entry["uri"]
    return None


# --------------------------------------------------------------------------- busy (read)
#
# Busy time is derived from the EVENTS API, not freebusy.query: free/busy returns only opaque
# intervals with no titles, and we must NEVER treat an event titled "Availability" as busy (it is a
# director's availability marker) even if it's mis-marked opaque. So we read events and classify
# each — busy iff confirmed, marked busy (opaque), and not an "Availability" marker. events.list
# works with the calendar.events scope, so no extra free/busy scope is needed.

READ_SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def _busy_service():
    creds = service_account.Credentials.from_service_account_file(
        _key_path(), scopes=READ_SCOPES, subject=_subject_email()
    )
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _event_is_busy(ev: dict) -> bool:
    """True if the event actually occupies the director: confirmed, marked busy (opaque), and NOT
    an "Availability" marker. Availability blocks never count as busy, whatever their transparency."""
    if ev.get("status") == "cancelled":
        return False
    if ev.get("transparency") == "transparent":          # owner explicitly marked it "free"
        return False
    if (ev.get("summary") or "").strip().lower() == "availability":
        return False
    return True


def _event_interval(ev: dict):
    """(start_iso, end_iso) for a timed event; None for all-day/date-only events (ignored, so a
    single all-day 'busy' event can't wipe out a whole day of bookable slots)."""
    start = (ev.get("start") or {}).get("dateTime")
    end = (ev.get("end") or {}).get("dateTime")
    return (start, end) if (start and end) else None


def _sync_list_busy(calendar_id, time_min_iso, time_max_iso):
    svc = _busy_service()
    out, page = [], None
    while True:
        resp = svc.events().list(
            calendarId=calendar_id, timeMin=time_min_iso, timeMax=time_max_iso,
            singleEvents=True, orderBy="startTime", maxResults=250, pageToken=page,
        ).execute()
        for ev in resp.get("items", []):
            if _event_is_busy(ev):
                iv = _event_interval(ev)
                if iv:
                    out.append(iv)
        page = resp.get("nextPageToken")
        if not page:
            break
    return out


async def get_busy_intervals(*, calendar_ids, time_min_iso, time_max_iso) -> dict:
    """Busy intervals per calendar from the events API, honoring transparency + the "Availability"
    exclusion. Returns {calendar_id: {"errors": <str|None>, "busy": [(start_iso, end_iso), ...]}}.
    Intervals are per-event (unmerged — the availability engine subtracts overlaps fine); all-day
    events are ignored. One events.list per calendar (paginated); a bad calendar => its "errors"."""
    out = {}
    for cal in [c for c in (calendar_ids or []) if c]:
        try:
            out[cal] = {"errors": None,
                        "busy": await asyncio.to_thread(_sync_list_busy, cal, time_min_iso, time_max_iso)}
        except Exception as e:
            out[cal] = {"errors": str(e), "busy": []}
    return out


async def is_busy(*, calendar_id: Optional[str], start_iso: str, end_iso: str) -> Optional[bool]:
    """Live guard for the commit path: True if a real busy event (not transparent, not an
    "Availability" marker) overlaps [start, end); False if clear; None if the check couldn't run
    (caller should FAIL-OPEN so a Google outage can't halt bookings). One events.list for the slot."""
    if not calendar_id:
        return None
    try:
        res = await get_busy_intervals(calendar_ids=[calendar_id], time_min_iso=start_iso, time_max_iso=end_iso)
        info = res.get(calendar_id) or {}
        if info.get("errors"):
            logger.warning("busy check: calendar %s error %s", calendar_id, info["errors"])
            return None
        return len(info.get("busy") or []) > 0
    except Exception as e:
        logger.warning("busy check failed for %s (%s) — failing open", calendar_id, e)
        return None


# --------------------------------------------------------------------------- create

MEET_API = "https://meet.googleapis.com"


def _meet_session() -> AuthorizedSession:
    creds = service_account.Credentials.from_service_account_file(
        _key_path(), scopes=MEET_SCOPES, subject=_subject_email()
    )
    return AuthorizedSession(creds)


def _sync_create_event_with_meet(calendar_id, summary, description, start_iso, end_iso, tz,
                                 attendee_email, director_email, request_id):
    # 1) Meet space via the Meet API — app-created, so it's configurable + member-manageable
    #    (Calendar-minted conferences 403 on member management). Owner = the impersonated
    #    subject, so recordings land in their Drive.
    meet = _meet_session()
    resp = meet.post(f"{MEET_API}/v2/spaces", json={"config": {
        "moderation": "ON",
        "artifactConfig": {"recordingConfig": {"autoRecordingGeneration": "ON"}},
    }}, timeout=30)
    resp.raise_for_status()
    space = resp.json()
    meet_link = space["meetingUri"]
    rec = (((space.get("config") or {}).get("artifactConfig") or {})
           .get("recordingConfig") or {}).get("autoRecordingGeneration")
    if rec != "ON":
        logger.warning("Meet space %s created WITHOUT auto-recording (got %s) — check the "
                       "Workspace edition supports recording", space.get("name"), rec)

    # 2) Formal COHOST for the assigned director. Best-effort — never blocks the booking;
    #    409 = already a member = fine.
    d_email = (director_email or "").strip()
    if d_email:
        r = meet.post(f"{MEET_API}/v2beta/{space['name']}/members",
                      json={"email": d_email, "role": "COHOST"}, timeout=20)
        if r.status_code not in (200, 409):
            logger.warning("Director co-host %s on %s failed: %s %s",
                           d_email, space.get("name"), r.status_code, (r.text or "")[:200])

    # 3) Calendar event with the space attached as a native Meet conference (normal chip).
    body = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_iso, "timeZone": tz},
        "end": {"dateTime": end_iso, "timeZone": tz},
        "conferenceData": {
            "conferenceSolution": {"key": {"type": "hangoutsMeet"}},
            "conferenceId": space["meetingCode"],
            "entryPoints": [{"entryPointType": "video", "uri": meet_link}],
        },
    }
    # Patient + the assigned director. De-duped in case the director is also the organizer.
    attendees = []
    for email in (attendee_email, director_email):
        e = (email or "").strip()
        if e and e.lower() not in {a["email"].lower() for a in attendees}:
            attendees.append({"email": e})
    if attendees:
        body["attendees"] = attendees

    event = (
        _service().events()
        .insert(calendarId=calendar_id, body=body, conferenceDataVersion=1, sendUpdates="none")
        .execute()
    )
    return event.get("id"), meet_link


async def create_event_with_meet(
    *,
    calendar_id: str,
    summary: str,
    description: str,
    start_utc: datetime,
    end_utc: datetime,
    timezone: str,
    attendee_email: Optional[str] = None,
    director_email: Optional[str] = None,
    request_id: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """Create a Meet space (Host Management ON, auto-recording ON) + a calendar event with it
    attached; return (event_id, meet_link). Raises on failure (the caller compensates by
    releasing the booking hold). ``director_email`` is added as an attendee AND granted the
    formal COHOST role on the space (best-effort). ``request_id`` is legacy (Calendar-conference
    idempotency) and unused since spaces are created via the Meet API."""
    if not calendar_id:
        raise RuntimeError("director has no google_calendar_id configured")
    req_id = request_id or f"cadence-{uuid.uuid4().hex[:24]}"
    return await asyncio.to_thread(
        _sync_create_event_with_meet,
        calendar_id, summary, description, start_utc.isoformat(), end_utc.isoformat(),
        timezone, attendee_email, director_email, req_id,
    )


# --------------------------------------------------------------------------- Meet co-host

# Both must be on the DWD grant: settings (read/patch space config) + created (member
# management on spaces the subject owns — what members.create actually authorizes against).
MEET_SCOPES = [
    "https://www.googleapis.com/auth/meetings.space.settings",
    "https://www.googleapis.com/auth/meetings.space.created",
]
_MEET_CODE_RE = re.compile(r"meet\.google\.com/([a-z0-9-]+)", re.IGNORECASE)


def _sync_add_meet_cohost(meet_link: str, email: str) -> None:
    code_match = _MEET_CODE_RE.search(meet_link or "")
    if not code_match:
        raise ValueError(f"no meeting code in link {meet_link!r}")
    session = _meet_session()
    # Resolve the canonical space name from the meeting code (as the owner), then add the member.
    r = session.get(f"{MEET_API}/v2/spaces/{code_match.group(1)}", timeout=20)
    r.raise_for_status()
    space = r.json()["name"]
    r = session.post(f"{MEET_API}/v2beta/{space}/members",
                     json={"email": email, "role": "COHOST"}, timeout=20)
    if r.status_code == 409:  # already a member — idempotent success
        return
    r.raise_for_status()


async def add_meet_cohost(*, meet_link: Optional[str], email: Optional[str]) -> None:
    """Ops utility: grant ``email`` the formal COHOST role on a booking's Meet space by its
    link. The booking flow grants the director inline at space creation; this exists for
    after-the-fact fixes (works only on spaces this app created — Calendar-minted conferences
    403). Best-effort: never raises."""
    if not meet_link or not email:
        return
    try:
        await asyncio.to_thread(_sync_add_meet_cohost, meet_link, email)
        logger.info("Meet co-host %s added to %s", email, meet_link)
    except Exception as e:
        logger.warning("Meet co-host add for %s failed (%s) — call unaffected; note the "
                       "members API only manages spaces created via the Meet API (pre-2026-07-09 "
                       "bookings were Calendar-minted and always 403).", email, e)


# --------------------------------------------------------------------------- update / delete

def _sync_update_event_time(calendar_id, event_id, start_iso, end_iso, tz):
    service = _service()
    body = {"start": {"dateTime": start_iso, "timeZone": tz}, "end": {"dateTime": end_iso, "timeZone": tz}}
    event = (
        service.events()
        .patch(calendarId=calendar_id, eventId=event_id, body=body, sendUpdates="none")
        .execute()
    )
    return event.get("id"), _extract_meet_url(event)


async def update_event_time(*, calendar_id, event_id, start_utc, end_utc, timezone) -> tuple[str, Optional[str]]:
    """Move an existing event; Meet link is preserved. Returns (event_id, meet_link)."""
    return await asyncio.to_thread(
        _sync_update_event_time, calendar_id, event_id, start_utc.isoformat(), end_utc.isoformat(), timezone
    )


def _sync_delete_event(calendar_id, event_id):
    service = _service()
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id, sendUpdates="none").execute()
    except HttpError as e:
        # Already gone — treat as success.
        if getattr(e, "status_code", None) in (404, 410) or "404" in str(e) or "410" in str(e):
            logger.info("Calendar event %s already deleted/unknown", event_id)
            return
        raise


async def delete_event(*, calendar_id, event_id) -> None:
    await asyncio.to_thread(_sync_delete_event, calendar_id, event_id)


# --------------------------------------------------------------------------- attendees

def _sync_get_event(calendar_id, event_id):
    return _service().events().get(calendarId=calendar_id, eventId=event_id).execute()


def _sync_set_attendees(calendar_id, event_id, attendees):
    # Calendar treats the attendees array as a whole, so we always send the full merged list.
    # conferenceDataVersion=1 keeps the existing Meet conference intact; sendUpdates="none"
    # avoids emailing the patient on each coordinator change.
    _service().events().patch(
        calendarId=calendar_id, eventId=event_id,
        body={"attendees": attendees}, conferenceDataVersion=1, sendUpdates="none",
    ).execute()


async def add_event_attendees(*, calendar_id, event_id, emails) -> None:
    """Add coordinator email(s) as attendees, preserving existing guests + the Meet link.
    Idempotent: skips emails already on the event. Being on the invite is what grants
    no-knock Meet access."""
    if not calendar_id or not event_id or not emails:
        return

    def _do():
        ev = _sync_get_event(calendar_id, event_id)
        existing = ev.get("attendees", []) or []
        have = {(a.get("email") or "").lower() for a in existing}
        changed = False
        for em in emails:
            if em and em.lower() not in have:
                existing.append({"email": em})
                have.add(em.lower())
                changed = True
        if changed:
            _sync_set_attendees(calendar_id, event_id, existing)

    await asyncio.to_thread(_do)


async def remove_event_attendee(*, calendar_id, event_id, email) -> None:
    """Remove a coordinator from an event's attendees (e.g. when the day's PCC changes)."""
    if not calendar_id or not event_id or not email:
        return

    def _do():
        ev = _sync_get_event(calendar_id, event_id)
        existing = ev.get("attendees", []) or []
        filtered = [a for a in existing if (a.get("email") or "").lower() != email.lower()]
        if len(filtered) != len(existing):
            _sync_set_attendees(calendar_id, event_id, filtered)

    await asyncio.to_thread(_do)
