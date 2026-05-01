"""Patient booking-confirmation email: template + sender wrapper.

Consumes booking_info and the matched calendar event to produce a formatted
email with Meet link + portal activation button, then sends via SMTP2GO.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from services.smtp2go import send_email

logger = logging.getLogger(__name__)

SUBJECT = "Dr. Shumard booked you for a session"


def _portal_base_url() -> str:
    return os.environ.get("PB_PORTAL_BASE_URL", "https://drshumard.practicebetter.io").rstrip("/")


def _onboarding_video_url() -> str:
    return os.environ.get("ONBOARDING_VIDEO_URL", "").strip()


def calculate_activation_id(record_id: str) -> str:
    """Mirror of the frontend BigInt math: hex(int(record_id, 16) + 4)
    padded to the original length. Returns record_id on failure.
    """
    try:
        as_int = int(record_id, 16)
        bumped = as_int + 4
        hex_str = format(bumped, "x")
        return hex_str.rjust(len(record_id), "0")
    except (ValueError, TypeError):
        return record_id


def activation_url(record_id: str) -> str:
    return f"{_portal_base_url()}/#/u/activate/{calculate_activation_id(record_id)}?portal_rid={record_id}"


def _strip_patient_from_summary(summary: str) -> str:
    """PB event summaries look like:
        'Testing - Diabetes Reversal Strategy Session with Raymond Owusu (Online/Video chat)'
    Strip the 'with <name>' portion so the email shows a clean service title.
    """
    if not summary:
        return ""
    # Collapse ' with <anything up to opening paren>' → ' '
    cleaned = re.sub(r"\s+with\s+[^(]+", " ", summary).strip()
    # Collapse double spaces
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned


def _format_when(session_start_iso: str, tz_name: Optional[str]) -> tuple[str, str]:
    """Returns (date_line, time_line) rendered in the patient's timezone.
    Falls back to UTC if tz_name is missing/invalid.

    date_line example: 'Thursday, May 21'
    time_line example: '7:30 PM (BST)'
    """
    try:
        dt = datetime.fromisoformat(session_start_iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return ("", "")

    tz: Optional[ZoneInfo] = None
    if tz_name:
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            tz = None
    if tz is not None:
        local_dt = dt.astimezone(tz)
    else:
        local_dt = dt

    date_line = local_dt.strftime("%A, %B %-d")  # e.g. Thursday, May 21
    time_line = local_dt.strftime("%-I:%M %p") + f" ({local_dt.strftime('%Z')})"
    return date_line, time_line


def _first_name(user: dict) -> str:
    # Pull from any common shape (server stores first_name; fallback to split of "name")
    fn = user.get("first_name")
    if fn:
        return fn.strip()
    full = user.get("name") or ""
    return full.split(" ", 1)[0] if full else "there"


# ---------------------------------------------------------------------------
# HTML + plain-text rendering
# ---------------------------------------------------------------------------
def _render_html(
    first_name: str,
    service_title: str,
    date_line: str,
    time_line: str,
    meet_link: Optional[str],
    video_url: str,
    activate_url: str,
) -> str:
    meet_block = ""
    if meet_link:
        meet_block = f'''
        <p style="margin: 16px 0;">
          <strong>Google Meet link:</strong>
          <a href="{meet_link}" style="color:#1a73e8;">{meet_link}</a>
        </p>'''

    video_block = ""
    if video_url:
        video_block = (
            f'<p>'
            f'<a href="{video_url}" style="color:#1a73e8;">Click here to watch the '
            f'Diabetes Consultation Onboarding Video.</a>'
            f'</p>'
        )

    return f"""<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#222; line-height:1.6; max-width:640px; margin: 0 auto; padding: 24px;">
  <p>I've booked a session with you for <strong>{date_line} @ {time_line}</strong>.</p>

  <p>Hi {first_name},</p>

  <p>Here are the details for our upcoming session:</p>

  <p style="margin: 20px 0; padding: 16px; background:#f6f8fa; border-left: 4px solid #1a73e8; border-radius: 4px;">
    <strong>{service_title}</strong><br>
    {date_line} @ {time_line}
  </p>
  {meet_block}
  {video_block}

  <p>Please complete your paperwork, <strong>step 2 in the portal</strong> within the next 48 hours so our director of admissions has enough time to prepare for your strategy session. If the paperwork is not complete within the next 48 hours we will need to cancel your appointment and get you rescheduled once your paperwork is completed.</p>

  <ul>
    <li>Make sure you are in a quiet area during the strategy session.</li>
    <li>Make sure your spouse and or significant other is part of the strategy session.</li>
  </ul>

  <p>If you have any questions or need assistance, please call us at <strong>858-564-7081</strong> and we can help. Please also make sure that you log on to the call <strong>10 minutes before the actual call time</strong>. Thank you and I am looking forward to seeing you soon!</p>

  <hr style="border:none; border-top: 1px solid #e0e0e0; margin: 32px 0;">

  <p>Activate your account to access your resources from any device.</p>
  <p>
    <a href="{activate_url}"
       style="display:inline-block; background:#1a73e8; color:#ffffff; padding: 12px 24px; border-radius: 6px; text-decoration:none; font-weight: 600;">
      Activate account
    </a>
  </p>
</body>
</html>"""


def _render_text(
    first_name: str,
    service_title: str,
    date_line: str,
    time_line: str,
    meet_link: Optional[str],
    video_url: str,
    activate_url: str,
) -> str:
    meet_line = f"\nGoogle Meet link: {meet_link}\n" if meet_link else ""
    video_line = f"\nOnboarding video: {video_url}\n" if video_url else ""
    return (
        f"I've booked a session with you for {date_line} @ {time_line}.\n\n"
        f"Hi {first_name},\n\n"
        f"Here are the details for our upcoming session:\n\n"
        f"{service_title}\n"
        f"{date_line} @ {time_line}\n"
        f"{meet_line}{video_line}\n"
        f"Please complete your paperwork, step 2 in the portal within the next 48 hours "
        f"so our director of admissions has enough time to prepare for your strategy session. "
        f"If the paperwork is not complete within the next 48 hours we will need to cancel "
        f"your appointment and get you rescheduled once your paperwork is completed.\n\n"
        f"- Make sure you are in a quiet area during the strategy session.\n"
        f"- Make sure your spouse and or significant other is part of the strategy session.\n\n"
        f"If you have any questions or need assistance, please call us at 858-564-7081. "
        f"Please also make sure that you log on to the call 10 minutes before the actual call time. "
        f"Thank you and I am looking forward to seeing you soon!\n\n"
        f"Activate your account: {activate_url}\n"
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
async def send_booking_confirmation(user: dict, event: dict, meet_link: Optional[str]) -> dict:
    """Compose and send the booking confirmation email.

    Args:
        user: MongoDB users document (must include email, first_name, booking_info, pb_client_record_id)
        event: The Google Calendar event dict (for the service-title summary)
        meet_link: The Meet URL to include (may be None if not yet available)

    Returns the SMTP2GO response dict.
    """
    to_email = user.get("email")
    if not to_email:
        raise ValueError("user.email required")

    booking_info = user.get("booking_info") or {}
    session_start = booking_info.get("session_start")
    tz_name = booking_info.get("timezone")
    pb_rid = user.get("pb_client_record_id") or booking_info.get("pb_client_record_id")

    service_title = _strip_patient_from_summary(event.get("summary", ""))
    date_line, time_line = _format_when(session_start or "", tz_name)

    act_url = activation_url(pb_rid) if pb_rid else _portal_base_url()
    first_name = _first_name(user)

    html = _render_html(
        first_name=first_name,
        service_title=service_title,
        date_line=date_line,
        time_line=time_line,
        meet_link=meet_link,
        video_url=_onboarding_video_url(),
        activate_url=act_url,
    )
    text = _render_text(
        first_name=first_name,
        service_title=service_title,
        date_line=date_line,
        time_line=time_line,
        meet_link=meet_link,
        video_url=_onboarding_video_url(),
        activate_url=act_url,
    )

    return await send_email(to=to_email, subject=SUBJECT, html_body=html, text_body=text)
