"""
FastAPI Routes for Practice Better Booking System (v2)

Improvements:
- Slot validation before booking
- Idempotency protection
- Proper health check status codes
- Structured logging with correlation IDs
- Future date validation
- Background cache refresh for instant loading
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/booking", tags=["booking"])


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
    """Background task to refresh availability cache"""
    global _availability_cache, _background_task_running
    
    _background_task_running = True
    logger.info("Starting background availability cache refresh task")
    
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
            
        except Exception as e:
            logger.error(f"[background] Error refreshing cache: {e}")
        
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


@router.post("/book", response_model=BookSessionResponse)
async def book_session(
    request: BookSessionRequest,
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
        start_date = request.slot_start_time.split("T")[0]
        cached_slots, _ = await get_cached_availability(start_date, 1, pb_service)
        
        slot_exists = any(
            slot.consultant_id == request.consultant_id and
            slot.start_time.isoformat() == request.slot_start_time
            for slot in cached_slots
        )
        
        if not slot_exists:
            await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
            raise HTTPException(
                status_code=409,
                detail="This time slot is no longer available. Please select another time."
            )
        
        booking_request = BookingRequest(
            first_name=request.first_name,
            last_name=request.last_name,
            email=request.email,
            phone=request.phone,
            timezone=request.timezone,
            slot_start_time=request.slot_start_time,
            consultant_id=request.consultant_id,
            notes=request.notes
        )
        
        result = await pb_service.complete_booking(
            booking_request,
            cached_availability=cached_slots,
            correlation_id=correlation_id
        )
        
        await idempotency_store.complete(
            request.email,
            request.consultant_id,
            request.slot_start_time,
            result.session_id
        )
        
        logger.info(f"[{correlation_id}] Booking successful: {result.session_id}")
        
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
        
        logger.warning(f"[{correlation_id}] Slot unavailable: {e.internal_message}")
        raise HTTPException(
            status_code=409,
            detail=e.message
        )
    
    except BookingError as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        
        logger.error(f"[{correlation_id}] Booking error: {e.internal_message}")
        raise HTTPException(
            status_code=400,
            detail=e.message
        )
    
    except httpx.HTTPStatusError as e:
        await idempotency_store.remove(request.email, request.consultant_id, request.slot_start_time)
        
        error_body = e.response.text
        logger.error(f"[{correlation_id}] HTTP error: {e.response.status_code} - {error_body}")
        
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="Service is busy. Please try again in a moment."
            )
        
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
