"""Portal-session auth shim for the supplements module.

Replaces the standalone app's Clerk layer wholesale: requests carry the SAME portal JWT
the rest of the admin/staff frontend uses, and access is decided by the portal role
model (hc + admin + super_admin). The three dependency functions keep the original
names/signatures (`get_current_user(authorization)`, `require_auth`, `require_admin`)
and return the original user shape ({sub, email, name, role: 'hc'|'admin'}) so the
ported route bodies did not have to change.

The JWT secret and the portal users collection are INJECTED from server.py at include
time (see supplements/__init__.init) — this package never reads auth env itself, so it
can't drift from the portal's token config (JWT_SECRET_KEY has a random fallback that
must be shared process-wide).
"""
from fastapi import Header, HTTPException
from jose import jwt, JWTError

_secret: str = ""
_users = None  # portal `users` collection (Motor)
_caps_for = None  # portal capabilities_for(user) resolver, injected at init

# Legacy fallback if the capability resolver isn't wired: portal role -> module role.
_ROLE_MAP = {"hc": "hc", "admin": "admin", "super_admin": "admin"}


def init(secret_key: str, users_collection, caps_resolver=None) -> None:
    global _secret, _users, _caps_for
    _secret = secret_key
    _users = users_collection
    _caps_for = caps_resolver


async def get_current_user(authorization: str = Header(None)):
    """Resolve the portal JWT to a supplementor-shaped user, or None."""
    if not authorization or not _secret or _users is None:
        return None
    token = authorization[7:] if authorization.startswith("Bearer ") else authorization
    try:
        payload = jwt.decode(token, _secret, algorithms=["HS256"])
    except JWTError:
        return None
    if payload.get("type") == "refresh":  # refresh tokens are for /auth/refresh only
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    u = await _users.find_one(
        {"id": user_id}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1, "active": 1}
    )
    if not u or u.get("active") is False:
        return None
    # Access derives from the portal capability matrix: "supplements" = coach-level,
    # "supplements.manage" = catalog/template admin. Fall back to the legacy role map
    # only if the resolver wasn't injected.
    if _caps_for is not None:
        caps = _caps_for(u)
        if "supplements" not in caps and "supplements.manage" not in caps:
            # Valid session, real active user, but no supplements access. FORBIDDEN,
            # not 401 — a 401 would send the client into a pointless refresh/logout loop.
            raise HTTPException(status_code=403, detail="Your role does not have access to Supplements")
        role = "admin" if "supplements.manage" in caps else "hc"
    else:
        role = _ROLE_MAP.get(u.get("role"))
        if role is None:
            raise HTTPException(status_code=403, detail="Your role does not have access to Supplements")
    return {"sub": u["id"], "email": u.get("email", ""), "name": u.get("name", ""), "role": role}


async def require_auth(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
