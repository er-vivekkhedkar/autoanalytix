"""Generate a PDF analysis report with reportlab."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

import engine

ACCENT = colors.HexColor("#2563eb")
DARK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#eff6ff")


def _styles():
    h1 = ParagraphStyle("h1", fontSize=22, leading=26, textColor=DARK, spaceAfter=4)
    h2 = ParagraphStyle("h2", fontSize=13.5, leading=17, textColor=ACCENT,
                        spaceBefore=14, spaceAfter=6)
    p = ParagraphStyle("p", fontSize=9.5, leading=13.5, textColor=MUTED)
    th = ParagraphStyle("th", fontSize=8.5, leading=11, textColor=colors.white)
    td = ParagraphStyle("td", fontSize=8.5, leading=11, textColor=DARK)


def _fmt(v, nd=3):
    if v is None:
        return "—"
    try:
        f = float(v)
        return f"{f:,.{nd}f}" if abs(f) < 1e6 else f"{f:.3g}"
    except (TypeError, ValueError):
        return str(v)


def build_pdf(df, name, history, charts_meta):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title="AutoAnalytix Report")
    h1 = ParagraphStyle("h1", fontSize=21, leading=25, textColor=DARK)
    h2 = ParagraphStyle("h2", fontSize=13, leading=16, textColor=ACCENT,
                        spaceBefore=12, spaceAfter=5)
    p = ParagraphStyle("p", fontSize=9, leading=12.5, textColor=MUTED)
    cell = ParagraphStyle("cell", fontSize=8, leading=10.5, textColor=DARK)
    head = ParagraphStyle("head", fontSize=8, leading=10.5, textColor=colors.white)
    small = ParagraphStyle("small", fontSize=7.5, leading=10, textColor=MUTED)

    story = [Paragraph("AutoAnalytix — Analysis Report", h1),
             Paragraph(f"Dataset: <b>{name}</b> · Generated {datetime.now():%d %b %Y, %H:%M} · "
                       f"{len(df):,} rows × {df.shape[1]} columns (cleaned state)", p),
             Spacer(1, 6)]

    # overview
    prof = engine.profile(df)
    stat_rows = [["Rows", f"{prof['rows']:,}"], ["Columns", str(prof["cols"])],
                 ["Numeric columns", str(prof["numericCols"])],
                 ["Missing cells", f"{prof['missingCells']:,} ({prof['missingPct']}%)"],
                 ["Duplicate rows", str(prof["duplicates"])]]
    ov = Table(stat_rows, colWidths=[52 * mm, 40 * mm])
    ov.setStyle(_grid_style())
    story += [Paragraph("Dataset overview", h2), ov]

    # column profile
    story.append(Paragraph("Column profile", h2))
    col_rows = [[Paragraph("Column", head), Paragraph("Type", head), Paragraph("Missing", head),
                 Paragraph("Unique", head), Paragraph("Min", head), Paragraph("Max", head),
                 Paragraph("Mean", head)]]
    for c in prof["columns"]:
        col_rows.append([Paragraph(str(c["name"]), cell), Paragraph(c["type"], cell),
                         Paragraph(f"{c['missing']} ({c['missingPct']}%)", cell),
                         Paragraph(str(c["unique"]), cell),
                         Paragraph(_fmt(c.get("min")), cell), Paragraph(_fmt(c.get("max")), cell),
                         Paragraph(_fmt(c.get("mean")), cell)])
    widths = [40 * mm, 18 * mm, 24 * mm, 16 * mm, 20 * mm, 20 * mm, 20 * mm]
    t = Table(col_rows, colWidths=widths, repeatRows=1)
    t.setStyle(_grid_style())
    story.append(t)

    # statistics
    stats = engine.descriptive_stats(df)
    if stats:
        story.append(Paragraph("Descriptive statistics (numeric columns)", h2))
        rows = [[Paragraph("Column", head), Paragraph("Mean", head), Paragraph("Median", head),
                 Paragraph("Std", head), Paragraph("Var", head), Paragraph("Min", head),
                 Paragraph("Q1", head), Paragraph("Q3", head), Paragraph("Max", head),
                 Paragraph("Skew", head)]]
        for c, s in list(stats.items())[:14]:
            rows.append([Paragraph(c, cell)] + [Paragraph(_fmt(s[k]), cell)
                        for k in ("mean", "median", "std", "variance", "min", "q1", "q3", "max", "skew")])
        t = Table(rows, colWidths=[34 * mm] + [18 * mm] * 9, repeatRows=1)
        t.setStyle(_grid_style())
        story.append(t)

    # cleaning history
    if history:
        story.append(Paragraph("Cleaning actions applied", h2))
        for i, h in enumerate(reversed(history[-12:])):
            story.append(Paragraph(f"{len(history) - i}. {h['label']}", small))

    # correlations
    corr = engine.correlations(df)
    if corr["columns"] and len(corr["columns"]) > 1:
        story.append(Paragraph("Strongest correlations (Pearson)", h2))
        cols = corr["columns"]
        pairs = []
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                r = corr["matrix"][i][j]
                if r is not None:
                    pairs.append((abs(r), cols[i], cols[j], r))
        pairs.sort(reverse=True)
        if pairs:
            rows = [[Paragraph("Pair", head), Paragraph("r", head), Paragraph("Strength", head)]]
            for a, x, y, r in pairs[:6]:
                strength = "strong" if abs(r) >= 0.7 else ("moderate" if abs(r) >= 0.4 else "weak")
                rows.append([Paragraph(f"{x} ↔ {y}", cell), Paragraph(f"{r:.3f}", cell),
                             Paragraph(strength, cell)])
            t = Table(rows, colWidths=[70 * mm, 22 * mm, 30 * mm], repeatRows=1)
            t.setStyle(_grid_style())
            story.append(t)

    if charts_meta:
        story.append(Paragraph("Figures included in this ZIP", h2))
        for cm in charts_meta:
            story.append(Paragraph(f"• {cm}", small))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Generated by AutoAnalytix — automated, no-code data analytics.", small))
    doc.build(story)
    return buf.getvalue()


def _grid_style():
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dbe4f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ])
