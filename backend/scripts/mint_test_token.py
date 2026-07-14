"""Mint a short-lived JWT for a known user, for local Playwright UI tests ONLY.

Reads JWT_SECRET_KEY / MONGO_URL / DB_NAME from the backend's own environment (.env via
dotenv) — the secret is never printed. Usage:  python scripts/mint_test_token.py <email>
Prints the access token to stdout (or an ERROR line to stderr + exit 1).
"""
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
import jwt
from pymongo import MongoClient

load_dotenv()

SECRET = os.environ.get("JWT_SECRET_KEY")
MONGO = os.environ.get("MONGO_URL")
DB = os.environ.get("DB_NAME")

if not SECRET:
    sys.exit("ERROR: JWT_SECRET_KEY is not set — cannot mint a token the backend will accept.")
if not MONGO or not DB:
    sys.exit("ERROR: MONGO_URL / DB_NAME not set.")
if len(sys.argv) < 2:
    sys.exit("ERROR: usage: mint_test_token.py <email>")

email = sys.argv[1].strip().lower()
user = MongoClient(MONGO)[DB].users.find_one({"email": email}, {"_id": 0, "id": 1})
if not user or not user.get("id"):
    sys.exit(f"ERROR: no user with email {email}")

token = jwt.encode(
    {"sub": user["id"], "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
    SECRET,
    algorithm="HS256",
)
print(token)
