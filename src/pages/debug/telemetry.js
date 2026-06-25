import { readTelemetryQueue, clearTelemetryQueue, flush } from '../../lib/telemetry.js';

const summaryEl = document.getElementById('telemetry-summary');
const jsonEl = document.getElementById('telemetry-json');
const modeEl = document.getElementById('telemetry-mode');
const flushBtn = document.getElementById('telemetry-flush');
const flushStatusEl = document.getElementById('telemetry-flush-status');

const telemetryEnabled = Boolean(import.meta.env.VITE_TELEMETRY_URL);

document.getElementById('back-import').href = chrome.runtime.getURL(
  'src/pages/import/import.html'
);

function setFlushStatus(message, isError = false) {
  flushStatusEl.hidden = !message;
  flushStatusEl.textContent = message;
  flushStatusEl.classList.toggle('flush-status--error', isError);
}

function setupModeBanner() {
  if (telemetryEnabled) {
    modeEl.textContent =
      'Phase B — events queue locally and flush to the GCP ingest endpoint on a schedule or when you click Flush now.';
    flushBtn.hidden = false;
    return;
  }
  modeEl.textContent =
    'Phase A — local queue only. Set VITE_TELEMETRY_URL in .env.local and rebuild to enable flush.';
}

async function render() {
  const queue = await readTelemetryQueue();
  const events = queue.map((e) => e.event);
  const latest = queue[queue.length - 1];

  summaryEl.innerHTML = `
    <dt>Events queued</dt><dd>${queue.length}</dd>
    <dt>Event types</dt><dd>${events.length ? events.join(', ') : '(none)'}</dd>
    <dt>Latest user</dt><dd>${latest?.user_email || '—'}</dd>
    <dt>Identity source</dt><dd>${latest?.identity_source || '—'}</dd>
    <dt>Install id</dt><dd>${latest?.install_id || '—'}</dd>
    <dt>Ingest URL</dt><dd>${telemetryEnabled ? import.meta.env.VITE_TELEMETRY_URL : '(not configured)'}</dd>
  `;
  jsonEl.textContent = JSON.stringify(queue, null, 2);
}

document.getElementById('telemetry-refresh').addEventListener('click', () => {
  render().catch(console.error);
});
document.getElementById('telemetry-clear').addEventListener('click', async () => {
  await clearTelemetryQueue();
  setFlushStatus('');
  await render();
});
flushBtn.addEventListener('click', async () => {
  flushBtn.disabled = true;
  setFlushStatus('Flushing…');
  try {
    const result = await flush();
    if (result.skipped) {
      setFlushStatus('Flush skipped — ingest URL not configured at build time.');
    } else if (result.sent > 0) {
      setFlushStatus(`Sent ${result.sent} event(s) to ingest.`);
    } else {
      setFlushStatus(result.error || 'Nothing to flush (queue empty).', Boolean(result.error));
    }
    await render();
  } catch (err) {
    setFlushStatus(`Flush failed: ${err.message}`, true);
  } finally {
    flushBtn.disabled = false;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.telemetry_queue) {
    render().catch(console.error);
  }
});

setupModeBanner();
render().catch((err) => {
  console.error('[eml-viewer] telemetry debug failed', err);
  jsonEl.textContent = `Error: ${err.message}`;
});
