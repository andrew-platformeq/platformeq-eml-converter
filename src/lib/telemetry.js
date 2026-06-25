// Privacy-safe usage telemetry: events queue locally in chrome.storage.local.
// Network flush is a no-op until VITE_TELEMETRY_URL is set (Phase B).

const QUEUE_KEY = 'telemetry_queue';
const INSTALL_ID_KEY = 'telemetry_install_id';
const SESSION_ID_KEY = 'telemetry_session_id';

export const MAX_QUEUE_EVENTS = 500;
export const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Property keys that must never appear in telemetry (PHI / content risk). */
export const FORBIDDEN_PROPERTY_KEYS = new Set([
  'subject',
  'from',
  'to',
  'cc',
  'body',
  'filename',
  'mailid',
  'mail_id',
  'attachmentid',
  'attachment_id',
  'content',
  'html',
  'text',
  'message',
  'stack',
  'err',
  'error',
]);

/**
 * @param {number} bytes
 * @returns {'0-100kb' | '100kb-1mb' | '1-10mb' | '10mb+'}
 */
export function fileSizeBucket(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 100 * 1024) return '0-100kb';
  if (n <= 1024 * 1024) return '100kb-1mb';
  if (n <= 10 * 1024 * 1024) return '1-10mb';
  return '10mb+';
}

/**
 * @param {number} count
 * @returns {'0' | '1-3' | '4-10' | '10+'}
 */
export function attachmentCountBucket(count) {
  const n = Number(count) || 0;
  if (n === 0) return '0';
  if (n <= 3) return '1-3';
  if (n <= 10) return '4-10';
  return '10+';
}

/**
 * Coarse MIME category — no filenames or full content types with PII.
 * @param {string} mimeType
 * @returns {'image/*' | 'application/pdf' | 'other'}
 */
export function mimeCategory(mimeType) {
  const type = (mimeType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image/*';
  if (type === 'application/pdf') return 'application/pdf';
  return 'other';
}

/**
 * @param {{ hasHtml?: boolean, text?: string }} mail
 * @returns {'html' | 'text' | 'empty' | 'both'}
 */
export function deriveBodyType({ hasHtml, text }) {
  const html = Boolean(hasHtml);
  const plain = Boolean(text && String(text).trim());
  if (html && plain) return 'both';
  if (html) return 'html';
  if (plain) return 'text';
  return 'empty';
}

/**
 * Extract a safe file extension (e.g. `.eml`) — never the full filename.
 * @param {string} name
 * @returns {string}
 */
export function safeFileExtension(name) {
  const lower = (name || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'unknown';
  const ext = lower.slice(dot);
  return ext.length <= 8 ? ext : 'unknown';
}

/**
 * SHA-256 hex fingerprint of raw file bytes. Same file => same fingerprint.
 * Opaque ID only — not filename, subject, or body. Linkable if someone holds the original file.
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<string>}
 */
export async function computeContentFingerprint(data) {
  const buffer =
    data instanceof ArrayBuffer
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Drop events older than MAX_QUEUE_AGE_MS, then cap length to MAX_QUEUE_EVENTS.
 * @param {object[]} events
 * @param {number} [now]
 */
export function pruneQueue(events, now = Date.now()) {
  const cutoff = now - MAX_QUEUE_AGE_MS;
  const fresh = events.filter((e) => {
    const ts = Date.parse(e.ts);
    return Number.isFinite(ts) && ts >= cutoff;
  });
  if (fresh.length <= MAX_QUEUE_EVENTS) return fresh;
  return fresh.slice(fresh.length - MAX_QUEUE_EVENTS);
}

/**
 * @param {object} properties
 * @returns {object}
 */
export function assertSafeProperties(properties) {
  if (!properties || typeof properties !== 'object') return {};
  const safe = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_PROPERTY_KEYS.has(key.toLowerCase())) {
      throw new Error(`telemetry: forbidden property key "${key}"`);
    }
    if (value !== undefined && value !== null) {
      safe[key] = value;
    }
  }
  return safe;
}

function parseChromeVersion(userAgent) {
  const match = (userAgent || '').match(/Chrome\/([\d.]+)/);
  return match ? match[1] : 'unknown';
}

let cachedUserContext = null;

async function getUserContext() {
  if (cachedUserContext) return cachedUserContext;
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    if (info?.email) {
      cachedUserContext = { user_email: info.email, identity_source: 'chrome' };
    } else {
      cachedUserContext = { user_email: 'unknown', identity_source: 'unknown' };
    }
  } catch {
    cachedUserContext = { user_email: 'unknown', identity_source: 'unknown' };
  }
  return cachedUserContext;
}

async function getInstallId() {
  const stored = await chrome.storage.local.get(INSTALL_ID_KEY);
  if (stored[INSTALL_ID_KEY]) return stored[INSTALL_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id });
  return id;
}

/** Per browser session — lives in session storage (clears on browser quit). */
async function getSessionId() {
  const stored = await chrome.storage.session.get(SESSION_ID_KEY);
  if (stored[SESSION_ID_KEY]) return stored[SESSION_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [SESSION_ID_KEY]: id });
  return id;
}

async function readQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  const queue = stored[QUEUE_KEY];
  return Array.isArray(queue) ? queue : [];
}

/** Dev-only: read the local queue (e.g. ?debug=telemetry on import page). */
export async function readTelemetryQueue() {
  return readQueue();
}

/** Dev-only: wipe the local queue for repeated manual QA. */
export async function clearTelemetryQueue() {
  await writeQueue([]);
}

async function writeQueue(events) {
  await chrome.storage.local.set({ [QUEUE_KEY]: events });
}

/**
 * Record a usage event. Enriches with identity and context, then appends to
 * the local queue. Never throws — telemetry must not break user flows.
 * @param {string} eventName
 * @param {object} [properties]
 */
export async function track(eventName, properties = {}) {
  try {
    const safeProps = assertSafeProperties(properties);
    const [user, installId, sessionId] = await Promise.all([
      getUserContext(),
      getInstallId(),
      getSessionId(),
    ]);

    const envelope = {
      event: eventName,
      ts: new Date().toISOString(),
      user_email: user.user_email,
      identity_source: user.identity_source,
      install_id: installId,
      session_id: sessionId,
      extension_version: chrome.runtime.getManifest().version,
      chrome_version: parseChromeVersion(navigator.userAgent),
      platform: navigator.platform || 'unknown',
      properties: safeProps,
    };

    const queue = pruneQueue([...(await readQueue()), envelope]);
    await writeQueue(queue);
  } catch (err) {
    console.debug('[eml-viewer] telemetry track failed', err);
  }
}

/**
 * POST queued events to the ingest endpoint. No-op when URL is unset (Phase A).
 * @returns {Promise<{ sent: number, skipped: boolean, error?: string }>}
 */
export async function flush() {
  const url = import.meta.env.VITE_TELEMETRY_URL;
  if (!url) return { sent: 0, skipped: true };

  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, skipped: false };

  const apiKey = import.meta.env.VITE_TELEMETRY_API_KEY || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events: queue }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }
    await writeQueue([]);
    return { sent: queue.length, skipped: false };
  } catch (err) {
    console.debug('[eml-viewer] telemetry flush failed', err);
    return { sent: 0, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }
}
