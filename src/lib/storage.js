// IndexedDB persistence for parsed emails and their attachments.
// Binary attachment bodies are stored as Blobs so we can hand out blob: URLs
// later (Milestone 4) without re-encoding.

import {
  DB_NAME, DB_VERSION, STORE_MAILS, STORE_ATTACHMENTS,
} from './constants.js';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MAILS)) {
        db.createObjectStore(STORE_MAILS, { keyPath: 'mailId' });
      }
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        const store = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'pk' });
        store.createIndex('mailId', 'mailId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeNames, mode) {
  const transaction = db.transaction(storeNames, mode);
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return { transaction, done };
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist a parsed mail record and its attachments in one transaction.
 * @param {object} mail   { mailId, subject, from, to, cc, date, htmlSanitized, text, createdAt }
 * @param {Array}  attachments  [{ attachmentId, filename, mimeType, disposition, related, contentId, blob }]
 */
export async function saveMailWithAttachments(mail, attachments = []) {
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_MAILS, STORE_ATTACHMENTS], 'readwrite');
  transaction.objectStore(STORE_MAILS).put(mail);
  const attStore = transaction.objectStore(STORE_ATTACHMENTS);
  for (const att of attachments) {
    attStore.put({ ...att, pk: `${mail.mailId}::${att.attachmentId}`, mailId: mail.mailId });
  }
  await done;
}

export async function getMail(mailId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_MAILS], 'readonly');
  return reqToPromise(transaction.objectStore(STORE_MAILS).get(mailId));
}

export async function getAttachments(mailId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_ATTACHMENTS], 'readonly');
  const index = transaction.objectStore(STORE_ATTACHMENTS).index('mailId');
  return reqToPromise(index.getAll(IDBKeyRange.only(mailId)));
}

export async function getAttachment(mailId, attachmentId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_ATTACHMENTS], 'readonly');
  return reqToPromise(transaction.objectStore(STORE_ATTACHMENTS).get(`${mailId}::${attachmentId}`));
}

export async function getAllMailIds() {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_MAILS], 'readonly');
  return reqToPromise(transaction.objectStore(STORE_MAILS).getAllKeys());
}

export async function getAllMailsMeta() {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_MAILS], 'readonly');
  return reqToPromise(transaction.objectStore(STORE_MAILS).getAll());
}

/**
 * Delete a mail and all of its attachments.
 */
export async function deleteMail(mailId) {
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_MAILS, STORE_ATTACHMENTS], 'readwrite');
  transaction.objectStore(STORE_MAILS).delete(mailId);
  const index = transaction.objectStore(STORE_ATTACHMENTS).index('mailId');
  const cursorReq = index.openCursor(IDBKeyRange.only(mailId));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await done;
}
