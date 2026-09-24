"""Learn entitlement delivery uses current authority and survives failed delivery."""
import asyncio
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=200")
os.environ.setdefault("DB_NAME", "test")

import httpx
import pytest
import server as s


def cursor(rows):
    result = Mock()
    result.to_list = AsyncMock(return_value=rows)
    result.sort.return_value = result
    return result


@pytest.fixture
def state(monkeypatch):
    def collection():
        return SimpleNamespace(find=Mock(return_value=cursor([])), find_one=AsyncMock(return_value=None),
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
            insert_one=AsyncMock(), delete_one=AsyncMock(), create_index=AsyncMock())
    db = SimpleNamespace(users=collection(), role_permissions=collection(), learn_push_queue=collection(),
        auto_login_tokens=SimpleNamespace(find_one_and_update=AsyncMock(return_value={
            "user_id": "member", "expires_at": datetime.now(timezone.utc) + timedelta(minutes=2),
        })))
    monkeypatch.setattr(s, "db", db)
    monkeypatch.setattr(s, "_role_caps_overrides", {})
    monkeypatch.setattr(s, "_learn_drain_lock", asyncio.Lock())
    monkeypatch.setattr(s, "LEARN_SERVICE_URL", "https://learn.invalid")
    monkeypatch.setattr(s, "LEARN_SERVICE_KEY", "test-service-key")
    return db


@pytest.fixture
def delivery(monkeypatch):
    client = SimpleNamespace(post=AsyncMock(return_value=SimpleNamespace(status_code=200)))
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: context)
    return client


def test_sso_redeem_uses_current_db_permissions_for_member_and_roster(state, monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {
        "hc": {"learn", "learn.instruct"}, "pcc": {"learn"},
    })
    monkeypatch.setattr(s, "log_activity", AsyncMock())
    member = {"id": "member", "email": "coach@example.com", "role": "hc"}
    state.users.find_one.return_value = member
    state.users.find.return_value = cursor([
        member, {"id": "revoked", "email": "pcc@example.com", "role": "pcc"},
        {"id": "super", "email": "super@example.com", "role": "super_admin"},
    ])
    permission_cursor = cursor([])
    permission_read_at = []

    async def permissions(_length):
        permission_read_at.append(datetime.now(timezone.utc))
        return [{"role": "hc", "capabilities": ["learn"]}, {"role": "pcc", "capabilities": []},
                {"role": "super_admin", "capabilities": []}]

    permission_cursor.to_list.side_effect = permissions
    state.role_permissions.find.return_value = permission_cursor
    result = asyncio.run(s.learn_sso_redeem(s.LearnRedeemRequest(token="handoff")))
    assert result["instruct"] is False
    assert [(person["id"], person["instruct"]) for person in result["team"]] == [("member", False), ("super", True)]
    assert datetime.fromisoformat(result["team_ts"]) <= permission_read_at[0]
    state.role_permissions.find.assert_called_once()


@pytest.mark.parametrize("action", ["mint", "redeem"])
def test_sso_rejects_revoked_learn_access_despite_cached_grant(state, monkeypatch, action):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"learn", "learn.instruct"}})
    monkeypatch.setattr(s, "create_auto_login_token", AsyncMock())
    state.users.find_one.return_value = {"id": "member", "email": "coach@example.com", "role": "hc"}
    state.role_permissions.find.return_value = cursor([{"role": "hc", "capabilities": ["supplements"]}])
    operation = (s.learn_sso_token(current_user=state.users.find_one.return_value) if action == "mint"
                 else s.learn_sso_redeem(s.LearnRedeemRequest(token="handoff")))
    with pytest.raises(s.HTTPException) as error:
        asyncio.run(operation)
    assert error.value.status_code == 403
    s.create_auto_login_token.assert_not_awaited()


def test_sso_defaults_do_not_fall_back_to_stale_worker_overrides(state, monkeypatch):
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"learn", "learn.instruct"}})
    monkeypatch.setattr(s, "log_activity", AsyncMock())
    state.users.find_one.return_value = {"id": "member", "email": "coach@example.com", "role": "hc"}
    state.users.find.return_value = cursor([state.users.find_one.return_value])
    # No persisted HC override: seeded HC defaults allow Learn, not instruction.
    result = asyncio.run(s.learn_sso_redeem(s.LearnRedeemRequest(token="handoff")))
    assert result["instruct"] is False and result["team"][0]["instruct"] is False


@pytest.mark.parametrize("current_caps,active,instruct", [
    ([], False, False), (["learn"], True, False), (["learn", "learn.instruct"], True, True),
])
def test_retried_push_uses_current_database_permissions(state, delivery, monkeypatch,
                                                       current_caps, active, instruct):
    # The old queue job and process cache both still grant instructor access.
    old_job = {"user_id": "member", "email": "old@example.com", "active": True, "role": "admin"}
    monkeypatch.setattr(s, "_role_caps_overrides", {"hc": {"learn", "learn.instruct"}})
    state.users.find_one.return_value = {
        "id": "member", "email": "current@example.com", "name": "Coach", "role": "hc", "active": True,
    }
    state.role_permissions.find_one.return_value = {"role": "hc", "capabilities": current_caps}
    before = datetime.now(timezone.utc)
    assert asyncio.run(s._send_learn_push(old_job)) is True
    payload = delivery.post.await_args.kwargs["json"]
    assert payload["portalUserId"] == "member"
    assert payload["email"] == "current@example.com" and payload["role"] == "hc"
    assert payload["active"] is active and payload["instruct"] is instruct
    assert datetime.fromisoformat(payload["ts"]) >= before


@pytest.mark.parametrize("member", [None, {"id": "member", "role": "hc", "active": False},
                                    {"id": "member", "role": "user", "active": True}])
def test_retried_grant_cannot_reactivate_deleted_disabled_or_demoted_member(state, delivery, member):
    state.users.find_one.return_value = member
    state.role_permissions.find_one.return_value = {"role": "hc", "capabilities": ["learn"]}
    assert asyncio.run(s._send_learn_push({"user_id": "member", "active": True, "role": "hc"})) is True
    assert delivery.post.await_args.kwargs["json"]["active"] is False


def test_delivery_failure_is_retryable(state, delivery):
    delivery.post.side_effect = httpx.ConnectError("Learn unavailable")
    assert asyncio.run(s._send_learn_push({"user_id": "member"})) is False


def test_marker_job_ids_are_backed_by_unique_index(state):
    asyncio.run(s.ensure_learn_push_indexes())
    state.learn_push_queue.create_index.assert_awaited_once_with("id", unique=True)


def test_markers_enqueue_idempotent_jobs_before_conditional_clear(state):
    marker = "2026-09-08T10:00:00+00:00"
    role_member = {"id": "coach", "role": "hc", "email": "coach@example.com"}
    changed_member = {"id": "coordinator", "role": "pcc", "learn_sync_pending": marker}
    state.role_permissions.find.return_value = cursor([{"role": "hc", "learn_sync_pending": marker}])
    state.users.find.side_effect = [cursor([role_member]), cursor([changed_member])]
    asyncio.run(s._enqueue_pending_learn_updates())
    writes = state.learn_push_queue.update_one.await_args_list
    assert [call.args[0]["id"] for call in writes] == [f"role:hc:{marker}:coach", f"member:coordinator:{marker}"]
    assert all(call.kwargs["upsert"] and "$setOnInsert" in call.args[1] for call in writes)
    state.role_permissions.update_one.assert_awaited_once_with(
        {"role": "hc", "learn_sync_pending": marker}, {"$unset": {"learn_sync_pending": ""}})
    state.users.update_one.assert_awaited_once_with(
        {"id": "coordinator", "learn_sync_pending": marker}, {"$unset": {"learn_sync_pending": ""}})


@pytest.mark.parametrize("marker_kind", ["role", "member"])
def test_failed_enqueue_preserves_pending_marker_for_retry(state, marker_kind):
    member = {"id": "member", "role": "hc", "learn_sync_pending": "pending-version"}
    if marker_kind == "role":
        state.role_permissions.find.return_value = cursor([{"role": "hc", "learn_sync_pending": "pending-version"}])
        state.users.find.return_value = cursor([member])
    else:
        state.users.find.return_value = cursor([member])
    state.learn_push_queue.update_one.side_effect = RuntimeError("queue temporarily unavailable")
    with pytest.raises(RuntimeError, match="queue temporarily unavailable"):
        asyncio.run(s._enqueue_pending_learn_updates())
    state.role_permissions.update_one.assert_not_awaited()
    state.users.update_one.assert_not_awaited()


def test_drain_deletes_success_and_backs_off_failed_delivery(state, monkeypatch):
    monkeypatch.setattr(s, "_enqueue_pending_learn_updates", AsyncMock())
    monkeypatch.setattr(s, "_send_learn_push", AsyncMock(side_effect=[True, False]))
    state.learn_push_queue.find.return_value = cursor([
        {"id": "delivered", "user_id": "one"},
        {"id": "retry", "user_id": "two", "attempts": 1},
    ])
    before = datetime.now(timezone.utc)
    asyncio.run(s.drain_learn_push_queue())
    state.learn_push_queue.delete_one.assert_awaited_once_with({"id": "delivered"})
    query, change = state.learn_push_queue.update_one.await_args.args
    assert query == {"id": "retry"}
    assert change["$set"]["attempts"] == 2
    assert (datetime.fromisoformat(change["$set"]["next_at"]) - before).total_seconds() >= 120


def test_permission_change_persists_delivery_marker_with_permissions(state, monkeypatch):
    monkeypatch.setattr(s, "load_role_caps_cache", AsyncMock())
    monkeypatch.setattr(s, "drain_learn_push_queue", AsyncMock())
    monkeypatch.setattr(s, "log_admin_action", AsyncMock())
    asyncio.run(s.set_role_permissions("hc", s.RolePermissionUpdate(capabilities=["supplements"]),
                                       admin_user={"id": "super", "role": "super_admin"}))
    query, change = state.role_permissions.update_one.await_args.args
    assert query == {"role": "hc"}
    assert change["$set"]["capabilities"] == ["supplements"]
    assert change["$set"]["learn_sync_pending"] == change["$set"]["updated_at"]


@pytest.mark.parametrize("payload", [{"active": False}, {"role": "pcc"}])
def test_member_change_persists_delivery_marker_with_identity(state, monkeypatch, payload):
    state.users.find_one.return_value = {"id": "member", "role": "hc", "email": "member@example.com"}
    monkeypatch.setattr(s, "drain_learn_push_queue", AsyncMock())
    monkeypatch.setattr(s, "log_admin_action", AsyncMock())
    asyncio.run(s.update_team_member("member", s.TeamMemberUpdate(**payload),
                                      admin_user={"id": "admin", "role": "admin"}))
    change = state.users.update_one.await_args.args[1]["$set"]
    assert change["learn_sync_pending"]
    assert all(change[key] == value for key, value in payload.items())
