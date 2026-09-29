"""Availability's "today" is the clinic's (Pacific) calendar day, not the server clock's UTC date.

From 5pm Pacific (4pm in winter) UTC is already on tomorrow's date; clamping "past" start dates against it dropped
the rest of the clinic's day from every availability list.
"""

import asyncio
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import booking  # noqa: E402


class _FixedDatetime(datetime):
    fixed = None

    @classmethod
    def now(cls, tz=None):
        return cls.fixed.astimezone(tz) if tz else cls.fixed


def _at(monkeypatch, iso):
    _FixedDatetime.fixed = datetime.fromisoformat(iso)
    monkeypatch.setattr(booking, "datetime", _FixedDatetime)


def test_pacific_evening_is_still_today(monkeypatch):
    _at(monkeypatch, "2026-09-28T01:30:00+00:00")  # 6:30pm PDT on Sep 27; UTC is already Sep 28
    assert booking.clinic_today() == date(2026, 9, 27)


def test_winter_rollover_is_at_4pm(monkeypatch):
    _at(monkeypatch, "2026-12-02T00:30:00+00:00")  # 4:30pm PST on Dec 1
    assert booking.clinic_today() == date(2026, 12, 1)


def test_pacific_morning(monkeypatch):
    _at(monkeypatch, "2026-09-27T16:00:00+00:00")  # 9am PDT
    assert booking.clinic_today() == date(2026, 9, 27)


def _requested_start(monkeypatch, start_date):
    """Call GET /booking/availability (local engine) and return the start date it computed from."""
    seen = {}

    async def fake_engine():
        return "local"

    async def fake_compute(db, start, days):
        seen["start"] = start
        return [], []

    monkeypatch.setattr(booking, "_booking_engine", fake_engine)
    monkeypatch.setattr(booking.availability_engine, "compute_availability_response", fake_compute)
    asyncio.run(booking.get_availability(start_date=start_date, days=14, pb_service=None, correlation_id="test"))
    return seen["start"]


def test_evening_request_for_today_is_not_pushed_to_tomorrow(monkeypatch):
    _at(monkeypatch, "2026-09-28T01:30:00+00:00")  # 6:30pm PDT on Sep 27
    assert _requested_start(monkeypatch, "2026-09-27") == "2026-09-27"


def test_past_date_still_clamps_to_the_clinic_day(monkeypatch):
    _at(monkeypatch, "2026-09-28T01:30:00+00:00")  # 6:30pm PDT on Sep 27
    assert _requested_start(monkeypatch, "2026-09-20") == "2026-09-27"
