"""Shared dosage schedule semantics for storage, calculations and patient PDFs.

Older plans store a uniform quantity/frequency. Read those unchanged unless their
text explicitly describes a supported time schedule, which the old parser lost.
"""
import math
import re

TIME_ORDER = ("AM", "Afternoon", "PM")
_NUMBER = r"\d+(?:\.\d+)?"
_UNIT = r"(?:capsules?|caps?|tablets?|tabs?|pills?|pumps?|scoops?|packets?|drops?|servings?|teaspoons?|ml|g)"
_TIMES = {"am": "AM", "morning": "AM", "afternoon": "Afternoon", "aft": "Afternoon", "pm": "PM", "evening": "PM"}


def times_for_frequency(frequency):
    return list(TIME_ORDER) if frequency == 3 else ["AM", "PM"] if frequency == 2 else ["AM"]


def validate_schedule(schedule):
    if not isinstance(schedule, list) or not 1 <= len(schedule) <= 3:
        raise ValueError("Select one to three daily time slots")
    result = []
    seen = set()
    for dose in schedule:
        if not isinstance(dose, dict):
            raise ValueError("Each dose needs a time and quantity")
        time = dose.get("time")
        quantity = dose.get("quantity")
        if time not in TIME_ORDER or time in seen:
            raise ValueError("Each dose needs a unique AM, Afternoon or PM time")
        if isinstance(quantity, bool) or not isinstance(quantity, (int, float)) or not math.isfinite(quantity) or quantity <= 0:
            raise ValueError("Each selected time needs a positive finite quantity")
        seen.add(time)
        result.append({"time": time, "quantity": quantity})
    return sorted(result, key=lambda dose: TIME_ORDER.index(dose["time"]))


def parse_timed_dosage(text):
    """Parse complete explicit time/dash instructions; never accept a prefix."""
    if not isinstance(text, str) or not text.strip():
        return None
    text = text.strip().lower()
    if re.fullmatch(rf"{_NUMBER}(?:\s*-\s*{_NUMBER}){{1,2}}", text):
        quantities = [float(part) for part in text.split("-")]
        schedule = [{"time": time, "quantity": qty} for time, qty in zip(times_for_frequency(len(quantities)), quantities)]
    else:
        parts = re.split(r"\s*(?:/|&|,|\band\b)\s*", text)
        matches = [re.fullmatch(rf"({_NUMBER})\s*(?:{_UNIT}\s*)?(am|pm|afternoon|aft|morning|evening)", part) for part in parts]
        if not all(matches):
            return None
        schedule = [{"time": _TIMES[match[2]], "quantity": float(match[1])} for match in matches]
    return validate_schedule(schedule)


def normalize_dosage(entry):
    """Normalize a dict in place; explicit schedule takes precedence over text."""
    schedule = entry.get("dose_schedule")
    if schedule is not None:
        schedule = validate_schedule(schedule)
    else:
        schedule = parse_timed_dosage(entry.get("dosage_display"))
    if schedule:
        quantities = [dose["quantity"] for dose in schedule]
        entry["dose_schedule"] = schedule
        entry["quantity_per_dose"] = quantities[0] if len(set(quantities)) == 1 else None
        entry["frequency_per_day"] = len(schedule)
        entry["times"] = [dose["time"] for dose in schedule]
    return entry


def dose_schedule_for(entry):
    normalized = normalize_dosage(dict(entry))
    if normalized.get("dose_schedule"):
        return normalized["dose_schedule"]
    quantity = normalized.get("quantity_per_dose") or 0
    frequency = normalized.get("frequency_per_day") or 1
    times = normalized.get("times") or []
    if len(times) != frequency:
        times = times_for_frequency(frequency)
    return [{"time": time, "quantity": quantity} for time in times]
