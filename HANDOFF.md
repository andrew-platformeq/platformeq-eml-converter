# PlatformEQ EML Viewer — Internal Install Guide

A private Chrome extension for viewing `.eml` email files locally. **Email
content is never sent over the network** — the extension has no `host_permissions`
for browsing or fetching remote URLs, and opened emails are wiped when you fully
quit Chrome.

**Usage telemetry (Phase A):** the extension records *how* the tool is used (not
email content) into a local queue on the device. Nothing is transmitted until
Phase B enables a scoped GCP ingest endpoint. See [Usage telemetry](#usage-telemetry)
below.

> Not published to the Chrome Web Store — this is for internal team use only.

---

## Build from source

Requires Node.js (18+; built and tested on Node 26).

```bash
npm install        # first time only
npm test           # optional: run the unit + integration tests
npm run package    # builds dist/ and produces platformeq-eml-viewer.zip
```

- `npm run build` → unpacked extension in `dist/`
- `npm run package` → `dist/` **plus** a zipped `platformeq-eml-viewer.zip`

> Network note: this machine sits behind a TLS-inspecting proxy. npm is already
> configured to trust the macOS system CA bundle (`~/.npm-macos-ca.pem`). On a
> fresh machine that errors with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, export the
> system roots and `npm config set cafile <path>` (see project memory).

---

## Option A — Load unpacked (individual install)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right) on.
3. Click **Load unpacked** and select the **`dist/`** folder
   (or unzip `platformeq-eml-viewer.zip` and select the unzipped folder).
4. Pin the **PlatformEQ EML Viewer** icon to the toolbar.

To use: click the icon → drop a `.eml` file → it opens in a reader tab.

To update: rebuild, then click the **reload** ↻ icon on the extension card.

---

## Option B — Enterprise force-install (IT-managed fleet)

For managed devices, push the extension via policy instead of manual loading.

1. Host the packed extension (`.crx`) and an `update_manifest.xml` on an
   internal URL, **or** distribute the unpacked folder to a known path.
2. Add the extension ID to the **ExtensionInstallForcelist** policy
   (`chrome://policy` to verify it applied). On macOS this is delivered via a
   configuration profile / MDM (Jamf, Kandji, etc.):

   ```
   ExtensionInstallForcelist:
     - <extension-id>;<internal-update-manifest-url>
   ```

3. Force-installed extensions cannot be disabled by end users and auto-update
   from the internal update URL.

> Generating a stable extension ID + `.crx` requires a signing key
> (`chrome://extensions` → **Pack extension**, keep the `.pem` safe). Hand that
> off to IT once the team is happy with the build.

---

## Using this with Epic (Citrix / VDI environments)

**Diagnosed constraint:** when Epic runs in a remote Citrix/VDI session and the
extension runs in **local** Chrome, the virtualization boundary blocks **both
drag-and-drop and clipboard** for content originating in Epic. (Verified with
`tools/epic-drag-test.html` and `tools/epic-paste-test.html`: local clipboard
works; copy/drag *from Epic* delivers an empty payload.) No code on the local
side can reach Epic's data — the email must travel by a channel the VDI permits.
Two workable approaches:

### Path A — Run the extension inside the VDI (recommended)
Install the extension in the Chrome/Chromium that runs **in the same virtual
session as Epic**. With no boundary to cross, drag, paste, and the file picker
all work at full fidelity. Steps:
1. Confirm a Chromium-based browser is available inside the VDI image.
2. Force-install the extension there (see **Option B** above) or Load unpacked
   if the VDI Chrome allows Developer mode.
3. **Re-test in-session transfer first:** open `tools/epic-drag-test.html` and
   `tools/epic-paste-test.html` *inside the VDI* and drag/paste an Epic email.
   Confirm a file or HTML payload appears before rolling out.

### Path B — File channel (Epic "Save As" → file picker)
The built-in file picker works if (1) Epic can **export/Save As** the message or
attachment to a file, and (2) that file lands on a **redirected drive or shared
network location** reachable from local Chrome. Verify:
- Whether the email/attachment in Epic can be saved as `.eml` (chart attachments
  often can; In Basket messages often cannot).
- Whether a mapped/redirected drive (e.g. a home share) is visible from both the
  VDI and the local machine. If so: save to it from Epic, then open it with the
  extension's file picker.

### Quick checklist for IT
- [ ] Is a Chromium browser available **inside** the Epic VDI session?
- [ ] Can an unlisted/internal extension be force-installed in that browser?
- [ ] Can Epic export the email/attachment to a file, and to where?
- [ ] Is any drive/folder redirected and visible to both VDI and local machine?

---

## What it does / doesn't do

| | |
|---|---|
| ✅ Reads `.eml` (and `.txt`/`.mht`) locally | ❌ No `.msg` (Outlook binary) — out of scope |
| ✅ Renders HTML safely in a locked sandbox | ❌ No reply / forward / search |
| ✅ Inline images, attachment preview/download | ❌ No remote/cloud fetch for email content |
| ✅ Forgets emails on browser close | ❌ Not on the Chrome Web Store |
| ✅ Local usage telemetry queue (Phase A) | ❌ Email subject/body/filenames never logged |

---

## Usage telemetry

Internal usage telemetry helps the team understand adoption, reliability, and
workflow patterns (e.g. drag-and-drop vs file picker in Epic/VDI). It is
**separate from email content** — the privacy model below is intentional for
healthcare/Epic contexts.

### Phase A (current) — local queue only

- Events are written to `chrome.storage.local` under the key `telemetry_queue`.
- **No network calls** — `flush()` is a no-op until a GCP ingest URL is configured.
- Still **no `host_permissions`** in the manifest.

### Phase B (implemented) — GCP ingest

- Scoped `host_permissions` for one internal Cloud Run ingest URL only (injected at build time from `VITE_TELEMETRY_URL`).
- Batch-flush queued events to BigQuery bronze via `eml-viewer-telemetry` service; gold views in `platformeq-tools`.
- Build-time env: `VITE_TELEMETRY_URL`, `VITE_TELEMETRY_API_KEY` (see `.env.local.example`).
- Service worker flushes on startup and every ~15 minutes when URL is configured.

### What is collected

| Collected | Examples |
|-----------|----------|
| Who (identified) | Work email from Chrome profile (`chrome.identity`), stable `install_id`, per-session `session_id` |
| Tool context | Extension version, Chrome version, OS platform |
| Flow metadata | Import method (`drop` / `picker`), preview type, success/fail, parse duration |
| Coarse buckets | File size band, attachment count band, MIME category, body type (`html` / `text` / …) |
| Content fingerprint | SHA-256 hash of **raw file bytes** (`content_fingerprint`) — same file → same hash; lets you count repeat opens without logging filename or subject |

### What is never collected

- Email subject, from/to/cc, body, or dates
- Filenames or attachment names
- `mailId` or raw error messages (only stable `error_code` enums)
- Any parsed email content

The fingerprint is an opaque ID: it does not reveal message text, but someone
who holds the original `.eml` could compute the same hash and match a row. Treat
as pseudonymous usage data, not reversible content.

### Events instrumented

| Event | When |
|-------|------|
| `extension_opened` | Toolbar icon clicked |
| `session_reconciled` | Background prune on startup/install |
| `import_rejected` | Wrong extension or file too large |
| `import_started` | File accepted, parse begins |
| `import_succeeded` | Mail saved and viewer opened |
| `import_failed` | Parse or storage error |
| `viewer_opened` | Viewer tab loads |
| `attachment_opened` | Attachment tab loads |
| `attachment_downloaded` | Download link clicked |

`content_fingerprint` is included on `import_started`, `import_succeeded`, and
`import_failed` (once the file bytes have been read).

### Permissions added for telemetry

```json
"permissions": ["storage", "identity", "identity.email"]
```

Identity uses **Scenario A**: users sign into Chrome with work Google (Okta→Google
federation). No Okta login inside the extension. IT controls who gets the
extension via MDM force-install (Option B above).

### Inspecting the queue locally (QA)

1. Rebuild and reload the extension from `dist/`.
2. Open the telemetry debug page:
   - Import page → **Open telemetry debug** (footer link), or
   - `chrome-extension://<extension-id>/src/pages/debug/telemetry.html`
3. Use the tool in another tab; click **Refresh** on the debug page to see queued JSON.
4. Confirm the Network tab shows **no outbound requests** (Phase A).

Implementation: `src/lib/telemetry.js`. Tests: `test/telemetry.test.js`. Further
detail: `docs/telemetry.md` and `docs/phase-a-telemetry-report.pdf`.

---

## Security model (one-paragraph version)

The email body renders in a `sandbox`ed iframe with **no script execution** and
**no same-origin access**, inside its own restrictive CSP (`default-src 'none';
img-src data:`). Scripts can't run, tracking pixels can't load, and the email
can't reach cookies, storage, or the network. HTML is also sanitized before
storage as defense-in-depth. Email bodies are never included in telemetry.
See `PLAN.md`, `docs/telemetry.md`, and `docs/milestone-2.pdf` for detail.
