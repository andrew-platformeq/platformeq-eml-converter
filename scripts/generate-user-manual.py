#!/usr/bin/env python3
"""Generate end-user guide for PlatformEQ EML Viewer as PDF."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "user-manual.pdf"


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontSize=22,
            leading=26,
            spaceAfter=6,
            textColor=colors.HexColor("#1a2332"),
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=base["Normal"],
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#5a6578"),
            spaceAfter=18,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontSize=16,
            leading=20,
            spaceBefore=16,
            spaceAfter=8,
            textColor=colors.HexColor("#1a2332"),
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontSize=12,
            leading=15,
            spaceBefore=12,
            spaceAfter=6,
            textColor=colors.HexColor("#2c3e50"),
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontSize=10.5,
            leading=14,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontSize=10.5,
            leading=14,
            leftIndent=14,
            spaceAfter=4,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontSize=9.5,
            leading=12,
            backColor=colors.HexColor("#f4f6f9"),
            borderColor=colors.HexColor("#d8dee8"),
            borderWidth=1,
            borderPadding=6,
            spaceAfter=10,
        ),
    }


def bullet(st, text):
    return Paragraph(f"• {text}", st["bullet"])


def troubleshooting_table():
    data = [
        ["Problem", "What to try"],
        [
            "Nothing happens when I drop a file",
            "Use the file picker instead. Confirm the file ends in .eml or .msg",
        ],
        [
            "“File too large” message",
            "The file exceeds the size limit. Contact IT if you routinely need larger files",
        ],
        [
            "Email layout looks wrong",
            "Some HTML emails render differently here than in Outlook. "
            "Compare with another viewer if needed",
        ],
        [
            "Extension missing after an update",
            "Open chrome://extensions and confirm PlatformEQ EML Viewer is enabled",
        ],
    ]
    t = Table(data, colWidths=[2.1 * inch, 4.3 * inch], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d8dee8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def build_pdf():
    st = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    story = []

    story.append(Paragraph("PlatformEQ EML Viewer", st["title"]))
    story.append(
        Paragraph(
            f"User guide — internal team · {date.today().strftime('%B %Y')}",
            st["subtitle"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#d8dee8")))
    story.append(Spacer(1, 12))

    story.append(Paragraph("What it is", st["h1"]))
    story.append(
        Paragraph(
            "PlatformEQ EML Viewer is a Chrome extension for opening "
            "<b>.eml</b> and Outlook <b>.msg</b> email files on your computer. "
            "Email content is read and displayed locally — it is not uploaded "
            "to a server for viewing.",
            st["body"],
        )
    )

    story.append(Paragraph("Installing", st["h1"]))
    for line in [
        "Open the link IT provides (Chrome Web Store internal app), or find "
        "<b>PlatformEQ EML Viewer</b> in your company’s Chrome extensions.",
        "Click <b>Add to Chrome</b>.",
        "Pin the extension icon on the toolbar (puzzle piece → pin).",
    ]:
        story.append(bullet(st, line))

    story.append(Paragraph("Opening an email", st["h1"]))
    story.append(Paragraph("Click the <b>PlatformEQ EML Viewer</b> icon in Chrome.", st["body"]))
    story.append(
        Paragraph("On the import screen, either:", st["body"]),
    )
    for line in [
        "<b>Drag and drop</b> an .eml or .msg file onto the drop zone, or",
        "<b>Click</b> the drop zone and choose a file from your computer.",
    ]:
        story.append(bullet(st, line))
    story.append(
        Paragraph(
            "Supported file types: <b>.eml</b>, <b>.msg</b>, <b>.txt</b>, <b>.mht</b>, "
            "<b>.mhtml</b>. The email opens in a new tab.",
            st["body"],
        )
    )

    story.append(Paragraph("Reading the email", st["h1"]))
    for line in [
        "<b>Header</b> — subject, from, to, cc (if any), and date.",
        "<b>Body</b> — HTML or plain text in the main reading area.",
        "<b>Inline images</b> included in the file display in the body when possible.",
        "<b>Links</b> in the email open in a new browser tab when you click them.",
    ]:
        story.append(bullet(st, line))

    story.append(Paragraph("Attachments", st["h1"]))
    for line in [
        "Attachments appear in a list below the header when present.",
        "<b>Images and PDFs</b> — click to preview in a new tab.",
        "<b>Other file types</b> — click to download to your computer.",
    ]:
        story.append(bullet(st, line))

    story.append(Paragraph("Opening another file", st["h1"]))
    story.append(
        Paragraph(
            'Click <b>Open another file</b> in the viewer toolbar to return to the import screen.',
            st["body"],
        )
    )

    story.append(Paragraph("Privacy and data", st["h1"]))
    for line in [
        "<b>Email content</b> (subject, body, attachments, names) stays on your computer "
        "while Chrome is open.",
        "When you <b>fully quit Chrome</b>, opened emails are removed from the extension’s "
        "local storage.",
        "The extension may send <b>usage statistics</b> to an internal PlatformEQ service "
        "(for example, whether an import succeeded and coarse file-size ranges). It does "
        "<b>not</b> send email subject, body, filenames, or attachment content.",
    ]:
        story.append(bullet(st, line))

    story.append(Paragraph("Limitations", st["h1"]))
    for line in [
        "<b>No reply, forward, or search</b> — view only.",
        "<b>Remote images</b> in HTML emails may not load (by design, for security).",
        "In some <b>Epic / remote desktop</b> setups, drag-and-drop from Epic may not work. "
        "Save the file to a shared location or use the extension inside the virtual session "
        "if IT recommends that.",
    ]:
        story.append(bullet(st, line))

    story.append(Paragraph("Troubleshooting", st["h1"]))
    story.append(troubleshooting_table())
    story.append(Spacer(1, 8))

    story.append(Paragraph("Getting help", st["h1"]))
    story.append(
        Paragraph(
            "Contact your IT team or PlatformEQ support with your Chrome version and a short "
            "description of the issue. You do not need to send email content.",
            st["body"],
        )
    )

    doc.build(story)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
