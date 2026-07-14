"""Orchestration tests for the portal-owned booking path (booking._book_local).

Externals (assignment, Google Calendar, PB, email, DB) are mocked so we can assert the
sequencing + compensation rules from CADENCE_MIGRATION_PLAN §4.1:
  - Google failure -> release the hold (status=cancelled) and raise 503.
  - PB failure -> pb_status='pending' but the booking still succeeds.
  - Idempotency -> a prior confirmed booking is returned without re-assigning.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

import booking  # noqa: E402
from booking import BookSessionRequest, _book_local  # noqa: E402

UTC = timezone.utc
FUTURE = (datetime.now(UTC) + timedelta(days=10)).replace(microsecond=0)
SLOT_ISO = FUTURE.isoformat().replace("+00:00", "Z")


class FakeColl:
    def __init__(self, find_one_result=None):
        self._find_one_result = find_one_result
        self.updates = []
        self.fou_calls = []

    async def find_one(self, q, proj=None):
        r = self._find_one_result
        return r(q) if callable(r) else r

    async def update_one(self, q, u, **k):
        self.updates.append((q, u))
        return type("R", (), {"matched_count": 1, "modified_count": 1})()

    async def find_one_and_update(self, q, u, **k):
        self.fou_calls.append((q, u))
        return {"booking_id": q.get("booking_id")}  # claim succeeds


class FakeDB:
    def __init__(self, settings, idempotency_existing=None):
        self.settings = FakeColl(settings)
        self.bookings = FakeColl(idempotency_existing)   # find_one == idempotency lookup
        self.directors = FakeColl({"timezone": "America/New_York"})
        self.users = FakeColl(None)                       # no user -> advance is a safe no-op
        self.user_progress = FakeColl(None)


class FakePB:
    def __init__(self, fail=False):
        self.fail = fail
        self.book_calls = []

    async def get_or_create_client(self, profile, correlation_id=None):
        return ("rec1", True)

    async def book_session(self, **kwargs):
        self.book_calls.append(kwargs)
        if self.fail:
            raise RuntimeError("PB is down")
        return {"id": "sess1"}


def _request():
    return BookSessionRequest(
        first_name="Pat", last_name="Ient", email="pat@example.com",
        phone="+15551234567", timezone="America/New_York",
        slot_start_time=SLOT_ISO, consultant_id="auto", notes="hi",
    )


def _settings(shared_pb=True):
    return {
        "slot_minutes": 30, "session_title": "Strategy Session", "session_description": "desc",
        "shared_pb_consultant_id": "shared-1" if shared_pb else "", "pb_service_id": "svc-1",
    }


def _install(monkeypatch, db, *, assign_returns=None, assign_raises=None,
             gcal_returns=("evt1", "https://meet.google.com/x"), gcal_raises=None):
    monkeypatch.setattr(booking, "db", db)

    async def fake_assign(_db, **kw):
        if assign_raises:
            raise assign_raises
        doc = {
            "booking_id": "b1", "director_id": "d1", "gcal_calendar_id": "cal-d1",
            "slot_start_utc": kw["slot_start_utc"], "slot_end_utc": kw["slot_end_utc"],
            "duration_minutes": kw["duration_minutes"], "status": "confirmed",
            "gcal_status": "pending", "pb_status": "pending",
        }
        doc.update(assign_returns or {})
        return doc
    monkeypatch.setattr(booking.assignment_service, "assign_and_hold", fake_assign)

    async def fake_gcal(**kw):
        if gcal_raises:
            raise gcal_raises
        return gcal_returns
    monkeypatch.setattr(booking.gcal, "create_event_with_meet", fake_gcal)

    async def fake_email(**kw):
        return {"id": "email1"}
    monkeypatch.setattr(booking.booking_email, "send_booking_confirmation", fake_email)


def test_happy_path(monkeypatch):
    db = FakeDB(_settings())
    _install(monkeypatch, db)
    pb = FakePB()

    async def run_and_drain():
        resp = await _book_local(_request(), None, pb, "cid")
        # PB mirror + coordinator add are backgrounded — drain them before asserting.
        tasks = list(booking._bg_tasks)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        return resp
    resp = asyncio.run(run_and_drain())

    assert resp.success is True
    assert resp.booking_id == "b1"
    assert resp.meet_link == "https://meet.google.com/x"
    assert resp.session_id == "b1"             # PB mirror is async now; session_id falls back to booking id
    assert resp.duration == 30                  # minutes
    # gcal synced inline; pb synced by the background mirror after draining
    set_ops = [u["$set"] for (_q, u) in db.bookings.updates if "$set" in u]
    assert any(s.get("gcal_status") == "synced" and s.get("gcal_event_id") == "evt1" for s in set_ops)
    assert any(s.get("pb_status") == "synced" and s.get("pb_session_id") == "sess1" for s in set_ops)
    assert len(pb.book_calls) == 1
    # PB called WITHOUT telehealth and WITHOUT client notify, with the shared id + Meet link in notes
    call = pb.book_calls[0]
    assert call["include_telehealth"] is False and call["notify"] is False
    assert call["consultant_id"] == "shared-1"
    assert "Google Meet:" in (call["notes"] or "")


def test_google_failure_releases_hold_and_503(monkeypatch):
    db = FakeDB(_settings())
    _install(monkeypatch, db, gcal_raises=RuntimeError("calendar down"))
    pb = FakePB()
    with pytest.raises(HTTPException) as ei:
        asyncio.run(_book_local(_request(), None, pb, "cid"))
    assert ei.value.status_code == 503
    set_ops = [u["$set"] for (_q, u) in db.bookings.updates if "$set" in u]
    assert any(s.get("status") == "cancelled" for s in set_ops), "hold must be released on Google failure"
    assert len(pb.book_calls) == 0, "PB must not be touched after Google failure"


def test_pb_failure_keeps_booking_pending(monkeypatch):
    db = FakeDB(_settings())
    _install(monkeypatch, db)
    pb = FakePB(fail=True)
    resp = asyncio.run(_book_local(_request(), None, pb, "cid"))
    assert resp.success is True                 # patient keeps a valid appointment
    assert resp.meet_link == "https://meet.google.com/x"
    set_ops = [u["$set"] for (_q, u) in db.bookings.updates if "$set" in u]
    assert any(s.get("pb_status") == "pending" for s in set_ops)
    # session_id falls back to booking_id when PB didn't return one
    assert resp.session_id == "b1"


def test_no_shared_pb_skips_mirror(monkeypatch):
    db = FakeDB(_settings(shared_pb=False))
    _install(monkeypatch, db)
    pb = FakePB()
    resp = asyncio.run(_book_local(_request(), None, pb, "cid"))
    assert resp.success is True
    assert len(pb.book_calls) == 0


def test_idempotency_returns_existing(monkeypatch):
    existing = {
        "booking_id": "old1", "director_id": "d9", "slot_start_utc": FUTURE,
        "slot_end_utc": FUTURE + timedelta(minutes=30), "duration_minutes": 30,
        "pb_session_id": "oldsess", "pb_client_record_id": "oldrec",
        "meet_link": "https://meet.google.com/old",
    }
    db = FakeDB(_settings(), idempotency_existing=existing)

    async def boom(*a, **k):
        raise AssertionError("assign_and_hold must NOT be called on idempotent repeat")
    _install(monkeypatch, db)
    monkeypatch.setattr(booking.assignment_service, "assign_and_hold", boom)

    resp = asyncio.run(_book_local(_request(), None, FakePB(), "cid"))
    assert resp.booking_id == "old1"
    assert resp.meet_link == "https://meet.google.com/old"
    assert "already confirmed" in resp.message.lower()
