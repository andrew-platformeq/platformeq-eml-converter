// Shared constants: storage names, limits, MIME allowlists.

export const DB_NAME = 'eml-viewer';
export const DB_VERSION = 1;
export const STORE_MAILS = 'mails';
export const STORE_ATTACHMENTS = 'attachments';

export const SESSION_KEY_PREFIX = 'mail:'; // chrome.storage.session registry key

// TTL safety net: prune IndexedDB mails older than this even within a long-lived
// browser session that never closes.
export const MAIL_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Reject files larger than this to protect memory (parsing loads the whole
// file into an ArrayBuffer).
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// Accepted file extensions for the import picker / drop zone.
export const ACCEPTED_EXTENSIONS = ['.eml', '.msg', '.txt', '.mht', '.mhtml'];

// Attachment MIME types we preview inline (everything else downloads).
export const PREVIEW_IMAGE = /^image\//;
export const PREVIEW_PDF = 'application/pdf';
