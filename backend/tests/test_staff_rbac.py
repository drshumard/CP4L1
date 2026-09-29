"""Focused, DB-free tests for staff RBAC: the actor/target hierarchy, the seeded
capability defaults (must equal the pre-RBAC gates), the Learn roster filter, and
the require_capability dependency. Imports server with env stubs; no network."""
import asyncio
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=200")
os.environ.setdefault("DB_NAME", "test")

import pytest
from fastapi import HTTPException

import server as s

SUPER, ADMIN, PCC, HC, PATIENT = ({"role": r} for r in ("super_admin", "admin", "pcc", "hc", "user"))


def test_outranks_is_strict_hierarchy():
    assert s._outranks(SUPER, ADMIN) and s._outranks(SUPER, HC) and s._outranks(ADMIN, HC)
    assert s._outranks(ADMIN, PATIENT) and s._outranks(HC, PATIENT)
    # peers can't touch peers; nobody outranks the super admin
    assert not s._outranks(ADMIN, ADMIN) and not s._outranks(HC, HC)
    assert not s._outranks(ADMIN, SUPER) and not s._outranks(SUPER, SUPER)
    assert not s._outranks(HC, ADMIN)


def test_seeded_defaults_equal_pre_rbac_gates(monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {})
    assert s.capabilities_for(SUPER) == set(s.CAPABILITIES)
    assert s.capabilities_for(ADMIN) == set(s.CAPABILITIES)
    portal_staff = set(s._PORTAL_STAFF_CAPS)
    assert s.capabilities_for(PCC) == portal_staff and s.capabilities_for({"role": "doa"}) == portal_staff
    assert "team.manage" not in portal_staff and "accounts.destroy" not in portal_staff
    assert s.capabilities_for(HC) == {"supplements", "learn"}
    assert s.capabilities_for(PATIENT) == set()


def test_overrides_win_over_defaults(monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"learn"}})
    assert s.capabilities_for(HC) == {"learn"}          # supplements revoked
    assert s.capabilities_for(SUPER) == set(s.CAPABILITIES)  # super admin is never overridable


def _roster(team):
    # mirrors the comprehension in learn_sso_redeem
    return [dict(m, instruct=("learn.instruct" in s.capabilities_for(m)))
            for m in team if "learn" in s.capabilities_for(m)]


def test_learn_roster_filters_revoked_and_carries_instruct(monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"supplements"}})  # Learn revoked for HCs
    team = [dict(ADMIN, email="a@x"), dict(PCC, email="p@x"), dict(HC, email="h@x")]
    roster = _roster(team)
    assert [m["email"] for m in roster] == ["a@x", "p@x"]          # hc dropped -> Learn deactivates them
    assert roster[0]["instruct"] is True and roster[1]["instruct"] is False


def test_require_capability_dependency(monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {})
    dep = s.require_capability("team.manage")
    assert asyncio.run(dep(current_user=dict(ADMIN))) == ADMIN
    with pytest.raises(HTTPException) as e:
        asyncio.run(dep(current_user=dict(HC)))
    assert e.value.status_code == 403


def test_vienna_role_follows_the_highest_granted_capability():
    assert s.vienna_role_for({"vienna"}) == "agent"
    assert s.vienna_role_for({"vienna", "vienna.support"}) == "support_manager"
    assert s.vienna_role_for({"vienna", "vienna.support", "vienna.marketing"}) == "marketing"
    assert s.vienna_role_for(set(s.CAPABILITIES)) == "admin"
