#!/usr/bin/env python3
"""Generate Phase A telemetry implementation report as PDF."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "phase-a-telemetry-report.pdf"


def build_styles():
    base = getSampleStyleSheet()
    styles = {
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
            bulletIndent=0,
            spaceAfter=4,
        ),
        "code": ParagraphStyle(
            "CodeBlock",
            parent=base["Code"],
            fontSize=8.5,
            leading=11,
            backColor=colors.HexColor("#f4f6f9"),
            borderColor=colors.HexColor("#d8dee8"),
            borderWidth=1,
            borderPadding=8,
            spaceAfter=10,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base["Normal"],
            fontSize=8,
            textColor=colors.HexColor("#8a94a6"),
        ),
    }
    return styles


def bullet(st, text):
    return Paragraph(f"• {text}", st["bullet"])


def table(data, col_widths=None):
    t = Table(data, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1a2332")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d8dee8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    st = build_styles()
    story = []

    # --- Cover / summary ---
    story.append(Paragraph("PlatformEQ EML Viewer", st["title"]))
    story.append(Paragraph("Phase A Telemetry — Implementation Report", st["title"]))
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            f"Generated {date.today().strftime('%B %d, %Y')} · Extension v0.1.0",
            st["subtitle"],
        )
    )
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#d8dee8")))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph("Executive summary", st["h1"]))
    story.append(
        Paragraph(
            "Phase A adds a privacy-safe usage diary to the Chrome extension. When team members "
            "open the tool, import an email, or view an attachment, the extension records a short "
            "note about <i>that action</i> — not about the email content. Notes are saved locally "
            "in the browser until a future phase sends them to GCP.",
            st["body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Important:</b> No network calls are made in Phase A. The extension still has zero "
            "<code>host_permissions</code>. Events accumulate in local storage only.",
            st["body"],
        )
    )

    story.append(Paragraph("What changed at a glance", st["h2"]))
    for item in [
        "Core module: <code>src/lib/telemetry.js</code> (queue, bucketing, SHA-256 fingerprint)",
        "Manifest: <code>identity</code> and <code>identity.email</code> permissions",
        "Nine event types across service worker, import, viewer, attachment pages",
        "Dedicated QA page: <code>src/pages/debug/telemetry.html</code>",
        "Documentation: <code>HANDOFF.md</code>, <code>PLAN.md</code> §8, <code>docs/telemetry.md</code>",
        "13 unit tests in <code>test/telemetry.test.js</code> (39 total in suite)",
    ]:
        story.append(bullet(st, item))

    story.append(PageBreak())

    # --- Goals ---
    story.append(Paragraph("1. Goals and scope", st["h1"]))
    story.append(
        Paragraph(
            "Phase A implements the local half of the telemetry plan: capture identified usage "
            "events, buffer them on disk, and enforce strict privacy guardrails. Sending data to "
            "GCP (Phase B), periodic flush alarms, and HANDOFF governance updates are explicitly "
            "out of scope for this phase.",
            st["body"],
        )
    )

    story.append(Paragraph("In scope (Phase A)", st["h2"]))
    for item in [
        "Event tracking module with local queue",
        "Chrome profile identity (work email via Okta→Google)",
        "Instrumentation of all planned user flows",
        "Coarse bucketing helpers (file size, attachment count, MIME category)",
        "SHA-256 <code>content_fingerprint</code> on import events (repeat-file analytics)",
        "Forbidden-key validation to block PHI-risk fields",
        "Unit tests for pure helper functions",
    ]:
        story.append(bullet(st, item))

    story.append(Paragraph("Deferred to later phases", st["h2"]))
    for item in [
        "<b>Phase B:</b> GCP Cloud Run ingest, <code>host_permissions</code>, build-time URL/API key, periodic flush",
        "<b>Phase C:</b> Opt-out policy, team announcement before production flush (HANDOFF updated)",
        "<b>Phase D:</b> In-extension Okta login (only if too many unknown users)",
    ]:
        story.append(bullet(st, item))

    # --- Privacy ---
    story.append(Paragraph("2. Privacy model", st["h1"]))
    story.append(
        Paragraph(
            "The extension handles Epic/healthcare email locally. Telemetry must never capture "
            "message content or identifiers that could contain patient information.",
            st["body"],
        )
    )

    story.append(Paragraph("Never collected", st["h2"]))
    for item in [
        "Email subject, from/to/cc, body, or dates",
        "Filenames or attachment names",
        "mailId, subject text, or parsed email body",
        "Raw error messages (only stable error_code enums)",
    ]:
        story.append(bullet(st, item))

    story.append(Paragraph("Safe to collect", st["h2"]))
    for item in [
        "Corporate email from Chrome profile (<code>chrome.identity.getProfileUserInfo</code>)",
        "Extension version, Chrome version, OS platform",
        "Coarse buckets: file size band, attachment count band, MIME category",
        "Flow metadata: import method (drop vs picker), preview type, success/fail codes",
        "Parse duration in milliseconds",
        "<code>content_fingerprint</code>: SHA-256 hex of raw file bytes (same file → same hash)",
    ]:
        story.append(bullet(st, item))

    story.append(
        Paragraph(
            "The fingerprint is an opaque ID — not filename or subject — but linkable if someone "
            "holds the original file. A runtime guard (<code>assertSafeProperties</code>) rejects "
            "forbidden keys such as <code>subject</code>, <code>filename</code>, or <code>body</code>.",
            st["body"],
        )
    )

    story.append(PageBreak())

    # --- Architecture ---
    story.append(Paragraph("3. Architecture", st["h1"]))
    story.append(
        Paragraph(
            "Usage notes are written by extension pages and the background service worker. "
            "All notes land in a single array stored under the key <code>telemetry_queue</code> "
            "in <code>chrome.storage.local</code>, which persists across browser restarts.",
            st["body"],
        )
    )

    story.append(
        Preformatted(
            """User action (import page, viewer, etc.)
        │
        ▼
   track(event, properties)
        │ enrich with identity + context
        │ validate properties (no forbidden keys)
        ▼
   chrome.storage.local["telemetry_queue"]
        │
        ▼ (Phase B only, when URL configured)
   flush() → HTTPS POST → GCP bronze layer""",
            st["code"],
        )
    )

    story.append(Paragraph("Storage layout", st["h2"]))
    story.append(
        table(
            [
                ["Key", "Storage", "Purpose"],
                ["telemetry_queue", "chrome.storage.local", "Array of event envelopes awaiting flush"],
                ["telemetry_install_id", "chrome.storage.local", "Stable UUID per extension install"],
                ["telemetry_session_id", "chrome.storage.session", "UUID per browser session (clears on quit)"],
            ],
            col_widths=[1.6 * inch, 1.5 * inch, 3.4 * inch],
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Queue limits", st["h2"]))
    for item in [
        "Maximum 500 events — oldest dropped on overflow",
        "Maximum age 7 days — stale events pruned on each write",
        "<code>track()</code> never throws — failures log to console.debug only",
    ]:
        story.append(bullet(st, item))

    story.append(PageBreak())

    # --- Event envelope ---
    story.append(Paragraph("4. Event envelope", st["h1"]))
    story.append(
        Paragraph(
            "Every tracked event is wrapped in a consistent JSON envelope before being appended "
            "to the queue:",
            st["body"],
        )
    )
    story.append(
        Preformatted(
            """{
  "event": "import_succeeded",
  "ts": "2026-06-23T12:00:00.000Z",
  "user_email": "jane@company.com",
  "identity_source": "chrome",
  "install_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "extension_version": "0.1.0",
  "chrome_version": "131.0.6778.86",
  "platform": "MacIntel",
    "properties": {
    "content_fingerprint": "8f3a2b1c…",
    "method": "drop",
    "parse_ms": 142,
    "body_type": "html",
    "attachment_count_bucket": "1-3",
    "inline_image_count": 2,
    "has_pdf": false
  }
}""",
            st["code"],
        )
    )

    story.append(Paragraph("Identity (Scenario A — confirmed)", st["h2"]))
    story.append(
        Paragraph(
            "Users sign into Chrome with their work Google account (federated through Okta). "
            "The extension reads <code>user_email</code> from the Chrome profile — no Okta API "
            "calls. If Chrome is not signed in, events use <code>user_email: unknown</code> and "
            "<code>identity_source: unknown</code>, with a stable <code>install_id</code> as fallback.",
            st["body"],
        )
    )

    # --- Events table ---
    story.append(Paragraph("5. Events instrumented", st["h1"]))
    story.append(
        table(
            [
                ["Event", "Trigger", "Key properties"],
                ["extension_opened", "Toolbar icon clicked", "—"],
                ["session_reconciled", "Background prune on startup/install", "pruned_count"],
                ["import_rejected", "Wrong extension or file too large", "reason: bad_extension | too_large"],
                ["import_started", "File accepted, parse begins", "method, file_ext, file_size_bucket, content_fingerprint"],
                [
                    "import_succeeded",
                    "Mail saved and viewer opened",
                    "parse_ms, body_type, attachment_count_bucket, inline_image_count, has_pdf, content_fingerprint",
                ],
                ["import_failed", "Parse or storage error", "error_code, content_fingerprint (if bytes read)"],
                ["viewer_opened", "Viewer page loads", "body_type, attachment_count_bucket"],
                ["attachment_opened", "Attachment tab loads", "preview_type, mime_category"],
                ["attachment_downloaded", "Download link clicked", "mime_category"],
            ],
            col_widths=[1.25 * inch, 2.0 * inch, 3.25 * inch],
        )
    )

    story.append(PageBreak())

    # --- Files changed ---
    story.append(Paragraph("6. Files changed", st["h1"]))

    story.append(Paragraph("New files", st["h2"]))
    story.append(
        table(
            [
                ["File", "Description"],
                ["src/lib/telemetry.js", "track(), flush(), bucketing, computeContentFingerprint(), queue"],
                ["src/pages/debug/telemetry.html", "Dedicated local queue inspector (QA)"],
                ["test/telemetry.test.js", "13 unit tests for helpers, fingerprint, forbidden-key guard"],
                ["docs/telemetry.md", "Full telemetry reference"],
                ["HANDOFF.md", "Install guide + telemetry summary for IT/compliance"],
            ],
            col_widths=[2.2 * inch, 4.3 * inch],
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Modified files", st["h2"]))
    story.append(
        table(
            [
                ["File", "Changes"],
                [
                    "manifest.json",
                    "Added permissions: identity, identity.email (no host_permissions)",
                ],
                [
                    "src/background/service-worker.js",
                    "track extension_opened on toolbar click; track session_reconciled after prune",
                ],
                ["src/pages/import/import.js", "Import events + content_fingerprint; link to debug page"],
                [
                    "src/pages/viewer/viewer.js",
                    "track viewer_opened with body_type and attachment_count_bucket",
                ],
                [
                    "src/pages/attachment/attachment.js",
                    "track attachment_opened and attachment_downloaded",
                ],
            ],
            col_widths=[2.2 * inch, 4.3 * inch],
        )
    )

    # --- Helpers ---
    story.append(Paragraph("7. Bucketing helpers", st["h1"]))
    story.append(
        table(
            [
                ["Helper", "Input", "Output bands"],
                ["fileSizeBucket(bytes)", "File size in bytes", "0-100kb, 100kb-1mb, 1-10mb, 10mb+"],
                ["attachmentCountBucket(count)", "Non-inline attachment count", "0, 1-3, 4-10, 10+"],
                ["mimeCategory(mimeType)", "MIME type string", "image/*, application/pdf, other"],
                ["deriveBodyType({hasHtml, text})", "Mail body flags", "html, text, empty, both"],
                ["safeFileExtension(name)", "Filename", "Extension only (e.g. .eml), never full name"],
                ["computeContentFingerprint(bytes)", "Raw file ArrayBuffer", "64-char SHA-256 hex"],
            ],
            col_widths=[1.8 * inch, 1.5 * inch, 3.2 * inch],
        )
    )

    story.append(PageBreak())

    # --- Testing ---
    story.append(Paragraph("8. Testing and verification", st["h1"]))
    story.append(Paragraph("Automated tests", st["h2"]))
    story.append(
        Paragraph(
            "Run <code>npm test</code>. The telemetry test file covers bucketing, body-type derivation, "
            "content fingerprint stability, safe file extension extraction, forbidden-key rejection, and "
            "queue pruning. Total: 39 tests, all passing.",
            st["body"],
        )
    )

    story.append(Paragraph("Manual verification in Chrome", st["h2"]))
    for step, text in enumerate(
        [
            "Reload the extension at chrome://extensions",
            "Open chrome-extension://&lt;id&gt;/src/pages/debug/telemetry.html (or footer link on import page)",
            "Use the tool: click icon, import a .eml twice, open an attachment",
            "Refresh the debug page — confirm content_fingerprint matches on repeat imports",
            "Confirm no network requests in DevTools Network tab",
        ],
        start=1,
    ):
        story.append(bullet(st, f"{step}. {text}"))

    story.append(Paragraph("Build output", st["h2"]))
    story.append(
        Paragraph(
            "<code>npm run build</code> produces a bundled <code>telemetry-*.js</code> chunk (~4.4 KB "
            "gzip ~1.9 KB) shared across import, viewer, attachment, and service worker pages.",
            st["body"],
        )
    )

    # --- Next steps ---
    story.append(Paragraph("9. Next steps (Phase B)", st["h1"]))
    for item in [
        "Deploy Cloud Run ingest endpoint in the GCP/medallion infra repo",
        "Land raw events in bronze (GCS or BigQuery — match existing medallion pattern)",
        "Add <code>VITE_TELEMETRY_URL</code> and <code>VITE_TELEMETRY_API_KEY</code> to extension build/CI",
        "Add scoped <code>host_permissions</code> for the Cloud Run URL only",
        "Wire <code>chrome.alarms</code> in the service worker for periodic flush (~15 min) and flush on startup",
        "Add silver/gold transforms for dashboards (DAU, import success rate, drop vs picker ratio)",
    ]:
        story.append(bullet(st, item))

    story.append(Spacer(1, 0.3 * inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#d8dee8")))
    story.append(Spacer(1, 0.08 * inch))
    story.append(
        Paragraph(
            "PlatformEQ EML Viewer · Phase A Telemetry Report · Internal use only",
            st["footer"],
        )
    )

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Phase A Telemetry Implementation Report",
        author="PlatformEQ EML Viewer",
    )
    doc.build(story)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
