/**
 * Build a self-addressed RFC822 message (forward) from a stored mail + attachments.
 * Recipient is always `selfEmail` — callers must not pass another address.
 */

const MAX_GMAIL_RAW_BYTES = 20 * 1024 * 1024; // stay under Gmail ~25MB raw limit with margin

/**
 * @param {object} mail
 * @param {Array} attachments IndexedDB attachment records (with blob)
 * @param {string} selfEmail Workspace Gmail of the signed-in user
 * @returns {Promise<{ raw: string, attachmentCount: number, approxBytes: number }>}
 */
export async function buildForwardMime(mail, attachments, selfEmail) {
  if (!selfEmail || !selfEmail.includes('@')) {
    throw new Error('Missing Workspace email for send-to-self.');
  }

  const boundary = `peq_${crypto.randomUUID().replace(/-/g, '')}`;
  const subject = encodeRfc2047(`Fwd: ${mail.subject || '(no subject)'}`);
  const listed = (attachments || []).filter((a) => !a.inline && a.blob);

  const preamble = [
    '---------- Forwarded message ---------',
    `From: ${mail.from || ''}`,
    `Date: ${mail.date || ''}`,
    `Subject: ${mail.subject || '(no subject)'}`,
    `To: ${mail.to || ''}`,
    mail.cc ? `Cc: ${mail.cc}` : null,
    '',
  ]
    .filter((line) => line !== null)
    .join('\r\n');

  let bodyHtml;
  if (mail.hasHtml && mail.htmlSanitized) {
    bodyHtml = `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(preamble)}</pre>${mail.htmlSanitized}`;
  } else {
    const text = `${preamble}\r\n${mail.text || '(no body)'}`;
    bodyHtml = `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
  }

  const parts = [];
  parts.push(
    `--${boundary}\r\n` +
      'Content-Type: text/html; charset="UTF-8"\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      `${wrapBase64(utf8ToBase64(bodyHtml))}\r\n`
  );

  for (const att of listed) {
    const bytes = new Uint8Array(await att.blob.arrayBuffer());
    const filename = sanitizeFilename(att.filename || 'attachment');
    const mime = att.mimeType || 'application/octet-stream';
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${mime}; name="${escapeHeaderAtom(filename)}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        `Content-Disposition: attachment; filename="${escapeHeaderAtom(filename)}"\r\n\r\n` +
        `${wrapBase64(bytesToBase64(bytes))}\r\n`
    );
  }

  parts.push(`--${boundary}--\r\n`);

  const headers =
    `From: ${selfEmail}\r\n` +
    `To: ${selfEmail}\r\n` +
    `Subject: ${subject}\r\n` +
    'MIME-Version: 1.0\r\n' +
    `Content-Type: multipart/mixed; boundary="${boundary}"\r\n` +
    '\r\n';

  const rfc822 = headers + parts.join('');
  const approxBytes = new TextEncoder().encode(rfc822).length;
  if (approxBytes > MAX_GMAIL_RAW_BYTES) {
    throw new Error(
      'This email is too large to send via Gmail from the extension (attachments included). Download attachments instead.'
    );
  }

  return {
    raw: base64UrlEncode(rfc822),
    attachmentCount: listed.length,
    approxBytes,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeFilename(name) {
  return String(name).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'attachment';
}

function escapeHeaderAtom(value) {
  return String(value).replace(/"/g, '');
}

/** RFC 2047 encoded-word for non-ASCII subjects. */
function encodeRfc2047(text) {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${utf8ToBase64(text)}?=`;
}

function utf8ToBase64(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function wrapBase64(b64) {
  return b64.replace(/.{1,76}/g, '$&\r\n').trim();
}

function base64UrlEncode(str) {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
