"""Seed the real Directors of Admissions (Cora, Dr. Jake, Dr. Strang) into the directors
collection — profile, PB consultant id, Google calendar, and weekly availability.

Idempotent: upserts by email, so it can be re-run safely (dev now, prod at cutover) and
edits made later in the admin UI to non-seeded fields (time off, overrides) are preserved.

Usage (from backend/):
    venv/bin/python scripts/seed_directors.py                       # upsert the three
    venv/bin/python scripts/seed_directors.py --deactivate-others   # ...and deactivate any
                                                                    # active director not in
                                                                    # the seed list
Reads MONGO_URL / DB_NAME from backend/.env. Never prints secrets.
"""

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

TIMEZONE = "America/Los_Angeles"  # practice is San Diego; all hours below are local to this

# day_of_week: 0=Mon ... 6=Sun (matches DirectorWeeklyRule / the admin UI)
DIRECTORS = [
    {
        "name": "Cora",
        "email": "cora@drshumard.com",
        "pb_consultant_id": "631b99d4c5264b3e86d8ac34",
        "google_calendar_id": "c_a94ceac0171d27ad04567a683e5cd1b949bcb71be26407a4da665865cda5820e@group.calendar.google.com",
        "weekly_rules": [
            {"day_of_week": 0, "start": "09:00", "end": "12:00"},
            {"day_of_week": 0, "start": "14:00", "end": "17:30"},
            {"day_of_week": 1, "start": "14:00", "end": "17:30"},
            {"day_of_week": 2, "start": "09:00", "end": "12:00"},
            {"day_of_week": 2, "start": "14:00", "end": "17:30"},
            {"day_of_week": 3, "start": "14:00", "end": "17:30"},
            {"day_of_week": 4, "start": "08:00", "end": "12:30"},
        ],
    },
    {
        "name": "Dr. Jake",
        "email": "drjake@drshumard.com",
        "pb_consultant_id": "63d9da77036354ef722f2e27",
        "google_calendar_id": "c_27f7a4cb54672b4db6325bcaa71b2f59fdd991fbdb664fe50d83698f08ee2bd1@group.calendar.google.com",
        "weekly_rules": [
            {"day_of_week": 0, "start": "08:00", "end": "12:00"},
            {"day_of_week": 1, "start": "08:00", "end": "12:00"},
            {"day_of_week": 2, "start": "09:00", "end": "12:00"},
            {"day_of_week": 3, "start": "08:00", "end": "12:00"},
        ],
    },
    {
        "name": "Dr. Strang",
        "email": "drstrang@drshumard.com",
        "pb_consultant_id": "66c3ae0c79263f1c7cf564db",
        "google_calendar_id": "c_8b9abb36b1f387ba1c0527cea36c26d6a087deec5f0af618468ad32df97dc373@group.calendar.google.com",
        "weekly_rules": [
            {"day_of_week": 1, "start": "08:00", "end": "12:00"},
            {"day_of_week": 1, "start": "14:00", "end": "17:00"},
            {"day_of_week": 2, "start": "08:00", "end": "12:00"},
            {"day_of_week": 2, "start": "14:00", "end": "17:00"},
            {"day_of_week": 3, "start": "08:00", "end": "12:00"},
            {"day_of_week": 3, "start": "14:00", "end": "17:00"},
            {"day_of_week": 4, "start": "08:00", "end": "12:30"},
        ],
    },
]


async def main(deactivate_others: bool) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]
    now = datetime.now(timezone.utc).isoformat()

    seed_emails = {d["email"] for d in DIRECTORS}
    for d in DIRECTORS:
        existing = await db.directors.find_one({"email": d["email"]}, {"_id": 0, "director_id": 1})
        seeded = {
            "name": d["name"],
            "email": d["email"],
            "timezone": TIMEZONE,
            "google_calendar_id": d["google_calendar_id"],
            "pb_consultant_id": d["pb_consultant_id"],
            "weekly_rules": d["weekly_rules"],
            "active": True,
            "updated_at": now,
        }
        if existing:
            await db.directors.update_one({"email": d["email"]}, {"$set": seeded})
            print(f"updated  {d['name']:<11} ({d['email']})")
        else:
            seeded.update({
                "director_id": str(uuid.uuid4()),
                "time_off": [],
                "date_overrides": [],
                "created_at": now,
            })
            await db.directors.insert_one(seeded)
            print(f"created  {d['name']:<11} ({d['email']})")

    if deactivate_others:
        res = await db.directors.update_many(
            {"email": {"$nin": list(seed_emails)}, "active": True},
            {"$set": {"active": False, "updated_at": now}})
        print(f"deactivated {res.modified_count} other active director(s)")

    total_active = await db.directors.count_documents({"active": True})
    print(f"done — {total_active} active director(s) in '{os.environ.get('DB_NAME', 'test_database')}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deactivate-others", action="store_true",
                        help="deactivate any active director whose email is not in the seed list")
    args = parser.parse_args()
    asyncio.run(main(args.deactivate_others))
