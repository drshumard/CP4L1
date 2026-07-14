"""Cutover preflight: go/no-go checks before flipping settings.booking_engine to 'local'.

Run against the environment you're about to cut over (reads backend/.env):

    venv/bin/python scripts/preflight.py                # full run (creates + deletes ONE
                                                        # real test event on a director
                                                        # calendar for the Google check)
    venv/bin/python scripts/preflight.py --skip-google  # no external side effects

Prints PASS / WARN / FAIL per check. Exit code 1 if anything FAILs (WARNs don't block).
FAIL = do not flip. WARN = flip works but something degrades (read the line).
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
RESULTS = []


def report(level: str, name: str, detail: str = "") -> None:
    RESULTS.append(level)
    pad = " " * max(1, 42 - len(name))
    print(f"  [{level}] {name}{pad}{detail}")


# ---------------------------------------------------------------- checks

def check_env() -> None:
    print("\n== Environment ==")
    required = ["MONGO_URL", "DB_NAME", "JWT_SECRET_KEY",
                "PRACTICE_BETTER_CLIENT_ID", "PRACTICE_BETTER_CLIENT_SECRET",
                "PRACTICE_BETTER_SERVICE_ID", "RESEND_API_KEY"]
    for var in required:
        report(PASS if os.environ.get(var) else FAIL, f"env {var}",
               "set" if os.environ.get(var) else "MISSING")

    from services import google_calendar as gcal
    key = gcal._key_path()
    report(PASS if os.path.exists(key) else FAIL, "Google service-account key", key)
    report(PASS if os.environ.get("GOOGLE_CALENDAR_SUBJECT") else WARN, "env GOOGLE_CALENDAR_SUBJECT",
           os.environ.get("GOOGLE_CALENDAR_SUBJECT") or f"unset — defaults to {gcal._subject_email()}")

    for var in ("BUNNY_STORAGE_ZONE", "BUNNY_STORAGE_PASSWORD", "BUNNY_STORAGE_HOST", "BUNNY_CDN_BASE_URL"):
        report(PASS if os.environ.get(var) else WARN, f"env {var}",
               "set" if os.environ.get(var) else "unset — admin avatar upload will fail")

    tags = [t for t in os.environ.get("PRACTICE_BETTER_TAG_IDS", "").split(",") if t.strip()]
    report(PASS if tags else WARN, "PRACTICE_BETTER_TAG_IDS",
           f"{len(tags)} tag(s)" if tags else "empty — new PB clients get NO tags")


async def check_mongo(db) -> None:
    print("\n== MongoDB ==")
    try:
        await db.command("ping")
        report(PASS, "connection", os.environ.get("DB_NAME", ""))
    except Exception as e:
        report(FAIL, "connection", str(e)[:80])
        return
    idx = await db.bookings.index_information()
    uniq = idx.get("uniq_confirmed_director_slot")
    report(PASS if (uniq and uniq.get("unique")) else FAIL, "double-booking unique index",
           "uniq_confirmed_director_slot" if uniq else "MISSING — start the backend once to build indexes")
    bid = any(v.get("unique") and v.get("key") == [("booking_id", 1)] for v in idx.values())
    report(PASS if bid else WARN, "booking_id unique index", "present" if bid else "missing")


async def check_directors(db, settings) -> list:
    print("\n== Directors ==")
    directors = [d async for d in db.directors.find({"active": True}, {"_id": 0})]
    report(PASS if directors else FAIL, "active directors", f"{len(directors)}")
    for d in directors:
        name = d.get("name") or d.get("director_id", "?")[:8]
        problems = []
        if not (d.get("google_calendar_id") or "").strip():
            problems.append("no calendar id")
        if not (d.get("email") or "").strip():
            problems.append("no email (no Meet co-host)")
        if not d.get("weekly_rules"):
            problems.append("no weekly rules")
        if not (d.get("pb_consultant_id") or "").strip():
            # Legacy-engine availability polls this id; per_director routing needs it too.
            problems.append("no PB consultant id (invisible in legacy mode; skipped by per_director routing)")
        hard = [p for p in problems if "calendar" in p or "rules" in p]
        level = FAIL if hard else (WARN if problems else PASS)
        report(level, f"director {name}", "; ".join(problems) or "calendar + email + rules + PB id ok")
    return directors


async def check_settings(db) -> dict:
    print("\n== Settings ==")
    doc = await db.settings.find_one({"_id": "app_settings"}, {"_id": 0}) or {}
    engine = doc.get("booking_engine", "pb")
    report(PASS, "booking_engine (current)", engine)
    sessions = doc.get("sessions") or []
    report(PASS if sessions else FAIL, "sessions configured", f"{len(sessions)}")
    for s in sessions:
        has_pb = bool((s.get("pb_service_id") or "").strip())
        report(PASS if has_pb else WARN, f"session '{(s.get('title') or '?')[:34]}'",
               f"{s.get('duration_minutes')} min" + ("" if has_pb else " — no PB service id (mirrors under default service)"))
    mode = doc.get("pb_booking_mode") or "one_director"
    shared = (doc.get("shared_pb_consultant_id") or "").strip()
    if mode == "one_director":
        report(PASS if shared else WARN, "PB routing (one_director)",
               "shared consultant set" if shared else "no shared consultant — PB mirror skipped entirely")
    else:
        report(PASS, "PB routing", "per_director (checked per director above)")
    return doc


async def check_availability(db) -> None:
    print("\n== Availability engine ==")
    from services import availability as availability_engine
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        slots, dates = await availability_engine.compute_availability_response(db, today, 14)
        n = len(slots or [])
        report(PASS if n else FAIL, "slots in next 14 days",
               f"{n} slots across {len(dates or [])} day(s)" if n else "ZERO — patients would see an empty /book")
    except Exception as e:
        report(FAIL, "availability engine", str(e)[:100])


async def check_google(directors, skip: bool) -> None:
    print("\n== Google Calendar + Meet (live round-trip) ==")
    if skip:
        report(WARN, "live event round-trip", "skipped (--skip-google)")
        return
    target = next((d for d in directors if (d.get("google_calendar_id") or "").strip()), None)
    if not target:
        report(FAIL, "live event round-trip", "no director with a calendar id")
        return
    from services import google_calendar as gcal
    cal = target["google_calendar_id"].strip()
    start = datetime.now(timezone.utc) + timedelta(days=1)
    try:
        event_id, meet_link = await gcal.create_event_with_meet(
            calendar_id=cal, summary="[PREFLIGHT] safe to ignore", description="",
            start_utc=start, end_utc=start + timedelta(minutes=15),
            timezone=target.get("timezone") or "UTC",
            director_email=(target.get("email") or "").strip() or None)
        report(PASS, "event + Meet space created", f"{target.get('name')}: {meet_link}")
    except Exception as e:
        report(FAIL, "event + Meet space created", str(e)[:120])
        return
    try:
        session = gcal._meet_session()
        code = gcal._MEET_CODE_RE.search(meet_link).group(1)
        space = session.get(f"{gcal.MEET_API}/v2/spaces/{code}", timeout=20).json()
        cfg = space.get("config", {})
        rec = ((cfg.get("artifactConfig") or {}).get("recordingConfig") or {}).get("autoRecordingGeneration")
        report(PASS if cfg.get("moderation") == "ON" else WARN, "host management on space", str(cfg.get("moderation")))
        report(PASS if rec == "ON" else WARN, "auto-recording on space",
               str(rec) + ("" if rec == "ON" else " — check Workspace edition supports recording"))
        if (target.get("email") or "").strip():
            members = session.get(f"{gcal.MEET_API}/v2beta/{space['name']}/members", timeout=20).json()
            cohost = any((m.get("email") or "").lower() == target["email"].strip().lower()
                         and m.get("role") == "COHOST" for m in members.get("members", []))
            report(PASS if cohost else WARN, "director co-host on space",
                   target["email"] if cohost else "not found — director joins without host powers")
        else:
            report(WARN, "director co-host on space", "director has no email configured")
    except Exception as e:
        report(WARN, "Meet space inspection", str(e)[:100])
    finally:
        try:
            await gcal.delete_event(calendar_id=cal, event_id=event_id)
            report(PASS, "test event cleanup", "deleted")
        except Exception as e:
            report(WARN, "test event cleanup", f"delete it manually: {e}")


async def check_pb() -> None:
    print("\n== Practice Better ==")
    try:
        from services.practice_better_v2 import get_practice_better_service
        pb = get_practice_better_service()
        client = await pb._get_client()
        await pb.token_manager.get_token(client)
        report(PASS, "API auth (token fetch)", "ok")
    except Exception as e:
        report(FAIL, "API auth (token fetch)", str(e)[:100])
        return
    try:
        from services.client_cache import get_client_cache
        n = get_client_cache().get_total_cached_clients()
        report(PASS if n else WARN, "client cache",
               f"{n} clients" if n else "empty — first sync runs ~60s after backend start; picker/lookup degraded until done")
    except Exception as e:
        report(WARN, "client cache", str(e)[:80])


# ---------------------------------------------------------------- main

async def main(skip_google: bool) -> int:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "test_database")]
    check_env()
    await check_mongo(db)
    settings = await check_settings(db)
    directors = await check_directors(db, settings)
    await check_availability(db)
    await check_google(directors, skip_google)
    await check_pb()

    fails, warns = RESULTS.count(FAIL), RESULTS.count(WARN)
    print(f"\n{'=' * 60}")
    if fails:
        print(f"NO-GO: {fails} FAIL, {warns} WARN — fix the FAILs before flipping booking_engine.")
        return 1
    print(f"GO: 0 FAIL, {warns} WARN — safe to flip booking_engine to 'local'."
          + (" Review the WARNs above." if warns else ""))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-google", action="store_true",
                        help="skip the live Google event round-trip (no external side effects)")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.skip_google)))
