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
from zoneinfo import ZoneInfo
from typing import Any, Optional, Dict, List, Tuple
import asyncio
from pydantic import BaseModel, EmailStr
import os
import time
import logging
import random
import uuid
from dataclasses import dataclass, field
from services.client_cache import get_client_cache

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


def to_pb_session_date(session_date: str) -> str:
    """Convert an ISO datetime into the wall-time format PB's sessions API actually parses.

    Verified empirically (2026-07-06, POST /consultant/sessions): PB ignores both a trailing
    'Z' and the request's timeZone field when parsing sessionDate, and reads the naive
    clock time as US Eastern wall time ('...T21:00:00Z' + timeZone=Central stored as
    2026-07-10T01:00:00Z; naive '...T16:00:00' + timeZone=Central stored as 20:00Z). Offset
    forms like '-05:00' make it 500 outright. So: take the real instant and send PB the
    matching US-Eastern wall clock, naive. Naive inputs are passed through untouched (the
    caller already speaks PB's convention — e.g. legacy availability round-trips)."""
    try:
        dt = datetime.fromisoformat(session_date.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return session_date
    if dt.tzinfo is None:
        return session_date
    return dt.astimezone(ZoneInfo("America/New_York")).strftime("%Y-%m-%dT%H:%M:%S")


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
    max_retries: int = 2
    max_auth_retries: int = 1
    retry_base_delay: float = 2.0
    retry_max_delay: float = 15.0
    retry_429_base_delay: float = 10.0
    # Proactive client-side throttle to stay under PB's published limits (5 req/s, burst 20).
    rate_limit_per_second: float = 4.5
    rate_limit_burst: int = 12
    
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
            max_retries=int(os.environ.get("PRACTICE_BETTER_MAX_RETRIES", "2")),
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
    duration: int  # minutes
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
    duration: int  # seconds (from PB API response)
    is_new_client: bool = False
    telehealth_url: Optional[str] = None  # Zoom/telehealth join link, when PB returns one


def _extract_telehealth_url(session: dict) -> Optional[str]:
    """Best-effort join-link extraction from a PB session payload (key names vary by
    telehealth provider; None is fine — PB's own confirmation email carries the link)."""
    ts = session.get("telehealthSettings") or {}
    candidates = [ts.get(k) for k in ("joinUrl", "join_url", "launchUrl", "startUrl", "url", "link")]
    candidates.append(session.get("location"))
    for v in candidates:
        if isinstance(v, str) and v.startswith("http"):
            return v
    return None


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
    data: Any
    expires_at: float
    
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class AvailabilityCache:
    """In-memory cache for availability data"""
    
    def __init__(self, ttl: int = 60):
        self.ttl = ttl
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._cache.get(key)
            if entry and not entry.is_expired():
                return entry.data
            if entry:
                del self._cache[key]
            return None
    
    async def set(self, key: str, data: Any) -> None:
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

class _TokenBucket:
    """Async token bucket so every PB call respects PB's rate limit (5 req/s, burst 20).
    Tokens refill continuously; a caller waits only when the bucket is empty, so steady-state
    throughput is capped at `rate` while short bursts up to `burst` pass instantly. This stops
    the 429 cascades an unthrottled burst (e.g. a multi-page search) would otherwise cause."""

    def __init__(self, rate: float, burst: int):
        self.rate = max(0.1, rate)
        self.capacity = float(max(1, burst))
        self.tokens = self.capacity
        self.updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
            self.updated = now
            if self.tokens < 1.0:
                await asyncio.sleep((1.0 - self.tokens) / self.rate)
                self.tokens = 0.0
                self.updated = time.monotonic()
            else:
                self.tokens -= 1.0


_shared_rate_limiter: Optional["_TokenBucket"] = None


def get_pb_rate_limiter(rate: float = 4.5, burst: int = 12) -> "_TokenBucket":
    """Process-wide token bucket shared by EVERY Practice Better caller — the booking service and
    the background client sync alike — so the sum of all PB traffic stays under PB's 5 req/s. It's
    created once (first caller's rate/burst win) and reused thereafter."""
    global _shared_rate_limiter
    if _shared_rate_limiter is None:
        _shared_rate_limiter = _TokenBucket(rate, burst)
    return _shared_rate_limiter


class PracticeBetterService:
    """Main service for Practice Better API interactions"""

    def __init__(self, config: PracticeBetterConfig):
        self.config = config
        self.token_manager = TokenManager(config)
        self._client: Optional[httpx.AsyncClient] = None
        self._availability_cache = AvailabilityCache(ttl=config.availability_cache_ttl)
        self._rate_limiter = get_pb_rate_limiter(config.rate_limit_per_second, config.rate_limit_burst)
    
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
        """Make authenticated request with retries.
        Auth failures (401/403) get a separate retry budget and don't consume transient retries."""
        cid = correlation_id or str(uuid.uuid4())[:8]
        client = await self._get_client()
        token = await self.token_manager.get_token(client)
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Correlation-ID"] = cid
        
        url = f"{self.config.base_url}{path}"
        auth_retries_left = self.config.max_auth_retries
        attempt = 0
        
        while attempt < self.config.max_retries:
            try:
                await self._rate_limiter.acquire()  # stay under PB's 5 req/s, burst 20
                response = await client.request(method, url, headers=headers, **kwargs)
                response.raise_for_status()
                # DELETE / some PUTs return 204 or an empty body — don't treat that as a failure.
                if response.status_code == 204 or not response.content:
                    return {}
                return response.json()
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                
                # Auth failures: separate budget, don't consume transient retries
                if status in (401, 403) and auth_retries_left > 0:
                    auth_retries_left -= 1
                    logger.info(f"[{cid}] Auth {status}, refreshing token (auth retries left: {auth_retries_left})")
                    self.token_manager._token = None
                    token = await self.token_manager.get_token(client)
                    headers["Authorization"] = f"Bearer {token}"
                    continue  # retry without incrementing attempt
                
                # 429: use configurable base delay
                if status == 429:
                    if attempt >= self.config.max_retries - 1:
                        raise
                    retry_after = e.response.headers.get("Retry-After")
                    if retry_after:
                        delay = min(float(retry_after), self.config.retry_max_delay * 2)
                    else:
                        delay = min(
                            self.config.retry_429_base_delay * (2 ** attempt) + random.uniform(0, 2),
                            self.config.retry_max_delay * 2
                        )
                    logger.warning(f"[{cid}] Rate limited (429), waiting {delay:.1f}s (attempt {attempt + 1}/{self.config.max_retries})")
                    await asyncio.sleep(delay)
                    attempt += 1
                    continue
                
                # Other HTTP errors: standard backoff. Log PB's response body — a bare
                # "500 Internal Server Error" is undiagnosable without it.
                logger.warning(f"[{cid}] PB {status} on {method} {path} "
                               f"(attempt {attempt + 1}/{self.config.max_retries}): "
                               f"{(e.response.text or '')[:500]}")
                if attempt >= self.config.max_retries - 1:
                    raise
                delay = min(
                    self.config.retry_base_delay * (2 ** attempt) + random.uniform(0, 1),
                    self.config.retry_max_delay
                )
                await asyncio.sleep(delay)
            except Exception:
                if attempt >= self.config.max_retries - 1:
                    raise
                delay = min(
                    self.config.retry_base_delay * (2 ** attempt) + random.uniform(0, 1),
                    self.config.retry_max_delay
                )
                await asyncio.sleep(delay)
            attempt += 1
        
        raise Exception(f"Request failed after {self.config.max_retries} attempts")
    
    async def get_consultants(self, correlation_id: str = None) -> List[dict]:
        """
        Get list of practitioners/consultants from the team.
        Uses /company/administration/members endpoint to get actual practitioners.
        """
        cid = correlation_id or str(uuid.uuid4())[:8]
        result = await self._request("GET", "/company/administration/members", correlation_id=cid)
        
        # Filter for active practitioners/owners only
        team_members = result.get("members", result.get("items", []))
        consultants = [
            member for member in team_members
            if member.get("activationStatus") == "activated" and 
               (member.get("isOwner") or member.get("isPractitioner"))
        ]
        
        # If practitioner IDs are configured, filter to only those
        if self.config.practitioner_ids:
            consultants = [c for c in consultants if c.get("id") in self.config.practitioner_ids]
        
        logger.info(f"[{cid}] Found {len(consultants)} active practitioners")
        return consultants
    
    async def get_availability(
        self,
        start_date: str,
        days: int = 14,
        correlation_id: str = None,
        consultant_ids: Optional[List[str]] = None,
    ) -> Tuple[List[TimeSlot], List[str]]:
        """Get availability using /consultant/availability/slots.

        consultant_ids=None keeps the legacy behavior (PB team roster filtered by the
        PRACTICE_BETTER_PRACTITIONER_IDS env). When a list is given (the portal passes the
        active directors' PB consultant ids), ONLY those consultants are polled — the
        Directors admin is then the single source of who's bookable. An empty list means
        zero slots on purpose."""
        cid = correlation_id or str(uuid.uuid4())[:8]

        # Include the consultant filter in the cache key so different sets don't collide
        prac = consultant_ids if consultant_ids is not None else self.config.practitioner_ids
        prac_hash = hash(tuple(sorted(prac))) if prac else "all"
        cache_key = f"{start_date}:{days}:{prac_hash}"
        cached = await self._availability_cache.get(cache_key)
        if cached:
            return cached

        if consultant_ids is not None:
            consultants = [{"id": c} for c in consultant_ids]
        else:
            consultants = await self.get_consultants(correlation_id=cid)
        
        all_slots: List[TimeSlot] = []
        dates_set = set()
        
        # Fetch all consultants concurrently with a semaphore to respect rate limits
        sem = asyncio.Semaphore(3)
        
        async def fetch_consultant_slots(consultant: dict) -> List[TimeSlot]:
            consultant_id = consultant.get("id")
            profile = consultant.get('profile', {})
            if profile:
                consultant_name = f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
            else:
                consultant_name = f"{consultant.get('firstName', '')} {consultant.get('lastName', '')}".strip()
            
            slots = []
            async with sem:
                try:
                    result = await self._request(
                        "GET",
                        "/consultant/availability/slots",
                        correlation_id=cid,
                        params={
                            "as_consultant": consultant_id,
                            "day": start_date,
                            "serviceId": self.config.service_id,
                            "type": self.config.session_type,
                        }
                    )
                    
                    slots_data = result if isinstance(result, list) else result.get("items", result.get("slots", []))
                    
                    for slot_data in slots_data:
                        start_str = slot_data.get("startDate") or slot_data.get("startTime") or slot_data.get("start")
                        if not start_str:
                            continue
                        start_time = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                        
                        end_str = slot_data.get("endDate") or slot_data.get("endTime") or slot_data.get("end")
                        if end_str:
                            end_time = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                        else:
                            end_time = start_time + timedelta(minutes=self.config.session_duration)
                        
                        slots.append(TimeSlot(
                            start_time=start_time,
                            end_time=end_time,
                            duration=self.config.session_duration,  # minutes
                            consultant_id=consultant_id,
                            consultant_name=consultant_name
                        ))
                except Exception as e:
                    logger.warning(f"[{cid}] Failed to get availability for consultant {consultant_id}: {e}")
            return slots
        
        results = await asyncio.gather(*[fetch_consultant_slots(c) for c in consultants])
        for slots in results:
            for slot in slots:
                all_slots.append(slot)
                dates_set.add(slot.start_time.strftime("%Y-%m-%d"))
        
        all_slots.sort(key=lambda s: s.start_time)
        dates_list = sorted(list(dates_set))
        
        result_data = (all_slots, dates_list)
        await self._availability_cache.set(cache_key, result_data)
        
        return result_data
    
    def slot_in_cache(
        self,
        cached_slots: List[TimeSlot],
        consultant_id: str,
        slot_start_time: str
    ) -> bool:
        """Check if a slot exists in cached availability (advisory only — cache may be stale)"""
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
            "isActive": True,
            "sendInvitation": self.config.send_invitation,
            "documentsFolder": True,
        }
        
        if profile.phone:
            payload["profile"]["mobilePhone"] = profile.phone
        
        if profile.timezone:
            windows_tz = convert_timezone_to_windows(profile.timezone)
            payload["profile"]["timeZone"] = windows_tz
        
        # Add tags using tagActions structure
        if self.config.tag_ids:
            payload["tagActions"] = {
                "actions": [
                    {
                        "actionType": "add",
                        "tagIds": self.config.tag_ids
                    }
                ]
            }
        
        result = await self._request("POST", "/consultant/records", json=payload, correlation_id=cid)
        
        client_id = result["id"]
        logger.info(f"[{cid}] Created client {client_id}")
        
        return client_id
    
    async def search_client_by_email(
        self,
        email: str,
        correlation_id: str = None
    ) -> Optional[str]:
        """Find an existing client by email from the local SQLite cache (kept comprehensive by
        ClientSyncService). PB's API has no email filter, so the old path paginated up to 2,000
        records and tripped the rate limit; the cache makes this a near-instant lookup.

        A cache miss almost always means a client created directly in PB (not via this portal)
        that the periodic full sync hasn't picked up yet — and those are the MOST RECENTLY created.
        PB returns records newest-first, so we pull just the newest 1-2 pages (walking older via
        before_id), upsert them, and re-check. Returns the record id, or None."""
        cid = correlation_id or str(uuid.uuid4())[:8]
        normalized = email.lower().strip()
        cache = get_client_cache()

        hit = cache.get_client_by_email(normalized)
        if hit:
            logger.info(f"[{cid}] Found existing client in cache: {email} -> {hit['record_id']}")
            return hit["record_id"]

        # Cache miss: pull the newest records (newest-first); a just-created client is in the first
        # page or two. Bounded to 2 pages — never the old 20-page sweep.
        before_id = None
        try:
            for page in range(2):
                params = {"limit": 100}
                if before_id:
                    params["before_id"] = before_id  # records older than the last seen (keep descending)
                data = await self._request("GET", "/consultant/records", correlation_id=cid, params=params)
                items = data.get("items", []) or []
                if not items:
                    break
                cache.upsert_clients_batch(items)
                hit = cache.get_client_by_email(normalized)
                if hit:
                    logger.info(f"[{cid}] Found client in newest records (page {page + 1}): {email} -> {hit['record_id']}")
                    return hit["record_id"]
                if len(items) < 100:
                    break  # reached the end
                before_id = items[-1].get("id")
        except Exception as e:
            logger.warning(f"[{cid}] Newest-records refresh during client search failed: {e}")

        logger.info(f"[{cid}] Client not found in cache or newest records: {email}")
        return None

    async def get_or_create_client(
        self,
        profile: ClientProfile,
        correlation_id: str = None
    ) -> Tuple[str, bool]:
        """Create new client or get existing if creation fails"""
        cid = correlation_id or str(uuid.uuid4())[:8]
        
        # Check local cache first
        cache = get_client_cache()
        cached_client = cache.get_client_by_email(profile.email)
        if cached_client:
            record_id = cached_client["record_id"]
            logger.info(f"[{cid}] Found client in local cache: {profile.email} -> {record_id}")
            return (record_id, False)
        
        try:
            client_record_id = await self.create_client_record(profile, correlation_id=cid)
            logger.info(f"[{cid}] Created new client: {profile.email}")
            # Save to local cache
            cache.upsert_client({
                "id": client_record_id,
                "profile": {
                    "emailAddress": profile.email,
                    "firstName": profile.first_name,
                    "lastName": profile.last_name,
                    "mobilePhone": profile.phone
                },
                "status": "active"
            })
            return (client_record_id, True)
            
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            response_body = ""
            try:
                response_body = e.response.text
            except Exception:
                pass
            logger.warning(f"[{cid}] Client creation failed ({status}): {e}")
            if response_body:
                logger.warning(f"[{cid}] Response body: {response_body[:500]}")
            
            # 400 = duplicate email / bad request, 500 = server-side duplicate,
            # 429 = rate limited. All cases: search for existing client first.
            if status in (400, 429, 500):
                found_id = await self.search_client_by_email(profile.email, correlation_id=cid)
                if found_id:
                    return (found_id, False)
            
            if status == 429:
                raise BookingError(
                    "The booking service is temporarily busy. Please wait a moment and try again.",
                    internal_message=f"Rate limited creating client for {profile.email}"
                )
            
            raise BookingError(
                "We couldn't create your account. Please try again or contact support.",
                internal_message=f"PB returned {status} for {profile.email} and client not found via search. Response: {response_body[:200]}"
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
        correlation_id: str = None,
        *,
        include_telehealth: bool = True,
        notify: bool = True,
        service_id: Optional[str] = None,
        duration_seconds: Optional[int] = None,
    ) -> dict:
        """Book a session for a client.

        Portal-owned flow passes include_telehealth=False (Google Meet is the link,
        carried in notes) and notify=False (the portal sends its own Resend email).
        Legacy defaults (include_telehealth=True, notify=True) keep the old path intact.
        service_id overrides the configured service when booking under the shared account.
        Sessions are always created markConfirmed=True — the portal owns the booking
        state, so PB never holds a session in an unconfirmed/pending limbo.
        """
        cid = correlation_id or str(uuid.uuid4())[:8]

        if duration_seconds is None:
            duration_seconds = self.config.session_duration * 60
        windows_timezone = convert_timezone_to_windows(timezone)

        payload = {
            "clientRecordId": client_record_id,
            "asConsultantId": consultant_id,
            "serviceId": service_id or self.config.service_id,
            "serviceType": self.config.session_type,
            "sessionDate": to_pb_session_date(session_date),
            "duration": duration_seconds,
            "timeZone": windows_timezone,
            "notify": notify,
            "markConfirmed": True,  # portal is authoritative — auto-confirm on creation (no PB pending state)
        }
        if include_telehealth and self.config.telehealth_app:
            payload["telehealthSettings"] = {"launchApplication": self.config.telehealth_app}

        if notes:
            payload["notes"] = notes
        
        logger.info(f"[{cid}] Booking session for client {client_record_id} with {consultant_id}")
        result = await self._request("POST", "/consultant/sessions", json=payload, correlation_id=cid)
        
        logger.info(f"[{cid}] Session booked: {result.get('id')}")

        await self._availability_cache.clear()

        return result

    async def reschedule_session(
        self,
        session_id: str,
        session_date: str,
        *,
        duration_seconds: Optional[int] = None,
        ignore_conflict: bool = True,
        correlation_id: str = None,
    ) -> dict:
        """Move an existing PB session to a new date/time.

        PUT /consultant/sessions/{sessionId}/date. The portal is the source of truth for
        availability, so ignore_conflict defaults to True. duration_seconds defaults to the
        configured session length when omitted.
        """
        cid = correlation_id or str(uuid.uuid4())[:8]
        payload = {
            "duration": duration_seconds if duration_seconds is not None else self.config.session_duration * 60,
            "ignoreConflict": ignore_conflict,
            "sessionDate": to_pb_session_date(session_date),
        }
        logger.info(f"[{cid}] Rescheduling PB session {session_id} -> {session_date}")
        result = await self._request(
            "PUT", f"/consultant/sessions/{session_id}/date", json=payload, correlation_id=cid
        )
        await self._availability_cache.clear()
        return result

    async def cancel_session(self, session_id: str, correlation_id: str = None, *,
                             notify: bool = False, notes: Optional[str] = None) -> None:
        """Cancel an existing PB session. POST /consultant/sessions/{sessionId}/cancel — PB's
        documented cancellation: the session stays in PB marked cancelled (a proper record,
        same as a UI cancel) and PB's calendar sync removes its synced Google event. We
        previously hard-DELETEd the session, whose calendar cleanup proved flaky (ghost
        events, 2026-07-23). ``notify`` controls PB's cancellation email to the client.
        cancelPendingBookings / cancelRecurringAutomations are deliberately never sent —
        we cancel exactly one session, never other bookings or payment plans."""
        cid = correlation_id or str(uuid.uuid4())[:8]
        logger.info(f"[{cid}] Cancelling PB session {session_id} (notify={notify})")
        body = {"notify": notify}
        if notes:
            body["notes"] = notes
        await self._request("POST", f"/consultant/sessions/{session_id}/cancel",
                            json=body, correlation_id=cid)
        await self._availability_cache.clear()

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
                if not self.slot_in_cache(
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
                # Stale client record ID — PB says it doesn't exist
                if e.response.status_code == 404 and "item_not_found" in error_text:
                    logger.warning(f"[{cid}] Stale client record {client_record_id}, evicting and recreating")
                    cache = get_client_cache()
                    cache.delete_by_email(request.email)
                    
                    # Force-create a new client (skip cache)
                    new_record_id = await self.create_client_record(
                        ClientProfile(
                            first_name=request.first_name,
                            last_name=request.last_name,
                            email=request.email,
                            phone=request.phone,
                            timezone=request.timezone
                        ),
                        correlation_id=cid
                    )
                    logger.info(f"[{cid}] Recreated client: {request.email} -> {new_record_id}")
                    client_record_id = new_record_id
                    is_new_client = True
                    
                    # Retry session booking with new record ID
                    session = await self.book_session(
                        client_record_id=client_record_id,
                        consultant_id=request.consultant_id,
                        session_date=request.slot_start_time,
                        timezone=request.timezone,
                        notes=request.notes,
                        correlation_id=cid
                    )
                else:
                    raise
            
            session_id = session["id"]
            
            logger.info(f"[{cid}] Booking complete: session={session_id}, client={client_record_id}, new={is_new_client}")
            
            consultant = session.get("consultant", {})
            consultant_name = f"{consultant.get('firstName', '')} {consultant.get('lastName', '')}".strip()
            if not consultant_name:
                consultant_name = consultant.get("emailAddress", "")
            
            return BookingResult(
                session_id=session_id,
                client_record_id=client_record_id,
                consultant_name=consultant_name,
                session_start=datetime.fromisoformat(session["sessionDate"].replace("Z", "+00:00")),
                session_end=datetime.fromisoformat(session["endDate"].replace("Z", "+00:00")),
                duration=session["duration"],  # seconds (from PB API)
                is_new_client=is_new_client,
                telehealth_url=_extract_telehealth_url(session),
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

IDEMPOTENCY_PENDING = "pending"
IDEMPOTENCY_COMPLETE = "complete"


@dataclass
class IdempotencyEntry:
    """Idempotency entry with explicit status"""
    status: str  # "pending" or "complete"
    session_id: Optional[str]
    expires_at: float
    
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class IdempotencyStore:
    """In-memory store for booking idempotency.
    
    Lifecycle:
    1. check_and_set -> stores PENDING entry (sentinel)
    2. On success: complete() -> upgrades to COMPLETE with session_id
    3. On failure: remove() -> deletes the entry so user can retry
    
    If process crashes between 1 and 2/3, the PENDING entry expires after TTL.
    Retries hitting a PENDING entry are told to wait rather than re-submitting.
    """
    
    def __init__(self, ttl: int = 300):
        self.ttl = ttl
        self._store: Dict[str, IdempotencyEntry] = {}
        self._lock = asyncio.Lock()
    
    def _make_key(self, email: str, consultant_id: str, slot_start_time: str) -> str:
        return f"{email.lower()}:{consultant_id}:{slot_start_time}"
    
    async def check_and_set(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str
    ) -> Tuple[bool, Optional[str]]:
        """Returns (is_duplicate, session_id_or_none).
        
        If COMPLETE: returns (True, session_id) — booking already done.
        If PENDING: returns (True, None) — booking in progress, tell user to wait.
        If absent/expired: sets PENDING and returns (False, None) — proceed with booking.
        """
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            entry = self._store.get(key)
            
            if entry and not entry.is_expired():
                return (True, entry.session_id)
            
            self._store[key] = IdempotencyEntry(
                status=IDEMPOTENCY_PENDING,
                session_id=None,
                expires_at=time.time() + self.ttl
            )
            return (False, None)
    
    async def complete(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str,
        session_id: str
    ) -> None:
        """Mark booking as complete with session ID."""
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            self._store[key] = IdempotencyEntry(
                status=IDEMPOTENCY_COMPLETE,
                session_id=session_id,
                expires_at=time.time() + self.ttl
            )
    
    async def remove(
        self,
        email: str,
        consultant_id: str,
        slot_start_time: str
    ) -> None:
        """Remove entry on failure so user can retry."""
        key = self._make_key(email, consultant_id, slot_start_time)
        
        async with self._lock:
            self._store.pop(key, None)


# ============================================================================
# Global Instances
# ============================================================================

_service_instance: Optional[PracticeBetterService] = None
_idempotency_store: Optional[IdempotencyStore] = None
_init_lock = asyncio.Lock()


def get_practice_better_service() -> PracticeBetterService:
    """Get or create the global service instance.
    Note: for threaded ASGI servers, call init_service() at startup instead."""
    global _service_instance
    
    if _service_instance is None:
        config = PracticeBetterConfig.from_env()
        _service_instance = PracticeBetterService(config)
    
    return _service_instance


def get_idempotency_store() -> IdempotencyStore:
    """Get or create the global idempotency store."""
    global _idempotency_store
    
    if _idempotency_store is None:
        _idempotency_store = IdempotencyStore()
    
    return _idempotency_store


async def init_service() -> PracticeBetterService:
    """Thread-safe async initialization. Call from lifespan/startup event."""
    global _service_instance
    async with _init_lock:
        if _service_instance is None:
            config = PracticeBetterConfig.from_env()
            _service_instance = PracticeBetterService(config)
    return _service_instance


async def shutdown_service() -> None:
    """Shutdown the service. Call on application shutdown."""
    global _service_instance
    
    if _service_instance:
        await _service_instance.close()
        _service_instance = None
