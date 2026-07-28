# PlatformEQ EML Viewer

Private Chrome extension for viewing `.eml` and Outlook `.msg` email files
locally. Built for internal team use (Epic/VDI workflows). Chrome Web Store:
https://chromewebstore.google.com/detail/dfhaanhlejilnnkbpabpdffhnecfhoam

Email content stays on the device. Usage telemetry (optional at build time)
records *how* the tool is used, never subject/body/filenames.

## Quick start

Requires Node.js 18+.

```bash
npm install
cp .env.local.example .env.local   # set telemetry URL + API key for Phase B
npm run package                    # dist/ + platformeq-eml-viewer.zip
```

Install in Chrome:

1. `chrome://extensions` → **Developer mode** on
2. **Load unpacked** → select the `dist/` folder (or unzip the zip first)
3. Click the toolbar icon → drop a `.eml` or `.msg` file

## Telemetry (Phase B)

When `VITE_TELEMETRY_URL` is set in `.env.local` at build time, the extension
flushes privacy-safe usage events to the GCP ingest service in
[`tools-gcp`](https://github.com/andrew-platformeq/tools-gcp) (`eml-viewer-telemetry`
→ BigQuery). See [docs/telemetry.md](docs/telemetry.md).

Flush triggers: browser startup, extension reload, and ~every 15 minutes.
QA can open the telemetry debug page via direct URL (see `HANDOFF.md`).

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Unit + integration tests |
| `npm run build` | Unpacked extension in `dist/` |
| `npm run package` | Build + `platformeq-eml-viewer.zip` |
| `npm run dev` | Vite dev server (extension HMR) |

## Docs

| Document | Contents |
|----------|----------|
| [HANDOFF.md](HANDOFF.md) | Install guide, Epic/VDI notes, IT rollout |
| [PLAN.md](PLAN.md) | Architecture and execution plan |
| [docs/EMAIL_TO_SELF.md](docs/EMAIL_TO_SELF.md) | Workspace Gmail send-to-self setup |
| [docs/telemetry.md](docs/telemetry.md) | Privacy model, events, Phase B checklist |
| [docs/user-manual.pdf](docs/user-manual.pdf) | End-user guide (`npm run docs:user-manual` to regenerate) |

## Related repo

Backend ingest, BigQuery bronze/gold, and Terraform live in
[andrew-platformeq/tools-gcp](https://github.com/andrew-platformeq/tools-gcp)
(`docs/EML_VIEWER_TELEMETRY.md`).

## Security

- Email HTML renders in a sandboxed iframe; no script execution
- No network access for email content
- Opened emails pruned on browser quit
- Telemetry blocklist rejects subject, body, filenames, and raw error strings
