import PostalMime from 'postal-mime';

/**
 * Parse a raw .eml ArrayBuffer into a structured email object.
 *
 * postal-mime returns attachment bodies as ArrayBuffers by default, which is
 * exactly what we want for re-encoding to data:/blob: URLs later.
 *
 * @param {ArrayBuffer} arrayBuffer raw bytes of the .eml file
 * @returns {Promise<object>} parsed email (headers, from, to, subject, html, text, attachments[])
 */
export async function parseEml(arrayBuffer) {
  return PostalMime.parse(arrayBuffer, {
    attachmentEncoding: 'arraybuffer',
  });
}

/**
 * Format a single address object ({ name, address }) for display.
 */
function formatAddress(a) {
  if (!a) return '';
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || '';
}

/**
 * Format an address field, which postal-mime may give as an object or array.
 */
export function formatAddressList(field) {
  if (!field) return '';
  const list = Array.isArray(field) ? field : [field];
  return list.map(formatAddress).filter(Boolean).join(', ');
}

/**
 * Build a small, human-readable summary of a parsed email. Used by the
 * Milestone 1 debug panel and handy for logging.
 *
 * @param {object} email result of parseEml()
 */
export function summarizeEml(email) {
  const attachments = email.attachments || [];
  return {
    subject: email.subject || '(no subject)',
    from: formatAddressList(email.from),
    to: formatAddressList(email.to),
    cc: formatAddressList(email.cc),
    date: email.date || '',
    hasHtml: Boolean(email.html),
    hasText: Boolean(email.text),
    textSnippet: (email.text || '').slice(0, 280),
    attachmentCount: attachments.length,
    attachments: attachments.map((att) => ({
      filename: att.filename || '(unnamed)',
      mimeType: att.mimeType || 'application/octet-stream',
      disposition: att.disposition || '',
      contentId: att.contentId || '',
      related: Boolean(att.related),
      bytes: att.content ? att.content.byteLength : 0,
    })),
  };
}
