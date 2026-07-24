"""Patient scheduling emails (confirmation / reschedule / cancellation), sent via Resend.

Black-and-white "block kit" style matching the auth/onboarding emails: a small logo at
the top, Arial type, black buttons, and bordered light-gray blocks. Times render in the
patient's timezone. The "Activate" button points at the same Practice Better portal link
used on the patient's Step 3 page.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import resend

logger = logging.getLogger(__name__)

FROM_ADDRESS = "Bookings - Dr Shumard <noreply@portal.drshumard.com>"
REPLY_TO = ["concierge@drshumard.com"]
SUPPORT_PHONE = "858-564-7081"

# Same Practice Better portal link the patient sees on Step 3 (PortalReady).
# Fallback when we have no PB record id: the PRACTICE's patient portal login — NEVER
# my.practicebetter.io, which is Practice Better's practitioner-side entry and walks
# patients into creating a practitioner account.
PB_ACTIVATE_URL = os.environ.get("PB_ACTIVATE_URL", "https://drshumard.practicebetter.io")


def _portal_base_url() -> str:
    return os.environ.get("PB_PORTAL_BASE_URL", "https://drshumard.practicebetter.io").rstrip("/")


def _pb_activation_url(pb_record_id: Optional[str]) -> str:
    """Per-patient Practice Better activation deep-link — the same computation Step 3 (PortalReady)
    used: activationId = (record id as hex) + 4, back to hex, zero-padded to the record id's
    length; then {portal}/#/u/activate/{activationId}?portal_rid={recordId}. Falls back to the
    generic PB portal login when we don't have a record id yet (brand-new PB client)."""
    rid = (pb_record_id or "").strip()
    if not rid:
        return PB_ACTIVATE_URL
    try:
        activation_id = format(int(rid, 16) + 4, "x").zfill(len(rid))
    except ValueError:
        return PB_ACTIVATE_URL
    return f"{_portal_base_url()}/#/u/activate/{activation_id}?portal_rid={rid}"


def _logo_url() -> str:
    return os.environ.get("EMAIL_LOGO_URL", "https://portal-drshumard.b-cdn.net/logo.png")


def _format_when(session_start_iso: str, tz_name: Optional[str]) -> tuple[str, str]:
    """Returns (date_line, time_line) in the patient's tz, e.g. ('Thursday, May 21', '7:30 PM (EDT)')."""
    try:
        dt = datetime.fromisoformat((session_start_iso or "").replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return ("", "")
    tz: Optional[ZoneInfo] = None
    if tz_name:
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            tz = None
    local_dt = dt.astimezone(tz) if tz is not None else dt
    date_line = local_dt.strftime("%A, %B %-d")
    time_line = local_dt.strftime("%-I:%M %p") + f" ({local_dt.strftime('%Z')})"
    return date_line, time_line


def _h1(text: str) -> str:
    return (f'<h1 style="font-size:24px; color:#000000; margin:0 0 20px 0; '
            f'border-bottom:2px solid #000000; padding-bottom:10px;">{text}</h1>')


def _hr() -> str:
    return '<hr style="border:none; border-top:1px solid #cccccc; margin:30px 0;">'


def _shell(inner_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; font-size:16px; line-height:1.6; color:#333333; background-color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; margin:0 auto; padding:20px;">
    <tr><td>
      <p style="margin:0 0 24px 0; text-align:center;">
        <img src="{_logo_url()}" alt="Dr. Shumard" style="height:36px; object-fit:contain;">
      </p>
      {inner_html}
      <p style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #cccccc; font-size:14px; color:#666666;">
        Best regards,<br><strong>Onboarding Team, DS</strong>
      </p>
    </td></tr>
  </table>
</body>
</html>"""


def _session_card(session_title: str, when_label: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:25px 0;">
      <tr><td style="padding:20px; background-color:#f5f5f5; border:1px solid #cccccc;">
        <span style="display:block; font-size:12px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#000000;">Your session</span>
        <span style="display:block; font-size:18px; font-weight:bold; color:#000000; margin-top:8px;">{session_title}</span>
        <span style="display:block; font-size:15px; color:#555555; margin-top:6px;">{when_label}</span>
      </td></tr>
    </table>"""


def _join_block(meet_link: Optional[str]) -> str:
    if not meet_link:
        return ""
    return f"""
      <p style="margin:30px 0; text-align:center;">
        <a href="{meet_link}" style="display:inline-block; padding:15px 40px; background-color:#000000; color:#ffffff; text-decoration:none; font-size:18px; font-weight:bold;">JOIN THE CALL</a>
      </p>
      <p style="margin:20px 0; font-size:14px;">If the button doesn't work, copy and paste this link:<br>
        <span style="word-break:break-all;">{meet_link}</span></p>"""


async def _send(to_email: str, subject: str, html: str, text: str) -> dict:
    """Send via Resend (sync SDK) off the event loop. Raises on failure (caller decides)."""
    def _do():
        return resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "reply_to": REPLY_TO,
            "subject": subject,
            "html": html,
            "text": text,
        })
    return await asyncio.to_thread(_do)


# --------------------------------------------------------------------------- public API

async def send_booking_confirmation(
    *,
    to_email: str,
    first_name: str,
    session_title: str,
    session_start_iso: str,
    patient_timezone: Optional[str],
    meet_link: Optional[str],
    pb_record_id: Optional[str] = None,  # accepted for back-compat; activation now uses the shared portal link
) -> dict:
    date_line, time_line = _format_when(session_start_iso, patient_timezone)
    when_label = f"{date_line} @ {time_line}" if date_line and time_line else "your upcoming session"
    activate_url = _pb_activation_url(pb_record_id)
    inner = f"""
    {_h1("Your session is booked")}
    <p style="font-size:18px; margin:20px 0;">Hello {first_name},</p>
    <p style="margin:20px 0;">Here are the details for your upcoming session:</p>
    {_session_card(session_title, when_label)}
    {_join_block(meet_link)}
    <p style="margin:25px 0; padding:15px; background-color:#f5f5f5;">Please complete your paperwork &mdash; <strong>step 2 in the portal</strong> &mdash; within the next 48 hours so our Director of Admissions can prepare for your session. Questions? Call <strong>{SUPPORT_PHONE}</strong>, and please log on <strong>10 minutes before</strong> the start time.</p>
    {_hr()}
    <h2 style="font-size:18px; color:#000000; margin:0 0 12px 0; border-bottom:1px solid #cccccc; padding-bottom:10px;">Activate your patient portal</h2>
    <p style="margin:15px 0;">Set up your secure Practice Better account to access your plan, messages, and resources any time, from any device.</p>
    <p style="margin:30px 0; text-align:center;">
      <a href="{activate_url}" style="display:inline-block; padding:15px 40px; background-color:#000000; color:#ffffff; text-decoration:none; font-size:18px; font-weight:bold;">ACTIVATE MY ACCOUNT</a>
    </p>
    <p style="margin:20px 0; font-size:14px;">If the button doesn't work, copy and paste this link:<br>
      <span style="word-break:break-all;">{activate_url}</span></p>"""
    text = (
        f"Your session is booked.\n\nHello {first_name},\n\n"
        f"{session_title}\n{when_label}\n"
        + (f"\nJoin the call: {meet_link}\n" if meet_link else "")
        + f"\nPlease complete your paperwork (step 2 in the portal) within 48 hours.\n"
        f"Questions? Call {SUPPORT_PHONE}. Log on 10 minutes before.\n"
        f"\nActivate your account: {activate_url}\n"
    )
    return await _send(to_email, f"Your session is booked — {date_line}" if date_line else "Your session is booked",
                       _shell(inner), text)


async def send_reschedule_notice(
    *,
    to_email: str,
    first_name: str,
    session_title: str,
    session_start_iso: str,
    patient_timezone: Optional[str],
    meet_link: Optional[str],
) -> dict:
    date_line, time_line = _format_when(session_start_iso, patient_timezone)
    when_label = f"{date_line} @ {time_line}" if date_line and time_line else "a new time"
    inner = f"""
    {_h1("Your session has been rescheduled")}
    <p style="font-size:18px; margin:20px 0;">Hello {first_name},</p>
    <p style="margin:20px 0;">Your session is now scheduled for:</p>
    {_session_card(session_title, when_label)}
    {_join_block(meet_link)}
    <p style="margin:20px 0;">The same meeting link above works for the new time. Questions? Call <strong>{SUPPORT_PHONE}</strong>.</p>"""
    text = (
        f"Your session has been rescheduled.\n\nHello {first_name},\n\n"
        f"New time: {when_label}\n{session_title}\n"
        + (f"\nJoin the call: {meet_link}\n" if meet_link else "")
        + f"\nQuestions? Call {SUPPORT_PHONE}.\n"
    )
    return await _send(to_email, "Your session has been rescheduled", _shell(inner), text)


async def send_cancellation_notice(
    *,
    to_email: str,
    first_name: str,
    session_title: str,
    session_start_iso: str,
    patient_timezone: Optional[str],
) -> dict:
    date_line, time_line = _format_when(session_start_iso, patient_timezone)
    when_label = f"{date_line} @ {time_line}" if date_line and time_line else "your session"
    inner = f"""
    {_h1("Your session has been cancelled")}
    <p style="font-size:18px; margin:20px 0;">Hello {first_name},</p>
    <p style="margin:20px 0;">The following session has been cancelled:</p>
    {_session_card(session_title, when_label)}
    <p style="margin:25px 0; padding:15px; background-color:#f5f5f5;">Need to rebook? Visit your portal or call us at <strong>{SUPPORT_PHONE}</strong> and we'll get you scheduled.</p>"""
    text = (
        f"Your session has been cancelled.\n\nHello {first_name},\n\n"
        f"Cancelled: {when_label} — {session_title}\n"
        f"\nTo rebook, visit your portal or call {SUPPORT_PHONE}.\n"
    )
    return await _send(to_email, "Your session has been cancelled", _shell(inner), text)
