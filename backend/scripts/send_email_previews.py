"""One-off patient-facing email template preview sender.

This is NOT part of the running application. It is a throwaway utility the owner
can run once to send a copy of EVERY patient-facing email template to a single
review inbox, side by side, so the templates can be compared and unified.

It covers two groups of emails:

  A) Auth / onboarding emails, which today live as inline `resend.Emails.send({...})`
     calls inside endpoint functions in `backend/server.py`. Their `from`, `subject`,
     and `html` (and `text` where present) are reproduced here verbatim, with the
     runtime variables (name, urls, code, ttls, ...) swapped for fixed sample values.

  B) Booking emails, which are already clean reusable async functions in
     `backend/services/booking_email.py`. Those are invoked directly so the preview
     stays faithful to production output.

Every send is overridden to a single recipient (`TO`). Subjects are kept EXACTLY
as production -- no "[Preview]" prefix -- so the templates render faithfully.

Usage:
    python backend/scripts/send_email_previews.py

Requires RESEND_API_KEY in the environment (loaded from backend/.env).
"""

import os
import sys
import asyncio

from dotenv import load_dotenv

load_dotenv()

import resend

resend.api_key = os.environ.get("RESEND_API_KEY", "")

# Make `from services import booking_email` work: this script lives in
# backend/scripts/, so add the backend dir (its parent's parent) to sys.path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import booking_email


# --------------------------------------------------------------------------- config

# Single review recipient for ALL emails. Overrides every real recipient.
TO = "raymond@fireside360.co.uk"

# Sample values standing in for the runtime variables in the production blocks.
SAMPLE_NAME = "Raymond"
SAMPLE_EMAIL = "raymond@fireside360.co.uk"
FRONTEND_URL = "https://portal.drshumard.com"
SAMPLE_TOKEN = "sample-auto-login-token-1234567890"
AUTO_LOGIN_URL = f"{FRONTEND_URL}/auto-login/{SAMPLE_TOKEN}"
SIGNUP_URL = f"{FRONTEND_URL}/signup?email=raymond%40fireside360.co.uk&name=Raymond"
MAGIC_URL = f"{FRONTEND_URL}/auto-login/{SAMPLE_TOKEN}"
RESET_URL = f"{FRONTEND_URL}/reset-password?token={SAMPLE_TOKEN}"
SAMPLE_CODE = "123456"
SAMPLE_PASSWORD = "Sample-Pass-9876"

# TTL constants used inside the production templates.
MAGIC_LINK_TTL_DAYS = 7
EMAIL_CODE_TTL_MINUTES = 10

# Booking-email sample data.
BOOKING_FIRST_NAME = "Raymond"
BOOKING_SESSION_TITLE = "Strategy Session"
BOOKING_SESSION_START_ISO = "2026-07-03T19:30:00+00:00"
BOOKING_PATIENT_TZ = "America/New_York"
BOOKING_MEET_LINK = "https://meet.google.com/abc-defg-hij"
BOOKING_PB_RECORD_ID = "5f3a1b2c"


# --------------------------------------------------------------------------- A) auth/onboarding email bodies
#
# Each builder below reproduces the exact `from` / `subject` / `html` from the
# corresponding server.py endpoint, with sample values substituted for the
# runtime variables.


# 1) Welcome email -- ghl_webhook(), subject "Welcome to Your Onboarding Portal".
#    Reproduces the passwordless (LEGACY_PASSWORD_LOGIN == False) branch: no
#    credentials box, a note pointing at the login page, and an auto-login CTA.
#    `data.name` -> SAMPLE_NAME, `cta_url` -> AUTO_LOGIN_URL, `frontend_url` -> FRONTEND_URL.
def welcome_email_html() -> str:
    frontend_url = FRONTEND_URL
    cta_url = AUTO_LOGIN_URL
    cta_label = "ACCESS YOUR PORTAL"
    credentials_html = ""
    note_html = f"""
                            <p style="margin: 25px 0;">
                                If this link expires, head to <a href="{frontend_url}/login" style="color: #000000;">{frontend_url}/login</a> and enter your email &mdash; we'll send a fresh sign-in link or text a 6-digit code to the phone on file.
                            </p>"""
    return f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to Your Onboarding Portal</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <tr>
                        <td>
                            <!-- Logo -->
                            <p style="margin: 0 0 24px 0; text-align: center;"><img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard" style="height: 36px; object-fit: contain;"></p>

                            <!-- Header -->
                            <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                                Welcome to your onboarding portal with Dr Shumard
                            </h1>

                            <!-- Greeting -->
                            <p style="font-size: 18px; margin: 20px 0;">
                                Hello {SAMPLE_NAME},
                            </p>

                            <!-- Main Message -->
                            <p style="margin: 20px 0;">
                                Thank you for joining us. Your account has been created and you can now access your onboarding portal.
                            </p>
                            {credentials_html}
                            {note_html}

                            <!-- Login Button -->
                            <p style="margin: 30px 0; text-align: center;">
                                <a href="{cta_url}"
                                   style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                                    {cta_label}
                                </a>
                            </p>

                            <!-- Alternative Link -->
                            <p style="margin: 20px 0; font-size: 14px;">
                                If the button above doesn't work, copy and paste this link into your browser:<br>
                                <span style="word-break: break-all;">{cta_url}</span>
                            </p>

                            <!-- What's Next -->
                            <h2 style="font-size: 18px; color: #000000; margin: 30px 0 15px 0; border-bottom: 1px solid #cccccc; padding-bottom: 10px;">
                                What to Do Next
                            </h2>
                            <ol style="margin: 15px 0; padding-left: 25px;">
                                <li style="margin: 10px 0;"><strong>Step 1:</strong> Book your strategy session</li>
                                <li style="margin: 10px 0;"><strong>Step 2:</strong> Complete your onboarding form</li>
                                <li style="margin: 10px 0;"><strong>Step 3:</strong> Review next steps for your strategy session</li>
                            </ol>

                            <!-- Need Help -->
                            <p style="margin: 30px 0; padding: 15px; background-color: #f5f5f5;">
                                <strong>Need Help?</strong><br>
                                If you have any questions or need assistance, please reply to this email or contact our support team at <a href="mailto:concierge@drshumard.com" style="color: #000000;">concierge@drshumard.com</a> or <a href="tel:+18585647081" style="color: #000000;">858-564-7081</a>.
                            </p>

                            <!-- Footer -->
                            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                                Best regards,<br>
                                <strong>Onboarding Team, DS</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """


# 2) Magic-link email -- request_magic_link(), subject "Access Your Portal".
#    `user.get('name', 'there')` -> SAMPLE_NAME, `magic_url` -> MAGIC_URL,
#    `MAGIC_LINK_TTL_DAYS` -> 7, `frontend_url` -> FRONTEND_URL.
def magic_link_email_html() -> str:
    frontend_url = FRONTEND_URL
    magic_url = MAGIC_URL
    return f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Access Your Portal</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <tr>
                        <td>
                            <!-- Logo -->
                            <p style="margin: 0 0 24px 0; text-align: center;"><img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard" style="height: 36px; object-fit: contain;"></p>

                            <!-- Header -->
                            <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                                Access Your Portal
                            </h1>

                            <!-- Greeting -->
                            <p style="font-size: 18px; margin: 20px 0;">
                                Hello {SAMPLE_NAME},
                            </p>

                            <!-- Main Message -->
                            <p style="margin: 20px 0;">
                                Click the button below to access your onboarding portal. This link will log you in automatically.
                            </p>

                            <!-- Login Button -->
                            <p style="margin: 30px 0; text-align: center;">
                                <a href="{magic_url}"
                                   style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                                    ACCESS YOUR PORTAL
                                </a>
                            </p>

                            <!-- Alternative Link -->
                            <p style="margin: 20px 0; font-size: 14px;">
                                If the button doesn't work, copy and paste this link into your browser:<br>
                                <span style="word-break: break-all;">{magic_url}</span>
                            </p>

                            <!-- Expiration Note -->
                            <p style="margin: 25px 0; padding: 15px; background-color: #f5f5f5; font-size: 14px;">
                                <strong>Note:</strong> This link is valid for {MAGIC_LINK_TTL_DAYS} days and can be reused. If it expires, head to <a href="{frontend_url}/login" style="color: #000000;">{frontend_url}/login</a> and enter your email &mdash; we'll send a fresh link or text a 6-digit code to the phone on file.
                            </p>

                            <!-- Need Help -->
                            <p style="margin: 30px 0; padding: 15px; background-color: #f5f5f5;">
                                <strong>Need Help?</strong><br>
                                If you have any questions, please reply to this email or contact our support team at <a href="mailto:concierge@drshumard.com" style="color: #000000;">concierge@drshumard.com</a> or <a href="tel:+18585647081" style="color: #000000;">858-564-7081</a>.
                            </p>

                            <!-- Footer -->
                            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                                Best regards,<br>
                                <strong>Onboarding Team, DS</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """


# 3) Sign-in code email -- email_signin_start(), subject "Your sign-in link and code".
#    The HTML is built by `_signin_email_html(name, magic_url, code, frontend_url)`,
#    reproduced verbatim below (it references EMAIL_CODE_TTL_MINUTES as a module global).
def _signin_email_html(name: str, magic_url: str, code: str, frontend_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in to your portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <tr>
            <td>
                <!-- Logo -->
                <p style="margin: 0 0 24px 0; text-align: center;">
                    <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard" style="height: 36px; object-fit: contain;">
                </p>

                <!-- Header -->
                <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                    Sign in to your portal
                </h1>

                <!-- Greeting -->
                <p style="font-size: 18px; margin: 20px 0;">
                    Hello {name},
                </p>

                <p style="margin: 20px 0;">
                    Use either option below to sign in &mdash; both will log you in.
                </p>

                <!-- Login Button -->
                <p style="margin: 30px 0; text-align: center;">
                    <a href="{magic_url}"
                       style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                        SIGN IN TO YOUR PORTAL
                    </a>
                </p>

                <!-- Code -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 25px 0;">
                    <tr><td style="padding: 20px; background-color: #f5f5f5; text-align: center;">
                        <span style="display: block; font-size: 14px; color: #555555; margin-bottom: 10px;">Or enter this code:</span>
                        <span style="display: block; font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #000000;">{code}</span>
                        <span style="display: block; font-size: 13px; color: #777777; margin-top: 10px;">This code expires in {EMAIL_CODE_TTL_MINUTES} minutes.</span>
                    </td></tr>
                </table>

                <!-- Alternative Link -->
                <p style="margin: 20px 0; font-size: 14px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <span style="word-break: break-all;">{magic_url}</span>
                </p>

                <!-- Need Help -->
                <p style="margin: 30px 0; padding: 15px; background-color: #f5f5f5;">
                    <strong>Need Help?</strong><br>
                    If you have any questions, please reply to this email or contact our support team at <a href="mailto:concierge@drshumard.com" style="color: #000000;">concierge@drshumard.com</a> or <a href="tel:+18585647081" style="color: #000000;">858-564-7081</a>.
                </p>

                <!-- Footer -->
                <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                    Best regards,<br>
                    <strong>Onboarding Team, DS</strong>
                </p>
            </td>
        </tr>
    </table>
</body>
</html>"""


# 4) Password reset -- request_password_reset(), subject "Password Reset Request".
#    `reset_url` -> RESET_URL.
def password_reset_email_html() -> str:
    reset_url = RESET_URL
    return f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%);">
                    <p style="margin: 0 0 24px 0; text-align: center;"><img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard" style="height: 36px; object-fit: contain;"></p>
                    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);">
                        <div style="background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Password Reset Request</h1>
                        </div>
                        <div style="padding: 40px 30px;">
                            <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
                                You requested to reset your password for your wellness portal account. Click the button below to create a new password:
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{reset_url}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);">Reset Password</a>
                            </div>
                            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 24px 0; color: #92400e; font-size: 14px;">
                                <strong>⚠️ Important:</strong> This link will expire in 1 hour for security reasons.
                            </div>
                            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                            </p>
                        </div>
                        <div style="background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px;">
                            <p style="margin: 0 0 8px 0;">Dr. Jason Shumard Wellness Portal</p>
                            <p style="margin: 0;">If you have any questions, our support team is here to help.</p>
                        </div>
                    </div>
                </body>
                </html>
                """


# 5) Resend welcome/access -- resend_welcome_email(), subject "Access Your Onboarding Portal".
#    `user.get('name', 'there')` -> SAMPLE_NAME, `auto_login_url` -> AUTO_LOGIN_URL,
#    `frontend_url` -> FRONTEND_URL.
def resend_welcome_email_html() -> str:
    frontend_url = FRONTEND_URL
    auto_login_url = AUTO_LOGIN_URL
    return f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Portal Access</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <tr>
                        <td>
                            <!-- Logo -->
                            <p style="margin: 0 0 24px 0; text-align: center;"><img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard" style="height: 36px; object-fit: contain;"></p>

                            <!-- Header -->
                            <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                                Access Your Portal
                            </h1>

                            <!-- Greeting -->
                            <p style="font-size: 18px; margin: 20px 0;">
                                Hello {SAMPLE_NAME},
                            </p>

                            <!-- Main Message -->
                            <p style="margin: 20px 0;">
                                Click the button below to access your onboarding portal. This link will log you in automatically.
                            </p>

                            <!-- Login Button -->
                            <p style="margin: 30px 0; text-align: center;">
                                <a href="{auto_login_url}"
                                   style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                                    ACCESS YOUR PORTAL
                                </a>
                            </p>

                            <!-- Alternative Link -->
                            <p style="margin: 20px 0; font-size: 14px;">
                                If the button doesn't work, copy and paste this link into your browser:<br>
                                <span style="word-break: break-all;">{auto_login_url}</span>
                            </p>

                            <!-- Note -->
                            <p style="margin: 25px 0; padding: 15px; border: 1px solid #cccccc; background-color: #f5f5f5;">
                                <strong>Note:</strong> This link is valid for 7 days and can be reused. If it expires, head to <a href="{frontend_url}/login" style="color: #000000;">{frontend_url}/login</a> and enter your email &mdash; we'll send a fresh link or text a 6-digit code to the phone on file.
                            </p>

                            <!-- Need Help -->
                            <p style="margin: 30px 0;">
                                <strong>Need Help?</strong><br>
                                If you have any questions, please reply to this email or contact our support team at <a href="mailto:concierge@drshumard.com" style="color: #000000;">concierge@drshumard.com</a> or <a href="tel:+18585647081" style="color: #000000;">858-564-7081</a>.
                            </p>

                            <!-- Footer -->
                            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                                Best regards,<br>
                                <strong>The Onboarding Team, DS</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """


# Each entry mirrors a production `resend.Emails.send({...})` payload, with `to`
# forced to [TO]. `reply_to` is kept where the source block sets it.
AUTH_EMAILS = [
    {
        "label": "1) Welcome email (ghl_webhook)",
        "payload": {
            "from": "Onboarding - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [TO],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Welcome to Your Onboarding Portal",
            "html": welcome_email_html(),
        },
    },
    {
        "label": "2) Magic-link email (request_magic_link)",
        "payload": {
            "from": "Onboarding - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [TO],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Access Your Portal",
            "html": magic_link_email_html(),
        },
    },
    {
        "label": "3) Sign-in code email (email_signin_start)",
        "payload": {
            "from": "Onboarding - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [TO],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Your sign-in link and code",
            "html": _signin_email_html(SAMPLE_NAME, MAGIC_URL, SAMPLE_CODE, FRONTEND_URL),
        },
    },
    {
        "label": "4) Password reset (request_password_reset)",
        "payload": {
            "from": "Onboarding - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [TO],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Password Reset Request",
            "html": password_reset_email_html(),
        },
    },
    {
        "label": "5) Resend welcome/access (resend_welcome_email)",
        "payload": {
            "from": "Onboarding - Dr Shumard <noreply@portal.drshumard.com>",
            "to": [TO],
            "reply_to": ["concierge@drshumard.com"],
            "subject": "Access Your Onboarding Portal",
            "html": resend_welcome_email_html(),
        },
    },
]


def _extract_id(result) -> str:
    """Resend returns either a dict like {"id": "..."} or an object with .id."""
    if isinstance(result, dict):
        return result.get("id", str(result))
    return getattr(result, "id", str(result))


def send_auth_emails() -> None:
    for entry in AUTH_EMAILS:
        label = entry["label"]
        subject = entry["payload"]["subject"]
        try:
            result = resend.Emails.send(entry["payload"])
            print(f"[OK]   {label} | subject={subject!r} | id={_extract_id(result)}")
        except Exception as e:
            print(f"[FAIL] {label} | subject={subject!r} | error={e}")


# --------------------------------------------------------------------------- B) booking emails
#
# These call the real reusable async functions in services/booking_email.py with
# sample data, so the preview matches production output exactly. Each is wrapped
# so one failure doesn't stop the rest.

def send_booking_emails() -> None:
    booking_sends = [
        (
            "6) Booking confirmation (send_booking_confirmation)",
            lambda: booking_email.send_booking_confirmation(
                to_email=TO,
                first_name=BOOKING_FIRST_NAME,
                session_title=BOOKING_SESSION_TITLE,
                session_start_iso=BOOKING_SESSION_START_ISO,
                patient_timezone=BOOKING_PATIENT_TZ,
                meet_link=BOOKING_MEET_LINK,
                pb_record_id=BOOKING_PB_RECORD_ID,
            ),
        ),
        (
            "7) Reschedule notice (send_reschedule_notice)",
            lambda: booking_email.send_reschedule_notice(
                to_email=TO,
                first_name=BOOKING_FIRST_NAME,
                session_title=BOOKING_SESSION_TITLE,
                session_start_iso=BOOKING_SESSION_START_ISO,
                patient_timezone=BOOKING_PATIENT_TZ,
                meet_link=BOOKING_MEET_LINK,
            ),
        ),
        (
            "8) Cancellation notice (send_cancellation_notice)",
            lambda: booking_email.send_cancellation_notice(
                to_email=TO,
                first_name=BOOKING_FIRST_NAME,
                session_title=BOOKING_SESSION_TITLE,
                session_start_iso=BOOKING_SESSION_START_ISO,
                patient_timezone=BOOKING_PATIENT_TZ,
            ),
        ),
    ]
    for label, coro_factory in booking_sends:
        try:
            result = asyncio.run(coro_factory())
            print(f"[OK]   {label} | id={_extract_id(result)}")
        except Exception as e:
            print(f"[FAIL] {label} | error={e}")


# --------------------------------------------------------------------------- main

def main() -> None:
    if not resend.api_key:
        print("WARNING: RESEND_API_KEY is empty; sends will fail. "
              "Set it in backend/.env or the environment.")
    print(f"Sending all patient-facing email previews to: {TO}\n")
    print("--- A) Auth / onboarding emails ---")
    send_auth_emails()
    print("\n--- B) Booking emails ---")
    send_booking_emails()
    print("\nDone.")


if __name__ == "__main__":
    main()
