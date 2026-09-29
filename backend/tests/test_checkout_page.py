"""The page a checkout payment came from (/checkout or /session) reaches automations.

Every "Checkout purchase" payload carries checkout_page, and an automation can be limited to one page; a manual
send from Admin > Purchases goes to the actions picked, whatever their page.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

import checkout  # noqa: E402
import server  # noqa: E402


def test_payload_carries_the_page():
    order = {"_id": "cs_1", "email": "a@example.com", "checkout_page": "/session"}
    assert checkout._purchase_payload(order, {"patient": {}}, None, "t")["checkout_page"] == "/session"


def test_orders_from_before_session_count_as_checkout():
    assert checkout._purchase_payload({"_id": "cs_1"}, {"patient": {}}, None, "t")["checkout_page"] == "/checkout"


@pytest.mark.parametrize("value, stored", [(None, None), ("", None), ("any", None),
                                           ("/checkout", "/checkout"), ("/session", "/session")])
def test_page_limit_values(value, stored):
    assert server._checkout_page_filter(value) == stored


def test_page_limit_rejects_other_paths():
    with pytest.raises(HTTPException) as err:
        server._checkout_page_filter("/other")
    assert err.value.status_code == 400


class _Automations:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):
        ids = query.get("id", {}).get("$in")
        docs = [d for d in self.docs if d["trigger"] == query["trigger"]
                and (d["id"] in ids if ids is not None else d.get("enabled"))]

        class _Cursor:
            async def to_list(self, n):
                return docs[:n]
        return _Cursor()


class _Logs:
    async def insert_one(self, doc):
        pass


class _DB:
    def __init__(self, docs):
        self.automations, self.automation_logs = _Automations(docs), _Logs()


def _automation(aid, page):
    return {"id": aid, "name": aid, "trigger": "checkout_purchase", "enabled": True, "checkout_page": page,
            "actions": [{"id": f"{aid}-action", "url": f"http://hooks.test/{aid}", "method": "POST"}]}


def _run(monkeypatch, data, only=None):
    """Which webhooks execute_automations calls for `data` (three automations: any page, /checkout, /session)."""
    sent = []

    class _Response:
        status_code, headers, text = 200, {}, "ok"

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kwargs):
            sent.append(url.rsplit("/", 1)[-1])
            return _Response()

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    monkeypatch.setattr(server, "db", _DB([_automation("any", None), _automation("checkout", "/checkout"),
                                           _automation("session", "/session")]))
    asyncio.run(server.execute_automations("checkout_purchase", data, only=only))
    return sorted(sent)


def test_session_purchase_skips_checkout_only_automations(monkeypatch):
    assert _run(monkeypatch, {"checkout_page": "/session"}) == ["any", "session"]


def test_checkout_purchase_skips_session_only_automations(monkeypatch):
    assert _run(monkeypatch, {"checkout_page": "/checkout"}) == ["any", "checkout"]


def test_manual_send_goes_where_it_is_pointed(monkeypatch):
    assert _run(monkeypatch, {"checkout_page": "/session"}, only={("checkout", "checkout-action")}) == ["checkout"]
