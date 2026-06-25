# Usage telemetry reference

Internal usage telemetry for PlatformEQ EML Viewer. This document describes
what is implemented today (Phase A), what is planned (Phase B+), and how to
verify behavior locally.

For install and IT rollout context, see [HANDOFF.md](../HANDOFF.md). For
architecture placement in the repo, see [PLAN.md](../PLAN.md) §8.

---

## Goals

Understand **how** the team uses the tool — not **what** is in the emails:

- Adoption (who opens the tool, how often)
- Reliability (import success rate, error codes, parse latency)
- Epic/VDI workflows (drag-and-drop vs file picker)
- Repeat usage (same `.eml` opened multiple times via content fingerprint)

---

## Phases

| Phase | Status | Behavior |
|-------|--------|----------|
| **A** | Implemented | Instrument all flows; queue events in `chrome.storage.local`; **no network** |
| **B** | Implemented | Cloud Run ingest → BigQuery bronze; scoped `host_permissions`; periodic flush |
| **C** | Planned | Governance docs, opt-out policy, team announcement before production flush |
| **D** | Deferred | In-extension Okta login (only if too many `unknown` users) |

---

## Privacy model

### Never logged

- Email subject, from/to/cc, body, dates
- Filenames or attachment names
- `mailId` or parsed content
- Raw error strings (only `error_code` enums: `parse_error`, `storage_error`, `unknown`)

### Logged

| Field | Purpose |
|-------|---------|
| `user_email` | Chrome profile email (Okta→Google Scenario A) |
| `identity_source` | `chrome` or `unknown` |
| `install_id` | Stable UUID per extension install |
| `session_id` | UUID per browser session |
| `extension_version`, `chrome_version`, `platform` | Environment context |
| Coarse buckets | `file_size_bucket`, `attachment_count_bucket`, `mime_category`, `body_type` |
| Flow metadata | `method` (drop/picker), `preview_type`, `parse_ms`, `error_code`, etc. |
| `content_fingerprint` | SHA-256 hex of **raw file bytes** at import |

### Content fingerprint

Same bytes → same 64-character hex hash. Different files → different hashes
(with overwhelming probability).

- Does **not** expose filename, subject, or body text.
- **Is** linkable if someone holds the original file and computes SHA-256 offline.
- Used to answer: “How many unique emails vs total imports?” and “Is this user
  re-opening the same file repeatedly?”

Forbidden keys are blocked at runtime by `assertSafeProperties()` in
`src/lib/telemetry.js`.

---

## Storage

| Key | API | Survives browser quit? |
|-----|-----|------------------------|
| `telemetry_queue` | `chrome.storage.local` | Yes (until flushed or pruned) |
| `telemetry_install_id` | `chrome.storage.local` | Yes |
| `telemetry_session_id` | `chrome.storage.session` | No |

Queue limits: **500 events** max; events older than **7 days** dropped on write.

Email bodies remain in IndexedDB (`eml-viewer`) — separate from telemetry.

---

## Events

| Event | Trigger | Notable properties |
|-------|---------|-------------------|
| `extension_opened` | Toolbar click | — |
| `session_reconciled` | Startup/install prune | `pruned_count` |
| `import_rejected` | Bad extension or too large | `reason`: `bad_extension` \| `too_large` |
| `import_started` | File accepted | `method`, `file_ext`, `file_size_bucket`, `content_fingerprint` |
| `import_succeeded` | Saved + viewer opened | `parse_ms`, `body_type`, `attachment_count_bucket`, `inline_image_count`, `has_pdf`, `content_fingerprint` |
| `import_failed` | Parse/storage error | `error_code`, `content_fingerprint` (if bytes were read) |
| `viewer_opened` | Viewer loads | `body_type`, `attachment_count_bucket` |
| `attachment_opened` | Attachment tab loads | `preview_type`, `mime_category` |
| `attachment_downloaded` | Download clicked | `mime_category` |

### Example envelope

```json
{
  "event": "import_succeeded",
  "ts": "2026-06-23T19:35:51.224Z",
  "user_email": "jane@platformeq.com",
  "identity_source": "chrome",
  "install_id": "6733d244-539b-4daa-81d9-c02d0c5217db",
  "session_id": "3bb0202d-3f42-4eb0-885b-b30fdb5dff35",
  "extension_version": "0.1.0",
  "chrome_version": "149.0.0.0",
  "platform": "MacIntel",
  "properties": {
    "content_fingerprint": "8f3a2b1c…",
    "method": "picker",
    "file_ext": ".eml",
    "file_size_bucket": "0-100kb",
    "parse_ms": 15,
    "body_type": "text",
    "attachment_count_bucket": "1-3",
    "inline_image_count": 0,
    "has_pdf": false
  }
}
```

---

## Source files

| File | Role |
|------|------|
| `src/lib/telemetry.js` | `track()`, `flush()`, bucketing, fingerprint, queue |
| `src/background/service-worker.js` | `extension_opened`, `session_reconciled` |
| `src/pages/import/import.js` | Import events + fingerprint |
| `src/pages/viewer/viewer.js` | `viewer_opened` |
| `src/pages/attachment/attachment.js` | Attachment events |
| `src/pages/debug/telemetry.html` | Local queue inspector (QA) |
| `test/telemetry.test.js` | Unit tests (39 total in suite) |

---

## Local verification

1. `npm run build`
2. Reload extension at `chrome://extensions` from `dist/`
3. Open debug page:
   ```
   chrome-extension://<extension-id>/src/pages/debug/telemetry.html
   ```
   Or: import page → **Open telemetry debug** (footer link)
4. Use the tool; click **Refresh** on the debug page
5. DevTools → **Network**: confirm **no outbound requests** (Phase A)
6. Import the same `.eml` twice → same `content_fingerprint` on both runs

---

## Phase B checklist (infra repo)

- [x] Cloud Run HTTPS ingest with API key validation (`eml-viewer-telemetry` service)
- [x] Bronze landing (BigQuery `eml_viewer_bronze.events`)
- [x] Gold views (DAU, import success rate, repeat-file ratio)
- [x] Extension CI: `VITE_TELEMETRY_URL`, `VITE_TELEMETRY_API_KEY` (manual `.env.local` for dev)
- [x] Manifest: scoped `host_permissions` for ingest URL only (injected at build time)
- [x] Service worker: `chrome.alarms` flush (~15 min) + flush on startup

See `platformeq-tools/docs/EML_VIEWER_TELEMETRY.md` for deploy and `.env.local.example` in this repo for dev builds.

---

## Analytics examples (gold layer)

```sql
-- Distinct files vs total imports (last 7 days)
SELECT
  COUNT(*) AS total_imports,
  COUNT(DISTINCT JSON_VALUE(properties, '$.content_fingerprint')) AS unique_files
FROM bronze.eml_viewer_events
WHERE event = 'import_succeeded';

-- Users re-opening the same file 3+ times
SELECT user_email, JSON_VALUE(properties, '$.content_fingerprint') AS fp, COUNT(*) AS opens
FROM bronze.eml_viewer_events
WHERE event = 'import_succeeded'
GROUP BY 1, 2
HAVING opens >= 3;
```

(Exact table/column names depend on your medallion bronze schema.)

---

## Identity (Scenario A)

- Users sign into Chrome with work Google (federated via Okta).
- Extension reads email via `chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' })`.
- IT controls access via MDM force-install — no separate login in the extension.

If Chrome is not signed in: `user_email: unknown`, events still tagged with `install_id`.
