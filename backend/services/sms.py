"""Outbound SMS via Twilio Messages — used by the reminder sweep.

Separate from the Verify (OTP) client in server.py: that one sends verification codes, this
one sends plain Messages. Env: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, plus ONE sender —
TWILIO_MESSAGING_SERVICE_SID (preferred: pooled numbers + carrier-level STOP/HELP opt-out)
or TWILIO_SMS_FROM (a single E.164 number). No sender configured => SMS is disabled and the
reminder sweep no-ops.
"""

import asyncio
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_client_init = False


def _get_client():
    global _client, _client_init
    if _client_init:
        return _client
    _client_init = True
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    if sid and token:
        try:
            from twilio.rest import Client
            _client = Client(sid, token)
        except Exception as e:
            logger.warning(f"Twilio SMS client init failed: {e}")
    return _client


def to_e164(phone: Optional[str]) -> Optional[str]:
    """US-centric E.164 normalize (mirrors server.normalize_phone). None if unparseable."""
    if not phone:
        return None
    raw = phone.strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if raw.startswith("+"):
        return "+" + digits
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return None


def is_configured() -> bool:
    """True when a client and a sender (messaging service or from-number) are both present."""
    return bool(_get_client() and (os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
                                   or os.environ.get("TWILIO_SMS_FROM")))


# Opt-out / opt-in keywords. Twilio's Advanced Opt-Out normally tells us the action via an
# `OptOutType` field on the inbound webhook; this classifier is the fallback for when it doesn't.
# Deliberately conservative on opt-IN (only explicit re-subscribe words) so an ambiguous reply
# like "yes" in another context can never silently re-subscribe someone who texted STOP.
_STOP_KEYWORDS = {"stop", "stopall", "stop all", "unsubscribe", "cancel", "end", "quit", "optout", "opt out"}
_START_KEYWORDS = {"start", "unstop"}


def classify_optout(body: Optional[str]) -> Optional[str]:
    """Classify an inbound SMS body as 'stop' | 'start' | None. Tolerant of punctuation and
    trailing words the way carriers/Twilio are — 'STOP.', 'Stop please', 'unsubscribe now' all
    count — by matching the whole (de-punctuated) body OR its first word against the keyword sets.
    Still conservative on opt-IN (only explicit re-subscribe words), so an ambiguous reply can
    never silently re-subscribe someone who texted STOP."""
    t = (body or "").strip().lower()
    if not t:
        return None
    compact = re.sub(r"[^a-z ]", "", t).strip()   # catches multi-word keywords: 'stop all', 'opt out'
    first = re.sub(r"[^a-z]", "", t.split()[0])   # catches 'STOP.', 'Stop please'
    if compact in _STOP_KEYWORDS or first in _STOP_KEYWORDS:
        return "stop"
    if compact in _START_KEYWORDS or first in _START_KEYWORDS:
        return "start"
    return None


def _sync_send(to_number: str, body: str):
    kwargs = {"to": to_number, "body": body}
    msid = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
    if msid:
        kwargs["messaging_service_sid"] = msid
    else:
        kwargs["from_"] = os.environ.get("TWILIO_SMS_FROM")
    return _get_client().messages.create(**kwargs)


# Twilio error codes that mean "this will never succeed" — the caller must NOT retry these.
_OPTED_OUT_CODES = {21610}                              # recipient replied STOP (blocklisted)
_INVALID_CODES = {21211, 21214, 21401, 21408, 21612, 21614}  # invalid / unreachable / unroutable


async def send_sms(to: str, body: str) -> str:
    """Send one SMS to an E.164 number. Never raises. Returns a status the caller uses to decide
    whether to retry:
      'sent'      — Twilio accepted it
      'opted_out' — recipient has replied STOP (permanent — record it, do not retry)
      'invalid'   — unusable/unreachable number (permanent — do not retry)
      'failed'    — transient problem (safe to retry on the next sweep)"""
    if not to or not body or not is_configured():
        return "failed"
    try:
        msg = await asyncio.to_thread(_sync_send, to, body)
    except Exception as e:
        code = getattr(e, "code", None)  # TwilioRestException carries a numeric .code
        if code in _OPTED_OUT_CODES:
            logger.info(f"SMS to {to}: recipient opted out (Twilio code {code})")
            return "opted_out"
        if code in _INVALID_CODES:
            logger.warning(f"SMS to {to}: invalid/unreachable number (Twilio code {code})")
            return "invalid"
        logger.warning(f"SMS send to {to} failed: {e}")
        return "failed"
    status = getattr(msg, "status", None)
    if status in ("failed", "undelivered"):
        logger.warning(f"SMS to {to} returned status={status}")
        return "failed"
    return "sent"
