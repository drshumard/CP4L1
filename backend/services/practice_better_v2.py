"""
Practice Better API Integration Service (v2)

Improvements over v1:
- Shared httpx.AsyncClient with connection pooling
- In-memory availability cache (60s TTL)
- Jittered retry with exponential backoff
- Correlation ID tracking
- Async booking verification
- Externalized configuration
- Structured logging
"""

import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import asyncio
from pydantic import BaseModel, EmailStr
import os
import time
import logging
import random
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ============================================================================
# IANA to Windows Timezone Mapping
# ============================================================================

TIMEZONE_MAP = {
    "Etc/GMT+12": "Dateline Standard Time",
    "Etc/GMT+11": "UTC-11",
    "America/Adak": "Aleutian Standard Time",
    "Pacific/Honolulu": "Hawaiian Standard Time",
    "Pacific/Marquesas": "Marquesas Standard Time",
    "America/Anchorage": "Alaskan Standard Time",
    "Etc/GMT+9": "UTC-09",
    "America/Tijuana": "Pacific Standard Time (Mexico)",
    "Etc/GMT+8": "UTC-08",
    "America/Los_Angeles": "Pacific Standard Time",
    "America/Phoenix": "US Mountain Standard Time",
    "America/Mazatlan": "Mountain Standard Time (Mexico)",
    "America/Denver": "Mountain Standard Time",
    "America/Whitehorse": "Yukon Standard Time",
    "America/Guatemala": "Central America Standard Time",
    "America/Chicago": "Central Standard Time",
    "Pacific/Easter": "Easter Island Standard Time",
    "America/Mexico_City": "Central Standard Time (Mexico)",
    "America/Regina": "Canada Central Standard Time",
    "America/Bogota": "SA Pacific Standard Time",
    "America/Cancun": "Eastern Standard Time (Mexico)",
    "America/New_York": "Eastern Standard Time",
    "America/Port-au-Prince": "Haiti Standard Time",
    "America/Havana": "Cuba Standard Time",
    "America/Indiana/Indianapolis": "US Eastern Standard Time",
    "America/Grand_Turk": "Turks And Caicos Standard Time",
    "America/Halifax": "Atlantic Standard Time",
    "America/Caracas": "Venezuela Standard Time",
    "America/Cuiaba": "Central Brazilian Standard Time",
    "America/La_Paz": "SA Western Standard Time",
    "America/Santiago": "Pacific SA Standard Time",
    "America/St_Johns": "Newfoundland Standard Time",
    "America/Araguaina": "Tocantins Standard Time",
    "America/Asuncion": "Paraguay Standard Time",
    "America/Sao_Paulo": "E. South America Standard Time",
    "America/Cayenne": "SA Eastern Standard Time",
    "America/Argentina/Buenos_Aires": "Argentina Standard Time",
    "America/Montevideo": "Montevideo Standard Time",
    "America/Punta_Arenas": "Magallanes Standard Time",
    "America/Miquelon": "Saint Pierre Standard Time",
    "America/Bahia": "Bahia Standard Time",
    "Etc/GMT+2": "UTC-02",
    "America/Nuuk": "Greenland Standard Time",
    "Atlantic/Azores": "Azores Standard Time",
    "Atlantic/Cape_Verde": "Cape Verde Standard Time",
    "Etc/UTC": "UTC",
    "Europe/London": "GMT Standard Time",
    "Africa/Abidjan": "Greenwich Standard Time",
    "Africa/Sao_Tome": "Sao Tome Standard Time",
    "Africa/Casablanca": "Morocco Standard Time",
    "Europe/Berlin": "W. Europe Standard Time",
    "Europe/Budapest": "Central Europe Standard Time",
    "Europe/Paris": "Romance Standard Time",
    "Europe/Warsaw": "Central European Standard Time",
    "Africa/Lagos": "W. Central Africa Standard Time",
    "Europe/Bucharest": "GTB Standard Time",
    "Asia/Beirut": "Middle East Standard Time",
    "Africa/Cairo": "Egypt Standard Time",
    "Europe/Chisinau": "E. Europe Standard Time",
    "Asia/Hebron": "West Bank Standard Time",
    "Africa/Johannesburg": "South Africa Standard Time",
    "Europe/Kyiv": "FLE Standard Time",
    "Asia/Jerusalem": "Israel Standard Time",
    "Africa/Juba": "South Sudan Standard Time",
    "Europe/Kaliningrad": "Kaliningrad Standard Time",
    "Africa/Khartoum": "Sudan Standard Time",
    "Africa/Tripoli": "Libya Standard Time",
    "Africa/Windhoek": "Namibia Standard Time",
    "Asia/Amman": "Jordan Standard Time",
    "Asia/Baghdad": "Arabic Standard Time",
    "Asia/Damascus": "Syria Standard Time",
    "Europe/Istanbul": "Turkey Standard Time",
    "Asia/Riyadh": "Arab Standard Time",
    "Europe/Minsk": "Belarus Standard Time",
    "Europe/Moscow": "Russian Standard Time",
    "Africa/Nairobi": "E. Africa Standard Time",
    "Europe/Volgograd": "Volgograd Standard Time",
    "Asia/Tehran": "Iran Standard Time",
    "Asia/Dubai": "Arabian Standard Time",
    "Europe/Astrakhan": "Astrakhan Standard Time",
    "Asia/Baku": "Azerbaijan Standard Time",
    "Europe/Samara": "Russia Time Zone 3",
    "Indian/Mauritius": "Mauritius Standard Time",
    "Europe/Saratov": "Saratov Standard Time",
    "Asia/Tbilisi": "Georgian Standard Time",
    "Asia/Yerevan": "Caucasus Standard Time",
    "Asia/Kabul": "Afghanistan Standard Time",
    "Asia/Ashgabat": "West Asia Standard Time",
    "Asia/Yekaterinburg": "Ekaterinburg Standard Time",
    "Asia/Karachi": "Pakistan Standard Time",
    "Asia/Qyzylorda": "Qyzylorda Standard Time",
    "Asia/Kolkata": "India Standard Time",
    "Asia/Colombo": "Sri Lanka Standard Time",
    "Asia/Kathmandu": "Nepal Standard Time",
    "Asia/Almaty": "Central Asia Standard Time",
    "Asia/Dhaka": "Bangladesh Standard Time",
    "Asia/Omsk": "Omsk Standard Time",
    "Asia/Yangon": "Myanmar Standard Time",
    "Asia/Bangkok": "SE Asia Standard Time",
    "Asia/Barnaul": "Altai Standard Time",
    "Asia/Hovd": "W. Mongolia Standard Time",
    "Asia/Krasnoyarsk": "North Asia Standard Time",
    "Asia/Novosibirsk": "N. Central Asia Standard Time",
    "Asia/Tomsk": "Tomsk Standard Time",
    "Asia/Shanghai": "China Standard Time",
    "Asia/Irkutsk": "North Asia East Standard Time",
    "Asia/Singapore": "Singapore Standard Time",
    "Australia/Perth": "W. Australia Standard Time",
    "Asia/Taipei": "Taipei Standard Time",
    "Asia/Ulaanbaatar": "Ulaanbaatar Standard Time",
    "Australia/Eucla": "Aus Central W. Standard Time",
    "Asia/Chita": "Transbaikal Standard Time",
    "Asia/Tokyo": "Tokyo Standard Time",
    "Asia/Pyongyang": "North Korea Standard Time",
    "Asia/Seoul": "Korea Standard Time",
    "Asia/Yakutsk": "Yakutsk Standard Time",
    "Australia/Adelaide": "Cen. Australia Standard Time",
    "Australia/Darwin": "AUS Central Standard Time",
    "Australia/Brisbane": "E. Australia Standard Time",
    "Australia/Sydney": "AUS Eastern Standard Time",
    "Pacific/Guam": "West Pacific Standard Time",
    "Australia/Hobart": "Tasmania Standard Time",
    "Asia/Vladivostok": "Vladivostok Standard Time",
    "Australia/Lord_Howe": "Lord Howe Standard Time",
    "Pacific/Bougainville": "Bougainville Standard Time",
    "Asia/Srednekolymsk": "Russia Time Zone 10",
    "Asia/Magadan": "Magadan Standard Time",
    "Pacific/Norfolk": "Norfolk Standard Time",
    "Asia/Sakhalin": "Sakhalin Standard Time",
    "Pacific/Guadalcanal": "Central Pacific Standard Time",
    "Asia/Kamchatka": "Russia Time Zone 11",
    "Pacific/Auckland": "New Zealand Standard Time",
    "Etc/GMT-12": "UTC+12",
    "Pacific/Fiji": "Fiji Standard Time",
    "Pacific/Chatham": "Chatham Islands Standard Time",
    "Etc/GMT-13": "UTC+13",
    "Pacific/Tongatapu": "Tonga Standard Time",
    "Pacific/Apia": "Samoa Standard Time",
    "Pacific/Kiritimati": "Line Islands Standard Time",
}


def convert_timezone_to_windows(iana_timezone: str) -> str:
    """Convert IANA timezone to Windows timezone format."""
    result = TIMEZONE_MAP.get(iana_timezone)
    if result is None:
        logger.warning(f"Unknown timezone: {iana_timezone}, falling back to UTC")
        return "UTC"
    return result


# ============================================================================
# Configuration
# ============================================================================

class PracticeBetterConfig(BaseModel):
    """Configuration for Practice Better API - all values externalized"""
    base_url: str = "https://api.practicebetter.io"
    client_id: str
    client_secret: str
    service_id: str
    
    session_duration: int = 30
    session_type: str = "virtual"
    telehealth_app: str = "zoom"
    
    practitioner_ids: Optional[List[str]] = None
    tag_ids: List[str] = []
    send_invitation: bool = True
    portal_base_url: str = "https://portal.practicebetter.io"
    availability_cache_ttl: int = 60
    max_retries: int = 3
    retry_base_delay: float = 1.0
    retry_max_delay: float = 10.0
    
    @classmethod
    def from_env(cls) -> "PracticeBetterConfig":
        """Create config from environment variables with validation."""
        required = ["PRACTICE_BETTER_CLIENT_ID", "PRACTICE_BETTER_CLIENT_SECRET", "PRACTICE_BETTER_SERVICE_ID"]
        missing = [var for var in required if not os.environ.get(var)]
        
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        
        tag_ids_str = os.environ.get("PRACTICE_BETTER_TAG_IDS", "")
        tag_ids = [t.strip() for t in tag_ids_str.split(",") if t.strip()]
        
        prac_ids_str = os.environ.get("PRACTICE_BETTER_PRACTITIONER_IDS", "")
        practitioner_ids = [p.strip() for p in prac_ids_str.split(",") if p.strip()] or None
        
        return cls(
            base_url=os.environ.get("PRACTICE_BETTER_BASE_URL", "https://api.practicebetter.io"),
            client_id=os.environ["PRACTICE_BETTER_CLIENT_ID"],
            client_secret=os.environ["PRACTICE_BETTER_CLIENT_SECRET"],
            service_id=os.environ["PRACTICE_BETTER_SERVICE_ID"],
            session_duration=int(os.environ.get("PRACTICE_BETTER_SESSION_DURATION", "30")),
            session_type=os.environ.get("PRACTICE_BETTER_SESSION_TYPE", "virtual"),
            telehealth_app=os.environ.get("PRACTICE_BETTER_TELEHEALTH_APP", "zoom"),
            practitioner_ids=practitioner_ids,
            tag_ids=tag_ids,
            send_invitation=os.environ.get("PRACTICE_BETTER_SEND_INVITATION", "true").lower() == "true",
            portal_base_url=os.environ.get("PRACTICE_BETTER_PORTAL_URL", "https://portal.practicebetter.io"),
            availability_cache_ttl=int(os.environ.get("PRACTICE_BETTER_CACHE_TTL", "60")),
            max_retries=int(os.environ.get("PRACTICE_BETTER_MAX_RETRIES", "3")),
        )


# ============================================================================
# Models
# ============================================================================

class ClientProfile(BaseModel):
    """Client information for creating a record"""
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    timezone: Optional[str] = None


class TimeSlot(BaseModel):
    """Available time slot with consultant info"""
    start_time: datetime
    end_time: datetime
    duration: int
    consultant_id: str
    consultant_name: str


class BookingRequest(BaseModel):
    """Request to book a session"""
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    timezone: str
    slot_start_time: str
    consultant_id: str
    notes: Optional[str] = None


class BookingResult(BaseModel):
    """Result of a successful booking"""
    session_id: str
    client_record_id: str
    consultant_name: str
    session_start: datetime
    session_end: datetime
    duration: int
    is_new_client: bool = False


# ============================================================================
# Custom Exceptions
# ============================================================================

class BookingError(Exception):
    """Booking failed with user-friendly message"""
    def __init__(self, message: str, internal_message: str = None):
        self.message = message
        self.internal_message = internal_message or message
        super().__init__(message)


class SlotUnavailableError(BookingError):
    """Specific error when slot is no longer available"""
    def __init__(self, internal_message: str = None):
        super().__init__(
            "This time slot is no longer available. Please select another time.",
            internal_message
        )


# ============================================================================
# Cache
# ============================================================================

@dataclass
class CacheEntry:
    """Single cache entry with expiration"""
    data: any
    expires_at: float
    
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class AvailabilityCache:
    """In-memory cache for availability data"""
    
    def __init__(self, ttl: int = 60):
        self.ttl = ttl
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[any]:
        async with self._lock:
            entry = self._cache.get(key)
            if entry and not entry.is_expired():
                return entry.data
            if entry:
                del self._cache[key]
            return None
    
    async def set(self, key: str, data: any) -> None:
        async with self._lock:
            self._cache[key] = CacheEntry(
                data=data,
                expires_at=time.time() + self.ttl
            )
    
    async def clear(self) -> None:
        async with self._lock:
            self._cache.clear()


# ============================================================================
# Token Management
# ============================================================================

class TokenManager:
    """Manages OAuth2 tokens with automatic refresh"""
    
    def __init__(self, config: PracticeBetterConfig):
        self.config = config
        self._token: Optional[str] = None
        self._expires_at: float = 0
        self._lock = asyncio.Lock()
    
    async def get_token(self, client: httpx.AsyncClient) -> str:
        async with self._lock:
            if self._token and time.time() < self._expires_at - 60:
                return self._token
            
            response = await client.post(
                f"{self.config.base_url}/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            self._token = data["access_token"]
            self._expires_at = time.time() + data.get("expires_in", 3600)
            
            return self._token


# ============================================================================
# Main Service
# ============================================================================

class PracticeBetterService:
    """Main service for Practice Better API interactions"""
    
    def __init__(self, config: PracticeBetterConfig):
        self.config = config
        self.token_manager = TokenManager(config)
        self._client: Optional[httpx.AsyncClient] = None
        self._availability_cache = AvailabilityCache(ttl=config.availability_cache_ttl)
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5)
            )
        return self._client
    
    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def _request(
        self,
        method: str,
        path: str,
        correlation_id: str = None,
        **kwargs
    ) -> dict:
        """Make authenticated request with retries"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        client = await self._get_client()
        token = await self.token_manager.get_token(client)
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Correlation-ID"] = cid
        
        url = f"{self.config.base_url}{path}"
        
        for attempt in range(self.config.max_retries):
            try:
                response = await client.request(method, url, headers=headers, **kwargs)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    self.token_manager._token = None
                    token = await self.token_manager.get_token(client)
                    headers["Authorization"] = f"Bearer {token}"
                    continue
                if attempt == self.config.max_retries - 1:
                    raise
                delay = min(
                    self.config.retry_base_delay * (2 ** attempt) + random.uniform(0, 1),
                    self.config.retry_max_delay
                )
                await asyncio.sleep(delay)
            except Exception as e:
                if attempt == self.config.max_retries - 1:
                    raise
                delay = min(
                    self.config.retry_base_delay * (2 ** attempt) + random.uniform(0, 1),
                    self.config.retry_max_delay
                )
                await asyncio.sleep(delay)
        
        raise Exception(f"Request failed after {self.config.max_retries} attempts")
    
    async def get_consultants(self, correlation_id: str = None) -> List[dict]:
        """
        Get list of practitioners/consultants.
        
        NOTE: The Practice Better API /consultant/records endpoint returns clients, not practitioners.
        So we use the pre-configured practitioner_ids directly instead of fetching them from the API.
        """
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        # Use pre-configured practitioner IDs since the API doesn't have an endpoint 
        # to list team members/practitioners
        if self.config.practitioner_ids:
            logger.info(f"[{cid}] Using {len(self.config.practitioner_ids)} pre-configured practitioner IDs")
            return [
                {"id": pid, "profile": {"firstName": "", "lastName": ""}}
                for pid in self.config.practitioner_ids
            ]
        
        # Fallback: If no practitioner IDs configured, log a warning
        logger.warning(f"[{cid}] No practitioner IDs configured - availability will be empty")
        return []
    
    async def get_availability(
        self,
        start_date: str,
        days: int = 14,
        correlation_id: str = None
    ) -> Tuple[List[TimeSlot], List[str]]:
        """Get availability for all consultants"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        cache_key = f"{start_date}:{days}"
        cached = await self._availability_cache.get(cache_key)
        if cached:
            return cached
        
        consultants = await self.get_consultants(correlation_id=cid)
        
        all_slots: List[TimeSlot] = []
        dates_set = set()
        
        for consultant in consultants:
            consultant_id = consultant.get("id")
            consultant_name = f"{consultant.get('profile', {}).get('firstName', '')} {consultant.get('profile', {}).get('lastName', '')}".strip()
            
            try:
                result = await self._request(
                    "GET",
                    "/consultant/availability",
                    correlation_id=cid,
                    params={
                        "consultantId": consultant_id,
                        "serviceId": self.config.service_id,
                        "startDate": start_date,
                        "days": days,
                        "duration": self.config.session_duration * 60,
                    }
                )
                
                for slot_data in result.get("items", []):
                    start_time = datetime.fromisoformat(slot_data["startTime"].replace("Z", "+00:00"))
                    end_time = datetime.fromisoformat(slot_data["endTime"].replace("Z", "+00:00"))
                    
                    slot = TimeSlot(
                        start_time=start_time,
                        end_time=end_time,
                        duration=self.config.session_duration,
                        consultant_id=consultant_id,
                        consultant_name=consultant_name
                    )
                    all_slots.append(slot)
                    dates_set.add(start_time.strftime("%Y-%m-%d"))
                    
            except Exception as e:
                logger.warning(f"[{cid}] Failed to get availability for consultant {consultant_id}: {e}")
        
        all_slots.sort(key=lambda s: s.start_time)
        dates_list = sorted(list(dates_set))
        
        result_data = (all_slots, dates_list)
        await self._availability_cache.set(cache_key, result_data)
        
        return result_data
    
    def validate_slot_from_cache(
        self,
        cached_slots: List[TimeSlot],
        consultant_id: str,
        slot_start_time: str
    ) -> bool:
        """Check if a slot exists in cached availability"""
        for slot in cached_slots:
            if (slot.consultant_id == consultant_id and 
                slot.start_time.isoformat() == slot_start_time):
                return True
        return False
    
    async def create_client_record(
        self,
        profile: ClientProfile,
        correlation_id: str = None
    ) -> str:
        """Create a new client record in Practice Better"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        payload = {
            "profile": {
                "firstName": profile.first_name,
                "lastName": profile.last_name,
                "emailAddress": profile.email,
            },
            "status": "active",
            "sendInvitation": self.config.send_invitation,
        }
        
        if profile.phone:
            payload["profile"]["mobilePhone"] = profile.phone
        
        if profile.timezone:
            windows_tz = convert_timezone_to_windows(profile.timezone)
            payload["profile"]["timeZone"] = windows_tz
        
        if self.config.tag_ids:
            payload["tagIds"] = self.config.tag_ids
        
        result = await self._request("POST", "/consultant/records", json=payload, correlation_id=cid)
        
        client_id = result["id"]
        logger.info(f"[{cid}] Created client {client_id}")
        
        return client_id
    
    async def get_or_create_client(
        self,
        profile: ClientProfile,
        correlation_id: str = None
    ) -> Tuple[str, bool]:
        """Create new client or get existing if creation fails"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        try:
            client_record_id = await self.create_client_record(profile, correlation_id=cid)
            logger.info(f"[{cid}] Created new client: {profile.email}")
            return (client_record_id, True)
            
        except httpx.HTTPStatusError as e:
            logger.warning(f"[{cid}] Client creation failed: {e}")
            
            from services.client_cache import get_client_cache
            cache = get_client_cache()
            cached_client = cache.get_client_by_email(profile.email)
            
            if cached_client:
                record_id = cached_client["record_id"]
                logger.info(f"[{cid}] Found client in cache: {profile.email} -> {record_id}")
                return (record_id, False)
            
            logger.info(f"[{cid}] Not in cache, retrying creation: {profile.email}")
            try:
                client_record_id = await self.create_client_record(profile, correlation_id=cid)
                logger.info(f"[{cid}] Created client on retry: {profile.email}")
                return (client_record_id, True)
            except Exception as retry_error:
                logger.error(f"[{cid}] Retry also failed: {retry_error}")
                raise BookingError(
                    "We couldn't complete your booking. Please try again in a moment.",
                    internal_message=f"Client creation failed twice for {profile.email}: {retry_error}"
                )
        
        except Exception as e:
            logger.error(f"[{cid}] Unexpected error creating client: {e}")
            raise BookingError(
                "We couldn't complete your booking. Please try again.",
                internal_message=str(e)
            )
    
    async def book_session(
        self,
        client_record_id: str,
        consultant_id: str,
        session_date: str,
        timezone: str,
        notes: Optional[str] = None,
        correlation_id: str = None
    ) -> dict:
        """Book a session for a client"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        duration_seconds = self.config.session_duration * 60
        windows_timezone = convert_timezone_to_windows(timezone)
        
        payload = {
            "clientRecordId": client_record_id,
            "asConsultantId": consultant_id,
            "serviceId": self.config.service_id,
            "serviceType": self.config.session_type,
            "sessionDate": session_date,
            "duration": duration_seconds,
            "timeZone": windows_timezone,
            "notify": True,
            "telehealthSettings": {
                "launchApplication": self.config.telehealth_app
            }
        }
        
        if notes:
            payload["notes"] = notes
        
        logger.info(f"[{cid}] Booking session for client {client_record_id} with {consultant_id}")
        result = await self._request("POST", "/consultant/sessions", json=payload, correlation_id=cid)
        
        logger.info(f"[{cid}] Session booked: {result.get('id')}")
        
        await self._availability_cache.clear()
        
        return result
    
    async def complete_booking(
        self,
        request: BookingRequest,
        cached_availability: List[TimeSlot] = None,
        correlation_id: str = None
    ) -> BookingResult:
        """Complete booking flow with validation"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        logger.info(f"[{cid}] Starting booking for {request.email}")
        
        try:
            if cached_availability:
                if not self.validate_slot_from_cache(
                    cached_availability,
                    request.consultant_id,
                    request.slot_start_time
                ):
                    logger.warning(f"[{cid}] Slot not found in cache, may be stale")
            
            client_record_id, is_new_client = await self.get_or_create_client(
                ClientProfile(
                    first_name=request.first_name,
                    last_name=request.last_name,
                    email=request.email,
                    phone=request.phone,
                    timezone=request.timezone
                ),
                correlation_id=cid
            )
            
            try:
                session = await self.book_session(
                    client_record_id=client_record_id,
                    consultant_id=request.consultant_id,
                    session_date=request.slot_start_time,
                    timezone=request.timezone,
                    notes=request.notes,
                    correlation_id=cid
                )
            except httpx.HTTPStatusError as e:
                error_text = e.response.text.lower()
                if "slot" in error_text or "unavailable" in error_text or "conflict" in error_text:
                    raise SlotUnavailableError(
                        internal_message=f"Slot {request.slot_start_time} unavailable: {e.response.text}"
                    )
                raise
            
            session_id = session["id"]
            
            logger.info(f"[{cid}] Booking complete: session={session_id}, client={client_record_id}, new={is_new_client}")
            
            return BookingResult(
                session_id=session_id,
                client_record_id=client_record_id,
                consultant_name=session.get("consultant", {}).get("emailAddress", ""),
                session_start=datetime.fromisoformat(session["sessionDate"].replace("Z", "+00:00")),
                session_end=datetime.fromisoformat(session["endDate"].replace("Z", "+00:00")),
                duration=session["duration"],
                is_new_client=is_new_client
            )
        
        except (BookingError, SlotUnavailableError):
            raise
        
        except httpx.HTTPStatusError as e:
            logger.error(f"[{cid}] HTTP error during booking: {e.response.status_code} - {e.response.text}")
            raise BookingError(
                "We couldn't complete your booking. Please try again.",
                internal_message=f"HTTP {e.response.status_code}: {e.response.text}"
            )
        
        except Exception as e:
            logger.error(f"[{cid}] Unexpected error during booking: {e}")
            raise BookingError(
                "Something went wrong. Please try again in a moment.",
                internal_message=str(e)
            )


# ============================================================================
# Idempotency Store
# ============================================================================

class IdempotencyStore:
    """In-memory store for booking idempotency"""
    
    def __init__(self, ttl: int = 300):
        self.ttl = ttl
        self._store: Dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
    
    def _make_key(self, email: str, consultant_id: str, slot_start_time: str) -> str:
        return f"{email.lower()}:{consultant_id}:{slot_start_time}"
    
    async def check_and_set(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str
    ) -> Tuple[bool, Optional[str]]:
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            entry = self._store.get(key)
            
            if entry and not entry.is_expired():
                return (True, entry.data)
            
            self._store[key] = CacheEntry(data=None, expires_at=time.time() + self.ttl)
            return (False, None)
    
    async def complete(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str,
        session_id: str
    ) -> None:
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            self._store[key] = CacheEntry(data=session_id, expires_at=time.time() + self.ttl)
    
    async def remove(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str
    ) -> None:
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            self._store.pop(key, None)


# ============================================================================
# Global Instances
# ============================================================================

_service_instance: Optional[PracticeBetterService] = None
_idempotency_store: Optional[IdempotencyStore] = None


def get_practice_better_service() -> PracticeBetterService:
    """Get or create the global service instance"""
    global _service_instance
    
    if _service_instance is None:
        config = PracticeBetterConfig.from_env()
        _service_instance = PracticeBetterService(config)
    
    return _service_instance


def get_idempotency_store() -> IdempotencyStore:
    """Get or create the global idempotency store"""
    global _idempotency_store
    
    if _idempotency_store is None:
        _idempotency_store = IdempotencyStore()
    
    return _idempotency_store


async def shutdown_service() -> None:
    """Shutdown the service. Call on application shutdown."""
    global _service_instance
    
    if _service_instance:
        await _service_instance.close()
        _service_instance = None
