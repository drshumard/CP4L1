"""
FastAPI routes for the Google Calendar Meet attachment flow.

- Admin endpoints (JWT admin only): register, list, renew, stop watch channels
- Public webhook: POST /api/google/calendar-webhook (verified by channel token)
- Background task: periodic watch renewal before expiry
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Request, Header, status
from motor.motor_asyncio import AsyncIOMotorClient

from services import google_calendar as gc

logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "client_journey")
_mongo_client = AsyncIOMotorClient(MONGO_URL)
db = _mongo_client[DB_NAME]

router = APIRouter(prefix="/api/google", tags=["google-calendar"])

# Renew watches this many hours before they expire
RENEW_LEAD_HOURS = 24


# ---------------------------------------------------------------------------
# Auth helper (local copy of admin check; avoids circular import with server.py)
# ---------------------------------------------------------------------------
async def _require_admin(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = auth_header[7:]
    try:
        payload = jwt.decode(
            token,
            os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production"),
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Mongo helpers for watch state
# ---------------------------------------------------------------------------
async def _upsert_watch(doc: dict) -> None:
    await db.calendar_watches.update_one(
        {"calendar_email": doc["calendar_email"]},
        {"$set": doc},
        upsert=True,
    )


async def _get_watch(calendar_email: str) -> Optional[dict]:
    return await db.calendar_watches.find_one({"calendar_email": calendar_email}, {"_id": 0})


async def _get_watch_by_channel(channel_id: str) -> Optional[dict]:
    return await db.calendar_watches.find_one({"channel_id": channel_id}, {"_id": 0})


async def _delete_watch(calendar_email: str) -> None:
    await db.calendar_watches.delete_one({"calendar_email": calendar_email})


async def _list_watches() -> list[dict]:
    cursor = db.calendar_watches.find({}, {"_id": 0})
    return [w async for w in cursor]


# ---------------------------------------------------------------------------
# Core: register / stop / renew
# ---------------------------------------------------------------------------
async def register_for_calendar(calendar_email: str) -> dict:
    """Register a watch channel for a single calendar. Idempotent-ish:
    stops any existing channel first.
    """
    existing = await _get_watch(calendar_email)
    if existing and existing.get("channel_id") and existing.get("resource_id"):
        try:
            await gc.stop_watch(calendar_email, existing["channel_id"], existing["resource_id"])
        except Exception as e:
            logger.warning("Failed to stop existing channel for %s: %s", calendar_email, e)

    info = await gc.register_watch(calendar_email)
    exp = gc.expiration_dt(info.get("expiration_ms"))

    doc = {
        "calendar_email": calendar_email,
        "channel_id": info["channel_id"],
        "resource_id": info["resource_id"],
        "expiration_ms": info["expiration_ms"],
        "expires_at": exp.isoformat() if exp else None,
        "sync_token": info.get("sync_token"),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    await _upsert_watch(doc)
    logger.info("Registered watch on %s (channel=%s, expires=%s)", calendar_email, info["channel_id"], exp)
    return doc


async def register_all() -> list[dict]:
    cal_map = gc.consultant_calendar_map()
    results = []
    for consultant_id, email in cal_map.items():
        try:
            doc = await register_for_calendar(email)
            doc["consultant_id"] = consultant_id
            results.append(doc)
        except Exception as e:
            logger.exception("Failed to register watch for %s", email)
            results.append({"calendar_email": email, "error": str(e)})
    return results


async def renew_if_expiring() -> list[dict]:
    """Re-register watches that expire within RENEW_LEAD_HOURS."""
    threshold = datetime.now(timezone.utc) + timedelta(hours=RENEW_LEAD_HOURS)
    renewed = []
    for w in await _list_watches():
        exp_iso = w.get("expires_at")
        if not exp_iso:
            continue
        try:
            exp = datetime.fromisoformat(exp_iso)
        except ValueError:
            continue
        if exp <= threshold:
            try:
                doc = await register_for_calendar(w["calendar_email"])
                renewed.append(doc)
            except Exception as e:
                logger.exception("Renewal failed for %s", w["calendar_email"])
                renewed.append({"calendar_email": w["calendar_email"], "error": str(e)})
    return renewed


# ---------------------------------------------------------------------------
# Webhook handling: incremental sync + Meet attach + persist + email hook
# ---------------------------------------------------------------------------
async def _process_push(calendar_email: str) -> dict:
    """Do incremental sync for calendar_email, patch any matching events,
    save Meet URLs into users.booking_info.meet_link."""
    watch = await _get_watch(calendar_email)
    if not watch:
        logger.warning("No watch record for %s; ignoring push", calendar_email)
        return {"status": "no_watch"}

    sync_token = watch.get("sync_token")
    if not sync_token:
        # Bootstrap freshly
        new_token = await gc.bootstrap_sync_token(calendar_email)
        await _upsert_watch({**watch, "sync_token": new_token})
        return {"status": "bootstrapped"}

    events, new_token, needs_full = await gc.list_events_incremental(calendar_email, sync_token)
    if needs_full:
        logger.info("Sync token expired for %s, re-bootstrapping", calendar_email)
        fresh = await gc.bootstrap_sync_token(calendar_email)
        await _upsert_watch({**watch, "sync_token": fresh})
        return {"status": "resynced"}

    attached: list[dict] = []
    for ev in events:
        if ev.get("status") == "cancelled":
            continue
        if not gc.is_pb_meet_event(ev):
            continue
        if gc.event_has_meet(ev):
            # Already has a Meet link — just make sure we've saved it
            meet_url = gc._extract_meet_url(ev)
            if meet_url:
                await _save_meet_url(ev, meet_url, calendar_email)
            continue
        try:
            meet_url = await gc.attach_meet(calendar_email, ev["id"])
            if meet_url:
                saved = await _save_meet_url(ev, meet_url, calendar_email)
                attached.append({"event_id": ev["id"], "meet_url": meet_url, "matched_booking": saved})
        except Exception as e:
            logger.exception("Failed to attach Meet to event %s on %s", ev.get("id"), calendar_email)
            attached.append({"event_id": ev.get("id"), "error": str(e)})

    if new_token:
        await _upsert_watch({**watch, "sync_token": new_token})

    return {"status": "processed", "changed_events": len(events), "attached": attached}


async def _save_meet_url(event: dict, meet_url: str, calendar_email: str) -> bool:
    """Match event to a users.booking_info record by start_time + consultant_id,
    then write meet_link. Returns True if a booking was matched.
    """
    start = (event.get("start") or {}).get("dateTime")
    if not start:
        return False

    # Map calendar_email back to PB consultant_id
    consultant_id = None
    for cid, email in gc.consultant_calendar_map().items():
        if email.lower() == calendar_email.lower():
            consultant_id = cid
            break

    # Match a booking where session_start is within 1 minute of the event start
    try:
        event_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except ValueError:
        return False

    window_start = (event_dt - timedelta(minutes=1)).isoformat()
    window_end = (event_dt + timedelta(minutes=1)).isoformat()

    filter_q = {
        "booking_info.session_start": {"$gte": window_start, "$lte": window_end},
    }
    if consultant_id:
        filter_q["booking_info.consultant_id"] = consultant_id

    user = await db.users.find_one(filter_q, {"_id": 0, "email": 1, "booking_info": 1})
    if not user:
        logger.warning("No matching booking for event at %s on %s", start, calendar_email)
        return False

    await db.users.update_one(
        {"email": user["email"]},
        {
            "$set": {
                "booking_info.meet_link": meet_url,
                "booking_info.gcal_event_id": event.get("id"),
                "booking_info.gcal_calendar": calendar_email,
            }
        },
    )
    logger.info("Saved meet_link for %s (event=%s)", user["email"], event.get("id"))
    # TODO: trigger patient email with meet_url (SMTP2GO — to be wired up)
    return True


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------
@router.post("/calendar-webhook")
async def calendar_webhook(
    request: Request,
    x_goog_channel_id: Optional[str] = Header(None),
    x_goog_resource_id: Optional[str] = Header(None),
    x_goog_resource_state: Optional[str] = Header(None),
    x_goog_channel_token: Optional[str] = Header(None),
):
    """Receives push notifications from Google Calendar.
    Verified via X-Goog-Channel-Token matching our stored watch_token().
    """
    expected = gc.watch_token()
    if expected and x_goog_channel_token != expected:
        logger.warning("Calendar webhook: token mismatch (channel=%s)", x_goog_channel_id)
        raise HTTPException(status_code=401, detail="Invalid channel token")

    logger.info(
        "Calendar webhook: channel=%s state=%s resource=%s",
        x_goog_channel_id, x_goog_resource_state, x_goog_resource_id
    )

    if not x_goog_channel_id:
        return {"ok": True, "note": "no channel id"}

    # The `sync` state is a lifecycle ping after channel creation — ack and skip
    if x_goog_resource_state == "sync":
        return {"ok": True, "note": "sync acknowledged"}

    watch = await _get_watch_by_channel(x_goog_channel_id)
    if not watch:
        logger.warning("Unknown channel id %s — acking but not processing", x_goog_channel_id)
        return {"ok": True, "note": "unknown channel"}

    # Process in background so Google sees a fast 200 (webhooks retry if slow/5xx)
    asyncio.create_task(_safe_process(watch["calendar_email"]))
    return {"ok": True}


async def _safe_process(calendar_email: str):
    try:
        await _process_push(calendar_email)
    except Exception:
        logger.exception("Background processing failed for %s", calendar_email)


@router.post("/admin/watches/register")
async def admin_register(request: Request):
    await _require_admin(request)
    result = await register_all()
    return {"registered": result}


@router.post("/admin/watches/renew")
async def admin_renew(request: Request):
    await _require_admin(request)
    result = await renew_if_expiring()
    return {"renewed": result}


@router.get("/admin/watches")
async def admin_list(request: Request):
    await _require_admin(request)
    return {"watches": await _list_watches()}


@router.post("/admin/watches/stop")
async def admin_stop_all(request: Request):
    await _require_admin(request)
    stopped = []
    for w in await _list_watches():
        try:
            await gc.stop_watch(w["calendar_email"], w["channel_id"], w["resource_id"])
            await _delete_watch(w["calendar_email"])
            stopped.append({"calendar_email": w["calendar_email"], "stopped": True})
        except Exception as e:
            stopped.append({"calendar_email": w["calendar_email"], "error": str(e)})
    return {"stopped": stopped}


@router.post("/admin/watches/process/{calendar_email}")
async def admin_force_process(calendar_email: str, request: Request):
    """Manually trigger processing for a calendar (useful if a webhook was missed)."""
    await _require_admin(request)
    return await _process_push(calendar_email)


# ---------------------------------------------------------------------------
# Background renewal task (started from server.py lifespan)
# ---------------------------------------------------------------------------
_renewal_task: Optional[asyncio.Task] = None


async def _renewal_loop():
    # Check hourly
    while True:
        try:
            await renew_if_expiring()
        except Exception:
            logger.exception("Renewal loop error")
        await asyncio.sleep(3600)


def start_background_renewal():
    global _renewal_task
    if _renewal_task is None or _renewal_task.done():
        _renewal_task = asyncio.create_task(_renewal_loop())
        logger.info("Google Calendar watch renewal loop started")
