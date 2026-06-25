// Lightweight mail registry in chrome.storage.session.
//
// Session storage clears when the browser fully closes, which is the privacy
// pivot for this extension: the service worker reconciles IndexedDB against
// this registry on startup (see background/service-worker.js), so emails do
// not survive a browser restart.

import { SESSION_KEY_PREFIX } from './constants.js';

const keyFor = (mailId) => `${SESSION_KEY_PREFIX}${mailId}`;

/** Generate a new opaque mail id. */
export function newMailId() {
  return crypto.randomUUID();
}

/**
 * Register a mail's lightweight metadata for fast viewer bootstrap and for
 * reconciliation bookkeeping.
 * @param {object} meta { mailId, subject, from, date, attachmentIds, createdAt }
 */
export async function registerMail(meta) {
  await chrome.storage.session.set({ [keyFor(meta.mailId)]: meta });
}

export async function getSessionMail(mailId) {
  const key = keyFor(mailId);
  const result = await chrome.storage.session.get(key);
  return result[key] || null;
}

/** All mailIds currently present in the session registry. */
export async function listSessionMailIds() {
  const all = await chrome.storage.session.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(SESSION_KEY_PREFIX))
    .map((k) => k.slice(SESSION_KEY_PREFIX.length));
}

export async function unregisterMail(mailId) {
  await chrome.storage.session.remove(keyFor(mailId));
}
