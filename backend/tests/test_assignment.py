"""Unit tests for round-robin assignment (services/assignment.py).

Uses a fake DB whose insert_one raises DuplicateKeyError for "taken" (director, slot)
pairs, simulating the partial unique index. directors_free_at is stubbed.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pymongo.errors import DuplicateKeyError  # noqa: E402
from services import assignment  # noqa: E402
from services.assignment import assign_and_hold, SlotFull  # noqa: E402

UTC = timezone.utc
SLOT = datetime(2026, 6, 22, 13, 0, tzinfo=UTC)
PATIENT = {"first_name": "A", "last_name": "B", "email": "a@b.com", "phone": None}


class FakeBookings:
    def __init__(self, taken=None, loads=None):
        self.taken = set(taken or [])        # director_ids that already hold the slot
        self.loads = loads or {}
        self.inserted = []
        self.attempts = []

    async def insert_one(self, doc):
        self.attempts.append(doc["director_id"])
        if doc["director_id"] in self.taken:
            raise DuplicateKeyError("dup (director, slot)")
        self.inserted.append(doc)
        return type("R", (), {"inserted_id": "x"})()

    async def count_documents(self, q):
        return self.loads.get(q["director_id"], 0)


class FakeDirectors:
    def __init__(self, by_id):
        self.by_id = by_id

    async def find_one(self, q, proj=None):
        return self.by_id.get(q["director_id"])


class FakeDB:
    def __init__(self, bookings, directors=None):
        self.bookings = bookings
        self.directors = directors or FakeDirectors({})


def _dir(did):
    return {"director_id": did, "google_calendar_id": f"cal-{did}", "timezone": "UTC"}


def _stub_free(directors):
    async def _free(db, slot):
        return list(directors)
    assignment.availability_engine.directors_free_at = _free


def _hold(db, **kw):
    return asyncio.run(assign_and_hold(
        db, slot_start_utc=SLOT, slot_end_utc=SLOT, duration_minutes=30,
        patient=PATIENT, patient_timezone="America/New_York", user_id="u1",
        source="patient", **kw,
    ))


def test_picks_least_loaded():
    _stub_free([_dir("d1"), _dir("d2")])
    db = FakeDB(FakeBookings(loads={"d1": 2, "d2": 0}))
    doc = _hold(db)
    assert doc["director_id"] == "d2"
    assert doc["status"] == "confirmed" and doc["gcal_status"] == "pending" and doc["pb_status"] == "pending"
    assert doc["slot_start_utc"] == SLOT


def test_duplicate_key_falls_through_to_next_director():
    _stub_free([_dir("d1"), _dir("d2")])
    # loads make d1 first in order; d1 already taken -> DuplicateKeyError -> d2 wins.
    db = FakeDB(FakeBookings(taken={"d1"}, loads={"d1": 0, "d2": 1}))
    doc = _hold(db)
    assert doc["director_id"] == "d2"
    assert db.bookings.attempts == ["d1", "d2"]  # tried d1 first, fell through


def test_all_taken_raises_slot_full():
    _stub_free([_dir("d1"), _dir("d2")])
    db = FakeDB(FakeBookings(taken={"d1", "d2"}))
    try:
        _hold(db)
        assert False, "expected SlotFull"
    except SlotFull:
        pass


def test_no_eligible_raises_slot_full():
    _stub_free([])
    db = FakeDB(FakeBookings())
    try:
        _hold(db)
        assert False, "expected SlotFull"
    except SlotFull:
        pass


def test_forced_director_bypasses_free_check():
    # directors_free_at returns nothing, but a forced director can still be held.
    _stub_free([])
    db = FakeDB(FakeBookings(), FakeDirectors({"dX": _dir("dX")}))
    doc = _hold(db, forced_director_id="dX")
    assert doc["director_id"] == "dX"
    assert doc["gcal_calendar_id"] == "cal-dX"


def test_forced_director_not_found_raises():
    _stub_free([])
    db = FakeDB(FakeBookings(), FakeDirectors({}))
    try:
        _hold(db, forced_director_id="ghost")
        assert False, "expected SlotFull"
    except SlotFull:
        pass
