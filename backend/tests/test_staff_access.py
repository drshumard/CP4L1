"""Endpoint regressions for staff identity and booking permissions; no live DB/services."""
import asyncio
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=200")
os.environ.setdefault("DB_NAME", "test")

import httpx
import pytest

import server as s
import booking


@pytest.fixture
def state(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(), insert_one=AsyncMock(),
                            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
                            delete_one=AsyncMock(return_value=SimpleNamespace(deleted_count=1)))
    bookings = SimpleNamespace(find_one=AsyncMock(), update_one=AsyncMock())
    user_progress = SimpleNamespace(delete_many=AsyncMock())
    monkeypatch.setattr(s, "db", SimpleNamespace(users=users, bookings=bookings, user_progress=user_progress))
    monkeypatch.setattr(booking, "db", SimpleNamespace(users=users))
    monkeypatch.setattr(s, "log_admin_action", AsyncMock())
    monkeypatch.setattr(s, "log_activity", AsyncMock())
    monkeypatch.setattr(s, "drain_learn_push_queue", AsyncMock())
    monkeypatch.setattr(s, "push_learn_member_status", AsyncMock())
    monkeypatch.setattr(s, "_enqueue_pending_learn_updates", AsyncMock())
    monkeypatch.setattr(s, "_role_caps_overrides", {})
    monkeypatch.setattr(booking, "_capabilities_resolver", s.capabilities_for)
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    overrides = dict(s.app.dependency_overrides)
    yield SimpleNamespace(users=users, bookings=bookings, user_progress=user_progress)
    s.app.dependency_overrides.clear()
    s.app.dependency_overrides.update(overrides)


def request(method, path, *, actor=None, **kwargs):
    if actor is not None:
        async def current_user():
            return {"id": "actor", "email": "actor@example.com", **actor}
        s.app.dependency_overrides[s.get_current_user] = current_user

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=s.app),
                                     base_url="http://testserver") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(run())


@pytest.mark.parametrize("target_role", sorted(s.TEAM_ROLES))
def test_patient_editor_cannot_change_any_staff_identity(state, target_role):
    state.users.find_one.return_value = {"id": "target", "role": target_role}
    response = request("PUT", "/api/admin/user/target", actor={"role": "pcc"},
                       json={"email": "attacker@example.com", "name": "Changed"})
    assert response.status_code == 403
    state.users.update_one.assert_not_awaited()


@pytest.mark.parametrize("patient_role", ["user", None])
def test_patient_editor_still_updates_patient_identity(state, patient_role):
    state.users.find_one.side_effect = [
        {"id": "target", "role": patient_role, "email": "old@example.com"}, None,
    ]
    response = request("PUT", "/api/admin/user/target", actor={"role": "pcc"},
                       json={"email": "NEW@example.com"})
    assert response.status_code == 200
    query, operation = state.users.update_one.await_args.args
    assert query == {"id": "target", "role": {"$in": [None, "user"]}}
    assert operation == {"$set": {"email": "new@example.com"}}


def test_patient_promotion_during_edit_rejects_stale_write(state):
    state.users.find_one.side_effect = [{"id": "target", "role": "user"}, None]
    state.users.update_one.return_value = SimpleNamespace(matched_count=0)
    response = request("PUT", "/api/admin/user/target", actor={"role": "pcc"},
                       json={"email": "new@example.com"})
    assert response.status_code == 409
    s.log_activity.assert_not_awaited()


@pytest.mark.parametrize("actor_role", ["admin", "pcc", "doa", "hc", "marketing"])
def test_delegated_team_manager_cannot_create_admin(state, monkeypatch, actor_role):
    monkeypatch.setattr(s, "_role_caps_overrides", {actor_role: {"team.manage"}})
    response = request("POST", "/api/admin/team", actor={"role": actor_role},
                       json={"name": "New Admin", "email": "new@example.com", "role": "admin",
                             "password": "ChosenPassword123"})
    assert response.status_code == 403
    state.users.insert_one.assert_not_awaited()


@pytest.mark.parametrize("actor_role,new_role", [("super_admin", "admin"), ("hc", "pcc")])
def test_team_creation_allows_only_assignable_roles(state, monkeypatch, actor_role, new_role):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"team.manage"}})
    state.users.find_one.return_value = None
    response = request("POST", "/api/admin/team", actor={"role": actor_role},
                       json={"name": "New Member", "email": "new@example.com", "role": new_role})
    assert response.status_code == 200
    assert state.users.insert_one.await_args.args[0]["role"] == new_role
    assert ("admin" in s.assignable_team_roles({"role": actor_role})) == (actor_role == "super_admin")


def test_admin_cannot_promote_staff_to_admin(state):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    response = request("PUT", "/api/admin/team/target", actor={"role": "admin"}, json={"role": "admin"})
    assert response.status_code == 403
    state.users.update_one.assert_not_awaited()


def test_super_admin_can_promote_staff_to_admin(state):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    response = request("PUT", "/api/admin/team/target", actor={"role": "super_admin"}, json={"role": "admin"})
    assert response.status_code == 200
    assert state.users.update_one.await_args.args[0] == {"id": "target", "role": "hc"}
    assert state.users.update_one.await_args.args[1]["$set"]["role"] == "admin"


@pytest.mark.parametrize("payload", [{"name": "Changed"}, {"active": False}, {"role": "pcc"}])
def test_team_update_rejects_concurrently_promoted_target(state, payload):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    state.users.update_one.return_value = SimpleNamespace(matched_count=0)
    response = request("PUT", "/api/admin/team/target", actor={"role": "admin"}, json=payload)
    assert response.status_code == 409
    assert state.users.update_one.await_args.args[0] == {"id": "target", "role": "hc"}
    s.log_admin_action.assert_not_awaited()
    s.drain_learn_push_queue.assert_not_awaited()


def test_legacy_promotion_rejects_concurrently_promoted_target(state):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    state.users.update_one.return_value = SimpleNamespace(matched_count=0)
    response = request("POST", "/api/admin/user/target/promote", actor={"role": "admin"}, json={"role": "staff"})
    assert response.status_code == 409
    assert state.users.update_one.await_args.args[0] == {"id": "target", "role": "hc"}
    s.log_admin_action.assert_not_awaited()
    s.log_activity.assert_not_awaited()
    s.drain_learn_push_queue.assert_not_awaited()


def test_legacy_promotion_keeps_atomic_role_check_and_learn_marker(state):
    state.users.find_one.return_value = {"id": "target", "role": "user", "email": "patient@example.com"}
    response = request("POST", "/api/admin/user/target/promote", actor={"role": "admin"}, json={"role": "staff"})
    assert response.status_code == 200
    query, change = state.users.update_one.await_args.args
    assert query == {"id": "target", "role": "user"}
    assert change["$set"]["role"] == "staff" and change["$set"]["learn_sync_pending"]


def test_staff_delete_queues_revocation_before_removing_user(state):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    events = []

    async def disable(query, change):
        events.append("disable")
        assert query == {"id": "target", "role": "hc"}
        assert change["$set"]["active"] is False and change["$set"]["learn_sync_pending"]
        return SimpleNamespace(matched_count=1)

    async def enqueue():
        events.append("enqueue")

    async def delete(query):
        events.append("delete")
        assert query == {"id": "target", "role": "hc", "active": False}
        return SimpleNamespace(deleted_count=1)

    state.users.update_one.side_effect = disable
    s._enqueue_pending_learn_updates.side_effect = enqueue
    state.users.delete_one.side_effect = delete
    response = request("DELETE", "/api/admin/user/target", actor={"role": "admin"})
    assert response.status_code == 200
    assert events == ["disable", "enqueue", "delete"]
    state.user_progress.delete_many.assert_awaited_once_with({"user_id": "target"})


def test_staff_delete_stops_when_revocation_cannot_be_queued(state):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    s._enqueue_pending_learn_updates.side_effect = RuntimeError("queue unavailable")
    with pytest.raises(RuntimeError, match="queue unavailable"):
        asyncio.run(s.delete_user("target", admin_user={"id": "admin", "role": "admin"}))
    assert state.users.update_one.await_args.args[1]["$set"]["learn_sync_pending"]
    state.users.delete_one.assert_not_awaited()
    state.user_progress.delete_many.assert_not_awaited()


@pytest.mark.parametrize("conflict_stage", ["disable", "delete"])
def test_staff_delete_rejects_concurrent_identity_changes(state, conflict_stage):
    state.users.find_one.return_value = {"id": "target", "role": "hc", "email": "hc@example.com"}
    if conflict_stage == "disable":
        state.users.update_one.return_value = SimpleNamespace(matched_count=0)
    else:
        state.users.delete_one.return_value = SimpleNamespace(deleted_count=0)
    response = request("DELETE", "/api/admin/user/target", actor={"role": "admin"})
    assert response.status_code == 409
    state.user_progress.delete_many.assert_not_awaited()
    s.log_admin_action.assert_not_awaited()


def test_patient_delete_checks_role_before_deleting_progress(state):
    state.users.find_one.return_value = {"id": "target", "role": "user", "email": "patient@example.com"}
    response = request("DELETE", "/api/admin/user/target", actor={"role": "admin"})
    assert response.status_code == 200
    state.users.delete_one.assert_awaited_once_with({"id": "target", "role": "user"})
    s._enqueue_pending_learn_updates.assert_not_awaited()


@pytest.mark.parametrize("action", ["no-show", "resend-email"])
@pytest.mark.parametrize("actor_role", ["admin", "pcc"])
def test_booking_mutations_reject_view_only_roles(state, monkeypatch, action, actor_role):
    monkeypatch.setattr(s, "_role_caps_overrides", {actor_role: {"portal", "scheduling.view"}})
    response = request("POST", f"/api/admin/bookings/booking/{action}", actor={"role": actor_role}, json={})
    assert response.status_code == 403
    state.bookings.find_one.assert_not_awaited()
    state.bookings.update_one.assert_not_awaited()


@pytest.mark.parametrize("action", ["no-show", "resend-email"])
def test_booking_mutations_allow_delegated_scheduling_manager(state, monkeypatch, action):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"portal", "scheduling.manage"}})
    start = datetime.now(timezone.utc) + timedelta(days=-1 if action == "no-show" else 1)
    state.bookings.find_one.return_value = {"booking_id": "booking", "status": "confirmed",
        "slot_start_utc": start, "patient": {"email": "patient@example.com"}}
    monkeypatch.setattr(booking, "_load_app_settings", AsyncMock(return_value={}))
    monkeypatch.setattr(booking.booking_email, "send_booking_confirmation", AsyncMock())
    response = request("POST", f"/api/admin/bookings/booking/{action}", actor={"role": "hc"}, json={})
    assert response.status_code == 200
    if action == "no-show":
        assert state.bookings.update_one.await_args.args[1]["$set"]["status"] == "no_show"
    else:
        booking.booking_email.send_booking_confirmation.assert_awaited_once()


@pytest.mark.parametrize("method,path,payload", [
    ("POST", "/api/booking/reminders/test", {"key": "day_before", "to": "5555555555"}),
    ("GET", "/api/booking/pb-clients/fetch", None),
    ("GET", "/api/booking/pb-clients/lookup?email=patient@example.com", None),
    ("GET", "/api/booking/cache-lookup?email=patient@example.com", None),
    ("GET", "/api/booking/cache-status", None),
])
def test_booking_utilities_honor_revoked_permissions(state, monkeypatch, method, path, payload):
    state.users.find_one.return_value = {"id": "actor", "role": "admin", "active": True}
    monkeypatch.setattr(s, "_role_caps_overrides", {"admin": {"portal", "scheduling.view"}})
    s.app.dependency_overrides[booking.get_practice_better_service] = lambda: object()
    token = booking.jwt.encode({"sub": "actor", "type": "access"}, "test-secret", algorithm="HS256")
    response = request(method, path, headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert response.status_code == 403


def test_booking_utility_grant_and_revocation_use_live_policy(state, monkeypatch):
    state.users.find_one.return_value = {"id": "actor", "role": "hc", "active": True}
    token = booking.jwt.encode({"sub": "actor", "type": "access"}, "test-secret", algorithm="HS256")
    http_request = s.Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"settings.manage"}})
    assert asyncio.run(booking._require_capability(http_request, "settings.manage"))["id"] == "actor"
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": set()})
    with pytest.raises(s.HTTPException) as error:
        asyncio.run(booking._require_capability(http_request, "settings.manage"))
    assert error.value.status_code == 403


def test_booking_utilities_fail_closed_without_policy(state, monkeypatch):
    state.users.find_one.return_value = {"id": "actor", "role": "admin"}
    monkeypatch.setattr(booking, "_capabilities_resolver", None)
    token = booking.jwt.encode({"sub": "actor", "type": "access"}, "test-secret", algorithm="HS256")
    response = request("GET", "/api/booking/cache-status", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
