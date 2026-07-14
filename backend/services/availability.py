"""
Local availability engine.

Availability is a pure function of portal state in MongoDB — NO external API calls
(Practice Better is never polled; Google free/busy is not consulted):

    available = directors' weekly_rules
                − director time_off
                − org clinic_closures
                − that director's confirmed bookings (+ buffer)
                clamped to [now + min_notice, now + max_advance]

Everything is computed in UTC. A director's weekly_rules are authored in the
director's IANA timezone and converted to UTC tz-aware (DST-correct via zoneinfo).
A time appears in the result once if >= 1 director is free at it (capacity hidden).

The core slot-generation + subtraction logic (``compute_free_at_pure``,
``generate_director_slots``) is pure and unit-testable without a database; the thin
``*_db`` wrappers load directors/bookings/settings from Mongo and delegate to it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone, date as ddate
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

SETTINGS_ID = "app_settings"

# Engine knobs (with the same defaults as settings.app_settings). availability_days
# is the default look-ahead the patient widget requests; the others shape slots.
ENGINE_DEFAULTS = {
    "slot_minutes": 30,
    "min_notice_minutes": 120,
    "max_advance_days": 90,
    "buffer_minutes": 0,
    "availability_days": 14,
}


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def _to_aware_utc(value) -> Optional[datetime]:
    """Coerce a datetime or ISO-8601 string to a tz-aware UTC datetime, else None.
    Naive datetimes/strings are assumed to already be UTC."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_hhmm(value) -> Optional[tuple[int, int]]:
    """Parse "HH:MM" -> (hour, minute), tolerant of "H:MM" / "HH". None if invalid."""
    if not isinstance(value, str):
        return None
    parts = value.strip().split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return None
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return hour, minute
    return None


def _ranges_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Half-open interval overlap: [a_start, a_end) ∩ [b_start, b_end) != ∅."""
    return a_start < b_end and a_end > b_start


def _collect_ranges(items) -> list[tuple[datetime, datetime]]:
    """Normalize a list of {start_utc, end_utc} dicts to [(start, end), ...] UTC tuples."""
    out: list[tuple[datetime, datetime]] = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        start = _to_aware_utc(it.get("start_utc"))
        end = _to_aware_utc(it.get("end_utc"))
        if start and end and end > start:
            out.append((start, end))
    return out


# ---------------------------------------------------------------------------
# pure core
# ---------------------------------------------------------------------------

def generate_director_slots(
    director: dict,
    window_start: datetime,
    window_end: datetime,
    slot_minutes: int,
) -> dict[datetime, datetime]:
    """All grid slots a director's weekly_rules produce within [window_start, window_end),
    BEFORE any subtraction. Returns {slot_start_utc: slot_end_utc} (tz-aware UTC).

    Rules are interpreted in the director's IANA timezone, so DST is handled by
    zoneinfo when each local wall-time is converted to UTC.
    """
    tzname = director.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tzname)
    except Exception:
        logger.warning(
            "Director %s has invalid timezone %r; defaulting to UTC",
            director.get("director_id"), tzname,
        )
        tz = ZoneInfo("UTC")

    rules_by_dow: dict[int, list[tuple[tuple[int, int], tuple[int, int]]]] = {}
    for rule in director.get("weekly_rules") or []:
        if not isinstance(rule, dict):
            continue
        dow = rule.get("day_of_week")
        start_hm = _parse_hhmm(rule.get("start"))
        end_hm = _parse_hhmm(rule.get("end"))
        if dow is None or start_hm is None or end_hm is None:
            continue
        try:
            dow_int = int(dow)
        except (TypeError, ValueError):
            continue
        if 0 <= dow_int <= 6:
            rules_by_dow.setdefault(dow_int, []).append((start_hm, end_hm))

    # Date-specific overrides (Calendly-style): for a given calendar date these REPLACE the
    # weekday rule entirely. A date present with no windows means "off that day".
    overrides_by_date: dict[str, list[tuple[tuple[int, int], tuple[int, int]]]] = {}
    for ov in director.get("date_overrides") or []:
        if not isinstance(ov, dict):
            continue
        d = ov.get("date")
        if not isinstance(d, str):
            continue
        d = d.strip()
        try:
            ddate.fromisoformat(d)
        except ValueError:
            continue
        wins: list[tuple[tuple[int, int], tuple[int, int]]] = []
        for w in ov.get("windows") or []:
            if not isinstance(w, dict):
                continue
            s_hm = _parse_hhmm(w.get("start"))
            e_hm = _parse_hhmm(w.get("end"))
            if s_hm and e_hm:
                wins.append((s_hm, e_hm))
        overrides_by_date[d] = wins  # [] => off that day (still overrides the weekly rule)

    if not rules_by_dow and not overrides_by_date:
        return {}

    slots: dict[datetime, datetime] = {}
    step = timedelta(minutes=slot_minutes)

    # Walk local dates from one day before the window (local) through one day after,
    # to cover any tz offset between UTC and the director's zone.
    local_start = (window_start.astimezone(tz).date() - timedelta(days=1))
    local_end = (window_end.astimezone(tz).date() + timedelta(days=1))

    day = local_start
    while day <= local_end:
        day_iso = day.isoformat()
        # An override for this exact date supersedes the weekday rule (off if windows empty).
        windows = overrides_by_date[day_iso] if day_iso in overrides_by_date else rules_by_dow.get(day.weekday(), [])
        for (sh, sm), (eh, em) in windows:  # weekday(): Mon=0..Sun=6
            rule_start = datetime(day.year, day.month, day.day, sh, sm, tzinfo=tz)
            rule_end = datetime(day.year, day.month, day.day, eh, em, tzinfo=tz)
            if rule_end <= rule_start:
                continue
            cur = rule_start
            # emit whole slots only (slot must fit fully inside the rule window)
            while cur + step <= rule_end:
                start_utc = cur.astimezone(timezone.utc)
                if window_start <= start_utc < window_end:
                    slots[start_utc] = (cur + step).astimezone(timezone.utc)
                cur = cur + step
        day = day + timedelta(days=1)

    return slots


def compute_free_at_pure(
    directors: Iterable[dict],
    confirmed_bookings: Iterable[dict],
    clinic_closures: Iterable[dict],
    window_start: datetime,
    window_end: datetime,
    slot_minutes: int,
    buffer_minutes: int = 0,
) -> dict[datetime, list[str]]:
    """Pure availability core. Returns {slot_start_utc: [director_id, ...]} for every
    grid slot in [window_start, window_end) where at least one director is free.

    Subtraction per director: weekly slots − time_off − clinic_closures − that
    director's confirmed bookings (each booking blocks [start, end + buffer))."""
    closures = _collect_ranges(clinic_closures)

    # Pre-bucket confirmed bookings per director as buffered [start, end+buffer) intervals.
    booked_by_dir: dict[str, list[tuple[datetime, datetime]]] = {}
    for b in confirmed_bookings or []:
        start = _to_aware_utc(b.get("slot_start_utc"))
        if not start:
            continue
        end = _to_aware_utc(b.get("slot_end_utc")) or (start + timedelta(minutes=slot_minutes))
        end = end + timedelta(minutes=buffer_minutes)
        booked_by_dir.setdefault(b.get("director_id"), []).append((start, end))

    free_at: dict[datetime, list[str]] = {}
    for director in directors or []:
        if not director.get("active", True):
            continue
        director_id = director.get("director_id")
        time_off = _collect_ranges(director.get("time_off"))
        booked = booked_by_dir.get(director_id, [])
        for slot_start, slot_end in generate_director_slots(
            director, window_start, window_end, slot_minutes
        ).items():
            if any(_ranges_overlap(slot_start, slot_end, r0, r1) for r0, r1 in time_off):
                continue
            if any(_ranges_overlap(slot_start, slot_end, r0, r1) for r0, r1 in closures):
                continue
            if any(_ranges_overlap(slot_start, slot_end, r0, r1) for r0, r1 in booked):
                continue
            free_at.setdefault(slot_start, []).append(director_id)

    return free_at


def director_available_on(director: dict, date_str: str, slot_minutes: int, clinic_closures=None) -> bool:
    """True if the director has >= 1 availability slot on the given director-LOCAL date
    (weekly rule or date override, minus time_off + clinic closures; bookings are ignored —
    a booked day is still a working day). Used to gate the coordinator rota to real workdays."""
    tzname = director.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tzname)
    except Exception:
        tz = ZoneInfo("UTC")
    try:
        d = ddate.fromisoformat(date_str)
    except (ValueError, TypeError):
        return False
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=tz)
    win_start = local_midnight.astimezone(timezone.utc)
    win_end = (local_midnight + timedelta(days=1)).astimezone(timezone.utc)
    slots = generate_director_slots(director, win_start, win_end, slot_minutes)
    if not slots:
        return False
    time_off = _collect_ranges(director.get("time_off"))
    closures = _collect_ranges(clinic_closures)
    for s_start, s_end in slots.items():
        if any(_ranges_overlap(s_start, s_end, r0, r1) for r0, r1 in time_off):
            continue
        if any(_ranges_overlap(s_start, s_end, r0, r1) for r0, r1 in closures):
            continue
        return True
    return False


# ---------------------------------------------------------------------------
# Mongo-backed wrappers
# ---------------------------------------------------------------------------

async def load_engine_settings(db) -> dict:
    """Merge the app_settings singleton over engine defaults."""
    doc = await db.settings.find_one({"_id": SETTINGS_ID}, {"_id": 0}) or {}
    merged = dict(ENGINE_DEFAULTS)
    merged.update(doc)
    return merged


async def _load_active_directors(db) -> list[dict]:
    cursor = db.directors.find({"active": True}, {"_id": 0})
    return [d async for d in cursor]


async def _load_confirmed_bookings(db, lo: datetime, hi: datetime, exclude_booking_id: str = None) -> list[dict]:
    query = {"status": "confirmed", "slot_start_utc": {"$gte": lo, "$lt": hi}}
    if exclude_booking_id:
        # When re-checking availability for a reschedule, the booking being moved is still
        # 'confirmed' at its old slot; excluding it stops its own (buffered) interval from
        # blocking a nearby target slot.
        query["booking_id"] = {"$ne": exclude_booking_id}
    cursor = db.bookings.find(
        query,
        {"_id": 0, "director_id": 1, "slot_start_utc": 1, "slot_end_utc": 1},
    )
    return [b async for b in cursor]


async def compute_free_at(db, window_start: datetime, window_end: datetime) -> dict[datetime, list[str]]:
    """Mongo-backed compute_free_at_pure over [window_start, window_end)."""
    settings = await load_engine_settings(db)
    slot_minutes = int(settings.get("slot_minutes") or 30)
    buffer_minutes = int(settings.get("buffer_minutes") or 0)

    directors = await _load_active_directors(db)
    if not directors:
        return {}

    # Widen the booking query lower bound so a prior booking whose buffered interval
    # spills into window_start is still subtracted.
    booking_lo = window_start - timedelta(days=1)
    bookings = await _load_confirmed_bookings(db, booking_lo, window_end)

    return compute_free_at_pure(
        directors=directors,
        confirmed_bookings=bookings,
        clinic_closures=settings.get("clinic_closures"),
        window_start=window_start,
        window_end=window_end,
        slot_minutes=slot_minutes,
        buffer_minutes=buffer_minutes,
    )


def _clamp_window(settings: dict, range_start: datetime, range_end: datetime) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    earliest = now + timedelta(minutes=int(settings.get("min_notice_minutes") or 0))
    latest = now + timedelta(days=int(settings.get("max_advance_days") or 0))
    start = max(range_start, earliest)
    end = min(range_end, latest)
    return start, end


async def compute_availability(db, range_start: datetime, range_end: datetime) -> list[datetime]:
    """Sorted list of bookable slot_start_utc within [range_start, range_end), clamped to
    [now + min_notice, now + max_advance]. Empty if no active directors / nothing free."""
    settings = await load_engine_settings(db)
    start, end = _clamp_window(settings, range_start, range_end)
    if start >= end:
        return []
    free_at = await compute_free_at(db, start, end)
    return sorted(s for s, directors in free_at.items() if directors)


async def compute_availability_response(db, start_date: str, days: int) -> tuple[list[dict], list[str]]:
    """Produce the legacy AvailabilityResponse payload from the local engine.

    Returns (slots, dates_with_availability) where slots is
    [{start_time, end_time, duration, consultant_id="auto"}] with tz-aware UTC datetimes,
    and dates_with_availability is the sorted unique set of UTC date strings. This matches
    the existing patient widget contract (it groups slots by start_time's date-prefix), so
    no frontend change is required. consultant_id is a sentinel — the server assigns the
    director at commit time.
    """
    settings = await load_engine_settings(db)
    slot_minutes = int(settings.get("slot_minutes") or 30)

    day0 = ddate.fromisoformat(start_date)
    range_start = datetime(day0.year, day0.month, day0.day, tzinfo=timezone.utc)
    range_end = range_start + timedelta(days=days)

    slot_starts = await compute_availability(db, range_start, range_end)

    slots: list[dict] = []
    dates: set[str] = set()
    for slot_start in slot_starts:
        slot_end = slot_start + timedelta(minutes=slot_minutes)
        slots.append({
            "start_time": slot_start,
            "end_time": slot_end,
            "duration": slot_minutes,
            "consultant_id": "auto",
        })
        dates.add(slot_start.date().isoformat())

    return slots, sorted(dates)


async def directors_free_at(db, slot_start_utc: datetime, exclude_booking_id: str = None) -> list[dict]:
    """Active director docs that are free at exactly ``slot_start_utc`` (used by the
    assignment step at commit time). Recomputed authoritatively from rules + ledger.
    Pass ``exclude_booking_id`` when re-checking for a reschedule so the booking being
    moved doesn't count its own slot/buffer against the target time."""
    settings = await load_engine_settings(db)
    slot_minutes = int(settings.get("slot_minutes") or 30)
    window_start = _to_aware_utc(slot_start_utc)
    window_end = window_start + timedelta(minutes=slot_minutes)

    directors = await _load_active_directors(db)
    if not directors:
        return []
    bookings = await _load_confirmed_bookings(db, window_start - timedelta(days=1), window_end, exclude_booking_id=exclude_booking_id)

    free_at = compute_free_at_pure(
        directors=directors,
        confirmed_bookings=bookings,
        clinic_closures=settings.get("clinic_closures"),
        window_start=window_start,
        window_end=window_end,
        slot_minutes=slot_minutes,
        buffer_minutes=int(settings.get("buffer_minutes") or 0),
    )
    free_ids = set(free_at.get(window_start, []))
    return [d for d in directors if d.get("director_id") in free_ids]
