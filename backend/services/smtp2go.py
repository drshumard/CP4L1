"""SMTP2GO email client. Minimal wrapper around the /v3/email/send endpoint."""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SMTP2GO_ENDPOINT = "https://api.smtp2go.com/v3/email/send"


def _api_key() -> str:
    key = os.environ.get("SMTP2GO_API_KEY", "").strip()
    if not key:
        raise RuntimeError("SMTP2GO_API_KEY env var required")
    return key


def _default_sender() -> str:
    addr = os.environ.get("EMAIL_FROM_ADDRESS", "").strip()
    name = os.environ.get("EMAIL_FROM_NAME", "").strip()
    if not addr:
        raise RuntimeError("EMAIL_FROM_ADDRESS env var required")
    # SMTP2GO accepts "Name <email@domain>" format
    return f'"{name}" <{addr}>' if name else addr


async def send_email(
    to: str | list[str],
    subject: str,
    html_body: Optional[str] = None,
    text_body: Optional[str] = None,
    sender: Optional[str] = None,
    cc: Optional[list[str]] = None,
    bcc: Optional[list[str]] = None,
) -> dict:
    """Send an email via SMTP2GO. Raises on non-2xx."""
    recipients = [to] if isinstance(to, str) else list(to)
    payload: dict = {
        "sender": sender or _default_sender(),
        "to": recipients,
        "subject": subject,
    }
    if html_body:
        payload["html_body"] = html_body
    if text_body:
        payload["text_body"] = text_body
    if cc:
        payload["cc"] = cc
    if bcc:
        payload["bcc"] = bcc

    headers = {
        "Content-Type": "application/json",
        "X-Smtp2go-Api-Key": _api_key(),
        "accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(SMTP2GO_ENDPOINT, json=payload, headers=headers)
    if resp.status_code >= 400:
        logger.error("SMTP2GO send failed: %s %s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    data = resp.json()
    logger.info(
        "SMTP2GO ok: email_id=%s to=%s subject=%r",
        (data.get("data") or {}).get("email_id"),
        recipients,
        subject,
    )
    return data
