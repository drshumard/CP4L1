"""Bunny CDN avatar storage.

Profile photos are normalized to a compact, correctly-oriented square JPEG,
uploaded to a Bunny Storage Zone, and served via the linked pull zone (CDN).
Only the public URL is stored on the user document - never the image bytes.

Required env (set in backend/.env):
  BUNNY_STORAGE_ZONE      - storage zone name, e.g. "drshumard"
  BUNNY_STORAGE_PASSWORD  - storage zone write key (Bunny -> Storage -> FTP & API Access)
  BUNNY_CDN_BASE_URL      - public pull-zone base, e.g. "https://portal-drshumard.b-cdn.net"
  BUNNY_STORAGE_HOST      - storage endpoint host (default "storage.bunnycdn.com"; use a
                            regional host like "ny.storage.bunnycdn.com" for a region-locked zone)
"""
import io
import os
import re
import time

import httpx
from PIL import Image, ImageOps


def _clean_host(raw: str) -> str:
    """Accept a bare hostname; forgive a pasted scheme or trailing /path."""
    h = (raw or "").strip()
    h = re.sub(r"^https?://", "", h)   # drop a pasted "https://"
    h = h.split("/")[0]                # drop a pasted "/zone-name" path
    return h or "storage.bunnycdn.com"


def _clean_cdn(raw: str) -> str:
    c = (raw or "").strip().rstrip("/")
    if c and not c.startswith("http"):
        c = "https://" + c
    return c


BUNNY_STORAGE_ZONE = os.environ.get("BUNNY_STORAGE_ZONE", "").strip()
BUNNY_STORAGE_PASSWORD = os.environ.get("BUNNY_STORAGE_PASSWORD", "").strip()
BUNNY_CDN_BASE_URL = _clean_cdn(os.environ.get("BUNNY_CDN_BASE_URL", ""))
BUNNY_STORAGE_HOST = _clean_host(os.environ.get("BUNNY_STORAGE_HOST", ""))


class BunnyNotConfigured(Exception):
    """Raised when the Bunny env values are missing."""


def is_configured() -> bool:
    return bool(BUNNY_STORAGE_ZONE and BUNNY_STORAGE_PASSWORD and BUNNY_CDN_BASE_URL)


def _to_square_jpeg(data: bytes, size: int = 512) -> bytes:
    """Normalize any uploaded image to a compact, centered square JPEG."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)                     # honor phone orientation
    img = img.convert("RGB")
    img = ImageOps.fit(img, (size, size), Image.LANCZOS)   # center-crop to a square
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue()


async def upload_avatar(user_id: str, data: bytes) -> str:
    """Resize + upload the image to Bunny Storage; return the public CDN URL.

    Uses a deterministic path (avatars/<id>.jpg) so re-uploads overwrite the old
    file (no orphan accumulation) and a ?v=<ts> cache-buster so the CDN serves the
    fresh image immediately.
    """
    if not is_configured():
        raise BunnyNotConfigured("Photo uploads aren't set up yet. Add the Bunny CDN keys to the server.")
    if " " in BUNNY_STORAGE_ZONE or "," in BUNNY_STORAGE_ZONE:
        raise BunnyNotConfigured(
            f"BUNNY_STORAGE_ZONE ('{BUNNY_STORAGE_ZONE}') looks like a region, not a zone name. "
            "Set it to your Storage zone's name (the path you'd use in storage URLs, e.g. portal-storage)."
        )
    jpeg = _to_square_jpeg(data)
    path = f"avatars/{user_id}.jpg"
    put_url = f"https://{BUNNY_STORAGE_HOST}/{BUNNY_STORAGE_ZONE}/{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.put(
            put_url,
            content=jpeg,
            headers={"AccessKey": BUNNY_STORAGE_PASSWORD, "Content-Type": "image/jpeg"},
        )
    if resp.status_code in (401, 403):
        raise BunnyNotConfigured(
            "Bunny rejected the upload (401). Check BUNNY_STORAGE_ZONE (the zone name) and "
            "BUNNY_STORAGE_PASSWORD (the zone's Password under Storage -> FTP & API Access)."
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Bunny upload failed ({resp.status_code}): {resp.text[:200]}")
    return f"{BUNNY_CDN_BASE_URL}/{path}?v={int(time.time())}"
