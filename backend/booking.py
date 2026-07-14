"""
FastAPI Routes for Practice Better Booking System (v2)

Improvements:
- Slot validation before booking
- Idempotency protection
- Proper health check status codes
- Structured logging with correlation IDs
- Future date validation
- Background cache refresh for instant loading
- Auto-save client_record_id to user database on successful booking
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime, date, timezone as tz, timedelta
from zoneinfo import ZoneInfo
import httpx
import logging
import uuid
import os
import copy
import time
import asyncio
import jwt
import re as re_module

from services.practice_better_v2 import (
    PracticeBetterService,
    BookingRequest,
    BookingResult,
    BookingError,
    SlotUnavailableError,
    TimeSlot,
    ClientProfile,
    get_practice_better_service,
    get_idempotency_store,
    IdempotencyStore,
)
from services.client_cache import get_client_cache
from services import availability as availability_engine
from services import assignment as assignment_service
from services import google_calendar as gcal
from services import booking_email

# Import database connection
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "client_journey")
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/booking", tags=["booking"])

# Per-email booking cooldown to prevent rapid-fire requests
_booking_cooldowns: dict = {}  # email -> timestamp of last attempt
BOOKING_COOLDOWN_SECONDS = 30


# ============================================================================
# Response Models
# ============================================================================

class AvailabilitySlot(BaseModel):
    """Single availability slot for frontend"""
    start_time: datetime
    end_time: datetime
    duration: int
    consultant_id: str


class AvailabilityResponse(BaseModel):
    """Aggregated availability across all consultants"""
    slots: List[AvailabilitySlot]
    dates_with_availability: List[str]


class BookSessionRequest(BaseModel):
    """Request body for booking a session"""
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    timezone: str
    slot_start_time: str
    consultant_id: str
    notes: Optional[str] = None
    
    @field_validator('first_name', 'last_name', 'timezone', 'consultant_id', 'slot_start_time')
    @classmethod
    def not_empty(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise ValueError(f'{info.field_name.replace("_", " ").title()} is required')
        return v.strip()
    
    @field_validator('phone', 'notes')
    @classmethod  
    def clean_optional(cls, v: Optional[str]) -> Optional[str]:
        if v and v.strip():
            return v.strip()
        return None
    
    @field_validator('slot_start_time')
    @classmethod
    def validate_future_time(cls, v: str) -> str:
        """Validate that slot_start_time is in the future."""
        try:
            slot_time = datetime.fromisoformat(v.replace("Z", "+00:00"))
            now = datetime.now(tz.utc)
            
            if slot_time <= now:
                raise ValueError("Selected time slot has already passed")
            
            max_future = now + timedelta(days=90)
            if slot_time > max_future:
                raise ValueError("Cannot book more than 90 days in advance")
            
            return v
        except ValueError as e:
            if "passed" in str(e) or "90 days" in str(e):
                raise
            raise ValueError("Invalid date/time format")


class BookSessionResponse(BaseModel):
    """Response after successful booking.

    client_record_id / meet_link are Optional because the portal-owned flow treats PB as
    a best-effort clinical mirror — on the PB-pending branch there is no PB record id yet.
    session_id falls back to booking_id so it is always a non-empty string.
    """
    success: bool
    session_id: str
    client_record_id: Optional[str] = None
    session_start: datetime
    session_end: datetime
    duration: int
    message: str
    is_new_client: bool = False
    booking_id: Optional[str] = None
    meet_link: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# ============================================================================
# Dependencies
# ============================================================================

# Cache TTL: 2 minutes (120 seconds) for background refresh
# Frontend polling is now just a fallback
AVAILABILITY_CACHE_TTL = int(os.environ.get("AVAILABILITY_CACHE_TTL", "120"))  # 2 minutes default
BACKGROUND_REFRESH_INTERVAL = int(os.environ.get("BACKGROUND_REFRESH_INTERVAL", "120"))  # 2 minutes

_availability_cache: dict = {}
_background_task: Optional[asyncio.Task] = None
_background_task_running = False


def get_correlation_id(
    x_correlation_id: Optional[str] = Header(None, alias="X-Correlation-ID")
) -> str:
    """Extract or generate correlation ID for request tracing"""
    return x_correlation_id or str(uuid.uuid4())[:8]


async def _pb_background_sync_loop():
    """Background Practice Better client-sync loop.

    Availability is NO LONGER polled from Practice Better — the portal computes availability
    locally (booking_engine='local'), so the old per-cycle get_availability poll is removed.
    This loop only keeps PB data fresh: an incremental client cache sync (~30 min, pulls only
    clients created since the last run — a full seed is a one-time/admin action) and the
    user<->PB record-id match in Mongo (~2 hours, no extra API calls)."""
    global _background_task_running

    _background_task_running = True
    logger.info("Starting background PB client-sync task (availability polling disabled)")
    sync_counter = 0
    mongo_sync_counter = 0
    CLIENT_SYNC_EVERY_N_CYCLES = 15  # ~30 min at 2-min intervals
    MONGO_SYNC_EVERY_N_CYCLES = 60   # ~2 hours at 2-min intervals

    while _background_task_running:
        try:
            # Incremental client sync (~30 min): pull only clients created since the last run
            # (the cache already holds the rest). Self-seeds with a full sync if the cache is empty.
            sync_counter += 1
            if sync_counter >= CLIENT_SYNC_EVERY_N_CYCLES:
                sync_counter = 0
                try:
                    pb_service = get_practice_better_service()
                    from services.client_sync import ClientSyncService
                    sync_service = ClientSyncService(
                        base_url=pb_service.config.base_url,
                        token_getter=pb_service.token_manager.get_token,
                    )
                    result = await sync_service.sync_recent_clients()
                    logger.info(f"[background] Incremental client sync: {result}")
                except Exception as e:
                    logger.warning(f"[background] Client sync failed: {e}")

            # Mongo match (~2 hours): map cached PB records onto local users (no PB API calls).
            mongo_sync_counter += 1
            if mongo_sync_counter >= MONGO_SYNC_EVERY_N_CYCLES:
                mongo_sync_counter = 0
                try:
                    await sync_pb_clients_to_mongo(correlation_id="bg-mongo-sync")
                except Exception as e:
                    logger.warning(f"[background] MongoDB PB sync failed: {e}")
        except Exception as e:
            logger.error(f"[background] Error in PB client-sync loop: {e}")

        await asyncio.sleep(BACKGROUND_REFRESH_INTERVAL)

    logger.info("Background PB client-sync task stopped")


def start_background_refresh():
    """Start the background PB client-sync task."""
    global _background_task

    if _background_task is None or _background_task.done():
        _background_task = asyncio.create_task(_pb_background_sync_loop())
        logger.info("Background PB client-sync task started")


def stop_background_refresh():
    """Stop the background refresh task"""
    global _background_task_running, _background_task
    
    _background_task_running = False
    if _background_task:
        _background_task.cancel()
        _background_task = None
    logger.info("Background cache refresh task stopped")



async def sync_pb_clients_to_mongo(
    pb_service: PracticeBetterService = None,
    correlation_id: str = "mongo-sync"
):
    """
    Sync pb_client_record_id from the local SQLite cache into MongoDB users.
    Reads the already-synced SQLite cache (no extra PB API calls).
    Matches by email. Only updates users who are missing or have a stale PB ID.
    """
    from services.client_cache import get_client_cache
    cache = get_client_cache()
    all_clients = cache.get_all_clients()

    if not all_clients:
        logger.info(f"[{correlation_id}] No cached clients to sync to MongoDB")
        return {"total_cached": 0, "updated": 0}

    updated_count = 0
    for client in all_clients:
        pb_email = (client.get("email") or "").lower().strip()
        pb_record_id = client.get("record_id")
        if not pb_email or not pb_record_id:
            continue

        email_escaped = re_module.escape(pb_email)
        result = await db.users.update_one(
            {
                "email": {"$regex": f"^{email_escaped}$", "$options": "i"},
                "$or": [
                    {"pb_client_record_id": {"$exists": False}},
                    {"pb_client_record_id": None},
                    {"pb_client_record_id": ""},
                ]
            },
            {"$set": {"pb_client_record_id": pb_record_id}}
        )
        if result.modified_count > 0:
            updated_count += 1

    logger.info(f"[{correlation_id}] MongoDB PB sync complete: {len(all_clients)} cached clients checked, {updated_count} MongoDB users updated")
    return {"total_cached": len(all_clients), "updated": updated_count}



async def _legacy_consultant_ids() -> list:
    """Active directors' PB consultant ids — the availability source for the legacy (pb)
    engine, so the Directors admin controls who's bookable in BOTH engines. Directors
    without a pb_consultant_id simply don't appear."""
    ids = set()
    async for d in db.directors.find({"active": True}, {"_id": 0, "pb_consultant_id": 1}):
        pid = (d.get("pb_consultant_id") or "").strip()
        if pid:
            ids.add(pid)
    return sorted(ids)


async def get_cached_availability(
    start_date: str,
    days: int,
    pb_service: PracticeBetterService
) -> tuple:
    """Get availability with caching - returns cached data instantly if available"""
    consultant_ids = await _legacy_consultant_ids()
    if not consultant_ids:
        logger.warning("Legacy availability: no active director has a pb_consultant_id — patients see no slots")
    cache_key = f"{start_date}:{days}:{','.join(consultant_ids) or 'none'}"

    # Check if we have cached data (even if slightly stale, return it for instant loading)
    if cache_key in _availability_cache:
        cached = _availability_cache[cache_key]
        # Return cached data - background task keeps it fresh
        logger.debug(f"Returning cached availability (age: {time.time() - cached.get('refreshed_at', 0):.0f}s)")
        return cached["data"]

    # No cache - fetch fresh (this only happens on first request)
    logger.info(f"Cache miss for {cache_key}, fetching fresh data")
    slots, dates = await pb_service.get_availability(start_date, days, consultant_ids=consultant_ids)
    
    _availability_cache[cache_key] = {
        "data": (slots, dates),
        "expires_at": time.time() + AVAILABILITY_CACHE_TTL,
        "refreshed_at": time.time()
    }
    
    # Start background refresh if not running
    start_background_refresh()
    
    return (slots, dates)


# ============================================================================
# Routes
# ============================================================================

async def _booking_engine() -> str:
    """Which availability/booking engine is active: 'local' (portal) or 'pb' (legacy).

    Defaults to 'pb' so behavior is unchanged until cutover flips the flag
    (settings.app_settings.booking_engine -> 'local'). See CADENCE_MIGRATION_PLAN §7.
    """
    try:
        doc = await db.settings.find_one({"_id": "app_settings"}, {"_id": 0, "booking_engine": 1})
        return (doc or {}).get("booking_engine", "pb")
    except Exception:
        return "pb"


def get_pb_service_optional() -> Optional[PracticeBetterService]:
    """PB is required only for the legacy 'pb' engine. With the 'local' engine (and in
    local dev where PB env vars are unset), return None instead of raising so endpoints
    that branch on the engine aren't 500'd at dependency-resolution time. The local code
    paths never touch PB; the PB paths already guard/try-except around the service."""
    try:
        return get_practice_better_service()
    except Exception:
        return None


@router.get("/availability", response_model=AvailabilityResponse)
async def get_availability(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    days: int = Query(14, ge=1, le=60, description="Number of days to fetch"),
    pb_service: Optional[PracticeBetterService] = Depends(get_pb_service_optional),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Get available booking slots.

    With booking_engine='local' (post-cutover), availability is computed from the
    portal's own rules/holidays/bookings (no Practice Better polling). The response
    shape is identical to the legacy PB path so the patient widget is unchanged.
    """
    try:
        date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if date.fromisoformat(start_date) < date.today():
        start_date = date.today().isoformat()

    logger.info(f"[{correlation_id}] Fetching availability from {start_date} for {days} days")

    engine = await _booking_engine()
    if engine == "local":
        try:
            slots_data, dates = await availability_engine.compute_availability_response(db, start_date, days)
            return AvailabilityResponse(
                slots=[AvailabilitySlot(**s) for s in slots_data],
                dates_with_availability=dates,
            )
        except Exception as e:
            logger.error(f"[{correlation_id}] Local availability error: {e}")
            raise HTTPException(status_code=503, detail="Unable to fetch availability")

    try:
        slots, dates = await get_cached_availability(start_date, days, pb_service)

        return AvailabilityResponse(
            slots=[
                AvailabilitySlot(
                    start_time=slot.start_time,
                    end_time=slot.end_time,
                    duration=slot.duration,
                    consultant_id=slot.consultant_id
                )
                for slot in slots
            ],
            dates_with_availability=dates
        )

    except Exception as e:
        logger.error(f"[{correlation_id}] Error fetching availability: {e}")
        raise HTTPException(status_code=503, detail="Unable to fetch availability")


@router.get("/availability/{date_str}")
async def get_availability_for_date(
    date_str: str,
    pb_service: Optional[PracticeBetterService] = Depends(get_pb_service_optional),
    correlation_id: str = Depends(get_correlation_id)
):
    """Get available slots for a specific date"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if target_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot fetch availability for past dates")

    engine = await _booking_engine()
    if engine == "local":
        try:
            slots_data, _ = await availability_engine.compute_availability_response(db, date_str, 1)
            date_slots = [
                AvailabilitySlot(**s)
                for s in slots_data
                if s["start_time"].strftime("%Y-%m-%d") == date_str
            ]
            return {"date": date_str, "slots": date_slots}
        except Exception as e:
            logger.error(f"[{correlation_id}] Local availability error for {date_str}: {e}")
            raise HTTPException(status_code=503, detail="Unable to fetch availability")

    try:
        slots, _ = await get_cached_availability(date_str, 1, pb_service)

        date_slots = [
            AvailabilitySlot(
                start_time=slot.start_time,
                end_time=slot.end_time,
                duration=slot.duration,
                consultant_id=slot.consultant_id
            )
            for slot in slots
            if slot.start_time.strftime("%Y-%m-%d") == date_str
        ]

        return {"date": date_str, "slots": date_slots}

    except Exception as e:
        logger.error(f"[{correlation_id}] Error fetching availability for {date_str}: {e}")
        raise HTTPException(status_code=503, detail="Unable to fetch availability")


def _decode_optional_jwt_user_id(authorization: Optional[str]) -> Optional[str]:
    """Decode the Authorization: Bearer <JWT> header if present. Returns user_id (sub) or None.
    Silent on failure — this is an optional auth hint, not a gate.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    secret_key = os.environ.get("JWT_SECRET_KEY")
    if not secret_key:
        # No insecure literal fallback: without the shared secret we can't validate, so
        # skip the optional decode (the caller falls back to email match). This also fixes
        # the prior mismatch with server.py's JWT_SECRET_KEY.
        return None
    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


async def _require_admin(request: Request) -> dict:
    """Hard admin gate for booking.py's admin utility endpoints. Fails CLOSED when
    JWT_SECRET_KEY is unset — never falls back to a known literal a caller could sign
    tokens with. Returns the admin user doc, or raises."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    secret_key = os.environ.get("JWT_SECRET_KEY")
    if not secret_key:
        logger.error("JWT_SECRET_KEY is not set — refusing admin auth")
        raise HTTPException(status_code=503, detail="Auth is not configured")
    try:
        payload = jwt.decode(auth_header[7:], secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ============================================================================
# Portal-owned booking (booking_engine == "local")
# ============================================================================

def _now_iso() -> str:
    return datetime.now(tz.utc).isoformat()


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if isinstance(value, datetime) else str(value)


async def _load_app_settings() -> dict:
    return await db.settings.find_one({"_id": "app_settings"}, {"_id": 0}) or {}


def _portal_session(settings: dict) -> dict:
    """The session the patient portal books. First portal-visible session, else the legacy
    single session synthesized from session_title/description/slot_minutes."""
    for s in (settings.get("sessions") or []):
        if s.get("portal_visible"):
            return s
    sessions = settings.get("sessions") or []
    if sessions:
        return sessions[0]
    return {
        "id": "strategy",
        "title": settings.get("session_title") or "Strategy Session",
        "description": settings.get("session_description") or "",
        "duration_minutes": int(settings.get("slot_minutes") or 30),
    }


def _session_by_id(settings: dict, session_id: str) -> Optional[dict]:
    for s in (settings.get("sessions") or []):
        if s.get("id") == session_id:
            return s
    return None


async def _director_timezone(director_id: str) -> str:
    d = await db.directors.find_one({"director_id": director_id}, {"_id": 0, "timezone": 1})
    return (d or {}).get("timezone") or "UTC"


async def _effective_pb_consultant_id(settings: dict, director_id: str, correlation_id: str) -> str:
    """Which PB consultant a session is created under (its asConsultantId):
    - one_director (default): the single shared consultant from settings.
    - per_director: the assigned director's own pb_consultant_id; if that's unset the PB mirror is
      skipped (better than booking under the wrong practitioner)."""
    mode = (settings.get("pb_booking_mode") or "one_director").strip()
    if mode == "per_director":
        d = await db.directors.find_one({"director_id": director_id}, {"_id": 0, "pb_consultant_id": 1})
        pid = ((d or {}).get("pb_consultant_id") or "").strip()
        if not pid:
            logger.warning(f"[{correlation_id}] per_director mode: director {director_id} has no "
                           f"pb_consultant_id; PB mirror skipped")
        return pid
    return (settings.get("shared_pb_consultant_id") or "").strip()


async def _director_email(director_id: str) -> Optional[str]:
    """The assigned director's Workspace email — added as an attendee and granted the Meet
    COHOST role (best-effort) so they can run the call the shared subject owns. None if not
    configured."""
    d = await db.directors.find_one({"director_id": director_id}, {"_id": 0, "email": 1})
    return ((d or {}).get("email") or "").strip() or None


async def _resolve_session_title(template: str, first: str, last: str, user_id: Optional[str]) -> str:
    """Fill the {{user}} placeholder in a session title with the patient's name: 'First Last' from
    the booking; if those aren't both present, the account's full name; else the booking first name."""
    if not template or "{{user}}" not in template:
        return template
    first = (first or "").strip()
    last = (last or "").strip()
    if first and last:
        name = f"{first} {last}"
    else:
        account_name = ""
        if user_id:
            u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
            account_name = ((u or {}).get("name") or "").strip()
        name = account_name or first
    return template.replace("{{user}}", name).strip()


def _booking_to_response(b: dict, message: str, is_new_client: bool = False) -> BookSessionResponse:
    return BookSessionResponse(
        success=True,
        session_id=b.get("pb_session_id") or b["booking_id"],
        client_record_id=b.get("pb_client_record_id"),
        session_start=b["slot_start_utc"],
        session_end=b["slot_end_utc"],
        duration=int(b.get("duration_minutes") or 30),
        message=message,
        is_new_client=is_new_client,
        booking_id=b["booking_id"],
        meet_link=b.get("meet_link"),
    )


async def _advance_journey_and_mirror_local(booking: dict, request: "BookSessionRequest",
                                            jwt_user_id: Optional[str], correlation_id: str) -> None:
    """Mirror the booking onto the user doc, advance Step 1->2, and fire the LeadConnector
    webhook + new_booking automations. Best-effort: never fails the booking."""
    try:
        user = None
        match_filter = None
        if jwt_user_id:
            user = await db.users.find_one({"id": jwt_user_id}, {"_id": 0})
            if user:
                match_filter = {"id": jwt_user_id}
        if not user:
            user = await db.users.find_one({"email": request.email.lower()}, {"_id": 0})
            if user:
                match_filter = {"email": request.email.lower()}

        booking_info = {
            "booking_id": booking["booking_id"],
            "session_id": booking.get("pb_session_id"),
            "session_start": _iso(booking["slot_start_utc"]),
            "session_end": _iso(booking["slot_end_utc"]),
            "duration": int(booking.get("duration_minutes") or 30),
            "director_id": booking["director_id"],
            "consultant_id": booking["director_id"],  # legacy field name some views read
            "meet_link": booking.get("meet_link"),
            "gcal_event_id": booking.get("gcal_event_id"),
            "timezone": request.timezone,
            "booked_at": _now_iso(),
            "source": "online_booking",
        }

        if not user:
            logger.warning(f"[{correlation_id}] No user matched for booking {booking['booking_id']} "
                           f"(jwt={jwt_user_id}, email={request.email}); ledger is still authoritative")
            return

        update_fields = {"booking_info": booking_info}
        if booking.get("pb_client_record_id"):
            update_fields["pb_client_record_id"] = booking["pb_client_record_id"]

        # Single-source Step 1->2 advance (idempotent: only when still on step 1).
        if user.get("current_step", 1) == 1:
            update_fields["current_step"] = 2
            await db.user_progress.update_one(
                {"user_id": user["id"], "step_number": 1},
                {"$set": {"completed_at": _now_iso()},
                 "$addToSet": {"tasks_completed": "book_consultation"}},
                upsert=True,
            )
            try:
                start_dt = booking["slot_start_utc"]
                payload = {
                    "email": user.get("email") or request.email,
                    "step": 1,
                    "booking_date": start_dt.strftime("%Y-%m-%d") if isinstance(start_dt, datetime) else None,
                    "booking_time": start_dt.strftime("%H:%M:%S") if isinstance(start_dt, datetime) else None,
                }
                async with httpx.AsyncClient() as http_client:
                    await http_client.post(
                        "https://services.leadconnectorhq.com/hooks/ygLPhGfHB5mDOoTJ86um/webhook-trigger/64b3e792-3c1e-4887-b8e3-efa79c58a704",
                        json=payload, timeout=10.0,
                    )
            except Exception as webhook_err:
                logger.warning(f"[{correlation_id}] LeadConnector webhook failed: {webhook_err}")

        await db.users.update_one(match_filter, {"$set": update_fields})

        # new_booking automations parity with the GHL webhook path (lazy import avoids cycle).
        try:
            from server import execute_automations  # type: ignore
            await execute_automations("new_booking", {
                "email": user.get("email") or request.email,
                "first_name": request.first_name,
                "last_name": request.last_name,
                "session_date": _iso(booking["slot_start_utc"]),
            })
        except Exception as autom_err:
            logger.warning(f"[{correlation_id}] new_booking automations failed: {autom_err}")
    except Exception as e:
        logger.error(f"[{correlation_id}] Failed to mirror/advance for booking {booking.get('booking_id')}: {e}")


async def _send_confirmation_once(booking: dict, request: "BookSessionRequest", session_title: str,
                                  meet_link: Optional[str], pb_record_id: Optional[str], correlation_id: str) -> None:
    """Send the confirmation email exactly once via an atomic claim on the booking doc."""
    claim = await db.bookings.find_one_and_update(
        {"booking_id": booking["booking_id"], "confirmation_email_sent_at": {"$exists": False}},
        {"$set": {"confirmation_email_sent_at": _now_iso()}},
    )
    if claim is None:
        return  # already claimed/sent
    try:
        await booking_email.send_booking_confirmation(
            to_email=request.email,
            first_name=request.first_name,
            session_title=session_title,
            session_start_iso=_iso(booking["slot_start_utc"]),
            patient_timezone=request.timezone,
            meet_link=meet_link,
            pb_record_id=pb_record_id,
        )
    except Exception as e:
        logger.warning(f"[{correlation_id}] Confirmation email failed; clearing claim to allow retry: {e}")
        await db.bookings.update_one({"booking_id": booking["booking_id"]},
                                     {"$unset": {"confirmation_email_sent_at": ""}})


_bg_tasks: set = set()


def _spawn_bg(coro) -> None:
    """Fire-and-forget a best-effort coroutine, holding a ref so it isn't GC'd mid-flight."""
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


async def _book_local_sidecar(booking: dict, request: "BookSessionRequest", director_tz: str,
                              meet_link: Optional[str], shared_pb_id: str, pb_service_id: str,
                              pb_service: PracticeBetterService, correlation_id: str) -> None:
    """Best-effort post-booking work that must NOT hold up the patient response: add the day's
    coordinator to the call, then mirror the session into the shared PB account. Runs in the
    background — PB can be slow/rate-limited, and the booking (Google event + Meet link) is
    already confirmed and durable before this starts."""
    booking_id = booking["booking_id"]

    # Coordinator on the rota for this day/director -> add to the call's Google event.
    try:
        await _add_day_pcc_to_new_booking(booking, director_tz, correlation_id)
    except Exception as e:
        logger.warning(f"[{correlation_id}] PCC add failed (booking still valid): {e}")

    if not shared_pb_id:
        logger.info(f"[{correlation_id}] shared_pb_consultant_id not configured; skipping PB mirror")
        return

    pb_record_id = None
    pb_session_id = None
    pb_status = "pending"
    try:
        pb_record_id, _ = await pb_service.get_or_create_client(
            ClientProfile(first_name=request.first_name, last_name=request.last_name,
                          email=request.email, phone=request.phone, timezone=request.timezone),
            correlation_id=correlation_id,
        )
        note_parts = []
        if request.notes:
            note_parts.append(request.notes)
        if meet_link:
            note_parts.append(f"Google Meet: {meet_link}")
        session = await pb_service.book_session(
            client_record_id=pb_record_id, consultant_id=shared_pb_id,
            session_date=request.slot_start_time, timezone=request.timezone,
            notes="\n\n".join(note_parts) or None, correlation_id=correlation_id,
            include_telehealth=False, notify=False, service_id=(pb_service_id or None),
            duration_seconds=int(booking.get("duration_minutes") or 30) * 60,
        )
        pb_session_id = session.get("id")
        pb_status = "synced"
    except Exception as e:
        logger.warning(f"[{correlation_id}] PB mirror failed (booking still valid): {e}")
        pb_status = "pending"

    try:
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"pb_client_record_id": pb_record_id, "pb_session_id": pb_session_id,
                      "pb_status": pb_status, "updated_at": _now_iso()}})
    except Exception as e:
        logger.warning(f"[{correlation_id}] PB status write failed: {e}")
    logger.info(f"[{correlation_id}] PB mirror finished for {booking_id}: pb_status={pb_status}")


async def _book_local(request: "BookSessionRequest", authorization: Optional[str],
                      pb_service: PracticeBetterService, correlation_id: str) -> BookSessionResponse:
    """Portal-owned booking: assign a director atomically, create the Google event + Meet link,
    best-effort mirror to the shared PB account, then advance the journey and email the patient."""
    settings = await _load_app_settings()
    portal_session = _portal_session(settings)
    session_id = portal_session.get("id") or "strategy"
    session_title = portal_session.get("title") or "Strategy Session"
    slot_minutes = int(portal_session.get("duration_minutes") or settings.get("slot_minutes") or 30)
    pb_service_id = (settings.get("pb_service_id") or "").strip()

    start_dt = datetime.fromisoformat(request.slot_start_time.replace("Z", "+00:00")).astimezone(tz.utc)
    end_dt = start_dt + timedelta(minutes=slot_minutes)
    jwt_user_id = _decode_optional_jwt_user_id(authorization)
    session_title = await _resolve_session_title(session_title, request.first_name, request.last_name, jwt_user_id)

    # Idempotency: a prior confirmed booking for the same (user/email, slot) -> return it.
    idem_or = [{"patient.email": request.email}, {"patient.email": request.email.lower()}]
    if jwt_user_id:
        idem_or.append({"user_id": jwt_user_id})
    existing = await db.bookings.find_one(
        {"status": "confirmed", "slot_start_utc": start_dt, "$or": idem_or}, {"_id": 0}
    )
    if existing:
        logger.info(f"[{correlation_id}] Duplicate booking; returning existing {existing['booking_id']}")
        return _booking_to_response(existing, "Your booking was already confirmed!")

    patient = {"first_name": request.first_name, "last_name": request.last_name,
               "email": request.email, "phone": request.phone}

    # 1. Atomic hold (round-robin director assignment).
    try:
        booking = await assignment_service.assign_and_hold(
            db, slot_start_utc=start_dt, slot_end_utc=end_dt, duration_minutes=slot_minutes,
            patient=patient, patient_timezone=request.timezone, user_id=jwt_user_id,
            source="patient", notes=request.notes,
        )
    except assignment_service.SlotFull:
        raise HTTPException(status_code=409,
                            detail="This time slot is no longer available. Please select another time.")

    booking_id = booking["booking_id"]
    director_id = booking["director_id"]
    director_tz = await _director_timezone(director_id)
    effective_pb_id = await _effective_pb_consultant_id(settings, director_id, correlation_id)
    director_email = await _director_email(director_id)

    # 2. Google Calendar event w/ Meet (the patient deliverable). Failure -> release hold, 503.
    try:
        event_id, meet_link = await gcal.create_event_with_meet(
            calendar_id=booking.get("gcal_calendar_id"),
            summary=session_title, description=(request.notes or ""),
            start_utc=start_dt, end_utc=end_dt, timezone=director_tz,
            attendee_email=request.email, director_email=director_email,
            request_id=f"cadence-{booking_id}",
        )
    except Exception as e:
        logger.error(f"[{correlation_id}] Google event creation failed: {e}; releasing hold {booking_id}")
        await db.bookings.update_one({"booking_id": booking_id},
                                     {"$set": {"status": "cancelled", "gcal_status": "failed",
                                               "pb_status": "skipped", "updated_at": _now_iso()}})
        raise HTTPException(status_code=503,
                            detail="We couldn't finish setting up your video call. Please try again.")

    await db.bookings.update_one({"booking_id": booking_id},
                                 {"$set": {"gcal_event_id": event_id, "meet_link": meet_link,
                                           "gcal_status": "synced", "session_id": session_id,
                                           "session_title": session_title, "updated_at": _now_iso()}})
    booking.update({"gcal_event_id": event_id, "meet_link": meet_link, "gcal_status": "synced",
                    "session_id": session_id, "session_title": session_title})

    # 3. Mirror to user + advance journey + webhook + automations (fast, patient-facing — keep
    #    synchronous so the portal reflects the booking on the next call).
    await _advance_journey_and_mirror_local(booking, request, jwt_user_id, correlation_id)

    # 4. Confirmation email (exactly once). The Meet link + time are the payload; the PB record
    #    id is filled later by the background mirror, so we don't hold the email for PB.
    await _send_confirmation_once(booking, request, session_title, meet_link, None, correlation_id)

    # 5. Coordinator add + Practice Better mirror run in the BACKGROUND so the patient isn't held
    #    on a slow or rate-limited PB call. pb_status stays "pending" until the mirror patches it.
    _spawn_bg(_book_local_sidecar(booking, request, director_tz, meet_link,
                                  effective_pb_id, pb_service_id, pb_service, correlation_id))

    logger.info(f"[{correlation_id}] Local booking complete: {booking_id} director={director_id} "
                f"(coordinator + PB mirror backgrounded)")
    return _booking_to_response(booking, "Your onboarding call has been booked successfully!",
                                is_new_client=False)


async def _manual_pb_mirror(booking_id: str, patient: dict, patient_timezone: str, slot_start_iso: str,
                            meet_link: Optional[str], shared_pb_id: str, pb_service_id: str,
                            pb_service: "PracticeBetterService", notes: Optional[str], correlation_id: str,
                            duration_minutes: Optional[int] = None) -> None:
    """Best-effort mirror of a manual booking into the shared PB account under this session's
    service id. Patches pb_status on the ledger row when done."""
    pb_record_id = None
    pb_session_id = None
    pb_status = "pending"
    try:
        pb_record_id, _ = await pb_service.get_or_create_client(
            ClientProfile(first_name=patient.get("first_name") or "", last_name=patient.get("last_name") or "",
                          email=patient.get("email") or "", phone=patient.get("phone"), timezone=patient_timezone),
            correlation_id=correlation_id,
        )
        note_parts = []
        if notes:
            note_parts.append(notes)
        if meet_link:
            note_parts.append(f"Google Meet: {meet_link}")
        session = await pb_service.book_session(
            client_record_id=pb_record_id, consultant_id=shared_pb_id,
            session_date=slot_start_iso, timezone=patient_timezone,
            notes="\n\n".join(note_parts) or None, correlation_id=correlation_id,
            include_telehealth=False, notify=False, service_id=(pb_service_id or None),
            duration_seconds=int(duration_minutes or 30) * 60,
        )
        pb_session_id = session.get("id")
        pb_status = "synced"
    except Exception as e:
        logger.warning(f"[{correlation_id}] Manual PB mirror failed (booking still valid): {e}")
        pb_status = "pending"
    try:
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"pb_client_record_id": pb_record_id, "pb_session_id": pb_session_id,
                      "pb_status": pb_status, "updated_at": _now_iso()}})
    except Exception as e:
        logger.warning(f"[{correlation_id}] Manual PB status write failed: {e}")


async def _record_legacy_booking(request: "BookSessionRequest", result, consultant_id: str,
                                 correlation_id: str) -> Optional[dict]:
    """Ledger row for a legacy (PB-engine) booking so the new admin surface, countdowns,
    cancel, and reschedule all work on it. PB is the system of record for the meeting
    (telehealth/Zoom + PB's own confirmation email) — there is no Google event. Best-effort:
    a ledger failure never fails the booking (it already exists in PB)."""
    try:
        director = await db.directors.find_one(
            {"pb_consultant_id": consultant_id}, {"_id": 0, "director_id": 1})
        settings = await _load_app_settings()
        session_cfg = _portal_session(settings)
        title = await _resolve_session_title(
            session_cfg.get("title") or "Strategy Session",
            request.first_name, request.last_name, None)
        now = _now_iso()
        row = {
            "booking_id": str(uuid.uuid4()),
            "status": "confirmed",
            "engine": "pb",
            "slot_start_utc": result.session_start,
            "slot_end_utc": result.session_end,
            "duration_minutes": max(1, int((result.duration or 1800) // 60)),
            "director_id": (director or {}).get("director_id"),
            "consultant_id": consultant_id,
            "gcal_calendar_id": None, "gcal_event_id": None, "gcal_status": "skipped",
            "meet_link": result.telehealth_url,
            "patient": {"first_name": request.first_name, "last_name": request.last_name,
                        "email": request.email, "phone": request.phone},
            "patient_timezone": request.timezone,
            "notes": request.notes,
            "session_id": session_cfg.get("id"),
            "session_title": title,
            "pb_client_record_id": result.client_record_id,
            "pb_session_id": result.session_id,
            "pb_status": "synced",
            "source": "online_booking",
            "created_at": now, "updated_at": now,
        }
        try:
            await db.bookings.insert_one(dict(row))
        except DuplicateKeyError:
            # Director+slot collision (PB allowed it, our partial unique index didn't):
            # keep the row, unassigned, rather than losing it from the admin surface.
            row["director_id"] = None
            row.pop("_id", None)
            await db.bookings.insert_one(dict(row))
        return row
    except Exception as e:
        logger.warning(f"[{correlation_id}] Legacy ledger write failed (booking still valid in PB): {e}")
        return None


async def retry_pending_pb_mirrors(correlation_id: str = "pb-sweep") -> dict:
    """Retry the PB clinical mirror for confirmed bookings stuck on pb_status='pending'
    (PB 5xx at booking time is transient — seen live). Oldest first, small batch, and only
    rows quiet for 10+ minutes so an in-flight booking sidecar is never raced. A booking
    whose director resolves to no PB consultant is marked 'skipped' instead of retrying
    forever. Failures stay 'pending' for the next sweep."""
    pb_service = get_pb_service_optional()
    if pb_service is None:
        return {"retried": 0, "reason": "pb not configured"}
    settings = await _load_app_settings()
    cutoff = (datetime.now(tz.utc) - timedelta(minutes=10)).isoformat()
    rows = await db.bookings.find(
        {"status": "confirmed", "pb_status": "pending", "updated_at": {"$lt": cutoff}},
        {"_id": 0},
    ).sort("updated_at", 1).to_list(5)

    synced = skipped = failed = 0
    for booking in rows:
        bid = booking["booking_id"]
        try:
            effective_pb_id = await _effective_pb_consultant_id(settings, booking["director_id"], correlation_id)
            if not effective_pb_id:
                await db.bookings.update_one({"booking_id": bid},
                    {"$set": {"pb_status": "skipped", "updated_at": _now_iso()}})
                skipped += 1
                continue
            session = _session_by_id(settings, booking.get("session_id")) or _portal_session(settings)
            patient = booking.get("patient") or {}
            note_parts = []
            if booking.get("notes"):
                note_parts.append(booking["notes"])
            if booking.get("meet_link"):
                note_parts.append(f"Google Meet: {booking['meet_link']}")
            record_id, _ = await pb_service.get_or_create_client(
                ClientProfile(first_name=patient.get("first_name") or "", last_name=patient.get("last_name") or "",
                              email=patient.get("email") or "", phone=patient.get("phone"),
                              timezone=booking.get("patient_timezone")),
                correlation_id=correlation_id)
            pb_session = await pb_service.book_session(
                client_record_id=record_id, consultant_id=effective_pb_id,
                session_date=_iso(booking["slot_start_utc"]),
                timezone=booking.get("patient_timezone") or "UTC",
                notes="\n\n".join(note_parts) or None, correlation_id=correlation_id,
                include_telehealth=False, notify=False,
                service_id=((session.get("pb_service_id") or "").strip() or None),
                duration_seconds=int(booking.get("duration_minutes") or 30) * 60)
            await db.bookings.update_one({"booking_id": bid},
                {"$set": {"pb_client_record_id": record_id, "pb_session_id": pb_session.get("id"),
                          "pb_status": "synced", "updated_at": _now_iso()}})
            synced += 1
            logger.info(f"[{correlation_id}] PB mirror retried OK for booking {bid}")
        except Exception as e:
            failed += 1
            logger.warning(f"[{correlation_id}] PB mirror retry failed for booking {bid} (stays pending): {e}")
    return {"retried": len(rows), "synced": synced, "skipped": skipped, "failed": failed}


def start_pb_pending_sweep(interval_seconds: int = 900) -> None:
    """Start the periodic pending-mirror retry loop (called once from server startup)."""
    async def _loop():
        await asyncio.sleep(120)  # let startup + rate-limit-sensitive warmup go first
        while True:
            try:
                result = await retry_pending_pb_mirrors()
                if result.get("retried"):
                    logger.info(f"PB pending sweep: {result}")
            except Exception as e:
                logger.warning(f"PB pending sweep iteration failed: {e}")
            await asyncio.sleep(interval_seconds)
    _spawn_bg(_loop())


# ============================================================================
# SMS reminders (Twilio) — journey-aware nudges, run by a periodic sweep.
#   book_24h / book_72h  : signed up (step 1) but hasn't booked
#   forms_24h / forms_pre: booked (step 2) but health forms incomplete
#   precall_1h           : ~1h before a confirmed appointment
# Dedup: each key is atomically claimed (find_one_and_update guarded on not-exists) before
# sending, so overlapping sweeps never double-text; a failed send releases the claim to
# retry. Quiet hours (9am-8pm patient-local) gate the nudges; the pre-call always sends.
# ============================================================================
from services import sms as _sms

# Practice-timezone fallback used when the patient's own tz is unknown (pre-booking nudges).
_REMINDER_PRACTICE_TZ = "America/Los_Angeles"


# Every tunable (enable, timing, quiet hours, message copy) lives in app_settings.sms_reminders
# and is edited from the admin Settings UI — nothing below is hardcoded copy. This reads that
# doc, deep-merged over SMS_REMINDER_DEFAULTS so a fresh install (nothing saved yet) still works
# and a partially-saved doc fills its gaps from defaults.
def _reminder_cfg(settings: dict) -> dict:
    from server import SMS_REMINDER_DEFAULTS
    cfg = copy.deepcopy(SMS_REMINDER_DEFAULTS)
    stored = (settings or {}).get("sms_reminders")
    if isinstance(stored, dict):
        for k, v in stored.items():
            if k == "items" and isinstance(v, dict):
                for ik, iv in v.items():
                    if ik in cfg["items"] and isinstance(iv, dict):
                        cfg["items"][ik].update(iv)
            elif k != "items":
                cfg[k] = v
    return cfg


def _reminder_frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "https://portal.drshumard.com").rstrip("/")


async def _issue_access_link(user_id: str, email: str = "") -> str:
    """A one-click portal auto-login link, valid 6 hours and reusable until it expires. Reuses
    the same audited token flow as the welcome / magic-link emails (GET /auth/auto-login/{token}).
    Falls back to the bare portal URL if minting fails, so a reminder is never blocked."""
    base = _reminder_frontend_url()
    if not user_id:
        return base
    try:
        from server import create_auto_login_token
        token = await create_auto_login_token(user_id, email or "", purpose="sms_reminder", ttl_minutes=360)
        return f"{base}/auto-login/{token}"
    except Exception as e:
        logger.warning(f"reminder access-link mint failed for user {user_id}: {e}")
        return base


def _render_reminder(template: str, *, first_name: str = "", link: str = "",
                     time_str: str = "", join: str = "") -> str:
    """Fill an admin-authored template. Plain .replace (never .format) so stray braces in the
    copy can't raise. Unused placeholders collapse to empty; unknown ones are left as-is."""
    return (str(template or "")
            .replace("{first_name}", first_name)
            .replace("{link}", link)
            .replace("{time}", time_str)
            .replace("{join}", join))


def _within_quiet_hours(tz_name: Optional[str], cfg: dict) -> bool:
    try:
        zone = ZoneInfo(tz_name or _REMINDER_PRACTICE_TZ)
    except Exception:
        zone = ZoneInfo(_REMINDER_PRACTICE_TZ)
    hour = datetime.now(zone).hour
    return int(cfg.get("quiet_start_hour", 9)) <= hour < int(cfg.get("quiet_end_hour", 20))


def _hours_since(iso_value) -> Optional[float]:
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz.utc)
    return (datetime.now(tz.utc) - dt).total_seconds() / 3600.0


def _first_name(name: Optional[str]) -> str:
    return (name or "there").strip().split(" ")[0] or "there"


async def _claim_reminder(collection, match: dict, key: str) -> bool:
    """Atomically claim a reminder key on a users/bookings doc. True iff we won it."""
    res = await collection.update_one({**match, f"reminders_sent.{key}": {"$exists": False}},
                                      {"$set": {f"reminders_sent.{key}": _now_iso()}})
    return res.modified_count == 1


async def _release_reminder(collection, match: dict, key: str) -> None:
    await collection.update_one(match, {"$unset": {f"reminders_sent.{key}": ""}})


async def _is_opted_out(phone) -> bool:
    """True if this number texted STOP (recorded in sms_opt_outs by the Twilio inbound webhook or
    a prior send-rejection). Keyed by E.164 — the same normalization the webhook and the sender
    use, so keys line up. Fails OPEN (returns False) on a DB error: a transient blip on this check
    must never permanently drop a reminder."""
    e164 = _sms.to_e164(phone)
    if not e164:
        return False
    try:
        doc = await db.sms_opt_outs.find_one({"_id": e164}, {"_id": 0, "opted_out": 1})
    except Exception as e:
        logger.warning(f"opt-out check failed for {e164}: {e} — proceeding as not-opted-out")
        return False
    return bool(doc and doc.get("opted_out"))


async def _record_local_opt_out(phone_e164: str) -> None:
    """Persist an opt-out we learned from a Twilio send-rejection (i.e. no inbound webhook fired,
    or it predates this feature), so later reminders to this number are skipped instead of retried
    forever. Same collection the inbound webhook writes."""
    try:
        await db.sms_opt_outs.update_one(
            {"_id": phone_e164},
            {"$set": {"opted_out": True, "updated_at": _now_iso(), "source": "send_rejection"}},
            upsert=True)
    except Exception as e:
        logger.warning(f"could not record opt-out for {phone_e164}: {e}")


async def _send_claimed(collection, match, key, phone, body, correlation_id) -> bool:
    """Send an already-claimed reminder and decide, from the outcome, whether to retry:
      - transient failure -> RELEASE the claim so the next sweep retries.
      - PERMANENT outcome (opted out, invalid/unusable number) -> KEEP the claim (never retry).
        An opt-out learned from Twilio here is also written to sms_opt_outs so every other reminder
        to that number is suppressed too."""
    to = _sms.to_e164(phone)
    if not to:  # non-empty but unparseable — permanent; keep the claim, don't loop
        logger.warning(f"[{correlation_id}] SMS reminder '{key}' skipped — unusable phone number")
        return False
    if await _is_opted_out(to):
        logger.info(f"[{correlation_id}] SMS reminder '{key}' suppressed — recipient opted out")
        return False  # keep the claim
    status = await _sms.send_sms(to, body)
    if status == "sent":
        logger.info(f"[{correlation_id}] SMS reminder '{key}' sent to {to}")
        return True
    if status == "opted_out":
        await _record_local_opt_out(to)
        logger.info(f"[{correlation_id}] SMS reminder '{key}' not sent — recipient opted out (recorded)")
        return False  # keep the claim
    if status == "invalid":
        logger.warning(f"[{correlation_id}] SMS reminder '{key}' not sent — invalid number; won't retry")
        return False  # keep the claim
    await _release_reminder(collection, match, key)
    logger.warning(f"[{correlation_id}] SMS reminder '{key}' not sent (transient) — will retry")
    return False


async def _sweep_booking_nudges(cid: str, cfg: dict) -> int:
    items = cfg["items"]
    i24, i72 = items["book_24h"], items["book_72h"]
    e24, e72 = bool(i24.get("enabled")), bool(i72.get("enabled"))
    if not (e24 or e72):
        return 0
    v24, v72 = float(i24.get("value", 24)), float(i72.get("value", 72))  # hours after signup
    # Don't nudge signups older than this — avoids texting long-dead leads (and a burst to the
    # whole backlog on first deploy). Someone still on step 1 that long won't book from an SMS.
    max_hours = float(cfg.get("booking_max_age_days", 14)) * 24
    sent = 0
    cursor = db.users.find(
        {"current_step": 1, "phone": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "created_at": 1, "reminders_sent": 1})
    async for u in cursor:
        if not _within_quiet_hours(_REMINDER_PRACTICE_TZ, cfg):  # step-1 users have no known tz yet
            continue
        hrs = _hours_since(u.get("created_at"))
        if hrs is None or hrs > max_hours:
            continue
        rem = u.get("reminders_sent") or {}
        match = {"id": u["id"]}
        first = _first_name(u.get("name"))
        # The later (second) nudge takes priority; a user first seen past its threshold gets ONLY
        # it (the first-nudge key is marked handled so the next sweep can't fire it too).
        if e72 and hrs >= v72 and "book_72h" not in rem:
            key, also_mark, tmpl = "book_72h", "book_24h", i72.get("message")
        elif e24 and hrs >= v24 and "book_24h" not in rem:
            key, also_mark, tmpl = "book_24h", None, i24.get("message")
        else:
            continue
        link = await _issue_access_link(u["id"], u.get("email")) if "{link}" in (tmpl or "") else ""
        body = _render_reminder(tmpl, first_name=first, link=link)
        if await _claim_reminder(db.users, match, key):
            if also_mark:
                await db.users.update_one(match, {"$set": {f"reminders_sent.{also_mark}": _now_iso()}})
            sent += await _send_claimed(db.users, match, key, u["phone"], body, cid)
    return sent


async def _sweep_forms_nudges(cid: str, cfg: dict) -> int:
    items = cfg["items"]
    ipre, i24 = items["forms_pre"], items["forms_24h"]
    e_pre, e_24 = bool(ipre.get("enabled")), bool(i24.get("enabled"))
    if not (e_pre or e_24):
        return 0
    pre_secs = float(ipre.get("value", 24)) * 3600.0   # send within this many hours of the appt
    after_hours = float(i24.get("value", 24))          # ...or this many hours after booking
    sent = 0
    cursor = db.users.find(
        {"current_step": 2, "phone": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1})
    async for u in cursor:
        booking = await db.bookings.find_one(
            {"user_id": u["id"], "status": "confirmed", "slot_start_utc": {"$gt": datetime.now(tz.utc)}},
            {"_id": 0, "booking_id": 1, "slot_start_utc": 1, "patient_timezone": 1,
             "created_at": 1, "reminders_sent": 1},
            sort=[("slot_start_utc", 1)])
        if not booking:
            continue  # step-2 with no upcoming ledger booking (pre-ledger legacy) — skip
        if not _within_quiet_hours(booking.get("patient_timezone"), cfg):
            continue
        rem = booking.get("reminders_sent") or {}
        first = _first_name(u.get("name"))
        match = {"booking_id": booking["booking_id"]}
        start = booking["slot_start_utc"]
        if start.tzinfo is None:
            start = start.replace(tzinfo=tz.utc)
        secs_to_appt = (start - datetime.now(tz.utc)).total_seconds()
        # forms_pre: within N hours of the appt (but >1h, so it never collides with pre-call).
        # Supersedes the after-booking nudge — if the appt is already this close, mark forms_24h
        # handled so the two don't fire back-to-back. (A far-out booking still gets forms_24h
        # early AND forms_pre near the appt — the intended two nudges.)
        if e_pre and 3600 < secs_to_appt <= pre_secs and "forms_pre" not in rem:
            if await _claim_reminder(db.bookings, match, "forms_pre"):
                await db.bookings.update_one(match, {"$set": {"reminders_sent.forms_24h": _now_iso()}})
                tmpl = ipre.get("message")
                link = await _issue_access_link(u["id"], u.get("email")) if "{link}" in (tmpl or "") else ""
                body = _render_reminder(tmpl, first_name=first, link=link)
                sent += await _send_claimed(db.bookings, match, "forms_pre", u["phone"], body, cid)
                continue
        # forms_24h: N hours after booking
        hrs = _hours_since(booking.get("created_at"))
        if e_24 and hrs is not None and hrs >= after_hours and "forms_24h" not in rem:
            if await _claim_reminder(db.bookings, match, "forms_24h"):
                tmpl = i24.get("message")
                link = await _issue_access_link(u["id"], u.get("email")) if "{link}" in (tmpl or "") else ""
                body = _render_reminder(tmpl, first_name=first, link=link)
                sent += await _send_claimed(db.bookings, match, "forms_24h", u["phone"], body, cid)
    return sent


async def _sweep_precall(cid: str, cfg: dict) -> int:
    item = cfg["items"]["precall"]
    if not item.get("enabled"):
        return 0
    lead_min = float(item.get("value", 60))  # minutes before the appointment
    now = datetime.now(tz.utc)
    # Small slack so a sweep landing just past the boundary still catches the booking. The dedup
    # claim keeps it to one send; the {time} placeholder keeps the copy accurate regardless.
    window_end = now + timedelta(minutes=lead_min + 6)
    sent = 0
    cursor = db.bookings.find(
        {"status": "confirmed", "slot_start_utc": {"$gt": now, "$lte": window_end}},
        {"_id": 0, "booking_id": 1, "slot_start_utc": 1, "patient_timezone": 1,
         "patient": 1, "user_id": 1, "meet_link": 1, "reminders_sent": 1})
    async for b in cursor:
        if "precall_1h" in (b.get("reminders_sent") or {}):
            continue
        patient = b.get("patient") or {}
        phone = patient.get("phone")
        if not phone:
            continue
        match = {"booking_id": b["booking_id"]}
        if not await _claim_reminder(db.bookings, match, "precall_1h"):  # pre-call ignores quiet hours
            continue
        time_str = ""
        try:
            start = b["slot_start_utc"]
            if start.tzinfo is None:
                start = start.replace(tzinfo=tz.utc)
            time_str = start.astimezone(ZoneInfo(b.get("patient_timezone") or _REMINDER_PRACTICE_TZ)).strftime("%-I:%M %p")
        except Exception:
            time_str = ""
        join = (f" Join here: {b['meet_link']}" if b.get("meet_link")
                else " Your join link is in your confirmation email.")
        tmpl = item.get("message")
        link = await _issue_access_link(b.get("user_id"), "") if "{link}" in (tmpl or "") else ""
        body = _render_reminder(tmpl, first_name=_first_name(patient.get("name")),
                                time_str=time_str, join=join, link=link)
        sent += await _send_claimed(db.bookings, match, "precall_1h", phone, body, cid)
    return sent


async def run_reminder_sweep(correlation_id: str = "reminder-sweep") -> dict:
    """One pass of all three reminder types. Best-effort; never raises. Re-reads the admin-editable
    config from app_settings.sms_reminders each pass, so enable/timing/copy changes take effect live
    (no restart needed)."""
    if not _sms.is_configured():
        return {"skipped": "sms_not_configured"}
    cfg = _reminder_cfg(await _load_app_settings())
    if not cfg.get("enabled", True):
        return {"skipped": "disabled_in_settings"}
    result = {}
    for name, fn in (("booking_nudges", _sweep_booking_nudges),
                     ("forms_nudges", _sweep_forms_nudges),
                     ("precall", _sweep_precall)):
        try:
            result[name] = await fn(correlation_id, cfg)
        except Exception as e:
            result[name] = f"error: {e}"
            logger.warning(f"[{correlation_id}] reminder {name} failed: {e}")
    if any(isinstance(v, int) and v for v in result.values()):
        logger.info(f"[{correlation_id}] reminder sweep: {result}")
    return result


def start_reminder_sweep(interval_seconds: int = 600) -> None:
    """Start the periodic SMS reminder loop (called once at startup). No-ops if SMS unconfigured."""
    if not _sms.is_configured():
        logger.info("SMS reminders disabled (Twilio Messaging not configured — set "
                    "TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM)")
        return

    async def _loop():
        await asyncio.sleep(90)  # let startup settle
        while True:
            try:
                await run_reminder_sweep()
            except Exception as e:
                logger.warning(f"Reminder sweep iteration failed: {e}")
            await asyncio.sleep(interval_seconds)

    _spawn_bg(_loop())
    logger.info(f"SMS reminder sweep started (every {interval_seconds}s)")


class ReminderTestRequest(BaseModel):
    key: str
    to: str


@router.post("/reminders/test")
async def send_reminder_test(req: ReminderTestRequest, request: Request):
    """Admin: send one reminder to a phone number to preview it live. Renders the CURRENT saved
    copy for that reminder with sample data — {link} shows the bare portal URL (a test isn't tied
    to a patient, so no personal login token is minted)."""
    await _require_admin(request)
    if not _sms.is_configured():
        raise HTTPException(status_code=400, detail="SMS is not configured on the server (Twilio env vars are missing).")
    cfg = _reminder_cfg(await _load_app_settings())
    item = cfg["items"].get(req.key)
    if not item:
        raise HTTPException(status_code=400, detail="Unknown reminder")
    to = _sms.to_e164(req.to)
    if not to:
        raise HTTPException(status_code=400, detail="Enter a valid US phone number.")
    body = _render_reminder(item.get("message"), first_name="Alex", link=_reminder_frontend_url(),
                            time_str="2:30 PM", join=" Join here: https://meet.google.com/abc-defg-hij")
    status = await _sms.send_sms(to, body)
    if status != "sent":
        detail = {"opted_out": "That number has opted out of texts (replied STOP).",
                  "invalid": "That doesn't look like a reachable number."}.get(
                      status, "Twilio did not accept the test message. Check the number and server logs.")
        raise HTTPException(status_code=502, detail=detail)
    return {"sent": True, "to": to}


async def create_manual_booking(*, session_id: str, director_id: str, slot_start_iso: str,
                                patient: dict, patient_timezone: str, notes: Optional[str],
                                send_email: bool, correlation_id: str) -> dict:
    """Admin-created booking into a chosen session for a patient. Books the chosen director,
    creates the Google event + Meet link, optionally emails the patient, and (when a shared PB
    account is configured) mirrors into Practice Better under the session's own service id.
    Unlike the portal flow it does NOT advance the portal journey or touch user.booking_info."""
    settings = await _load_app_settings()
    session = _session_by_id(settings, session_id) or _portal_session(settings)
    duration = int(session.get("duration_minutes") or 30)
    title = session.get("title") or "Session"
    effective_pb_id = await _effective_pb_consultant_id(settings, director_id, correlation_id)
    pb_service_id = (session.get("pb_service_id") or "").strip()
    initial_pb_status = "pending" if effective_pb_id else "skipped"

    start_dt = datetime.fromisoformat(slot_start_iso.replace("Z", "+00:00")).astimezone(tz.utc)
    end_dt = start_dt + timedelta(minutes=duration)

    email = (patient.get("email") or "").strip().lower()
    linked = await db.users.find_one({"email": email}, {"_id": 0, "id": 1}) if email else None
    title = await _resolve_session_title(title, patient.get("first_name"), patient.get("last_name"), (linked or {}).get("id"))

    try:
        booking = await assignment_service.assign_and_hold(
            db, slot_start_utc=start_dt, slot_end_utc=end_dt, duration_minutes=duration,
            patient={k: patient.get(k) for k in ("first_name", "last_name", "email", "phone")},
            patient_timezone=patient_timezone, user_id=(linked or {}).get("id"),
            source="manual", notes=notes, forced_director_id=director_id,
        )
    except assignment_service.SlotFull:
        raise HTTPException(status_code=409, detail="That director already has a booking at this time.")

    booking_id = booking["booking_id"]
    director_tz = await _director_timezone(director_id)
    sid = session.get("id") or session_id
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"session_id": sid, "session_title": title, "pb_status": initial_pb_status,
                  "updated_at": _now_iso()}})
    booking.update({"session_id": sid, "session_title": title, "pb_status": initial_pb_status})

    director_email = await _director_email(director_id)
    try:
        event_id, meet_link = await gcal.create_event_with_meet(
            calendar_id=booking.get("gcal_calendar_id"),
            summary=title, description=(notes or ""), start_utc=start_dt, end_utc=end_dt,
            timezone=director_tz, attendee_email=(patient.get("email") or None),
            director_email=director_email,
            request_id=f"cadence-{booking_id}",
        )
    except Exception as e:
        logger.error(f"[{correlation_id}] Manual booking Google event failed: {e}; cancelling {booking_id}")
        await db.bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"status": "cancelled", "gcal_status": "failed", "pb_status": "skipped",
                      "updated_at": _now_iso()}})
        raise HTTPException(status_code=503, detail="Could not create the calendar event. Please try again.")

    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"gcal_event_id": event_id, "meet_link": meet_link, "gcal_status": "synced",
                  "updated_at": _now_iso()}})
    booking.update({"gcal_event_id": event_id, "meet_link": meet_link, "gcal_status": "synced"})

    if send_email and patient.get("email"):
        try:
            await booking_email.send_booking_confirmation(
                to_email=patient["email"], first_name=patient.get("first_name") or "there",
                session_title=title, session_start_iso=_iso(start_dt),
                patient_timezone=patient_timezone, meet_link=meet_link, pb_record_id=None,
            )
        except Exception as e:
            logger.warning(f"[{correlation_id}] Manual booking confirmation email failed: {e}")

    # Mirror into the shared Practice Better account using this session's service id (background —
    # PB can be slow/rate-limited; the Google event + ledger are already durable).
    if effective_pb_id:
        pb = get_pb_service_optional()
        if pb:
            _spawn_bg(_manual_pb_mirror(booking_id, patient, patient_timezone, slot_start_iso,
                                        meet_link, effective_pb_id, pb_service_id, pb, notes, correlation_id,
                                        duration_minutes=duration))

    logger.info(f"[{correlation_id}] Manual booking complete: {booking_id} "
                f"session={sid} director={director_id}")
    return booking


# ============================================================================
# Reschedule / cancel (portal-owned, booking_engine == "local")
# ============================================================================

class RescheduleError(Exception):
    """Carries an HTTP status + message for the reschedule flow."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _booking_public(b: dict) -> dict:
    """Serialize a booking row for patient/admin clients (datetimes -> ISO)."""
    return {
        "booking_id": b.get("booking_id"),
        "status": b.get("status"),
        "session_start": _iso(b.get("slot_start_utc")),
        "session_end": _iso(b.get("slot_end_utc")),
        "duration_minutes": b.get("duration_minutes"),
        "director_id": b.get("director_id"),
        "meet_link": b.get("meet_link"),
        "patient_timezone": b.get("patient_timezone"),
        "pb_status": b.get("pb_status"),
        "gcal_status": b.get("gcal_status"),
    }


async def _sync_user_booking_info(booking: dict, *, clear: bool) -> None:
    """Keep the patient-facing user.booking_info in step with the ledger after an admin
    cancel (clear=True -> remove it) or reschedule (refresh its time + meet link). The
    patient portal's GET /user/appointment reads booking_info, so without this a patient
    would still see a cancelled session, or the old time after a move. Best-effort."""
    user_id = booking.get("user_id")
    email = (booking.get("patient") or {}).get("email")
    match = {"id": user_id} if user_id else ({"email": email.lower()} if email else None)
    if not match:
        return
    try:
        if clear:
            await db.users.update_one(match, {"$unset": {"booking_info": ""}})
        else:
            await db.users.update_one(match, {"$set": {
                "booking_info.session_start": _iso(booking.get("slot_start_utc")),
                "booking_info.session_end": _iso(booking.get("slot_end_utc")),
                "booking_info.meet_link": booking.get("meet_link"),
                "booking_info.updated_at": _now_iso(),
                "booking_info.updated_by": "admin",
            }})
    except Exception as e:
        logger.warning(f"Failed to sync user booking_info (clear={clear}): {e}")


async def _cancel_booking(booking: dict, pb_service: Optional[PracticeBetterService],
                          correlation_id: str, *, actor: str = "admin",
                          reason: Optional[str] = None) -> dict:
    """Cancel a booking end-to-end: PB delete + Google delete (best-effort) -> mark cancelled in
    Mongo (frees the slot) -> clear the patient's booking_info -> email the patient. Idempotent."""
    booking_id = booking["booking_id"]
    if booking.get("status") == "cancelled":
        return booking

    if booking.get("pb_session_id") and pb_service is not None:
        try:
            await pb_service.cancel_session(booking["pb_session_id"], correlation_id=correlation_id)
        except Exception as e:
            logger.warning(f"[{correlation_id}] PB cancel failed (continuing): {e}")

    if booking.get("gcal_event_id") and booking.get("gcal_calendar_id"):
        try:
            await gcal.delete_event(calendar_id=booking["gcal_calendar_id"], event_id=booking["gcal_event_id"])
        except Exception as e:
            logger.warning(f"[{correlation_id}] Google event delete failed (continuing): {e}")

    now = _now_iso()
    update = {"status": "cancelled", "updated_at": now, "cancelled_at": now, "cancelled_by": actor,
              # PB sync is moot once cancelled: "cancelled" if a real session existed (we just
              # deleted it), else "skipped" (nothing was ever mirrored) — never leave it "pending".
              "pb_status": "cancelled" if booking.get("pb_session_id") else "skipped"}
    if reason:
        update["cancel_reason"] = reason
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": update})
    booking.update(update)

    # Keep the patient portal consistent: drop the now-cancelled booking_info.
    await _sync_user_booking_info(booking, clear=True)

    # Legacy (PB-engine) bookings: Practice Better owns ALL patient emails — it holds the
    # Zoom link we never see, so our notices would only confuse. Portal bookings keep ours.
    settings = await _load_app_settings()
    patient = booking.get("patient") or {}
    if patient.get("email") and booking.get("engine") != "pb":
        try:
            await booking_email.send_cancellation_notice(
                to_email=patient["email"], first_name=patient.get("first_name") or "there",
                session_title=booking.get("session_title") or settings.get("session_title") or "Strategy Session",
                session_start_iso=_iso(booking.get("slot_start_utc")),
                patient_timezone=booking.get("patient_timezone"),
            )
        except Exception as e:
            logger.warning(f"[{correlation_id}] Cancellation email failed: {e}")

    logger.info(f"[{correlation_id}] Booking {booking_id} cancelled by {actor}")
    return booking


async def _pb_reassign_session(booking: dict, old_pb_session_id: Optional[str], new_director_id: str,
                               new_start_iso: str, session: dict, settings: dict,
                               pb_service: PracticeBetterService, correlation_id: str) -> None:
    """Per-director reschedule that CHANGED director: the PB consultant changes with the director,
    so cancel the old session (under the old consultant) and recreate it under the new director's
    own consultant. Best-effort — patches pb_session_id/pb_status. If the new director has no PB
    consultant the session is left without a PB record (pb_status='skipped')."""
    booking_id = booking["booking_id"]
    if old_pb_session_id:
        try:
            await pb_service.cancel_session(old_pb_session_id, correlation_id=correlation_id)
        except Exception as e:
            logger.warning(f"[{correlation_id}] PB cancel of old session failed (continuing): {e}")

    new_pb_id = await _effective_pb_consultant_id(settings, new_director_id, correlation_id)
    if not new_pb_id:
        await db.bookings.update_one({"booking_id": booking_id},
            {"$set": {"pb_session_id": None, "pb_status": "skipped", "updated_at": _now_iso()}})
        return

    patient = booking.get("patient") or {}
    pb_service_id = (session.get("pb_service_id") or "").strip()
    note_parts = []
    if booking.get("notes"):
        note_parts.append(booking["notes"])
    if booking.get("meet_link"):
        note_parts.append(f"Google Meet: {booking['meet_link']}")
    try:
        record_id, _ = await pb_service.get_or_create_client(
            ClientProfile(first_name=patient.get("first_name") or "", last_name=patient.get("last_name") or "",
                          email=patient.get("email") or "", phone=patient.get("phone"),
                          timezone=booking.get("patient_timezone")),
            correlation_id=correlation_id)
        new_session = await pb_service.book_session(
            client_record_id=record_id, consultant_id=new_pb_id, session_date=new_start_iso,
            timezone=booking.get("patient_timezone") or "UTC",
            notes="\n\n".join(note_parts) or None, correlation_id=correlation_id,
            include_telehealth=False, notify=False, service_id=(pb_service_id or None),
            duration_seconds=int(booking.get("duration_minutes") or 30) * 60)
        await db.bookings.update_one({"booking_id": booking_id},
            {"$set": {"pb_client_record_id": record_id, "pb_session_id": new_session.get("id"),
                      "pb_status": "synced", "updated_at": _now_iso()}})
    except Exception as e:
        logger.warning(f"[{correlation_id}] PB recreate under new director failed: {e}")
        await db.bookings.update_one({"booking_id": booking_id},
            {"$set": {"pb_status": "pending", "updated_at": _now_iso()}})


async def _reschedule_booking(booking: dict, new_start_iso: str,
                              pb_service: Optional[PracticeBetterService], correlation_id: str,
                              *, actor: str = "admin") -> dict:
    """Move a confirmed booking to a new time. Prefers keeping the same director; if that director
    isn't free at the new slot it REASSIGNS to an available one (so any offered slot can be booked).
    Atomically re-claims the slot (the partial unique index guards a double-book), moves/recreates the
    Google event + PB session (best-effort), and emails the new time."""
    if booking.get("status") != "confirmed":
        raise RescheduleError(409, "Only confirmed bookings can be rescheduled.")

    settings = await _load_app_settings()
    slot_minutes = int(booking.get("duration_minutes") or settings.get("slot_minutes") or 30)
    booking_id = booking["booking_id"]
    old_director_id = booking["director_id"]
    old_event_id = booking.get("gcal_event_id")
    old_calendar_id = booking.get("gcal_calendar_id")
    old_pb_session_id = booking.get("pb_session_id")

    try:
        new_start = datetime.fromisoformat(new_start_iso.replace("Z", "+00:00")).astimezone(tz.utc)
    except (ValueError, AttributeError):
        raise RescheduleError(400, "Invalid date/time.")
    new_end = new_start + timedelta(minutes=slot_minutes)
    # Admin reschedule intentionally enforces only "in the future" + director availability.
    # The patient-facing min_notice_minutes / max_advance_days guardrails are deliberately
    # NOT applied here, so an admin can move a session inside those windows on request.
    if new_start <= datetime.now(tz.utc):
        raise RescheduleError(400, "Choose a time in the future.")

    existing = booking.get("slot_start_utc")
    if isinstance(existing, datetime):
        existing_aware = existing if existing.tzinfo else existing.replace(tzinfo=tz.utc)
        if int(existing_aware.timestamp()) == int(new_start.timestamp()):
            return booking  # no-op: same time

    # ---- Legacy (PB-engine) rows: PB owns the meeting AND all patient emails (it holds
    # the Zoom link we never see) — no Google event, no local availability rules, none of
    # our notices. Move the PB session by id and mirror the ledger.
    if booking.get("engine") == "pb":
        if pb_service is None:
            raise RescheduleError(503, "Practice Better is not configured.")
        # Validate against PB's availability for this consultant — the same source the
        # reschedule picker showed. Best-effort: PB enforces its own conflicts regardless.
        consultant_id = booking.get("consultant_id")
        try:
            slots, _ = await get_cached_availability(date.today().isoformat(), 60, pb_service)
            slot_ok = any((not consultant_id or s.consultant_id == consultant_id)
                          and int(s.start_time.timestamp()) == int(new_start.timestamp())
                          for s in slots)
        except Exception:
            slot_ok = True
        if not slot_ok:
            raise RescheduleError(409, "That time isn't available. Please pick another slot.")
        try:
            await pb_service.reschedule_session(
                booking["pb_session_id"], new_start_iso,
                duration_seconds=slot_minutes * 60, correlation_id=correlation_id)
        except Exception as e:
            logger.warning(f"[{correlation_id}] Legacy PB reschedule failed: {e}")
            raise RescheduleError(502, "Practice Better couldn't move the session. Please try again.")
        set_fields = {"slot_start_utc": new_start, "slot_end_utc": new_end, "updated_at": _now_iso()}
        await db.bookings.update_one({"booking_id": booking_id}, {"$set": set_fields})
        booking.update(set_fields)
        await _sync_user_booking_info(booking, clear=False)
        logger.info(f"[{correlation_id}] Legacy booking {booking_id} rescheduled to {new_start.isoformat()} by {actor}")
        return booking

    # Which active directors are free at the new slot? Keep the same one if possible, else reassign.
    free = await availability_engine.directors_free_at(db, new_start, exclude_booking_id=booking_id)
    if not free:
        raise RescheduleError(409, "No director is available at that time. Please pick another slot.")
    new_director = next((d for d in free if d["director_id"] == old_director_id), None) or free[0]
    new_director_id = new_director["director_id"]
    director_changed = new_director_id != old_director_id

    new_director_doc = await db.directors.find_one({"director_id": new_director_id}, {"_id": 0}) or {}
    new_director_tz = new_director_doc.get("timezone") or "UTC"
    new_calendar_id = (new_director_doc.get("google_calendar_id") or "").strip()

    # Atomically move the ledger row (slot + director/calendar if it changed).
    set_fields = {"slot_start_utc": new_start, "slot_end_utc": new_end, "updated_at": _now_iso()}
    if director_changed:
        set_fields["director_id"] = new_director_id
        set_fields["gcal_calendar_id"] = new_calendar_id
    try:
        res = await db.bookings.update_one(
            {"booking_id": booking_id, "status": "confirmed"}, {"$set": set_fields})
    except DuplicateKeyError:
        raise RescheduleError(409, "That time was just taken. Please pick another slot.")
    if res.matched_count == 0:
        raise RescheduleError(409, "Booking is no longer active.")
    booking.update(set_fields)

    # Refresh the patient-facing booking_info to the new time.
    await _sync_user_booking_info(booking, clear=False)

    session = _session_by_id(settings, booking.get("session_id")) or _portal_session(settings)
    session_title = booking.get("session_title")
    if not session_title:
        # Legacy/edge rows with no stored title: resolve the raw template's {{user}} from the
        # baked-in patient rather than leaking a literal placeholder into the event + email.
        _p = booking.get("patient") or {}
        session_title = await _resolve_session_title(
            session.get("title") or "Strategy Session",
            _p.get("first_name"), _p.get("last_name"), booking.get("user_id"))

    # ---- Google Calendar ----
    if director_changed:
        # New director = different calendar. Create the new event (fresh Meet link) BEFORE deleting
        # the old one; on failure leave gcal_status=pending for the admin retry queue.
        try:
            new_event_id, new_meet = await gcal.create_event_with_meet(
                calendar_id=new_calendar_id, summary=session_title, description=(booking.get("notes") or ""),
                start_utc=new_start, end_utc=new_end, timezone=new_director_tz,
                attendee_email=(booking.get("patient") or {}).get("email"),
                director_email=(new_director_doc.get("email") or "").strip() or None,
                request_id=f"cadence-{booking_id}-{int(new_start.timestamp())}",
            )
            await db.bookings.update_one({"booking_id": booking_id},
                {"$set": {"gcal_event_id": new_event_id, "meet_link": new_meet,
                          "gcal_status": "synced", "updated_at": _now_iso()}})
            booking.update({"gcal_event_id": new_event_id, "meet_link": new_meet})
            # The new-booking path adds the day's PCC coordinator; a director-change reschedule
            # builds a fresh event, so re-apply the rota for the new director/day (best-effort).
            await _add_day_pcc_to_new_booking(booking, new_director_tz, correlation_id)
            if old_event_id and old_calendar_id:
                try:
                    await gcal.delete_event(calendar_id=old_calendar_id, event_id=old_event_id)
                except Exception as e:
                    logger.warning(f"[{correlation_id}] Old Google event delete failed (orphan): {e}")
        except Exception as e:
            logger.warning(f"[{correlation_id}] New Google event (director change) failed: {e}")
            await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"gcal_status": "pending"}})
    elif old_event_id and old_calendar_id:
        try:
            await gcal.update_event_time(
                calendar_id=old_calendar_id, event_id=old_event_id,
                start_utc=new_start, end_utc=new_end, timezone=new_director_tz,
            )
        except Exception as e:
            logger.warning(f"[{correlation_id}] Google reschedule failed (continuing): {e}")
            await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"gcal_status": "pending"}})

    # ---- Practice Better ----
    if pb_service is not None:
        pb_mode = (settings.get("pb_booking_mode") or "one_director").strip()
        if director_changed and pb_mode == "per_director":
            # Consultant changes with the director: cancel the old session, recreate under the new one.
            await _pb_reassign_session(booking, old_pb_session_id, new_director_id, new_start_iso,
                                       session, settings, pb_service, correlation_id)
        elif old_pb_session_id:
            # Same consultant (same director, or one_director shared consultant): just move the date.
            try:
                await pb_service.reschedule_session(
                    old_pb_session_id, new_start_iso,
                    duration_seconds=slot_minutes * 60, correlation_id=correlation_id,
                )
            except Exception as e:
                logger.warning(f"[{correlation_id}] PB reschedule failed (continuing): {e}")
                await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"pb_status": "pending"}})

    # ---- Email (new time + possibly a new Meet link) ----
    patient = booking.get("patient") or {}
    if patient.get("email"):
        try:
            await booking_email.send_reschedule_notice(
                to_email=patient["email"], first_name=patient.get("first_name") or "there",
                session_title=session_title,
                session_start_iso=_iso(new_start), patient_timezone=booking.get("patient_timezone"),
                meet_link=booking.get("meet_link"),
            )
        except Exception as e:
            logger.warning(f"[{correlation_id}] Reschedule email failed: {e}")

    logger.info(f"[{correlation_id}] Booking {booking_id} rescheduled to {new_start.isoformat()} "
                f"(director {old_director_id} -> {new_director_id}) by {actor}")
    return booking


# ============================================================================
# Patient Care Coordinator (PCC) rota — add the day's coordinator as a meeting
# attendee so the Director can hand the call over and leave. Meet keeps running
# until the last person leaves, so no host transfer is needed (attendee-only).
# ============================================================================

async def _bookings_on_local_day(director_id: str, date_str: str, director_tz: str) -> list:
    """Confirmed bookings for a director on a given calendar day (in the director's tz)."""
    try:
        zone = ZoneInfo(director_tz or "UTC")
    except Exception:
        zone = tz.utc
    d = date.fromisoformat(date_str)
    start_local = datetime(d.year, d.month, d.day, tzinfo=zone)
    start_utc = start_local.astimezone(tz.utc)
    end_utc = (start_local + timedelta(days=1)).astimezone(tz.utc)
    return [b async for b in db.bookings.find(
        {"director_id": director_id, "status": "confirmed",
         "slot_start_utc": {"$gte": start_utc, "$lt": end_utc}},
        {"_id": 0},
    )]


async def apply_pcc_to_day(director_id: str, date_str: str, add_email: Optional[str],
                           remove_email: Optional[str] = None, correlation_id: str = "pcc") -> int:
    """Add (and optionally remove a prior) coordinator as an attendee on every confirmed
    booking for a director on a local day. Best-effort per booking; returns count touched."""
    director = await db.directors.find_one({"director_id": director_id}, {"_id": 0})
    if not director:
        return 0
    bookings = await _bookings_on_local_day(director_id, date_str, director.get("timezone") or "UTC")
    touched = 0
    for b in bookings:
        cal, ev = b.get("gcal_calendar_id"), b.get("gcal_event_id")
        if not cal or not ev:
            continue
        try:
            if remove_email and remove_email.lower() != (add_email or "").lower():
                await gcal.remove_event_attendee(calendar_id=cal, event_id=ev, email=remove_email)
            if add_email:
                await gcal.add_event_attendees(calendar_id=cal, event_id=ev, emails=[add_email])
            touched += 1
        except Exception as e:
            logger.warning(f"[{correlation_id}] PCC attendee sync failed for {b.get('booking_id')}: {e}")
    logger.info(f"[{correlation_id}] PCC apply: director={director_id} date={date_str} touched={touched}")
    return touched


async def _add_day_pcc_to_new_booking(booking: dict, director_tz: str, correlation_id: str) -> None:
    """For a freshly created booking, if the rota already assigns a PCC for that day/director,
    add them as an attendee (covers bookings made after the rota was set). Best-effort."""
    try:
        start = booking.get("slot_start_utc")
        if not isinstance(start, datetime):
            return
        try:
            zone = ZoneInfo(director_tz or "UTC")
        except Exception:
            zone = tz.utc
        local_date = start.astimezone(zone).date().isoformat()
        a = await db.pcc_assignments.find_one(
            {"director_id": booking["director_id"], "date": local_date}, {"_id": 0})
        if not a or not a.get("pcc_email"):
            return
        cal, ev = booking.get("gcal_calendar_id"), booking.get("gcal_event_id")
        if cal and ev:
            await gcal.add_event_attendees(calendar_id=cal, event_id=ev, emails=[a["pcc_email"]])
            logger.info(f"[{correlation_id}] Added day PCC {a['pcc_email']} to new booking {booking['booking_id']}")
    except Exception as e:
        logger.warning(f"[{correlation_id}] day-PCC add on new booking failed: {e}")


@router.post("/book", response_model=BookSessionResponse)
async def book_session(
    request: BookSessionRequest,
    authorization: Optional[str] = Header(None),
    pb_service: Optional[PracticeBetterService] = Depends(get_pb_service_optional),
    idempotency_store: IdempotencyStore = Depends(get_idempotency_store),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Book a session.

    With booking_engine='local' the portal is the sole creator: it assigns a director,
    creates the Google event + Meet link, mirrors to the shared PB account, and emails the
    patient. With booking_engine='pb' (legacy) it books directly in Practice Better.
    """
    logger.info(f"[{correlation_id}] Booking request: {request.email} for {request.slot_start_time}")

    if await _booking_engine() == "local":
        return await _book_local(request, authorization, pb_service, correlation_id)

    # ===== Legacy Practice Better path (booking_engine='pb') =====

    # Per-email cooldown to prevent rapid-fire requests to Practice Better
    email_lower = request.email.lower()
    now = time.time()
    last_attempt = _booking_cooldowns.get(email_lower, 0)
    remaining = BOOKING_COOLDOWN_SECONDS - (now - last_attempt)
    if remaining > 0:
        logger.warning(f"[{correlation_id}] Booking cooldown active for {email_lower}, {remaining:.0f}s remaining")
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {int(remaining)} seconds before trying again."
        )
    
    is_duplicate, existing_session = await idempotency_store.check_and_set(
        request.email,
        request.consultant_id,
        request.slot_start_time
    )
    
    if is_duplicate and existing_session:
        logger.info(f"[{correlation_id}] Duplicate booking detected, returning existing session")
        return BookSessionResponse(
            success=True,
            session_id=existing_session,
            client_record_id="",
            session_start=datetime.fromisoformat(request.slot_start_time.replace("Z", "+00:00")),
            session_end=datetime.fromisoformat(request.slot_start_time.replace("Z", "+00:00")) + timedelta(minutes=30),
            duration=30,
            message="Your booking was already confirmed!",
            is_new_client=False
        )
    
    if is_duplicate:
        logger.warning(f"[{correlation_id}] Booking in progress for same slot")
        raise HTTPException(
            status_code=409,
            detail="A booking for this time slot is already being processed."
        )
    
    try:
        # Use the main 60-day cache (same as what the frontend fetches)
        today = date.today().isoformat()
        cached_slots, _ = await get_cached_availability(today, 60, pb_service)
        
        # Find any slot at the requested time (frontend may send different consultant due to deduplication)
        matching_slot = None
        for slot in cached_slots:
            slot_time = slot.start_time.isoformat().replace("+00:00", "Z")
            if slot_time == request.slot_start_time:
                matching_slot = slot
                break
        
        if not matching_slot:
            await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
            raise HTTPException(
                status_code=409,
                detail="This time slot is no longer available. Please select another time."
            )
        
        # Use the consultant from the matching slot (may differ from frontend request)
        actual_consultant_id = matching_slot.consultant_id
        logger.info(f"[{correlation_id}] Using consultant {actual_consultant_id} for slot {request.slot_start_time}")
        
        booking_request = BookingRequest(
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            phone=request.phone,
            timezone=request.timezone,
            slot_start_time=request.slot_start_time,
            consultant_id=actual_consultant_id,  # Use the actual consultant with this slot
            notes=request.notes
        )
        
        # Set cooldown now — we're about to hit Practice Better's API
        _booking_cooldowns[email_lower] = time.time()
        
        # Pre-flight: check MongoDB for existing PB client record ID
        # This avoids hitting PB's create endpoint for clients that already exist
        email_escaped = re_module.escape(request.email)
        existing_user = await db.users.find_one(
            {"email": {"$regex": f"^{email_escaped}$", "$options": "i"}},
            {"pb_client_record_id": 1}
        )
        existing_pb_id = (existing_user or {}).get("pb_client_record_id")
        if existing_pb_id:
            logger.info(f"[{correlation_id}] Found existing PB record in MongoDB: {existing_pb_id}")
            # Seed the local cache so get_or_create_client finds it
            cache = get_client_cache()
            cache.upsert_client({
                "id": existing_pb_id,
                "profile": {
                    "emailAddress": request.email,
                    "firstName": request.first_name,
                    "lastName": request.last_name,
                    "mobilePhone": request.phone or ""
                },
                "status": "active"
            })
        
        try:
            result = await pb_service.complete_booking(
            booking_request,
            cached_availability=cached_slots,
            correlation_id=correlation_id
        )
        except BookingError:
            # If we used a stored PB ID and it failed, clear the stale record
            if existing_pb_id:
                logger.info(f"[{correlation_id}] Clearing stale pb_client_record_id for {request.email}")
                await db.users.update_one(
                    {"email": {"$regex": f"^{email_escaped}$", "$options": "i"}},
                    {"$unset": {"pb_client_record_id": ""}}
                )
            raise
        
        await idempotency_store.complete(
            request.email,
            request.consultant_id,
            request.slot_start_time,
            result.session_id
        )
        
        logger.info(f"[{correlation_id}] Booking successful: {result.session_id}")

        # Clear cooldown on success
        _booking_cooldowns.pop(email_lower, None)

        # Record in the portal's bookings ledger so the new admin table, dashboard
        # countdown, cancel and reschedule work on legacy bookings too.
        ledger_row = await _record_legacy_booking(request, result, actual_consultant_id, correlation_id)
        
        # Save client_record_id AND auto-advance user to Step 2 as backend fallback
        # This ensures progression even if frontend advancement call fails
        if result.client_record_id:
            try:
                # Prefer the JWT-identified logged-in user (advances the account of whoever
                # is actually using the app, even if they typed a different email in the
                # booking form — e.g. purchaser booking on behalf of someone else).
                # Fall back to email match for unauthenticated flows.
                jwt_user_id = _decode_optional_jwt_user_id(authorization)
                user = None
                match_filter = None
                if jwt_user_id:
                    user = await db.users.find_one({"id": jwt_user_id}, {"_id": 0})
                    if user:
                        match_filter = {"id": jwt_user_id}
                        logger.info(f"[{correlation_id}] Advancing logged-in user {user.get('email')} (via JWT)")
                if not user:
                    user = await db.users.find_one({"email": request.email.lower()}, {"_id": 0})
                    if user:
                        match_filter = {"email": request.email.lower()}
                        logger.info(f"[{correlation_id}] Advancing user by booking email match: {request.email.lower()}")
                
                if user:
                    # Build booking info to store
                    booking_info = {
                        "session_id": result.session_id,
                        "session_start": result.session_start.isoformat() if result.session_start else None,
                        "session_end": result.session_end.isoformat() if result.session_end else None,
                        "duration": result.duration,
                        "consultant_id": request.consultant_id,
                        "timezone": request.timezone,
                        "booked_at": datetime.now(tz.utc).isoformat(),
                        "source": "online_booking",
                        # Ledger linkage + join link (when PB returned one) so the portal
                        # dashboard and admin actions work the same as portal-engine bookings.
                        "booking_id": (ledger_row or {}).get("booking_id"),
                        "director_id": (ledger_row or {}).get("director_id"),
                        "meet_link": (ledger_row or {}).get("meet_link"),
                    }
                    
                    update_fields = {
                        "pb_client_record_id": result.client_record_id,
                        "booking_info": booking_info
                    }
                    
                    # Auto-advance to Step 2 if user is on Step 1 (backend fallback)
                    if user.get("current_step", 1) == 1:
                        update_fields["current_step"] = 2
                        logger.info(f"[{correlation_id}] Auto-advancing user from Step 1 to Step 2")
                        
                        # Also record the task completion
                        from datetime import timezone
                        await db.user_progress.update_one(
                            {"user_id": user["id"], "step_number": 1},
                            {
                                "$set": {
                                    "completed_at": datetime.now(timezone.utc).isoformat(),
                                },
                                "$addToSet": {"tasks_completed": "book_consultation"}
                            },
                            upsert=True
                        )
                        
                        # Send LeadConnector webhook for Step 1 completion
                        try:
                            # Format booking date and time
                            booking_date = None
                            booking_time = None
                            if result.session_start:
                                booking_date = result.session_start.strftime("%Y-%m-%d")
                                booking_time = result.session_start.strftime("%H:%M:%S")
                            
                            webhook_payload = {
                                "email": user.get("email") or request.email,
                                "step": 1,
                                "booking_date": booking_date,
                                "booking_time": booking_time
                            }
                            
                            async with httpx.AsyncClient() as http_client:
                                await http_client.post(
                                    "https://services.leadconnectorhq.com/hooks/ygLPhGfHB5mDOoTJ86um/webhook-trigger/64b3e792-3c1e-4887-b8e3-efa79c58a704",
                                    json=webhook_payload,
                                    timeout=10.0
                                )
                            logger.info(f"[{correlation_id}] Step 1 LeadConnector webhook sent for {webhook_payload['email']}")
                        except Exception as webhook_err:
                            logger.warning(f"[{correlation_id}] Failed to send Step 1 webhook: {webhook_err}")
                    
                    await db.users.update_one(
                        match_filter,
                        {"$set": update_fields}
                    )
                    logger.info(f"[{correlation_id}] Saved booking_info and pb_client_record_id to user record")
                else:
                    logger.warning(f"[{correlation_id}] User not found for booking — JWT sub={jwt_user_id}, email={request.email}")
            except Exception as e:
                # Non-blocking - log but don't fail the booking
                logger.error(f"[{correlation_id}] Failed to update user record: {e}")
        
        return BookSessionResponse(
            success=True,
            session_id=result.session_id,
            client_record_id=result.client_record_id,
            session_start=result.session_start,
            session_end=result.session_end,
            duration=result.duration,
            message="Your onboarding call has been booked successfully!",
            is_new_client=result.is_new_client
        )
    
    except SlotUnavailableError as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        _booking_cooldowns.pop(email_lower, None)  # Slot error, not PB overload
        
        logger.warning(f"[{correlation_id}] Slot unavailable: {e.internal_message}")
        raise HTTPException(
            status_code=409,
            detail=e.message
        )
    
    except BookingError as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        # Keep cooldown only if it's a rate-limit issue; clear for other errors
        if "busy" not in e.message.lower():
            _booking_cooldowns.pop(email_lower, None)
        
        logger.error(f"[{correlation_id}] Booking error: {e.internal_message}")
        raise HTTPException(
            status_code=400,
            detail=e.message
        )
    
    except HTTPException:
        # Re-raise HTTPExceptions (e.g., slot not found) without wrapping
        raise
    
    except httpx.HTTPStatusError as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        
        error_body = e.response.text
        logger.error(f"[{correlation_id}] HTTP error: {e.response.status_code} - {error_body}")
        
        if e.response.status_code == 429:
            # Keep cooldown — PB is overloaded
            raise HTTPException(
                status_code=503,
                detail="Service is busy. Please try again in a moment."
            )
        
        # Non-rate-limit HTTP errors: clear cooldown
        _booking_cooldowns.pop(email_lower, None)
        
        if "slot" in error_body.lower() or "unavailable" in error_body.lower():
            raise HTTPException(
                status_code=409,
                detail="This time slot is no longer available. Please select another time."
            )
        
        raise HTTPException(
            status_code=400,
            detail="We couldn't complete your booking. Please try again."
        )
    
    except Exception as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        _booking_cooldowns.pop(email_lower, None)
        
        logger.error(f"[{correlation_id}] Unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again in a moment."
        )


@router.get("/health")
async def health_check(
    pb_service: PracticeBetterService = Depends(get_practice_better_service)
):
    """
    Health check endpoint.
    Returns 200 if healthy, 503 if Practice Better is unavailable.
    """
    try:
        consultants = await pb_service.get_consultants()
        return {
            "status": "healthy",
            "practice_better_connected": True,
            "active_consultants": len(consultants)
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "practice_better_connected": False,
                "error": str(e)
            }
        )


@router.post(
    "/sync-clients",
    include_in_schema=False
)
async def sync_clients(
    request: Request,
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Sync client records from Practice Better to local cache.
    
    Protected endpoint - requires X-Admin-Key header.
    Should be called by a scheduled job, not exposed publicly.
    """
    admin_key = request.headers.get("X-Admin-Key")
    expected_key = os.environ.get("ADMIN_API_KEY")
    
    if not expected_key:
        logger.warning(f"[{correlation_id}] Sync attempted but ADMIN_API_KEY not configured")
        raise HTTPException(status_code=503, detail="Sync not configured")
    
    if admin_key != expected_key:
        logger.warning(f"[{correlation_id}] Sync attempted with invalid key")
        raise HTTPException(status_code=403, detail="Forbidden")
    
    from services.client_cache import get_client_cache
    from services.client_sync import ClientSyncService
    
    try:
        cache = get_client_cache()
        
        sync_service = ClientSyncService(
            base_url="https://api.practicebetter.io",
            token_getter=pb_service.token_manager.get_token,
            cache=cache
        )
        
        result = await sync_service.sync_all_clients()
        
        logger.info(f"[{correlation_id}] Client sync completed: {result.get('total_synced', 0)} clients")
        
        return {
            "status": "success",
            "total_synced": result.get("total_synced", 0),
            "synced_at": result.get("synced_at"),
            "cached_clients": cache.get_total_cached_clients()
        }
    
    except Exception as e:
        logger.error(f"[{correlation_id}] Client sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/pb-clients/fetch")
async def fetch_pb_clients_to_mongo(
    request: Request,
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Fetch all client records from Practice Better and sync pb_client_record_id
    into MongoDB users collection (matching by email).
    
    Protected endpoint - requires Authorization Bearer token (admin only).
    Returns list of all PB clients fetched and which ones matched local users.
    """
    await _require_admin(request)

    all_pb_clients = []
    last_id = None
    max_pages = 30
    seen_ids: set = set()

    for page in range(max_pages):
        try:
            params = {"limit": 100}
            if last_id:
                params["before_id"] = last_id

            data = await pb_service._request(
                "GET",
                "/consultant/records",
                correlation_id=correlation_id,
                params=params
            )

            items = data.get("items", [])
            if not items:
                break

            # Detect infinite loop
            first_id = items[0].get("id")
            if first_id in seen_ids:
                logger.warning(f"[{correlation_id}] PB fetch pagination loop detected at page {page}")
                break
            for item in items:
                seen_ids.add(item.get("id"))

            all_pb_clients.extend(items)
            last_id = items[-1].get("id")

            if len(items) < 100:
                break

            await asyncio.sleep(0.3)  # Be gentle with PB rate limits
        except Exception as e:
            logger.error(f"[{correlation_id}] Error fetching PB clients page {page}: {e}")
            break

    # Now match PB clients to local MongoDB users by email and store pb_client_record_id
    matched = []
    unmatched = []
    updated = []

    for pb_client in all_pb_clients:
        profile = pb_client.get("profile", {})
        pb_email = (profile.get("emailAddress") or "").lower().strip()
        pb_record_id = pb_client.get("id")
        pb_name = f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()

        if not pb_email:
            continue

        email_escaped = re_module.escape(pb_email)
        local_user = await db.users.find_one(
            {"email": {"$regex": f"^{email_escaped}$", "$options": "i"}},
            {"_id": 0, "email": 1, "name": 1, "pb_client_record_id": 1, "id": 1}
        )

        entry = {
            "pb_record_id": pb_record_id,
            "pb_email": pb_email,
            "pb_name": pb_name,
            "pb_status": pb_client.get("status", "unknown"),
        }

        if local_user:
            entry["local_email"] = local_user.get("email")
            entry["local_name"] = local_user.get("name")
            entry["had_pb_id"] = local_user.get("pb_client_record_id")

            # Update MongoDB with PB record ID if missing or different
            if local_user.get("pb_client_record_id") != pb_record_id:
                await db.users.update_one(
                    {"id": local_user["id"]},
                    {"$set": {"pb_client_record_id": pb_record_id}}
                )
                entry["action"] = "updated"
                updated.append(entry)
            else:
                entry["action"] = "already_synced"

            matched.append(entry)
        else:
            entry["action"] = "no_local_user"
            unmatched.append(entry)

    # Also upsert into local SQLite cache
    from services.client_cache import get_client_cache
    cache = get_client_cache()
    cache.upsert_clients_batch(all_pb_clients)

    return {
        "status": "success",
        "total_pb_clients_fetched": len(all_pb_clients),
        "pages_fetched": min(len(all_pb_clients) // 100 + 1, max_pages),
        "matched_to_local_users": len(matched),
        "updated_in_mongo": len(updated),
        "unmatched_pb_clients": len(unmatched),
        "matched_details": matched,
        "updated_details": updated,
        "unmatched_details": unmatched,
    }


@router.get("/pb-clients/lookup")
async def lookup_pb_client(
    email: str,
    request: Request,
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Look up a specific client by email in Practice Better.
    Returns the PB record if found, and optionally syncs to MongoDB.
    
    Protected - requires admin Bearer token.
    """
    await _require_admin(request)

    # Search PB for this email using the fixed pagination
    pb_record_id = await pb_service.search_client_by_email(email, correlation_id=correlation_id)

    if not pb_record_id:
        return {
            "found": False,
            "email": email,
            "message": "Client not found in Practice Better"
        }

    # Check local user
    email_escaped = re_module.escape(email.lower().strip())
    local_user = await db.users.find_one(
        {"email": {"$regex": f"^{email_escaped}$", "$options": "i"}},
        {"_id": 0, "email": 1, "name": 1, "pb_client_record_id": 1, "id": 1}
    )

    result = {
        "found": True,
        "email": email,
        "pb_record_id": pb_record_id,
    }

    if local_user:
        old_id = local_user.get("pb_client_record_id")
        if old_id != pb_record_id:
            await db.users.update_one(
                {"id": local_user["id"]},
                {"$set": {"pb_client_record_id": pb_record_id}}
            )
            result["mongo_action"] = "updated"
            result["old_pb_id"] = old_id
        else:
            result["mongo_action"] = "already_synced"
        result["local_user"] = local_user.get("email")
    else:
        result["mongo_action"] = "no_local_user"

    return result


@router.get("/cache-status")
async def cache_status(
    correlation_id: str = Depends(get_correlation_id)
):
    """Get the current status of the client cache and availability cache."""
    from services.client_cache import get_client_cache
    
    cache = get_client_cache()
    sync_info = cache.get_last_sync_info()
    
    return {
        "total_cached_clients": cache.get_total_cached_clients(),
        "last_sync": sync_info.get("last_sync"),
        "needs_sync": cache.needs_sync(max_age_minutes=60),
        "availability_cache_entries": len(_availability_cache)
    }


@router.get("/cache-lookup")
async def cache_lookup(
    email: str,
    request: Request = None,
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Check if a specific email exists in the local SQLite cache (admin debug tool).

    Admin-gated: "does this email belong to a client of the practice" is sensitive
    membership information for a medical practice, even without profile fields.
    """
    await _require_admin(request)
    from services.client_cache import get_client_cache
    cache = get_client_cache()
    client = cache.get_client_by_email(email)

    if client:
        return {
            "found": True,
            "email": email,
            "record_id": client.get("record_id"),
            "status": client.get("status"),
            "synced_at": client.get("synced_at"),
        }
    return {
        "found": False,
        "email": email,
        "message": "Not in local cache. Will be searched in PB on next booking attempt."
    }
