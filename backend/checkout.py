"""Book-first checkout (/checkout): Stripe payment for a held slot.

Flow: POST /api/booking/hold (booking.py) -> POST /api/checkout/session creates a Stripe Checkout
Session (ui_mode "elements") for that hold -> the page confirms payment with Stripe's Payment Element
-> Stripe redirects to /checkout/complete, which polls GET /api/checkout/status.

FULFILLMENT (portal account + confirmed booking + Google/PB/emails + automations) runs ONLY from the
signed webhook (checkout.session.completed / async_payment_succeeded, when payment_status != 'unpaid'),
once per Checkout Session: the checkout_orders doc (_id = session id) is the claim, and each step is
guarded so a Stripe retry after a crash finishes the job without doubling anything.

Config (Railway backend vars, never in code): STRIPE_SECRET_KEY (a restricted rk_ key is preferred),
STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, and optionally STRIPE_PROMO_PRICE_ID —
charged instead of STRIPE_PRICE_ID while the admin's checkout promo toggle is on.
"""
import asyncio
import base64
import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import resend
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from booking import (BookSessionRequest, _cancel_booking, _finalize_local_booking, _iso, _now_iso, _spawn_bg, db,
                     get_pb_service_optional)
from services import assignment as assignment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/checkout", tags=["checkout"])

STRIPE_API_VERSION = "2026-08-26.dahlia"
# Tags these sessions in the Stripe Dashboard so this flow can be compared with other checkouts.
INTEGRATION_IDENTIFIER = "shumard_book_first_checkout_qjwvtmrk"
# The same checkout lives on two pages, one per traffic source (user, 2026-09-29). The page a payment came from is
# kept on the hold, in Stripe's metadata, on the order and in the automation payload ("checkout_page").
CHECKOUT_PAGES = ("/checkout", "/session")
SESSION_MINUTES = 31               # Stripe's minimum Checkout Session lifetime is 30 min; the sweep expires it with the 15-min hold
CLAIM_STALE_AFTER = timedelta(minutes=2)
LOGIN_WINDOW = timedelta(hours=2)  # the return page can swap a fulfilled order for a login, this soon after payment...
LOGIN_REISSUE = timedelta(minutes=2)  # ...and only within 2 min of the first time it did so

PRODUCT_TITLE = "Diabetes Reversal Strategy Session"
# The /checkout eligibility checkbox wording (Checkout.jsx; same as the GHL checkout's) — quoted in the receipt;
# keep the two identical.
POLICY_TEXT = ("I confirm that I (or the person I am booking for) have been diagnosed with Type 2 diabetes. I understand "
               "that this appointment is NOT for pre-diabetics. Also if you have a significant other they are REQUIRED "
               "to be part of the consultation. If these conditions are NOT met you are not eligible for a refund and "
               "this consultation fee of {price} is NON-REFUNDABLE.")
BILLED_BY = ("Dr. Shumard", "740 Nordahl Rd, Suite 294, San Marcos CA 92069")
RECEIPTS_DRIVE_ID = "0ALIj6IuzK66FUk9PVA"   # "Day 1 Receipts" shared drive: receipt-<name>-<order id>.pdf

_client: Optional[stripe.StripeClient] = None
_price_cache: dict = {}   # price_id -> unit_amount (cents)


def _configured() -> bool:
    return all(os.environ.get(k) for k in ("STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_PRICE_ID"))


def _stripe() -> stripe.StripeClient:
    global _client
    if _client is None:
        _client = stripe.StripeClient(os.environ["STRIPE_SECRET_KEY"], stripe_version=STRIPE_API_VERSION,
                                      http_client=stripe.HTTPXClient())
    return _client


def _aware(d: Optional[datetime]) -> Optional[datetime]:
    return d.replace(tzinfo=timezone.utc) if d is not None and d.tzinfo is None else d


def _frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "https://portal.drshumard.com").rstrip("/")


def _money(cents: int, whole: bool = False) -> str:
    """$97 / $97.00 — this checkout sells in USD only."""
    return f"${cents // 100}" if whole and cents % 100 == 0 else f"${cents / 100:.2f}"


async def _current_price_id() -> str:
    """STRIPE_PROMO_PRICE_ID while the admin's checkout promo toggle is on, else STRIPE_PRICE_ID."""
    settings = await db.settings.find_one({"_id": "app_settings"}, {"_id": 0, "checkout_promo_enabled": 1}) or {}
    promo_id = os.environ.get("STRIPE_PROMO_PRICE_ID")
    return promo_id if promo_id and settings.get("checkout_promo_enabled") else os.environ["STRIPE_PRICE_ID"]


async def _price_amount(price_id: str) -> int:
    # A Stripe Price's amount can never change, so it's fetched once per process.
    if price_id not in _price_cache:
        _price_cache[price_id] = (await _stripe().v1.prices.retrieve_async(price_id)).unit_amount
    return _price_cache[price_id]


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/config")
async def checkout_config():
    """Public: the price the /checkout page shows (the payment step shows the Stripe session's own total)."""
    if not _configured():
        raise HTTPException(status_code=503, detail="Payments aren't connected yet.")
    amount = await _price_amount(await _current_price_id())
    return {"display": _money(amount, whole=True), "display_full": _money(amount)}


class SessionRequest(BaseModel):
    hold_id: str
    page: Literal["/checkout", "/session"] = "/checkout"


@router.post("/session")
async def create_checkout_session(body: SessionRequest):
    """Stripe Checkout Session for an active hold; returns what the page needs to mount the Payment
    Element. Idempotent per hold (reload / double call -> same session)."""
    if not _configured():
        raise HTTPException(status_code=503, detail="Payments aren't connected yet.")
    now = datetime.now(timezone.utc)
    hold = await db.bookings.find_one({"booking_id": body.hold_id, "source": "checkout"}, {"_id": 0})
    if not hold or hold.get("status") != "held" or _aware(hold.get("hold_expires_at")) <= now:
        raise HTTPException(status_code=409, detail="Your hold has expired. Please choose a time again.")
    publishable_key = os.environ["STRIPE_PUBLISHABLE_KEY"]
    if hold.get("stripe_client_secret") and hold.get("stripe_session_state") == "open":
        return {"client_secret": hold["stripe_client_secret"], "publishable_key": publishable_key}

    session = await _stripe().v1.checkout.sessions.create_async(params={
        "ui_mode": "elements",
        "mode": "payment",
        "line_items": [{"price": await _current_price_id(), "quantity": 1}],
        "customer_email": hold["patient"]["email"],
        "client_reference_id": body.hold_id,
        "metadata": {"hold_id": body.hold_id, "checkout_page": body.page},
        "payment_intent_data": {"metadata": {"hold_id": body.hold_id, "checkout_page": body.page}},
        "return_url": f"{_frontend_url()}{body.page}/complete?session_id={{CHECKOUT_SESSION_ID}}",
        "expires_at": int((now + timedelta(minutes=SESSION_MINUTES)).timestamp()),
        "integration_identifier": INTEGRATION_IDENTIFIER,
    }, options={"idempotency_key": f"checkout-session-{body.hold_id}"})
    await db.bookings.update_one({"booking_id": body.hold_id}, {"$set": {
        "stripe_session_id": session.id, "stripe_client_secret": session.client_secret,
        "stripe_session_state": "open", "checkout_page": body.page, "updated_at": _now_iso()}})
    return {"client_secret": session.client_secret, "publishable_key": publishable_key}


@router.get("/status")
async def checkout_status(session_id: str):
    """What the return page shows while the webhook fulfills the order. Read-only, except that the FIRST
    call after fulfillment of a brand-new account returns login tokens (once, within LOGIN_WINDOW) —
    an existing account is never logged in from a public checkout form; it signs in normally."""
    order = await db.checkout_orders.find_one({"_id": session_id})
    if order and order.get("status") == "fulfilled":
        now = datetime.now(timezone.utc)
        resp = {"state": "fulfilled", "outcome": order.get("outcome"),
                "slot_start_utc": order.get("slot_start_utc"), "patient_timezone": order.get("patient_timezone"),
                "login": "sign_in"}
        # Re-issuable for LOGIN_REISSUE after the first issue (React dev double-effects, a quick refresh),
        # then never again; $min keeps the FIRST issue time so repeated polling can't extend it.
        claimed = await db.checkout_orders.find_one_and_update(
            {"_id": session_id, "user_created": True, "fulfilled_at": {"$gte": now - LOGIN_WINDOW},
             "$or": [{"login_issued_at": {"$exists": False}}, {"login_issued_at": {"$gte": now - LOGIN_REISSUE}}]},
            {"$min": {"login_issued_at": now}})
        if claimed:
            from server import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, create_refresh_token
            resp.update(login="tokens", email=order.get("email"),
                        access_token=create_access_token(data={"sub": order["user_id"]},
                                                         expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)),
                        refresh_token=create_refresh_token(data={"sub": order["user_id"]}))
        elif order.get("login_issued_at"):
            resp["login"] = "already_issued"
        return resp
    if not _configured():
        raise HTTPException(status_code=503, detail="Payments aren't connected yet.")
    try:
        session = await _stripe().v1.checkout.sessions.retrieve_async(session_id)
    except stripe.InvalidRequestError:
        raise HTTPException(status_code=404, detail="Checkout not found.")
    if session.status == "open":
        return {"state": "unpaid"}
    if session.status == "expired":
        return {"state": "expired"}
    if session.payment_status == "unpaid":
        return {"state": "processing"}      # delayed payment method: fulfilled when it succeeds
    return {"state": "confirming"}          # paid — the webhook is finishing the booking


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret or not os.environ.get("STRIPE_SECRET_KEY"):
        raise HTTPException(status_code=503, detail="Webhook not configured")
    payload = await request.body()
    try:
        event = _stripe().construct_event(payload, request.headers.get("Stripe-Signature"), secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")

    session = event.data.object.to_dict()   # StripeObject isn't a dict in stripe-python 15
    hold_id = (session.get("metadata") or {}).get("hold_id") if event.type.startswith("checkout.session.") else None
    if not hold_id:
        return {"received": True}           # not a book-first checkout (other integrations share the account)
    if event.type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if session.get("payment_status") != "unpaid":
            await fulfill_checkout(session)  # raises -> 500 -> Stripe retries; fulfillment resumes where it stopped
    elif event.type == "checkout.session.async_payment_failed":
        logger.warning(f"Checkout {session['id']} (hold {hold_id}): delayed payment failed")
    elif event.type == "checkout.session.expired":
        await db.bookings.update_one({"booking_id": hold_id, "stripe_session_state": "open"},
                                     {"$set": {"stripe_session_state": "expired", "updated_at": _now_iso()}})
    return {"received": True}


# ============================================================================
# Fulfillment
# ============================================================================

async def fulfill_checkout(session) -> dict:
    """Idempotent: account -> slot confirmed (or re-held; else the patient picks a new time) -> Google/PB/
    confirmation email via the normal booking finalizer -> welcome email -> receipt -> checkout_purchase automations."""
    sid, hold_id = session["id"], session["metadata"]["hold_id"]
    now = datetime.now(timezone.utc)
    try:
        order = await db.checkout_orders.find_one_and_update(
            {"_id": sid, "status": {"$ne": "fulfilled"},
             "$or": [{"claimed_at": {"$exists": False}}, {"claimed_at": {"$lt": now - CLAIM_STALE_AFTER}}]},
            {"$set": {"status": "fulfilling", "claimed_at": now},
             "$setOnInsert": {"hold_id": hold_id, "amount_total": session.get("amount_total"),
                              "currency": session.get("currency"), "payment_intent": session.get("payment_intent"),
                              "checkout_page": session["metadata"].get("checkout_page") or "/checkout",
                              "created_at": now}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        return await db.checkout_orders.find_one({"_id": sid})   # fulfilled, or another worker is on it

    hold = await db.bookings.find_one({"booking_id": hold_id}, {"_id": 0})
    if not hold:
        raise RuntimeError(f"checkout {sid}: hold {hold_id} not found")
    patient = hold["patient"]
    email = patient["email"].strip().lower()
    step = {"email": email, "patient_timezone": hold.get("patient_timezone"),
            "slot_start_utc": _iso(_aware(hold["slot_start_utc"]))}

    # 1. Portal account
    user, generated_password = await _ensure_user(patient, order)
    if "user_id" not in order:
        step.update(user_id=user["id"], user_created=generated_password is not None)
        await db.checkout_orders.update_one({"_id": sid}, {"$set": step})
        order.update(step)
    if generated_password is not None:     # brand-new account: same welcome email as the GHL purchase webhook
        from server import create_auto_login_token, send_portal_welcome_email
        token = await create_auto_login_token(user["id"], email)
        await send_portal_welcome_email(email, user.get("name") or email, user["id"], generated_password,
                                        f"{_frontend_url()}/auto-login/{token}")

    # 2. The slot: confirm the hold, else re-grab the same time, else the patient picks a new one
    booking, outcome = await _confirm_slot(hold, user["id"], sid)
    await db.checkout_orders.update_one({"_id": sid}, {"$set": {
        "outcome": outcome, "booking_id": booking["booking_id"] if booking else None}})

    # 3. Google event + Meet, journey Step 1->2, PB mirror + confirmation email (normal booking finalizer).
    #    A paid booking is kept even if Google fails; the office is told.
    if booking and not order.get("booking_finalized"):
        request = BookSessionRequest(
            first_name=patient.get("first_name") or "", last_name=patient.get("last_name") or "",
            email=email, phone=patient.get("phone"), timezone=hold.get("patient_timezone") or "America/New_York",
            slot_start_time=_iso(_aware(booking["slot_start_utc"])), consultant_id="auto")
        await _finalize_local_booking(booking, request, user["id"], get_pb_service_optional(),
                                      f"checkout-{sid[-8:]}", release_on_gcal_failure=False)
        await db.checkout_orders.update_one({"_id": sid}, {"$set": {"booking_finalized": True}})
        if booking.get("gcal_status") == "failed":
            _alert_office(f"Paid checkout booked without a Google event: {email}",
                          [f"Booking {booking['booking_id']} at {step['slot_start_utc']} is confirmed and paid, "
                           "but the Google Calendar event / Meet link could not be created. Please add it manually."])
    if outcome == "needs_new_time" and not order.get("office_alerted"):
        _alert_office(f"Paid checkout needs a new time: {email}",
                      [f"{patient.get('first_name', '')} {patient.get('last_name', '')} paid (Stripe {sid}) but their "
                       f"held time {step['slot_start_utc']} was taken after the hold expired.",
                       "Their account is at Step 1, so they'll be asked to pick a new time."])
        await db.checkout_orders.update_one({"_id": sid}, {"$set": {"office_alerted": True}})

    # 4. Receipt: emailed with its PDF attached, and the PDF filed in the receipts shared drive — each once
    #    (a failure is logged, not retried)
    if not (order.get("receipt_sent") and order.get("receipt_filed")):
        receipt = _receipt(session, patient, email, hold.get("patient_timezone"), _aware(order["created_at"]))
        done = await _deliver_receipt(receipt, send=not order.get("receipt_sent"), file=not order.get("receipt_filed"))
        if done:
            await db.checkout_orders.update_one({"_id": sid}, {"$set": done})

    # 5. Automations ("Checkout purchase" trigger -> e.g. GHL workflow webhooks), once
    if not order.get("automations_fired"):
        from server import execute_automations
        stored = await db.checkout_orders.find_one({"_id": sid})   # has every step's result (outcome, user, booking)
        _spawn_bg(execute_automations("checkout_purchase", _purchase_payload(
            stored, hold, booking, datetime.now(timezone.utc).isoformat())))
        await db.checkout_orders.update_one({"_id": sid}, {"$set": {"automations_fired": True}})

    done = {"status": "fulfilled", "fulfilled_at": datetime.now(timezone.utc)}
    await db.checkout_orders.update_one({"_id": sid}, {"$set": done})
    logger.info(f"Checkout {sid} fulfilled: hold {hold_id} -> {outcome}")
    return {**order, **done}


def _purchase_payload(order: dict, hold: dict, booking: Optional[dict], timestamp: str) -> dict:
    """What "Checkout purchase" automations receive — at fulfillment, and when resent from Admin > Purchases."""
    patient = hold.get("patient") or {}
    return {
        "trigger": "checkout_purchase",
        "first_name": patient.get("first_name"), "last_name": patient.get("last_name"),
        "email": order.get("email"), "mobile_phone": patient.get("phone"),
        "amount": (order.get("amount_total") or 0) / 100, "currency": order.get("currency"),
        "stripe_session_id": order["_id"], "stripe_payment_intent_id": order.get("payment_intent"),
        "booking_id": booking["booking_id"] if booking else None,
        "session_date": _iso(_aware(booking["slot_start_utc"])) if booking else None,
        "timezone": hold.get("patient_timezone"), "outcome": order.get("outcome"),
        "user_id": order.get("user_id"), "new_account": bool(order.get("user_created")),
        "checkout_page": order.get("checkout_page") or "/checkout",   # orders from before /session came from /checkout
        "timestamp": timestamp,
    }


async def _ensure_user(patient: dict, order: dict):
    """(user, generated_password). generated_password is None unless THIS call created the account."""
    email = patient["email"].strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        if user.get("current_step", 1) == 0:
            # A refunded patient paying again: the verified payment restores access, as the GHL repurchase webhook does.
            await db.users.update_one({"id": user["id"]}, {"$set": {"current_step": 1, "reactivated_at": _now_iso()}})
            user["current_step"] = 1
        return user, None
    from server import (LEGACY_PASSWORD_LOGIN, User, generate_portal_password, get_password_hash, log_activity,
                        normalize_phone)
    password = generate_portal_password()
    first, last = (patient.get("first_name") or "").strip(), (patient.get("last_name") or "").strip()
    user_dict = User(email=email, name=f"{first} {last}".strip() or email,
                     password_hash=get_password_hash(password) if LEGACY_PASSWORD_LOGIN else None).model_dump()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    if not LEGACY_PASSWORD_LOGIN:
        user_dict.pop("password_hash", None)
    user_dict.update(first_name=first, last_name=last, signup_source="checkout")
    if patient.get("phone"):
        user_dict["phone"] = normalize_phone(patient["phone"]) or patient["phone"]
    await db.users.insert_one(dict(user_dict))
    await log_activity(event_type="USER_CREATED", user_email=email, user_id=user_dict["id"],
                       details={"name": user_dict["name"], "source": "checkout"}, status="success")
    return user_dict, password


async def _confirm_slot(hold: dict, user_id: str, sid: str):
    """(booking, 'booked') or (None, 'needs_new_time'). Retry-safe: a booking already confirmed for this
    Checkout Session is reused, so a resumed fulfillment never books a second slot."""
    already = await db.bookings.find_one({"stripe_session_id": sid, "status": "confirmed"}, {"_id": 0})
    if already:
        return already, "booked"
    now_iso = _now_iso()
    # Still 'held' (even past hold_expires_at) means nobody else can have this host+time: confirm it.
    booking = await db.bookings.find_one_and_update(
        {"booking_id": hold["booking_id"], "status": "held"},
        {"$set": {"status": "confirmed", "user_id": user_id, "stripe_session_id": sid,
                  "stripe_session_state": "complete", "confirmed_at": now_iso, "updated_at": now_iso}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if booking:
        return booking, "booked"
    start = _aware(hold["slot_start_utc"])
    if start <= datetime.now(timezone.utc) + timedelta(hours=1):
        return None, "needs_new_time"
    try:
        booking = await assignment_service.assign_and_hold(
            db, slot_start_utc=start, slot_end_utc=_aware(hold["slot_end_utc"]),
            duration_minutes=hold.get("duration_minutes") or 30, patient=hold["patient"],
            patient_timezone=hold.get("patient_timezone"), user_id=user_id, source="checkout")
    except assignment_service.SlotFull:
        return None, "needs_new_time"
    await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$set": {
        "stripe_session_id": sid, "stripe_session_state": "complete", "replaces_hold": hold["booking_id"]}})
    booking.update(stripe_session_id=sid)
    return booking, "booked"


def _receipt(session: dict, patient: dict, email: str, tz_name: Optional[str], paid_at: datetime) -> dict:
    """What the receipt shows (the GHL route's n8n receipt) — the email body and the PDF render the same fields."""
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")
    stamp = lambda zone: paid_at.astimezone(zone).strftime("%b %d, %Y, %I:%M:%S %p %Z")  # noqa: E731
    currency = (session.get("currency") or "usd").upper()
    money = lambda cents: f"{_money(cents or 0)} {currency}"  # noqa: E731
    return {
        "order_id": session.get("payment_intent") or session["id"],
        "date": paid_at.astimezone(tz).strftime("%b %d, %Y"), "local": stamp(tz), "utc": stamp(timezone.utc),
        "name": f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip() or email,
        "email": email, "phone": patient.get("phone") or "—",
        "item": PRODUCT_TITLE, "price": money(session.get("amount_subtotal")), "total": money(session.get("amount_total")),
        "policy": POLICY_TEXT.format(price=_money(session.get("amount_total") or 0, whole=True)),
        "billed_by": BILLED_BY,
    }


def _receipt_html(r: dict) -> str:
    e = {k: escape(v) if isinstance(v, str) else v for k, v in r.items()}
    navy, gold, line, muted = "#0b2a5b", "#ffc24a", "#e3e6ea", "#6b6f6a"
    heading = "font-family:Montserrat,'Trebuchet MS',Helvetica,Arial,sans-serif"

    def meta(label, value, sub="", last=False):
        border = "" if last else f"border-bottom:1px solid {line};"
        sub = f'<br><span style="color:{muted};font-size:12px;font-weight:400">{sub}</span>' if sub else ""
        return (f'<tr><td style="padding:9px 0;{border}color:{muted};width:40%;vertical-align:top">{label}</td>'
                f'<td style="padding:9px 0;{border}text-align:right;font-weight:700;color:{navy};vertical-align:top">{value}{sub}</td></tr>')

    th = f"{heading};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:{navy};padding:8px 0;border-bottom:2px solid {navy}"
    td = f"padding:10px 0;border-bottom:1px solid {line}"
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;font-family:Lato,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:13px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere">
<tr><td style="background:{navy};color:#ffffff;padding:24px 14px;text-align:center">
  <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr Shumard" width="200" style="width:200px;display:block;margin:0 auto 24px">
  <h1 style="{heading};font-size:32px;line-height:38px;letter-spacing:-0.02em;font-weight:700;margin:0;color:#ffffff">Your <span style="color:{gold}">receipt</span>.</h1>
  <p style="margin:8px 0 0;color:#c9cdd3;font-size:14px">Order {e["order_id"]} · {e["date"]}</p>
</td></tr>
<tr><td style="padding:32px 28px">
  <p style="{heading};font-size:13px;font-weight:700;color:{navy};margin:0 0 8px">Payment details</p>
  <div style="background:#f4f6f8;border-radius:10px;padding:8px 20px;margin:0 0 24px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    {meta("Order ID", e["order_id"])}
    {meta("Order date", e["local"], e["utc"])}
    {meta("Customer", e["name"])}
    {meta("Email", e["email"])}
    {meta("Phone", e["phone"])}
    {meta("Payment method", "Stripe")}
    {meta("Billed by", escape(r["billed_by"][0]), escape(r["billed_by"][1]), last=True)}
  </table></div>
  <p style="{heading};font-size:13px;font-weight:700;color:{navy};margin:0 0 8px">Items</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><th style="{th};text-align:left;width:55%">Item</th><th style="{th};text-align:center">Qty</th><th style="{th};text-align:center">Price</th><th style="{th};text-align:right;width:15%">Total</th></tr>
    <tr><td style="{td}">{e["item"]}</td><td style="{td};text-align:center">1</td><td style="{td};text-align:center">{e["price"]}</td><td style="{td};text-align:right">{e["price"]}</td></tr>
    <tr><td colspan="3" style="padding:10px 12px 10px 0;border-top:2px solid {navy};font-weight:700;font-size:15px;text-align:right">Total paid</td><td style="padding:10px 0;border-top:2px solid {navy};font-weight:700;font-size:15px;text-align:right">{e["total"]}</td></tr>
  </table>
</td></tr>
<tr><td style="background:{navy};color:#ffffff;padding:18px 22px">
  <h2 style="{heading};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:{gold};margin:0 0 10px">Terms accepted at checkout</h2>
  <p style="margin:0 0 10px;color:#e6e9ee">Completing this order required ticking a mandatory checkbox agreeing to the following:</p>
  <div style="border-left:4px solid {gold};padding:14px 16px;font-size:16px;line-height:1.7;font-weight:700;color:#ffffff;margin:14px 0">"{e["policy"]}"</div>
  <p style="margin:0 0 10px;color:#e6e9ee">Accepted by {e["name"]} ({e["email"]}) on {e["local"]} ({e["utc"]}), order {e["order_id"]}.</p>
</td></tr>
</table></body></html>"""


def _slug(text: str) -> str:
    """'Peter W. Longa' -> 'Peter-W-Longa', as the GHL route names its receipts in the same drive."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().replace("'", "")
    return re.sub(r"[^A-Za-z0-9]+", "-", plain).strip("-") or "patient"


async def _deliver_receipt(r: dict, send: bool, file: bool) -> dict:
    """Email the receipt with its PDF attached (send) and put the PDF in the receipts shared drive (file).
    Returns the checkout_orders flags for what succeeded; failures are logged."""
    from services.google_drive import upload_pdf_to_drive
    from services.receipt_pdf import build_receipt_pdf
    done, filename = {}, f"receipt-{_slug(r['name'])}-{r['order_id']}.pdf"
    try:
        pdf = build_receipt_pdf(r)
    except Exception as e:
        logger.error(f"Checkout receipt PDF {filename} failed: {e}")
        pdf = None
    if send:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": "Billing - Dr Shumard <noreply@portal.drshumard.com>",
                "to": [r["email"]],
                "reply_to": ["concierge@drshumard.com"],
                "subject": "Your receipt from Dr. Shumard",
                "html": _receipt_html(r),
                **({"attachments": [{"filename": filename, "content": base64.b64encode(pdf).decode()}]} if pdf else {}),
            })
            done["receipt_sent"] = True
        except Exception as e:
            logger.error(f"Checkout receipt to {r['email']} (order {r['order_id']}) failed: {e}")
    if file and pdf:
        result = await asyncio.to_thread(upload_pdf_to_drive, pdf, filename, RECEIPTS_DRIVE_ID)
        if result.get("success"):
            done.update(receipt_filed=True, receipt_drive_file_id=result["file_id"])
        else:
            logger.error(f"Checkout receipt {filename}: Drive upload failed: {result.get('error')}")
    return done


def _alert_office(subject: str, lines: list) -> None:
    try:
        resend.Emails.send({
            "from": "Dr. Shumard's Office <noreply@email.drshumard.com>",
            "to": os.environ.get("ADMIN_NOTIFICATION_EMAIL", "drjason@drshumard.com"),
            "subject": subject,
            "html": "".join(f"<p>{line}</p>" for line in lines),
        })
    except Exception as e:
        logger.error(f"Office alert failed ({subject}): {e}")


# ============================================================================
# Admin > Purchases
# ============================================================================

async def list_purchases(limit: int = 200) -> list:
    """Every /checkout payment the Stripe webhook has processed, newest first, with what fulfillment did for
    it: the booking, the portal account, the receipt and each automation's result."""
    orders = await db.checkout_orders.find({}).sort("created_at", -1).to_list(limit)
    ids = lambda key: [o[key] for o in orders if o.get(key)]  # noqa: E731
    bookings = {b["booking_id"]: b async for b in db.bookings.find(
        {"booking_id": {"$in": ids("hold_id") + ids("booking_id")}}, {"_id": 0})}
    users = {u["id"]: u async for u in db.users.find({"id": {"$in": ids("user_id")}}, {"_id": 0, "id": 1, "current_step": 1})}
    hosts = {d["director_id"]: d.get("name") async for d in db.directors.find(
        {"director_id": {"$in": [b["director_id"] for b in bookings.values() if b.get("director_id")]}},
        {"_id": 0, "director_id": 1, "name": 1})}
    runs = {}
    async for log in db.automation_logs.find(
            {"trigger": "checkout_purchase", "trigger_data.stripe_session_id": {"$in": [o["_id"] for o in orders]}},
            {"_id": 0, "automation_name": 1, "action_name": 1, "success": 1, "response_status": 1, "error": 1,
             "executed_at": 1, "is_retry": 1, "manual": 1, "trigger_data.stripe_session_id": 1}).sort("executed_at", 1):
        sid = log.pop("trigger_data")["stripe_session_id"]
        runs.setdefault(sid, []).append(log)
    try:
        promo_id = os.environ.get("STRIPE_PROMO_PRICE_ID")
        promo_amount = await _price_amount(promo_id) if promo_id and _configured() else None
    except Exception:
        promo_amount = None

    await _refresh_pending_refunds(orders)
    rows = []
    for o in orders:
        hold, booking = bookings.get(o.get("hold_id")) or {}, bookings.get(o.get("booking_id"))
        refunded, remaining = refund_totals(o)
        patient = hold.get("patient") or {}
        rows.append({
            "id": o["_id"], "status": o.get("status"), "paid_at": _iso(_aware(o.get("created_at"))),
            "first_name": patient.get("first_name"), "last_name": patient.get("last_name"),
            "email": o.get("email") or patient.get("email"), "phone": patient.get("phone"),
            "amount": o.get("amount_total"), "currency": o.get("currency"),
            "promo": promo_amount is not None and o.get("amount_total") == promo_amount,
            "payment_intent": o.get("payment_intent"), "outcome": o.get("outcome"),
            "booking": booking and {
                "booking_id": booking["booking_id"], "status": booking.get("status"),
                "slot_start_utc": _iso(_aware(booking.get("slot_start_utc"))),
                "timezone": booking.get("patient_timezone") or hold.get("patient_timezone"),
                "host": hosts.get(booking.get("director_id")), "meet_link": booking.get("meet_link"),
                "gcal_status": booking.get("gcal_status"), "pb_status": booking.get("pb_status")},
            "user_id": o.get("user_id"), "new_account": bool(o.get("user_created")),
            "current_step": (users.get(o.get("user_id")) or {}).get("current_step"),
            "receipt_sent": bool(o.get("receipt_sent")), "receipt_filed": bool(o.get("receipt_filed")),
            "receipt_drive_file_id": o.get("receipt_drive_file_id"),
            "automations_fired": bool(o.get("automations_fired")), "automations": runs.get(o["_id"], []),
            "refunds": [{**r, "created_at": _iso(_aware(r.get("created_at")))} for r in o.get("refunds") or []],
            "amount_refunded": refunded,
            "refundable": remaining if o.get("status") == "fulfilled" and o.get("payment_intent") else 0,
        })
    return rows


async def send_purchase_to_automations(sid: str, targets: set, admin_email: str) -> Optional[list]:
    """Admin > Purchases "Send to automations": this purchase's automation payload (as sent at fulfillment,
    stamped with the original purchase time and manual=true) to the chosen (automation_id, action_id) actions,
    whether or not those automations are switched on. None if there's no such fulfilled purchase."""
    order = await db.checkout_orders.find_one({"_id": sid, "status": "fulfilled"})
    if not order:
        return None
    hold = await db.bookings.find_one({"booking_id": order.get("hold_id")}, {"_id": 0}) or {}
    booking = await db.bookings.find_one({"booking_id": order["booking_id"]}, {"_id": 0}) if order.get("booking_id") else None
    payload = {**_purchase_payload(order, hold, booking, _iso(_aware(order.get("fulfilled_at")))), "manual": True}
    from server import execute_automations
    return await execute_automations("checkout_purchase", payload, only=targets,
                                     log_extra={"manual": True, "triggered_by": admin_email})


# ============================================================================
# Hold expiry -> Stripe session expiry
# ============================================================================

# ============================================================================
# Refunds (Admin > Purchases, user 2026-09-30): refund on Stripe, full or partial, then — as the admin ticks —
# cancel the session quietly, move the patient to step 0 (refunded) and email them a refund confirmation.
# ============================================================================

REFUND_COUNTED = ("succeeded", "pending", "requires_action")   # refunds that count; failed/canceled gave nothing back
REFUND_LOCK_STALE = timedelta(minutes=2)                      # a refund that crashed mid-way frees its purchase after this


def refund_totals(order: dict) -> tuple:
    """(refunded, remaining) cents: what a purchase's refunds add up to, and what can still be refunded."""
    refunded = sum(r.get("amount") or 0 for r in order.get("refunds") or [] if r.get("status") in REFUND_COUNTED)
    return refunded, max((order.get("amount_total") or 0) - refunded, 0)


async def _refresh_pending_refunds(orders: list) -> None:
    """Card refunds usually succeed at once; a pending one is re-read from Stripe when the purchases list loads."""
    for o in orders:
        for r in o.get("refunds") or []:
            if r.get("status") not in ("pending", "requires_action") or not _configured():
                continue
            try:
                fresh = await _stripe().v1.refunds.retrieve_async(r["id"])
            except Exception as e:
                logger.warning(f"Refund {r['id']}: status check failed: {e}")
                continue
            if fresh.status != r["status"]:
                await db.checkout_orders.update_one({"_id": o["_id"], "refunds.id": r["id"]},
                                                    {"$set": {"refunds.$.status": fresh.status}})
                r["status"] = fresh.status


def _refund_email_html(r: dict) -> str:
    """The refund confirmation — the receipt's look (navy header, gold accent, details table)."""
    e = {k: escape(v) if isinstance(v, str) else v for k, v in r.items()}
    navy, gold, line, muted = "#0b2a5b", "#ffc24a", "#e3e6ea", "#6b6f6a"
    heading = "font-family:Montserrat,'Trebuchet MS',Helvetica,Arial,sans-serif"
    greeting = f"Hi {e['first_name']}," if r.get("first_name") else "Hello,"
    lead = (f"We’ve refunded your {e['amount']} payment to the card you paid with." if r["full"]
            else f"We’ve refunded {e['amount']} of your {e['paid']} payment to the card you paid with.")
    session = (f'<p style="margin:0 0 14px">As part of this refund, your strategy session on <strong>{e["session"]}</strong> '
               f'has been cancelled.</p>') if r.get("session") else ""
    rows = [("Refund", e["amount"]), ("Original payment", e["paid"]), ("Refunded to", "The card you paid with"),
            ("Refund date", e["date"]), ("Order ID", e["order_id"])]
    table = "".join(
        f'<tr><td style="padding:9px 0;{"" if i == len(rows) - 1 else f"border-bottom:1px solid {line};"}color:{muted};width:40%">{k}</td>'
        f'<td style="padding:9px 0;{"" if i == len(rows) - 1 else f"border-bottom:1px solid {line};"}text-align:right;font-weight:700;color:{navy}">{v}</td></tr>'
        for i, (k, v) in enumerate(rows))
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;font-family:Lato,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:15px;line-height:1.6;word-break:break-word">
<tr><td style="background:{navy};color:#ffffff;padding:24px 14px;text-align:center">
  <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr Shumard" width="200" style="width:200px;display:block;margin:0 auto 24px">
  <h1 style="{heading};font-size:32px;line-height:38px;letter-spacing:-0.02em;font-weight:700;margin:0;color:#ffffff">Your <span style="color:{gold}">refund</span>.</h1>
  <p style="margin:8px 0 0;color:#c9cdd3;font-size:14px">Order {e["order_id"]} · {e["date"]}</p>
</td></tr>
<tr><td style="padding:32px 28px">
  <p style="margin:0 0 14px">{greeting}</p>
  <p style="margin:0 0 14px">{lead}</p>
  {session}
  <p style="margin:0 0 24px">Refunds usually appear on your statement within 5–10 business days, depending on your bank.</p>
  <p style="{heading};font-size:13px;font-weight:700;color:{navy};margin:0 0 8px">Refund details</p>
  <div style="background:#f4f6f8;border-radius:10px;padding:8px 20px;margin:0 0 24px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">{table}</table></div>
  <p style="margin:0">If you have any questions, just reply to this email and our team will help.</p>
</td></tr>
<tr><td style="background:{navy};color:#c9cdd3;padding:18px 22px;font-size:12px;text-align:center">{escape(BILLED_BY[0])} · {escape(BILLED_BY[1])}</td></tr>
</table></body></html>"""


async def _send_refund_email(order: dict, hold: dict, refund, cancelled: Optional[dict]) -> bool:
    patient = hold.get("patient") or {}
    email = order.get("email") or patient.get("email")
    if not email:
        return False
    try:
        tz = ZoneInfo(hold.get("patient_timezone") or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")
    paid = order.get("amount_total") or 0
    session = None
    if cancelled and cancelled.get("slot_start_utc"):
        start = _aware(cancelled["slot_start_utc"]).astimezone(tz)
        session = f"{start:%A, %B} {start.day} at {start.hour % 12 or 12}:{start:%M %p %Z}"   # Thursday, October 1 at 9:00 AM PDT
    r = {"first_name": (patient.get("first_name") or "").strip(), "amount": _money(refund.amount), "paid": _money(paid),
         "full": refund.amount >= paid, "order_id": order.get("payment_intent") or order["_id"],
         "date": datetime.now(tz).strftime("%b %d, %Y"), "session": session}
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": "Billing - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [email],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Your refund from Dr. Shumard",
            "html": _refund_email_html(r),
        })
        return True
    except Exception as e:
        logger.error(f"Refund email to {email} (order {order['_id']}) failed: {e}")
        return False


async def refund_purchase(sid: str, *, amount: Optional[int], cancel_session: bool, mark_refunded: bool,
                          email_patient: bool, note: Optional[str], request_id: str, admin_email: str) -> dict:
    """Refund a /checkout (or /session) payment on Stripe: `amount` cents, or everything still refundable. Then, as
    asked: cancel the session quietly (the refund email says so), move the patient to step 0, email them, and run
    "Checkout refund" automations. Idempotent per request_id — the same request twice refunds and emails once."""
    now = datetime.now(timezone.utc)
    # One refund at a time per purchase (a double click, two admins at once).
    order = await db.checkout_orders.find_one_and_update(
        {"_id": sid, "$or": [{"refund_lock": {"$exists": False}}, {"refund_lock": {"$lt": now - REFUND_LOCK_STALE}}]},
        {"$set": {"refund_lock": now}})
    if not order:
        if await db.checkout_orders.count_documents({"_id": sid}, limit=1):
            raise HTTPException(status_code=409, detail="Another refund of this purchase is in progress. Try again in a moment.")
        raise HTTPException(status_code=404, detail="Purchase not found.")
    try:
        if order.get("status") != "fulfilled" or not order.get("payment_intent"):
            raise HTTPException(status_code=409, detail="This purchase can't be refunded yet.")
        _, remaining = refund_totals(order)
        if not remaining:
            raise HTTPException(status_code=400, detail="This purchase is already fully refunded.")
        amount = remaining if amount is None else amount
        if not 0 < amount <= remaining:
            raise HTTPException(status_code=400, detail=f"The refund must be between $0.01 and {_money(remaining)}.")
        try:
            refund = await _stripe().v1.refunds.create_async(params={
                "payment_intent": order["payment_intent"], "amount": amount, "reason": "requested_by_customer",
                "metadata": {"checkout_session": sid, "refunded_by": admin_email or ""},
            }, options={"idempotency_key": f"checkout-refund-{sid}-{request_id}"})
        except stripe.StripeError as e:
            logger.error(f"Refund of checkout {sid} failed at Stripe: {e}")
            raise HTTPException(status_code=502, detail=getattr(e, "user_message", None)
                                or "Stripe couldn't make the refund, so nothing was refunded. Please try again.")
        pushed = await db.checkout_orders.update_one({"_id": sid, "refunds.id": {"$ne": refund.id}}, {"$push": {"refunds": {
            "id": refund.id, "amount": refund.amount, "status": refund.status, "created_at": now,
            "by": admin_email, "note": (note or "").strip() or None}}})
    finally:
        await db.checkout_orders.update_one({"_id": sid}, {"$unset": {"refund_lock": ""}})

    stored = await db.checkout_orders.find_one({"_id": sid})
    record = next(r for r in stored["refunds"] if r["id"] == refund.id)
    done = {k: bool(record.get(k)) for k in ("session_cancelled", "marked_refunded", "email_sent")}
    if pushed.modified_count:          # a replay of an earlier request changes nothing else
        hold = await db.bookings.find_one({"booking_id": order.get("hold_id")}, {"_id": 0}) or {}
        booking = await db.bookings.find_one({"booking_id": order["booking_id"]}, {"_id": 0}) if order.get("booking_id") else None
        cancelled = None
        if cancel_session and booking and booking.get("status") == "confirmed":
            try:
                await _cancel_booking(booking, get_pb_service_optional(), f"refund-{sid[-8:]}", actor=admin_email or "admin",
                                      reason="Refunded", notify_patient=False)
                cancelled, done["session_cancelled"] = booking, True
            except Exception as e:
                logger.error(f"Refund of {sid}: cancelling booking {booking['booking_id']} failed: {e}")
        if mark_refunded and order.get("user_id"):
            moved = await db.users.update_one({"id": order["user_id"], "current_step": {"$ne": 0}}, {"$set": {"current_step": 0}})
            done["marked_refunded"] = moved.modified_count == 1
        if email_patient:
            done["email_sent"] = await _send_refund_email(order, hold, refund, cancelled)
        await db.checkout_orders.update_one({"_id": sid, "refunds.id": refund.id},
                                            {"$set": {f"refunds.$.{k}": v for k, v in done.items()}})
        stored = await db.checkout_orders.find_one({"_id": sid})
        from server import execute_automations
        refunded, left = refund_totals(stored)
        _spawn_bg(execute_automations("checkout_refund", {
            **_purchase_payload(stored, hold, booking, datetime.now(timezone.utc).isoformat()),
            "trigger": "checkout_refund", "refund_id": refund.id, "refund_amount": refund.amount / 100,
            "refunded_total": refunded / 100, "fully_refunded": left == 0, **done}))
    refunded, left = refund_totals(stored)
    return {"refund": {"id": refund.id, "amount": refund.amount, "status": refund.status}, **done,
            "refunded_total": refunded, "remaining": left, "replayed": not pushed.modified_count,
            "email": order.get("email"), "user_id": order.get("user_id")}


async def expire_lapsed_sessions() -> int:
    """Expire the Stripe Checkout Session of every hold that lapsed (15 min) or was replaced, so a payment
    can't complete on a slot we no longer hold. A session that already completed can't be expired —
    the webhook fulfills it (re-grabbing the time if it's still free)."""
    now = datetime.now(timezone.utc)
    rows = await db.bookings.find(
        {"source": "checkout", "stripe_session_state": "open",
         "$or": [{"status": "expired"}, {"status": "held", "hold_expires_at": {"$lte": now}}]},
        {"_id": 0, "booking_id": 1, "stripe_session_id": 1}).to_list(50)
    for row in rows:
        state = "expired"
        try:
            await _stripe().v1.checkout.sessions.expire_async(row["stripe_session_id"])
        except stripe.InvalidRequestError:
            state = "not_open"
        await db.bookings.update_one({"booking_id": row["booking_id"], "stripe_session_state": "open"},
                                     {"$set": {"stripe_session_state": state, "updated_at": _now_iso()}})
    await assignment_service.expire_stale_holds(db)
    return len(rows)


def start_checkout_sweep(interval_seconds: int = 60) -> None:
    if not _configured():
        logger.info("Checkout session sweep disabled (Stripe not configured)")
        return

    async def _loop():
        try:
            await db.bookings.create_index([("stripe_session_id", 1)], sparse=True)
        except Exception as e:
            logger.warning(f"stripe_session_id index: {e}")
        while True:
            try:
                n = await expire_lapsed_sessions()
                if n:
                    logger.info(f"Checkout sweep: expired {n} Stripe session(s) for lapsed holds")
            except Exception as e:
                logger.warning(f"Checkout sweep iteration failed: {e}")
            await asyncio.sleep(interval_seconds)
    _spawn_bg(_loop())
    logger.info("Checkout session sweep started (every %ss)", interval_seconds)
