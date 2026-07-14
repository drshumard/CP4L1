"""
Unit tests for the local availability engine (services/availability.py).

Pure functions are tested synchronously; the Mongo-backed wrappers are tested via
asyncio.run() against a tiny in-memory fake DB (no pytest-asyncio dependency).
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

# Make `services` importable when pytest's rootdir isn't backend/.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.availability import (  # noqa: E402
    generate_director_slots,
    compute_free_at_pure,
    compute_availability_response,
    directors_free_at,
    _ranges_overlap,
)

UTC = timezone.utc


def _director(director_id="d1", tz="America/New_York", rules=None, time_off=None, active=True):
    return {
        "director_id": director_id,
        "active": active,
        "timezone": tz,
        "weekly_rules": rules if rules is not None else [{"day_of_week": 0, "start": "09:00", "end": "13:00"}],
        "time_off": time_off or [],
    }


# --------------------------------------------------------------------------- pure: slot generation

def test_basic_slot_generation_monday_edt():
    # 2026-06-22 is a Monday; America/New_York is EDT (UTC-4) in June.
    d = _director()
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC), 30
    )
    # 09:00-13:00 = 4h = 8 half-hour slots, 09:00 EDT == 13:00 UTC.
    assert len(slots) == 8
    starts = sorted(slots)
    assert starts[0] == datetime(2026, 6, 22, 13, 0, tzinfo=UTC)
    assert starts[-1] == datetime(2026, 6, 22, 16, 30, tzinfo=UTC)
    assert slots[starts[0]] == datetime(2026, 6, 22, 13, 30, tzinfo=UTC)


def test_no_rule_on_that_weekday_yields_nothing():
    d = _director(rules=[{"day_of_week": 2, "start": "09:00", "end": "13:00"}])  # Wednesday rule
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC), 30  # a Monday
    )
    assert slots == {}


# --------------------------------------------------------------------------- date overrides

def test_date_override_replaces_weekday_rule_with_fewer_hours():
    # Monday rule 09:00-13:00 (8 slots), but override 2026-06-22 (a Monday) to 09:00-11:00.
    d = _director()
    d["date_overrides"] = [{"date": "2026-06-22", "windows": [{"start": "09:00", "end": "11:00"}]}]
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC), 30
    )
    # 09:00-11:00 EDT = 2h = 4 half-hour slots (09:00 EDT == 13:00 UTC).
    assert len(slots) == 4
    starts = sorted(slots)
    assert starts[0] == datetime(2026, 6, 22, 13, 0, tzinfo=UTC)
    assert starts[-1] == datetime(2026, 6, 22, 14, 30, tzinfo=UTC)


def test_date_override_empty_windows_marks_day_off():
    d = _director()  # Monday 09:00-13:00
    d["date_overrides"] = [{"date": "2026-06-22", "windows": []}]  # off that Monday
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC), 30
    )
    assert slots == {}


def test_date_override_adds_availability_on_day_with_no_weekly_rule():
    # Only a Wednesday rule, but override a Tuesday (2026-06-23) to add hours.
    d = _director(rules=[{"day_of_week": 2, "start": "09:00", "end": "13:00"}])
    d["date_overrides"] = [{"date": "2026-06-23", "windows": [{"start": "10:00", "end": "11:00"}]}]
    slots = generate_director_slots(
        d, datetime(2026, 6, 23, tzinfo=UTC), datetime(2026, 6, 24, tzinfo=UTC), 30  # a Tuesday
    )
    assert len(slots) == 2  # 10:00-11:00 EDT == 14:00 UTC
    assert sorted(slots)[0] == datetime(2026, 6, 23, 14, 0, tzinfo=UTC)


def test_date_override_only_affects_its_own_date():
    # Override only Monday 2026-06-22; the next Monday 2026-06-29 keeps the full weekly rule.
    d = _director()  # Monday 09:00-13:00 (8 slots)
    d["date_overrides"] = [{"date": "2026-06-22", "windows": [{"start": "09:00", "end": "10:00"}]}]
    slots = generate_director_slots(
        d, datetime(2026, 6, 29, tzinfo=UTC), datetime(2026, 6, 30, tzinfo=UTC), 30  # next Monday
    )
    assert len(slots) == 8


def test_whole_slots_only_partial_trailing_dropped():
    d = _director(rules=[{"day_of_week": 0, "start": "09:00", "end": "09:45"}])
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC), 30
    )
    # Only the full 09:00-09:30 slot fits; 09:30-10:00 would exceed 09:45.
    assert len(slots) == 1
    assert next(iter(slots)) == datetime(2026, 6, 22, 13, 0, tzinfo=UTC)


def test_dst_offset_changes_across_spring_forward():
    # America/Los_Angeles: 2026-03-07 is PST (UTC-8); 2026-03-14 is PDT (UTC-7). Both Saturdays.
    d = _director(tz="America/Los_Angeles", rules=[{"day_of_week": 5, "start": "09:00", "end": "09:30"}])
    pst = generate_director_slots(d, datetime(2026, 3, 7, tzinfo=UTC), datetime(2026, 3, 8, tzinfo=UTC), 30)
    pdt = generate_director_slots(d, datetime(2026, 3, 14, tzinfo=UTC), datetime(2026, 3, 15, tzinfo=UTC), 30)
    assert next(iter(pst)) == datetime(2026, 3, 7, 17, 0, tzinfo=UTC)   # 09:00 PST -> 17:00Z
    assert next(iter(pdt)) == datetime(2026, 3, 14, 16, 0, tzinfo=UTC)  # 09:00 PDT -> 16:00Z


def test_window_filters_out_of_range_slots():
    d = _director()
    # Window covers only 14:00-15:00 UTC of the Monday.
    slots = generate_director_slots(
        d, datetime(2026, 6, 22, 14, 0, tzinfo=UTC), datetime(2026, 6, 22, 15, 0, tzinfo=UTC), 30
    )
    assert sorted(slots) == [datetime(2026, 6, 22, 14, 0, tzinfo=UTC), datetime(2026, 6, 22, 14, 30, tzinfo=UTC)]


# --------------------------------------------------------------------------- pure: subtraction & dedup

def _window():
    return datetime(2026, 6, 22, tzinfo=UTC), datetime(2026, 6, 23, tzinfo=UTC)


def test_time_off_removes_overlapping_slots():
    d = _director(time_off=[{"start_utc": "2026-06-22T13:00:00+00:00", "end_utc": "2026-06-22T14:00:00+00:00"}])
    ws, we = _window()
    free = compute_free_at_pure([d], [], [], ws, we, 30)
    # 13:00 and 13:30 slots removed; 6 remain.
    assert datetime(2026, 6, 22, 13, 0, tzinfo=UTC) not in free
    assert datetime(2026, 6, 22, 13, 30, tzinfo=UTC) not in free
    assert datetime(2026, 6, 22, 14, 0, tzinfo=UTC) in free
    assert len(free) == 6


def test_clinic_closure_removes_slots():
    d = _director()
    ws, we = _window()
    closures = [{"start_utc": "2026-06-22T00:00:00Z", "end_utc": "2026-06-23T00:00:00Z"}]
    assert compute_free_at_pure([d], [], closures, ws, we, 30) == {}


def test_confirmed_booking_removes_its_slot():
    d = _director()
    ws, we = _window()
    booking = {"director_id": "d1", "slot_start_utc": datetime(2026, 6, 22, 13, 0, tzinfo=UTC),
               "slot_end_utc": datetime(2026, 6, 22, 13, 30, tzinfo=UTC)}
    free = compute_free_at_pure([d], [booking], [], ws, we, 30)
    assert datetime(2026, 6, 22, 13, 0, tzinfo=UTC) not in free
    assert datetime(2026, 6, 22, 13, 30, tzinfo=UTC) in free  # buffer 0: adjacent slot still free
    assert len(free) == 7


def test_buffer_blocks_adjacent_slot():
    d = _director()
    ws, we = _window()
    booking = {"director_id": "d1", "slot_start_utc": datetime(2026, 6, 22, 13, 0, tzinfo=UTC),
               "slot_end_utc": datetime(2026, 6, 22, 13, 30, tzinfo=UTC)}
    free = compute_free_at_pure([d], [booking], [], ws, we, 30, buffer_minutes=15)
    # booking blocks [13:00, 13:45) -> 13:00 and 13:30 both gone.
    assert datetime(2026, 6, 22, 13, 0, tzinfo=UTC) not in free
    assert datetime(2026, 6, 22, 13, 30, tzinfo=UTC) not in free
    assert datetime(2026, 6, 22, 14, 0, tzinfo=UTC) in free


def test_multi_director_dedup_and_capacity():
    d1 = _director("d1")
    d2 = _director("d2")
    ws, we = _window()
    slot = datetime(2026, 6, 22, 13, 0, tzinfo=UTC)
    # both free -> two directors at the slot
    free = compute_free_at_pure([d1, d2], [], [], ws, we, 30)
    assert set(free[slot]) == {"d1", "d2"}
    # book d1 -> only d2 free, slot still present
    free = compute_free_at_pure([d1, d2], [{"director_id": "d1", "slot_start_utc": slot,
                                            "slot_end_utc": slot + timedelta(minutes=30)}], [], ws, we, 30)
    assert free[slot] == ["d2"]
    # book both -> slot gone
    free = compute_free_at_pure(
        [d1, d2],
        [{"director_id": "d1", "slot_start_utc": slot, "slot_end_utc": slot + timedelta(minutes=30)},
         {"director_id": "d2", "slot_start_utc": slot, "slot_end_utc": slot + timedelta(minutes=30)}],
        [], ws, we, 30,
    )
    assert slot not in free


def test_inactive_director_ignored():
    d = _director(active=False)
    ws, we = _window()
    assert compute_free_at_pure([d], [], [], ws, we, 30) == {}


def test_empty_directors():
    ws, we = _window()
    assert compute_free_at_pure([], [], [], ws, we, 30) == {}


def test_ranges_overlap_halfopen():
    a0 = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
    a1 = datetime(2026, 1, 1, 9, 30, tzinfo=UTC)
    # touching at the boundary does NOT overlap (half-open)
    assert not _ranges_overlap(a0, a1, a1, a1 + timedelta(minutes=30))
    assert _ranges_overlap(a0, a1, a0 + timedelta(minutes=15), a1 + timedelta(minutes=15))


# --------------------------------------------------------------------------- async wrappers (fake DB)

class _Cursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._i = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._i]
        self._i += 1
        return doc


class _Coll:
    def __init__(self, docs):
        self._docs = docs

    def find(self, *a, **k):
        return _Cursor(self._docs)

    async def find_one(self, *a, **k):
        return self._docs[0] if self._docs else None


class FakeDB:
    def __init__(self, directors, bookings, settings):
        self.directors = _Coll(directors)
        self.bookings = _Coll(bookings)
        self.settings = _Coll([settings] if settings else [])


def test_availability_response_shape_and_min_notice_clamp():
    # Put a director's rule ~10 days out so generated slots clear min_notice and are < max_advance.
    target = (datetime.now(UTC) + timedelta(days=10))
    dow = target.weekday()
    d = _director(tz="UTC", rules=[{"day_of_week": dow, "start": "09:00", "end": "11:00"}])
    settings = {"_id": "app_settings", "slot_minutes": 30, "min_notice_minutes": 120,
                "max_advance_days": 90, "buffer_minutes": 0}
    db = FakeDB([d], [], settings)

    start_date = (datetime.now(UTC).date()).isoformat()
    slots, dates = asyncio.run(compute_availability_response(db, start_date, 30))

    assert slots, "expected non-empty availability"
    # legacy wire shape preserved
    sample = slots[0]
    assert set(sample.keys()) == {"start_time", "end_time", "duration", "consultant_id"}
    assert sample["consultant_id"] == "auto"
    assert sample["duration"] == 30
    assert sample["start_time"].tzinfo is not None
    # dates_with_availability are sorted UTC date strings matching the slots
    assert dates == sorted(dates)
    assert {s["start_time"].date().isoformat() for s in slots} == set(dates)
    # 09:00-11:00 UTC = 4 slots on the target day
    assert sum(1 for s in slots if s["start_time"].date() == target.date()) == 4


def test_availability_response_empty_when_no_directors():
    settings = {"_id": "app_settings", "slot_minutes": 30, "min_notice_minutes": 120, "max_advance_days": 90}
    db = FakeDB([], [], settings)
    start_date = datetime.now(UTC).date().isoformat()
    slots, dates = asyncio.run(compute_availability_response(db, start_date, 14))
    assert slots == [] and dates == []


def test_directors_free_at_returns_full_docs():
    target = datetime.now(UTC) + timedelta(days=10)
    dow = target.weekday()
    slot = datetime(target.year, target.month, target.day, 9, 0, tzinfo=UTC)
    d1 = _director("d1", tz="UTC", rules=[{"day_of_week": dow, "start": "09:00", "end": "10:00"}])
    d2 = _director("d2", tz="UTC", rules=[{"day_of_week": dow, "start": "09:00", "end": "10:00"}])
    settings = {"_id": "app_settings", "slot_minutes": 30, "min_notice_minutes": 0, "max_advance_days": 90}
    db = FakeDB([d1, d2], [{"director_id": "d1", "slot_start_utc": slot,
                            "slot_end_utc": slot + timedelta(minutes=30)}], settings)
    free = asyncio.run(directors_free_at(db, slot))
    assert [d["director_id"] for d in free] == ["d2"]
