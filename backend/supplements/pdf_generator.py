"""
PDF generation for patient and HC exports using fpdf2.
Layout matches clinic protocol style: Time groupings, With Food, Notes, Month Order.
"""
import os
import math
import re
from fpdf import FPDF

from .calculations import recalculate_plan_costs
from .month_notes import supp_in_month, strip_month_note

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")

# Teal palette
TEAL = (13, 95, 104)
TEAL_LIGHT = (214, 236, 232)
TEAL_BG = (234, 244, 243)
DARK = (15, 23, 42)
GRAY = (100, 116, 139)
LIGHT_GRAY = (226, 232, 240)
WHITE = (255, 255, 255)
RED = (197, 59, 59)
GREEN = (20, 125, 90)

TIME_ORDER = ["AM", "Afternoon", "PM"]


class ProtocolPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*GRAY)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}", align="C")


def _safe(val):
    if val is None:
        return ""
    return str(val)


def _month_label(num):
    """Format month number: 0.5 -> 'Month 1 (2 Weeks)', 1.0 -> 'Month 1', 1.5 -> 'Month 1 + 2 Weeks'."""
    if num == 0.5:
        return "Month 1 (2 Weeks)"
    if isinstance(num, float) and num == int(num):
        return f"Month {int(num)}"
    if isinstance(num, float) and num % 1 != 0:
        return f"Month {int(num)} + 2 Weeks"
    return f"Month {num}"


def _group_by_time(supplements):
    """Group supplements by time slots. A supplement with times: ["AM", "PM"] appears in both.
    Backfills times from frequency_per_day if times is missing."""
    groups = {t: [] for t in TIME_ORDER}
    for s in supplements:
        times = s.get("times")
        if not times or len(times) == 0:
            # Backfill from frequency
            freq = s.get("frequency_per_day") or 1
            if freq >= 3:
                times = ["AM", "Afternoon", "PM"]
            elif freq == 2:
                times = ["AM", "PM"]
            else:
                times = ["AM"]
            s["times"] = times
        for t in times:
            if t in groups:
                groups[t].append(s)
    return [(t, supps) for t in TIME_ORDER if (supps := groups.get(t, [])) and len(supps) > 0]


def _draw_header(pdf, plan):
    """Draw centered logo, program title, patient name, and date."""
    # Logo centered
    if os.path.exists(LOGO_PATH):
        logo_w = 35
        x = (pdf.w - logo_w) / 2
        pdf.image(LOGO_PATH, x=x, y=pdf.get_y(), w=logo_w)
        pdf.ln(22)

    # Program + Step — centered, slightly smaller
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*DARK)
    program = _safe(plan.get("program_name", ""))
    step = _safe(plan.get("step_label", ""))
    pdf.cell(0, 8, f"{program} - {step}", align="C", new_x="LMARGIN", new_y="NEXT")

    # Patient name — centered, no label
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 7, _safe(plan.get("patient_name", "")), align="C", new_x="LMARGIN", new_y="NEXT")

    # Date — centered, lighter
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 6, _safe(plan.get("date", "")), align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(3)
    pdf.set_draw_color(*LIGHT_GRAY)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(5)


def _draw_time_table(pdf, time_label, supps, show_costs=False):
    """Draw a time-grouped table with section header. Fixed row heights for alignment.
    Keeps the table together — moves to new page if it won't fit."""
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    ROW_H = 7

    # Estimate total table height: header(8) + col headers(6) + rows(~9 each) + padding(8)
    est_height = 8 + 6 + (len(supps) * 9) + 8
    available = pdf.h - pdf.get_y() - 20

    # If table won't fit here but would fit on a fresh page, start new page
    if est_height > available and est_height < (pdf.h - 40):
        pdf.add_page()

    # Section header
    pdf.set_fill_color(*TEAL)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(page_w, 8, f"  {time_label}", fill=True, new_x="LMARGIN", new_y="NEXT")

    # Column headers
    if show_costs:
        cols = [48, 24, 18, 16, 24, page_w - 130]
        headers = ["Supplement", "Dose", "Food", "Btls", "Cost", "Notes"]
    else:
        cols = [55, 28, 22, page_w - 105]
        headers = ["Supplement", "Dose", "Food", "Notes"]

    pdf.set_fill_color(*TEAL_LIGHT)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*TEAL)
    for i, h in enumerate(headers):
        pdf.cell(cols[i], 6, f" {h.upper()}", fill=True, new_x="RIGHT")
    pdf.ln()

    # Data rows
    for s in supps:
        if pdf.get_y() > pdf.h - 18:
            pdf.add_page()

        # Build notes text
        notes = _safe(s.get("instructions", ""))
        if s.get("refrigerate") and "refrigerat" not in notes.lower():
            notes = ("Refrigerate. " + notes).strip() if notes else "Refrigerate"

        # Calculate row height based on notes wrapping
        pdf.set_font("Helvetica", "", 7.5)
        notes_w = cols[-1] - 2
        note_width = pdf.get_string_width(notes) if notes else 0
        note_lines = max(1, math.ceil(note_width / notes_w)) if notes_w > 0 else 1
        row_h = max(ROW_H, note_lines * 4.5 + 2)

        row_y = pdf.get_y()
        x = pdf.l_margin

        # Supplement name
        pdf.set_xy(x, row_y)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*DARK)
        pdf.cell(cols[0], row_h, f" {_safe(s.get('supplement_name', ''))[:30]}", border="B", new_x="RIGHT")
        x += cols[0]

        # Dose — per-time qty only
        pdf.set_xy(x, row_y)
        pdf.set_font("Helvetica", "", 8)
        qty = s.get("quantity_per_dose") or 0
        unit_type = s.get("unit_type") or ""
        if not unit_type:
            dd = _safe(s.get("dosage_display", "")).lower()
            for u in ["caps", "cap", "pumps", "pump", "scoop", "ml", "tablet", "packet", "drop"]:
                if u in dd:
                    unit_type = u
                    break
            else:
                unit_type = "caps"
        if qty > 0:
            ul = unit_type.rstrip("s") if qty == 1 else (unit_type if unit_type.endswith("s") or unit_type in ("ml","g") else unit_type + "s")
            dose_text = f"{qty} {ul}"
        else:
            dose_text = re.sub(r'\s*\d*x\s*/?\s*day.*', '', _safe(s.get("dosage_display", "")), flags=re.IGNORECASE).strip()
        pdf.cell(cols[1], row_h, f" {dose_text[:14]}", border="B", new_x="RIGHT")
        x += cols[1]

        # Food
        pdf.set_xy(x, row_y)
        pdf.cell(cols[2], row_h, " Yes" if s.get("with_food", True) else " No", border="B", new_x="RIGHT")
        x += cols[2]

        if show_costs:
            # Bottles
            pdf.set_xy(x, row_y)
            pdf.cell(cols[3], row_h, f" {s.get('bottles_needed') or '-'}", border="B", new_x="RIGHT")
            x += cols[3]
            # Cost
            pdf.set_xy(x, row_y)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(*GREEN)
            cost = s.get("calculated_cost") or 0
            pdf.cell(cols[4], row_h, f"${cost:.0f}" if cost else "-", border="B", new_x="RIGHT")
            pdf.set_text_color(*DARK)
            pdf.set_font("Helvetica", "", 7.5)
            x += cols[4]

        # Notes — multi-line safe
        pdf.set_xy(x, row_y)
        if s.get("refrigerate"):
            pdf.set_text_color(*RED)
        if note_lines > 1:
            pdf.multi_cell(cols[-1], 4.5, f" {notes}", border="B", new_x="LMARGIN", new_y="NEXT")
            # Ensure we're at the correct Y after multi_cell
            if pdf.get_y() < row_y + row_h:
                pdf.set_y(row_y + row_h)
        else:
            pdf.cell(cols[-1], row_h, f" {notes[:60]}", border="B", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*DARK)

    pdf.ln(5)


def _draw_month_order(pdf, month, plan):
    """Draw the Month Order summary (bottles + duration).
    Keeps the entire table together — starts new page if it won't fit."""
    supps = month.get("supplements", [])
    if not supps:
        return

    num_months = len(plan.get("months", []))

    # Deduplicate supplements (only show each once in order table)
    seen = {}
    for s in supps:
        name = s.get("supplement_name", "")
        if name and name not in seen:
            seen[name] = s
    unique = list(seen.values())
    if not unique:
        return

    mid = math.ceil(len(unique) / 2)
    max_rows = math.ceil(len(unique) / 2)

    # Calculate total height: title(10) + header(7) + rows(7 each) + padding(10)
    table_height = 10 + 7 + (max_rows * 7) + 10

    # If table won't fit on current page, start fresh
    if pdf.get_y() + table_height > pdf.h - 20:
        pdf.add_page()

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 8, f"{_month_label(month.get('month_number', 1))} Order", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = page_w / 2 - 2
    cols_each = [col_w * 0.4, col_w * 0.15, col_w * 0.2, col_w * 0.25]

    # Header row
    pdf.set_fill_color(*TEAL_LIGHT)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*TEAL)

    x = pdf.l_margin
    for h, w in zip(["Supplement", "Bottles", "Duration", "Notes"], cols_each):
        pdf.set_xy(x, pdf.get_y())
        pdf.cell(w, 7, h, border=1, fill=True, new_x="RIGHT")
        x += w
    x += 4
    for h, w in zip(["Supplement", "Bottles", "Duration", "Notes"], cols_each):
        pdf.set_xy(x, pdf.get_y())
        pdf.cell(w, 7, h, border=1, fill=True, new_x="RIGHT")
        x += w
    pdf.ln()

    # Data rows
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)

    left = unique[:mid]
    right = unique[mid:]

    for i in range(max_rows):
        row_y = pdf.get_y()
        x = pdf.l_margin

        if i < len(left):
            s = left[i]
            pdf.set_xy(x, row_y)
            pdf.cell(cols_each[0], 7, _safe(s.get("supplement_name", ""))[:22], border="LBR")
            btls = s.get("bottles_needed", 0) or 0
            pdf.cell(cols_each[1], 7, str(btls) if btls > 0 else "-", border="LBR")
            pdf.cell(cols_each[2], 7, f"{num_months} months", border="LBR")
            note = "refrigerate" if s.get("refrigerate") else ""
            if note:
                pdf.set_text_color(*RED)
            pdf.cell(cols_each[3], 7, note, border="LBR")
            pdf.set_text_color(*DARK)
        else:
            pdf.set_xy(x, row_y)
            for w in cols_each:
                pdf.cell(w, 7, "", border="LBR")

        x = pdf.l_margin + col_w + 4
        if i < len(right):
            s = right[i]
            pdf.set_xy(x, row_y)
            pdf.cell(cols_each[0], 7, _safe(s.get("supplement_name", ""))[:22], border="LBR")
            btls = s.get("bottles_needed", 0) or 0
            pdf.cell(cols_each[1], 7, str(btls) if btls > 0 else "-", border="LBR")
            pdf.cell(cols_each[2], 7, f"{num_months} months", border="LBR")
            note = "refrigerate" if s.get("refrigerate") else ""
            if note:
                pdf.set_text_color(*RED)
            pdf.cell(cols_each[3], 7, note, border="LBR")
            pdf.set_text_color(*DARK)
        else:
            pdf.set_xy(x, row_y)
            for w in cols_each:
                pdf.cell(w, 7, "", border="LBR")

        pdf.ln()


def generate_patient_pdf(plan_data: dict) -> bytes:
    """Generate patient-facing PDF (no cost info)."""
    pdf = ProtocolPDF()
    pdf.alias_nb_pages()

    # Hide supplements whose legacy "Starts Month N" / "Month N only" note
    # places them in a different month (older plans carry these). When
    # anything is hidden, the stored bottle counts were computed for the
    # unfiltered months — recompute them for what the patient actually takes.
    months = plan_data.get("months") or []
    filtered = [
        {**m, "supplements": [
            strip_month_note(s) for s in m.get("supplements", [])
            if supp_in_month(s, m.get("month_number", 1))
        ]}
        for m in months
    ]
    if any(len(f["supplements"]) != len(m.get("supplements", [])) for f, m in zip(filtered, months)):
        recalculate_plan_costs({"months": filtered})
    months = filtered

    for month in months:
        pdf.add_page()
        _draw_header(pdf, plan_data)

        # Month label
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(*DARK)
        pdf.cell(40, 8, _month_label(month.get('month_number', 1)))
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*RED)
        pdf.cell(0, 8, "*Keep 2 hours from all medications", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # Group by time
        groups = _group_by_time(month.get("supplements", []))
        for time_label, supps in groups:
            _draw_time_table(pdf, time_label, supps, show_costs=False)

        # Month order
        _draw_month_order(pdf, month, plan_data)

    return pdf.output()


def generate_hc_pdf(plan_data: dict) -> bytes:
    """Generate HC/internal PDF (with costs)."""
    pdf = ProtocolPDF()
    pdf.alias_nb_pages()

    months = plan_data.get("months") or []
    for month in months:
        pdf.add_page()
        _draw_header(pdf, plan_data)

        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(*DARK)
        pdf.cell(40, 8, _month_label(month.get('month_number', 1)))
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*RED)
        pdf.cell(0, 8, "HC INTERNAL VIEW", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        groups = _group_by_time(month.get("supplements", []))
        for time_label, supps in groups:
            _draw_time_table(pdf, time_label, supps, show_costs=True)

        # Cost breakdown
        pdf.ln(3)
        supp_cost = month.get("supplement_cost") or month.get("monthly_total_cost", 0) or 0
        freight = month.get("freight_total", 0) or 0
        monthly_total = month.get("monthly_total_cost", 0) or 0

        pdf.set_draw_color(*TEAL_LIGHT)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        pdf.ln(3)

        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*GRAY)
        pdf.cell(60, 6, "Supplement Cost:", new_x="RIGHT")
        pdf.set_text_color(*DARK)
        pdf.cell(40, 6, f"${supp_cost:.2f}", new_x="LMARGIN", new_y="NEXT")

        if freight > 0:
            pdf.set_text_color(*GRAY)
            pdf.cell(60, 6, "Shipping / Freight:", new_x="RIGHT")
            pdf.set_text_color(*DARK)
            pdf.cell(40, 6, f"${freight:.2f}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*GREEN)
        pdf.cell(60, 8, "Monthly Total:", new_x="RIGHT")
        pdf.cell(40, 8, f"${monthly_total:.2f}", new_x="LMARGIN", new_y="NEXT")

        _draw_month_order(pdf, month, plan_data)

    # Program total page
    if len(months) > 1:
        pdf.add_page()
        _draw_header(pdf, plan_data)
        pdf.ln(20)
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(*GRAY)
        pdf.cell(0, 10, "Total Program Cost", align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 28)
        pdf.set_text_color(*GREEN)
        total = plan_data.get("total_program_cost", 0) or 0
        pdf.cell(0, 15, f"${total:.2f}", align="C", new_x="LMARGIN", new_y="NEXT")

    return pdf.output()
