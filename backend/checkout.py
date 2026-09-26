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
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import resend
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from booking import (BookSessionRequest, _finalize_local_booking, _iso, _now_iso, _spawn_bg, db,
                     get_pb_service_optional)
from services import assignment as assignment_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/checkout", tags=["checkout"])

STRIPE_API_VERSION = "2026-08-26.dahlia"
# Tags these sessions in the Stripe Dashboard so this flow can be compared with other checkouts.
INTEGRATION_IDENTIFIER = "shumard_book_first_checkout_qjwvtmrk"
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
        "metadata": {"hold_id": body.hold_id},
        "payment_intent_data": {"metadata": {"hold_id": body.hold_id}},
        "return_url": f"{_frontend_url()}/checkout/complete?session_id={{CHECKOUT_SESSION_ID}}",
        "expires_at": int((now + timedelta(minutes=SESSION_MINUTES)).timestamp()),
        "integration_identifier": INTEGRATION_IDENTIFIER,
    }, options={"idempotency_key": f"checkout-session-{body.hold_id}"})
    await db.bookings.update_one({"booking_id": body.hold_id}, {"$set": {
        "stripe_session_id": session.id, "stripe_client_secret": session.client_secret,
        "stripe_session_state": "open", "updated_at": _now_iso()}})
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
        _spawn_bg(execute_automations("checkout_purchase", {
            "trigger": "checkout_purchase",
            "first_name": patient.get("first_name"), "last_name": patient.get("last_name"),
            "email": email, "mobile_phone": patient.get("phone"),
            "amount": (session.get("amount_total") or 0) / 100, "currency": session.get("currency"),
            "stripe_session_id": sid, "stripe_payment_intent_id": session.get("payment_intent"),
            "booking_id": booking["booking_id"] if booking else None,
            "session_date": _iso(_aware(booking["slot_start_utc"])) if booking else None,
            "timezone": hold.get("patient_timezone"), "outcome": outcome,
            "user_id": user["id"], "new_account": bool(order.get("user_created")),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))
        await db.checkout_orders.update_one({"_id": sid}, {"$set": {"automations_fired": True}})

    done = {"status": "fulfilled", "fulfilled_at": datetime.now(timezone.utc)}
    await db.checkout_orders.update_one({"_id": sid}, {"$set": done})
    logger.info(f"Checkout {sid} fulfilled: hold {hold_id} -> {outcome}")
    return {**order, **done}


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
# Hold expiry -> Stripe session expiry
# ============================================================================

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
