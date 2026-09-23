"""convert_timezone_to_windows must never hand PB "UTC" for a real North-American zone.

Regression: a patient whose browser reported America/Nassau (not in TIMEZONE_MAP) had her PB
client created with timeZone "UTC", so every PB session reminder rendered a 12:30 PM EDT call
as "4:30 PM". Unlisted zones now resolve by matching standard+daylight offsets.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.practice_better_v2 import TIMEZONE_MAP, convert_timezone_to_windows  # noqa: E402


@pytest.mark.parametrize("iana, expected", [
    ("America/Nassau", "Eastern Standard Time"),
    ("America/Toronto", "Eastern Standard Time"),
    ("America/Detroit", "Eastern Standard Time"),
    ("America/Kentucky/Louisville", "Eastern Standard Time"),
    ("America/Vancouver", "Pacific Standard Time"),
    ("America/Edmonton", "Mountain Standard Time"),
    ("America/Winnipeg", "Central Standard Time"),
])
def test_unlisted_zone_resolves_by_offsets(iana, expected):
    assert iana not in TIMEZONE_MAP, "test premise: zone is not directly mapped"
    assert convert_timezone_to_windows(iana) == expected


@pytest.mark.parametrize("iana", ["America/New_York", "America/Los_Angeles", "America/Chicago",
                                  "America/Denver", "America/Phoenix", "Europe/London"])
def test_listed_zone_unchanged(iana):
    assert convert_timezone_to_windows(iana) == TIMEZONE_MAP[iana]


def test_garbage_still_falls_back_to_utc():
    assert convert_timezone_to_windows("Not/AZone") == "UTC"
    assert convert_timezone_to_windows("") == "UTC"
