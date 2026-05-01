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


def _logo_url() -> str:
    return os.environ.get("EMAIL_LOGO_URL", "https://portal-drshumard.b-cdn.net/logo.png")


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
    when_label = f"{date_line} @ {time_line}" if date_line and time_line else "your upcoming session"

    # Join-call block — a prominent primary button with a copy-link fallback underneath.
    join_block = ""
    if meet_link:
        join_block = f'''
      <p style="margin: 0 0 16px 0; color:#374151;">
        When it's time, join the session from the button below or by the link below it.
      </p>
      <div style="text-align:center; margin: 20px 0 28px 0;">
        <a href="{meet_link}"
           style="display:inline-block; background:#1e4bff; color:#ffffff; padding: 16px 44px; border-radius: 999px; text-decoration:none; font-weight: 600; font-size: 16px; letter-spacing: -0.01em;">
          Join the call
        </a>
        <p style="margin: 18px 0 0 0; font-size: 13px; color:#6b7280; line-height: 1.5;">
          Or copy this link if the button above doesn't work for you:<br>
          <a href="{meet_link}" style="color:#1e4bff; text-decoration: none; word-break: break-all;">{meet_link}</a>
        </p>
      </div>'''

    video_block = ""
    if video_url:
        video_block = f'''
      <p style="margin: 0 0 24px 0;">
        <a href="{video_url}" style="color:#1e4bff; text-decoration: none; font-weight: 500;">
          Watch the Diabetes Consultation Onboarding Video &rarr;
        </a>
      </p>'''

    hr = '<hr style="border:none; border-top: 1px solid #e5e7eb; margin: 32px 0;">'

    return f"""<!doctype html>
<html>
<body style="margin:0; padding:0; background:#ffffff;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color:#111827; line-height:1.65; max-width: 560px; margin: 0 auto; padding: 40px 24px;">

    <!-- Logo -->
    <div style="text-align: center; margin-bottom: 40px;">
      <img src="{_logo_url()}" alt="Dr. Shumard" style="max-width: 170px; height: auto; display:block; margin: 0 auto;">
    </div>

    <!-- Hero -->
    <h1 style="margin: 0 0 16px 0; font-size: 28px; line-height: 1.25; font-weight: 700; letter-spacing: -0.02em; color: #111827; text-align: center;">
      I've booked a session with you for {when_label}.
    </h1>

    <p style="margin: 24px 0 0 0; font-size: 16px; color: #374151;">Hi {first_name},</p>

    <p style="margin: 16px 0 0 0; font-size: 16px; color: #374151;">
      Here are the details for our upcoming session:
    </p>

    <div style="margin: 24px 0 0 0; padding: 20px 22px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color:#1e4bff;">
        Your session
      </p>
      <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 600; color:#111827; line-height: 1.4;">
        {service_title}
      </p>
      <p style="margin: 6px 0 0 0; font-size: 15px; color:#6b7280;">
        {when_label}
      </p>
    </div>

    {hr}

    {video_block}

    <p style="margin: 0 0 16px 0;">
      Please complete your paperwork — <strong>step 2 in the portal</strong> — within the next 48 hours so our Director of Admissions has enough time to prepare for your strategy session. If the paperwork is not complete within the next 48 hours we will need to cancel your appointment and get you rescheduled once your paperwork is completed.
    </p>

    {hr}

    <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color:#111827; letter-spacing: -0.01em;">
      Find a quiet space.
    </h3>
    <p style="margin: 0 0 24px 0; color:#374151;">
      Make sure you are somewhere calm and free of distractions for the duration of the call.
    </p>

    <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color:#111827; letter-spacing: -0.01em;">
      Bring your partner.
    </h3>
    <p style="margin: 0 0 8px 0; color:#374151;">
      Please make sure your spouse and/or significant other is part of the strategy session.
    </p>

    {join_block}

    <p style="margin: 0;">
      If you have any questions or need assistance, please call us at <strong>858-564-7081</strong>. Please also log on to the call <strong>10 minutes before the start time</strong>. Thank you — looking forward to seeing you soon!
    </p>

    {hr}

    <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color:#111827; letter-spacing: -0.01em;">
      Activate Your Practice Better Account.
    </h3>
    <p style="margin: 0 0 18px 0; color:#374151;">
      Activate your account and get access to resources from your phone or PC any time and anywhere. It's that simple.
    </p>
    <p style="margin: 0 0 8px 0;">
      <a href="{activate_url}"
         style="display:inline-block; background:#14532d; color:#ffffff; padding: 12px 28px; border-radius: 999px; text-decoration:none; font-weight: 600; font-size: 15px;">
        Activate My Account
      </a>
    </p>

  </div>
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
    when_label = f"{date_line} @ {time_line}" if date_line and time_line else "your upcoming session"
    join_line = f"\nJoin the call: {meet_link}\n" if meet_link else ""
    video_line = f"\nOnboarding video: {video_url}\n" if video_url else ""
    return (
        f"I've booked a session with you for {when_label}.\n\n"
        f"Hi {first_name},\n\n"
        f"Here are the details for our upcoming session:\n\n"
        f"{service_title}\n{when_label}\n"
        f"{video_line}\n"
        f"Please complete your paperwork (step 2 in the portal) within the next 48 hours "
        f"so our director of admissions has enough time to prepare. If paperwork isn't complete "
        f"in 48 hours we'll need to cancel and reschedule.\n\n"
        f"Find a quiet space.\nMake sure you are somewhere calm and free of distractions.\n\n"
        f"Bring your partner.\nMake sure your spouse and/or significant other is part of the strategy session.\n"
        f"{join_line}\n"
        f"If you have any questions, call us at 858-564-7081. "
        f"Please log on to the call 10 minutes before the start time.\n\n"
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
