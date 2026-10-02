"""Refunds from Admin > Purchases: what counts as refunded, and what the refund email says.

The Stripe call, the session cancel and the step change are exercised end to end against the Stripe sandbox.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import checkout  # noqa: E402


def _order(*refunds, total=9700):
    return {"amount_total": total, "refunds": [{"amount": a, "status": st} for a, st in refunds]}


def test_nothing_refunded_yet():
    assert checkout.refund_totals({"amount_total": 9700}) == (0, 9700)


def test_partial_refunds_add_up():
    assert checkout.refund_totals(_order((2000, "succeeded"), (1000, "pending"))) == (3000, 6700)


def test_failed_and_canceled_refunds_give_nothing_back():
    assert checkout.refund_totals(_order((2000, "failed"), (9700, "canceled"))) == (0, 9700)


def test_remaining_never_goes_negative():
    assert checkout.refund_totals(_order((9700, "succeeded"), (500, "succeeded"))) == (10200, 0)


def _email(**over):
    r = {"first_name": "Ann", "amount": "$97.00", "paid": "$97.00", "full": True, "order_id": "pi_1",
         "date": "Sep 30, 2026", "session": None}
    return checkout._refund_email_html({**r, **over})


def test_full_refund_email():
    html = _email()
    assert "Hi Ann," in html and "We’ve refunded your $97.00 payment to the card you paid with." in html
    assert "has been cancelled" not in html


def test_partial_refund_email():
    assert "We’ve refunded $20.00 of your $97.00 payment" in _email(amount="$20.00", full=False)


def test_session_line_only_when_a_session_was_cancelled():
    html = _email(session="Thursday, October 1 at 9:00 AM PDT")
    assert "your strategy session on <strong>Thursday, October 1 at 9:00 AM PDT</strong> has been cancelled" in html


def test_email_escapes_the_name_and_greets_without_one():
    assert "Hi &lt;b&gt;," in _email(first_name="<b>")
    assert "Hello," in _email(first_name="")
