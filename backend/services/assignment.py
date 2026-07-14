"""
Round-robin director assignment at commit time (least-loaded, atomic).

Fairness is "least-loaded with random tiebreak" over a balancing window (the same UTC
calendar day, D8). The atomicity is provided by the partial unique index on
(director_id, slot_start_utc) where status="confirmed": the first insert wins; a
concurrent claim for the same (director, slot) raises DuplicateKeyError and we fall
through to the next eligible director. No locks. If every eligible director is taken
between availability display and commit, we raise SlotFull -> a clean "just taken".
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from services import availability as availability_engine

logger = logging.getLogger(__name__)


class SlotFull(Exception):
    """No eligible director could be held for the requested slot."""


async def _load_in_window(db, director_id: str, slot_start_utc: datetime) -> int:
    """Count of confirmed bookings for a director on the same UTC calendar day."""
    day_start = slot_start_utc.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    return await db.bookings.count_documents({
        "director_id": director_id,
        "status": "confirmed",
        "slot_start_utc": {"$gte": day_start, "$lt": day_end},
    })


async def assign_and_hold(
    db,
    *,
    slot_start_utc: datetime,
    slot_end_utc: datetime,
    duration_minutes: int,
    patient: dict,
    patient_timezone: str,
    user_id,
    source: str,
    notes=None,
    forced_director_id=None,
) -> dict:
    """Atomically reserve a director for the slot by inserting a confirmed booking row.

    Returns the inserted booking doc (gcal_*/pb_* fields are placeholders to be filled by
    the caller after Google/PB steps). Raises SlotFull if nothing can be held.
    """
    if forced_director_id:
        # Admin override: book the chosen director even outside the normal free check;
        # the unique index still prevents an actual double-book.
        director = await db.directors.find_one({"director_id": forced_director_id}, {"_id": 0})
        if not director:
            raise SlotFull("forced director not found")
        order = [director]
    else:
        eligible = await availability_engine.directors_free_at(db, slot_start_utc)
        if not eligible:
            raise SlotFull("no eligible director free at slot")
        loads = {
            d["director_id"]: await _load_in_window(db, d["director_id"], slot_start_utc)
            for d in eligible
        }
        order = sorted(eligible, key=lambda d: (loads[d["director_id"]], random.random()))

    now_iso = datetime.now(timezone.utc).isoformat()
    for director in order:
        booking_id = str(uuid.uuid4())
        doc = {
            "booking_id": booking_id,
            "user_id": user_id,
            "director_id": director["director_id"],
            "status": "confirmed",
            "slot_start_utc": slot_start_utc,
            "slot_end_utc": slot_end_utc,
            "duration_minutes": duration_minutes,
            "patient_timezone": patient_timezone,
            "patient": {k: patient.get(k) for k in ("first_name", "last_name", "email", "phone")},
            "gcal_calendar_id": director.get("google_calendar_id"),
            "gcal_event_id": None,
            "gcal_status": "pending",
            "meet_link": None,
            "pb_client_record_id": None,
            "pb_session_id": None,
            "pb_status": "pending",
            "source": source,
            "notes": notes,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        try:
            await db.bookings.insert_one(dict(doc))
            doc.pop("_id", None)
            logger.info("Held booking %s for director %s at %s", booking_id, director["director_id"], slot_start_utc)
            return doc
        except DuplicateKeyError:
            logger.info("Director %s taken concurrently at %s; trying next", director["director_id"], slot_start_utc)
            continue

    raise SlotFull("all eligible directors were taken concurrently")
