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
import httpx
import logging
import uuid
import os
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
    get_practice_better_service,
    get_idempotency_store,
    IdempotencyStore,
)
from services.client_cache import get_client_cache

# Import database connection
from motor.motor_asyncio import AsyncIOMotorClient
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
    """Response after successful booking"""
    success: bool
    session_id: str
    client_record_id: str
    session_start: datetime
    session_end: datetime
    duration: int
    message: str
    is_new_client: bool = False


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


async def refresh_availability_cache():
    """Background task to refresh availability cache and periodically sync clients"""
    global _availability_cache, _background_task_running
    
    _background_task_running = True
    logger.info("Starting background availability cache refresh task")
    sync_counter = 0
    CLIENT_SYNC_EVERY_N_CYCLES = 15  # ~30 min at 2-min intervals
    MONGO_SYNC_EVERY_N_CYCLES = 60  # ~2 hours at 2-min intervals
    mongo_sync_counter = 0
    
    while _background_task_running:
        try:
            pb_service = get_practice_better_service()
            today = date.today().isoformat()
            
            logger.info(f"[background] Refreshing availability cache for {today}")
            
            # Fetch fresh availability
            slots, dates = await pb_service.get_availability(today, 60, correlation_id="bg-refresh")
            
            # Update cache
            cache_key = f"{today}:60"  # Cache for 60 days of data
            _availability_cache[cache_key] = {
                "data": (slots, dates),
                "expires_at": time.time() + AVAILABILITY_CACHE_TTL,
                "refreshed_at": time.time()
            }
            
            # Also cache common query patterns
            for days in [14, 30]:
                filtered_slots = [s for s in slots if (datetime.fromisoformat(s.start_time.isoformat()) - datetime.now(tz.utc)).days < days]
                filtered_dates = [d for d in dates if (date.fromisoformat(d) - date.today()).days < days]
                cache_key = f"{today}:{days}"
                _availability_cache[cache_key] = {
                    "data": (filtered_slots, filtered_dates),
                    "expires_at": time.time() + AVAILABILITY_CACHE_TTL,
                    "refreshed_at": time.time()
                }
            
            logger.info(f"[background] Cache refreshed: {len(slots)} slots, {len(dates)} dates")
            
            # Periodic client sync (SQLite cache)
            sync_counter += 1
            if sync_counter >= CLIENT_SYNC_EVERY_N_CYCLES:
                sync_counter = 0
                try:
                    from services.client_sync import ClientSyncService
                    sync_service = ClientSyncService(
                        base_url=pb_service.config.base_url,
                        token_getter=pb_service.token_manager.get_token
                    )
                    result = await sync_service.sync_all_clients()
                    logger.info(f"[background] Client sync complete: {result}")
                except Exception as e:
                    logger.warning(f"[background] Client sync failed: {e}")
            
            # Periodic MongoDB sync (match cached PB clients to local users, no extra API calls)
            mongo_sync_counter += 1
            if mongo_sync_counter >= MONGO_SYNC_EVERY_N_CYCLES:
                mongo_sync_counter = 0
                try:
                    await sync_pb_clients_to_mongo(correlation_id="bg-mongo-sync")
                except Exception as e:
                    logger.warning(f"[background] MongoDB PB sync failed: {e}")
            
        except Exception as e:
            logger.error(f"[background] Error refreshing cache: {e}")
            # If rate limited, back off longer (5 minutes instead of 2)
            if "429" in str(e):
                logger.warning("[background] Rate limited, backing off for 5 minutes")
                await asyncio.sleep(300)
                continue
        
        # Wait before next refresh
        await asyncio.sleep(BACKGROUND_REFRESH_INTERVAL)
    
    logger.info("Background availability cache refresh task stopped")


def start_background_refresh():
    """Start the background refresh task"""
    global _background_task
    
    if _background_task is None or _background_task.done():
        _background_task = asyncio.create_task(refresh_availability_cache())
        logger.info("Background cache refresh task started")


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



async def get_cached_availability(
    start_date: str,
    days: int,
    pb_service: PracticeBetterService
) -> tuple:
    """Get availability with caching - returns cached data instantly if available"""
    cache_key = f"{start_date}:{days}"
    
    # Check if we have cached data (even if slightly stale, return it for instant loading)
    if cache_key in _availability_cache:
        cached = _availability_cache[cache_key]
        # Return cached data - background task keeps it fresh
        logger.debug(f"Returning cached availability (age: {time.time() - cached.get('refreshed_at', 0):.0f}s)")
        return cached["data"]
    
    # No cache - fetch fresh (this only happens on first request)
    logger.info(f"Cache miss for {cache_key}, fetching fresh data")
    slots, dates = await pb_service.get_availability(start_date, days)
    
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

@router.get("/availability", response_model=AvailabilityResponse)
async def get_availability(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    days: int = Query(14, ge=1, le=60, description="Number of days to fetch"),
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Get available booking slots for all consultants.
    Results are cached for 60 seconds.
    """
    try:
        date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if date.fromisoformat(start_date) < date.today():
        start_date = date.today().isoformat()
    
    logger.info(f"[{correlation_id}] Fetching availability from {start_date} for {days} days")
    
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
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    correlation_id: str = Depends(get_correlation_id)
):
    """Get available slots for a specific date"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if target_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot fetch availability for past dates")
    
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
    try:
        secret_key = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


@router.post("/book", response_model=BookSessionResponse)
async def book_session(
    request: BookSessionRequest,
    authorization: Optional[str] = Header(None),
    pb_service: PracticeBetterService = Depends(get_practice_better_service),
    idempotency_store: IdempotencyStore = Depends(get_idempotency_store),
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Book a session with a consultant.
    
    Includes:
    - Idempotency protection (prevents duplicate bookings)
    - Slot validation against cached availability
    - Automatic client creation if needed
    """
    logger.info(f"[{correlation_id}] Booking request: {request.email} for {request.slot_start_time}")
    
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
                        "source": "online_booking"
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
    # Auth: reuse the JWT admin check from server.py
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = auth_header.replace("Bearer ", "")
    try:
        secret_key = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = auth_header.replace("Bearer ", "")
    try:
        secret_key = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
    correlation_id: str = Depends(get_correlation_id)
):
    """
    Check if a specific email exists in the local SQLite cache.
    No auth required — only returns whether the record exists and the ID (no PII).
    """
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
