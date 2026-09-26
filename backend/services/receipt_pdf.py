"""PDF version of the /checkout receipt (same layout as the GHL route's n8n receipt), built with reportlab.

`r` is the dict checkout._receipt() builds — the email body renders the same fields.
"""
import io
import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageTemplate, Paragraph, Spacer, Table, TableStyle

LOGO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "receipt-logo.png")
NAVY, GOLD = colors.HexColor("#0b2a5b"), colors.HexColor("#ffc24a")
LINE, MUTED, BOX = colors.HexColor("#e3e6ea"), colors.HexColor("#6b6f6a"), colors.HexColor("#f4f6f8")
PAGE_W = letter[0]
BODY_PAD = 33                                   # the template's 44px side padding
BODY_W = PAGE_W - 2 * BODY_PAD
TERMS_PAD = 16.5                                # 22px

TEXT = ParagraphStyle("text", fontName="Helvetica", fontSize=9.75, leading=15.6, textColor=colors.HexColor("#1d1d1f"))
TEXT_C = ParagraphStyle("textC", TEXT, alignment=TA_CENTER)
TEXT_R = ParagraphStyle("textR", TEXT, alignment=TA_RIGHT)
TITLE = ParagraphStyle("title", TEXT, fontName="Helvetica-Bold", fontSize=24, leading=28.5, textColor=colors.white, alignment=TA_CENTER)
SUBTITLE = ParagraphStyle("subtitle", TEXT, fontSize=10.5, leading=14, textColor=colors.HexColor("#c9cdd3"), alignment=TA_CENTER)
LABEL = ParagraphStyle("label", TEXT, fontName="Helvetica-Bold", textColor=NAVY)
META_KEY = ParagraphStyle("metaKey", TEXT, textColor=MUTED)
META_VAL = ParagraphStyle("metaVal", TEXT, fontName="Helvetica-Bold", textColor=NAVY, alignment=TA_RIGHT)
TH = ParagraphStyle("th", TEXT, fontName="Helvetica-Bold", fontSize=8.25, textColor=NAVY)
TH_C = ParagraphStyle("thC", TH, alignment=TA_CENTER)
TH_R = ParagraphStyle("thR", TH, alignment=TA_RIGHT)
TOTAL = ParagraphStyle("total", TEXT, fontName="Helvetica-Bold", fontSize=11.25, leading=15, alignment=TA_RIGHT)
TERMS_H = ParagraphStyle("termsH", TEXT, fontName="Helvetica-Bold", fontSize=9, textColor=GOLD)
TERMS_P = ParagraphStyle("termsP", TEXT, textColor=colors.HexColor("#e6e9ee"))
QUOTE = ParagraphStyle("quote", TEXT, fontName="Helvetica-Bold", fontSize=12, leading=17, textColor=colors.white)


def _box(content, width, pad, style=(), radius=None):
    """One-cell table around `content`: pad = (top, right, bottom, left), plus extra TableStyle commands."""
    t = Table([[content]], colWidths=[width], cornerRadii=radius)
    t.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), pad[0]), ("RIGHTPADDING", (0, 0), (-1, -1), pad[1]),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), pad[2]), ("LEFTPADDING", (0, 0), (-1, -1), pad[3]),
                           *style]))
    return t


def build_receipt_pdf(r: dict) -> bytes:
    e = {k: escape(v) if isinstance(v, str) else v for k, v in r.items()}   # Paragraph text is markup
    billed_name, billed_address = (escape(x) for x in r["billed_by"])

    header = _box([Image(LOGO, width=150, height=150 * 152 / 1024), Spacer(1, 14),
                   Paragraph('Your <font color="#ffc24a">receipt</font>.', TITLE), Spacer(1, 6),
                   Paragraph(f"Order {e['order_id']} · {e['date']}", SUBTITLE)],
                  PAGE_W, (16, 14, 16, 14), [("BACKGROUND", (0, 0), (-1, -1), NAVY), ("ALIGN", (0, 0), (-1, -1), "CENTER")])

    def meta(key, value, sub=""):
        sub = f'<br/><font name="Helvetica" size="9" color="#6b6f6a">{sub}</font>' if sub else ""
        return [Paragraph(key, META_KEY), Paragraph(value + sub, META_VAL)]

    inner_w = BODY_W - 30
    details = Table([meta("Order ID", e["order_id"]), meta("Order date", e["local"], e["utc"]),
                     meta("Customer", e["name"]), meta("Email", e["email"]), meta("Phone", e["phone"]),
                     meta("Payment method", "Stripe"), meta("Billed by", billed_name, billed_address)],
                    colWidths=[inner_w * 0.4, inner_w * 0.6])
    details.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                 ("TOPPADDING", (0, 0), (-1, -1), 5.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
                                 ("LINEBELOW", (0, 0), (-1, -2), 0.75, LINE)]))

    items = Table([[Paragraph("ITEM", TH), Paragraph("QTY", TH_C), Paragraph("PRICE", TH_C), Paragraph("TOTAL", TH_R)],
                   [Paragraph(e["item"], TEXT), Paragraph("1", TEXT_C), Paragraph(e["price"], TEXT_C), Paragraph(e["price"], TEXT_R)],
                   [Paragraph("Total paid", TOTAL), "", "", Paragraph(e["total"], TOTAL)]],
                  colWidths=[BODY_W * 0.55, BODY_W * 0.15, BODY_W * 0.15, BODY_W * 0.15])
    items.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("SPAN", (0, 2), (2, 2)),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 2), (0, 2), 9),
                               ("TOPPADDING", (0, 0), (-1, -1), 7.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 7.5),
                               ("LINEBELOW", (0, 0), (-1, 0), 1.5, NAVY), ("LINEBELOW", (0, 1), (-1, 1), 0.75, LINE),
                               ("LINEABOVE", (0, 2), (-1, 2), 1.5, NAVY)]))

    body = _box([Paragraph("Payment details", LABEL), Spacer(1, 6),
                 _box(details, BODY_W, (6, 15, 6, 15), [("BACKGROUND", (0, 0), (-1, -1), BOX)], radius=[7.5] * 4),
                 Spacer(1, 14), Paragraph("Items", LABEL), Spacer(1, 6), items],
                PAGE_W, (18, BODY_PAD, 18, BODY_PAD))

    quote = _box(Paragraph(f"“{e['policy']}”", QUOTE), PAGE_W - 2 * TERMS_PAD, (10.5, 12, 10.5, 12),
                 [("LINEBEFORE", (0, 0), (0, 0), 3, GOLD)])
    terms = _box([Paragraph("TERMS ACCEPTED AT CHECKOUT", TERMS_H), Spacer(1, 7.5),
                  Paragraph("Completing this order required ticking a mandatory checkbox agreeing to the following:", TERMS_P),
                  Spacer(1, 8), quote, Spacer(1, 8),
                  Paragraph(f"Accepted by {e['name']} ({e['email']}) on {e['local']} ({e['utc']}), order {e['order_id']}.", TERMS_P)],
                 PAGE_W, (13.5, TERMS_PAD, 13.5, TERMS_PAD), [("BACKGROUND", (0, 0), (-1, -1), NAVY)])

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=letter, title=f"Receipt {r['order_id']}", author="Dr. Shumard")
    # Full-bleed bands, like the template's @page{margin:0}: a frame with no margins and no padding.
    doc.addPageTemplates([PageTemplate(frames=[Frame(0, 0, *letter, leftPadding=0, rightPadding=0,
                                                     topPadding=0, bottomPadding=0)])])
    doc.build([header, body, terms])
    return buf.getvalue()
