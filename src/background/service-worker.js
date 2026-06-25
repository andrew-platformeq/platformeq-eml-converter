// Service worker:
//  - routes the toolbar click to the import page
//  - reconciles IndexedDB against the session registry so emails do not
//    survive a browser restart (see lib/mail-session.js for the rationale)
//  - Phase B: periodic telemetry flush when VITE_TELEMETRY_URL is set at build time

import { getAllMailsMeta, deleteMail } from '../lib/storage.js';
import { listSessionMailIds } from '../lib/mail-session.js';
import { MAIL_TTL_MS } from '../lib/constants.js';
import { track, flush } from '../lib/telemetry.js';

const FLUSH_ALARM = 'telemetry-flush';
const FLUSH_PERIOD_MINUTES = 15;
const telemetryEnabled = Boolean(import.meta.env.VITE_TELEMETRY_URL);

chrome.action.onClicked.addListener(() => {
  track('extension_opened');
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/pages/import/import.html'),
  });
});

/**
 * Delete IndexedDB mails that are either (a) not present in the session
 * registry — which happens after a browser restart, when session storage has
 * been cleared but IndexedDB persists — or (b) older than the TTL.
 */
async function reconcile(now) {
  const [mails, sessionIds] = await Promise.all([
    getAllMailsMeta(),
    listSessionMailIds(),
  ]);
  const live = new Set(sessionIds);
  const stale = mails.filter((m) => {
    const orphaned = !live.has(m.mailId);
    const expired = typeof m.createdAt === 'number' && now - m.createdAt > MAIL_TTL_MS;
    return orphaned || expired;
  });
  await Promise.all(stale.map((m) => deleteMail(m.mailId)));
  if (stale.length) {
    console.debug(`[eml-viewer] reconcile: pruned ${stale.length} stale mail(s)`);
    track('session_reconciled', { pruned_count: stale.length });
  }
}

async function setupTelemetryFlush() {
  if (!telemetryEnabled) return;
  try {
    const result = await flush();
    if (result.sent > 0) {
      console.debug(`[eml-viewer] telemetry flush sent ${result.sent} event(s)`);
    }
  } catch (err) {
    console.debug('[eml-viewer] telemetry startup flush failed', err);
  }
  await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_PERIOD_MINUTES });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM && telemetryEnabled) {
    flush();
  }
});

async function onLifecycle() {
  await reconcile(Date.now());
  await setupTelemetryFlush();
}

// Browser start = fresh session registry (empty) => prunes all prior emails.
chrome.runtime.onStartup.addListener(() => onLifecycle());
// Install/update: clean slate too.
chrome.runtime.onInstalled.addListener(() => onLifecycle());
