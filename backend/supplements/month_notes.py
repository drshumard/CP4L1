"""
Legacy 'Starts Month N' / 'Month N only' instruction notes.

Old flat-format templates encoded month membership in free-text
instructions (e.g. "With food. Starts Month 2."). These helpers
interpret those notes so a supplement only appears in the months it
belongs to, and strip the note text once it has been applied.

A note only counts when it stands alone as its own sentence/clause,
as in the legacy data — embedded mentions like "2 caps month 1 only,
then 1 cap daily" are dose instructions, not month membership.
"""
import re

SEGMENT_RE = re.compile(r"[^.;()]+")
NOTE_RE = re.compile(
    r"starts?\s+(?:in\s+|from\s+)?month\s+(\d+)|month\s+(\d+)\s+only",
    re.IGNORECASE,
)


def _find_note(instructions):
    """Locate a standalone month-note segment.
    Returns (start, end, kind, n) or None."""
    text = instructions or ""
    for seg in SEGMENT_RE.finditer(text):
        m = NOTE_RE.fullmatch(seg.group().strip())
        if m:
            start, end = seg.span()
            if end < len(text) and text[end] in ".;":
                end += 1
            kind = "from" if m.group(1) else "only"
            return start, end, kind, int(m.group(1) or m.group(2))
    return None


def month_note_rule(instructions):
    """Parse a legacy month note. Returns ('from', n), ('only', n), or None."""
    found = _find_note(instructions)
    return (found[2], found[3]) if found else None


def supp_in_month(supp, month_number):
    """Whether a supplement entry belongs in the given month per its note.
    Fractional month numbers (0.5 = first 2 weeks, 1.5 = month 1 + 2 weeks)
    count as the month they extend."""
    rule = month_note_rule(supp.get("instructions"))
    if not rule:
        return True
    eff = max(1, int(month_number))
    kind, n = rule
    return eff >= n if kind == "from" else eff == n


def strip_month_note(supp):
    """Copy of a supplement entry with the legacy month note removed."""
    c = dict(supp)
    text = c.get("instructions") or ""
    found = _find_note(text)
    if found:
        text = text[:found[0]] + text[found[1]:]
        text = re.sub(r"\(\s*\)", "", text)
        text = re.sub(r"\s+", " ", text).strip()
    c["instructions"] = text
    return c
