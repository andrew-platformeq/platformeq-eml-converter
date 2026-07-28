import { MsgReader } from '@kenjiuno/msgreader-web-ng';
import { decompressRTF } from '@kenjiuno/decompressrtf';

/**
 * Parse a raw Outlook `.msg` ArrayBuffer into the same shape postal-mime
 * produces for `.eml`, so the rest of the import → viewer pipeline is unchanged.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<object>} { subject, from, to, cc, date, html, text, attachments[] }
 */
export async function parseMsg(arrayBuffer) {
  // Prefer Uint8Array so MsgReader accepts the buffer across realms
  // (Vitest jsdom vs Node ArrayBuffer instanceof can disagree).
  const bytes =
    arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer);
  const reader = new MsgReader(bytes);
  const data = reader.getFileData();
  if (data?.error) {
    throw new Error(data.error);
  }
  return msgFieldsToEmail(data, reader);
}

/**
 * Map MsgReader FieldsData (+ attachment bytes) → postal-mime-like email object.
 * Exported for unit tests with synthetic fixtures.
 *
 * @param {object} data MsgReader.getFileData()
 * @param {{ getAttachment: (att: object|number) => { fileName?: string, content?: Uint8Array } }} reader
 */
export function msgFieldsToEmail(data, reader) {
  const html = resolveHtmlBody(data);
  const text = typeof data.body === 'string' ? data.body : '';

  return {
    subject: data.subject || '',
    from: senderToAddress(data),
    to: recipientsByType(data.recipients, 'to'),
    cc: recipientsByType(data.recipients, 'cc'),
    date: data.messageDeliveryTime || data.clientSubmitTime || data.creationTime || '',
    html: html || '',
    text,
    attachments: mapAttachments(data.attachments || [], reader),
  };
}

function senderToAddress(data) {
  const candidates = [
    data.senderSmtpAddress,
    data.creatorSMTPAddress,
    data.sentRepresentingSmtpAddress,
    data.senderEmail,
  ];
  const address = candidates.find((a) => isSmtpAddress(a)) || '';
  const name = data.senderName || '';
  if (!name && !address) return undefined;
  return { name, address };
}

/** Prefer real SMTP addresses over Exchange DNs like `/O=EXCHANGELABS/...`. */
function isSmtpAddress(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('/')) return false;
  return value.includes('@');
}

function recipientsByType(recipients = [], type) {
  return recipients
    .filter((r) => (r.recipType || 'to') === type)
    .map((r) => ({
      name: cleanDisplayName(r.name),
      address: r.smtpAddress || r.email || '',
    }))
    .filter((r) => r.name || r.address);
}

function cleanDisplayName(name) {
  if (!name) return '';
  return String(name).replace(/^['"]|['"]$/g, '').trim();
}

/**
 * Prefer native HTML properties; otherwise decompress compressed RTF and
 * extract Outlook `\fromhtml` HTML fragments. Returns '' if none.
 */
export function resolveHtmlBody(data) {
  if (typeof data.bodyHtml === 'string' && data.bodyHtml.trim()) {
    return data.bodyHtml;
  }
  if (data.html) {
    const bytes = toUint8Array(data.html);
    if (bytes && bytes.byteLength) {
      const decoded = decodeHtmlBytesWithFallbacks(bytes);
      if (decoded.trim()) return decoded;
    }
  }
  if (data.compressedRtf) {
    try {
      const compressed = toUint8Array(data.compressedRtf);
      const decompressed = decompressRTF(Array.from(compressed));
      const rtf = new TextDecoder('latin1').decode(Uint8Array.from(decompressed));
      const fromHtml = extractHtmlFromOutlookRtf(rtf);
      if (fromHtml) return fromHtml;
    } catch {
      // Fall through — plain text body still available.
    }
  }
  return '';
}

/**
 * Decode MSG HTML bytes using robust fallbacks for legacy Office charsets.
 * Outlook-generated mail bodies are often cp1252/latin1 even when no charset
 * metadata is available in the .msg structure.
 */
function decodeHtmlBytesWithFallbacks(bytes) {
  const decoders = [
    () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    () => new TextDecoder('windows-1252').decode(bytes),
    () => new TextDecoder('iso-8859-1').decode(bytes),
    () => new TextDecoder('utf-8', { fatal: false }).decode(bytes),
  ];

  for (const decode of decoders) {
    try {
      const text = decode();
      if (text && text.trim()) return text;
    } catch {
      // Try next decoder.
    }
  }
  return '';
}

/**
 * De-encapsulate Outlook HTML stored in compressed RTF ([MS-OXRTFEX]).
 *
 * Markup lives in `{\*\htmltagN ...}` groups; the visible text sits *between*
 * those groups when not suppressed by `\htmlrtf` … `\htmlrtf0`. Taking only the
 * htmltag fragments drops the body text (empty lists, missing paragraphs).
 *
 * @param {string} rtf
 * @returns {string|null}
 */
export function extractHtmlFromOutlookRtf(rtf) {
  if (!rtf || !/\\fromhtml/i.test(rtf)) return null;

  let out = '';
  let i = 0;
  let skipHtmlRtf = false;

  while (i < rtf.length) {
    if (rtf.startsWith('{\\*\\htmltag', i)) {
      const end = findMatchingBrace(rtf, i);
      const inner = rtf.slice(i + 1, end); // \*\htmltagN ...
      const m = inner.match(/^\\\*\\htmltag\d+[A-Za-z0-9-]*\s?([\s\S]*)$/);
      if (m && !skipHtmlRtf) out += cleanHtmlTagContent(m[1]);
      i = end + 1;
      continue;
    }

    // Other ignorable destinations ({\*...}) — skip entirely.
    if (rtf.startsWith('{\\*', i)) {
      i = findMatchingBrace(rtf, i) + 1;
      continue;
    }

    if (rtf.startsWith('\\htmlrtf0', i)) {
      skipHtmlRtf = false;
      i += 9;
      if (rtf[i] === ' ') i++;
      continue;
    }

    if (rtf.startsWith('\\htmlrtf', i)) {
      skipHtmlRtf = true;
      i += 8;
      if (rtf[i] === '1') i++;
      if (rtf[i] === ' ') i++;
      continue;
    }

    if (rtf.startsWith("\\'", i) && /^[0-9a-fA-F]{2}/.test(rtf.slice(i + 2, i + 4))) {
      if (!skipHtmlRtf) {
        out += String.fromCharCode(parseInt(rtf.slice(i + 2, i + 4), 16));
      }
      i += 4;
      continue;
    }

    if (rtf.startsWith('\\u', i)) {
      const m = rtf.slice(i).match(/^\\u(-?\d+)\s?/);
      if (m) {
        if (!skipHtmlRtf) {
          let code = parseInt(m[1], 10);
          if (code < 0) code += 65536;
          out += String.fromCharCode(code);
        }
        i += m[0].length;
        // Optional single-byte ANSI fallback after \uN
        if (
          i < rtf.length &&
          rtf[i] !== '\\' &&
          rtf[i] !== '{' &&
          rtf[i] !== '}' &&
          rtf[i] !== '\r' &&
          rtf[i] !== '\n'
        ) {
          i++;
        }
        continue;
      }
    }

    if (rtf[i] === '\\') {
      i++;
      if (i >= rtf.length) break;
      if (!/[a-zA-Z]/.test(rtf[i])) {
        i++;
        continue;
      }
      while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) i++;
      if (rtf[i] === '-') i++;
      while (i < rtf.length && /[0-9]/.test(rtf[i])) i++;
      if (rtf[i] === ' ') i++;
      continue;
    }

    if (rtf[i] === '{' || rtf[i] === '}') {
      i++;
      continue;
    }
    if (rtf[i] === '\r' || rtf[i] === '\n') {
      i++;
      continue;
    }

    if (!skipHtmlRtf) out += rtf[i];
    i++;
  }

  // Font-table leftovers sometimes precede the real document.
  const htmlStart = out.search(/<html\b/i);
  if (htmlStart > 0) out = out.slice(htmlStart);

  out = out.trim();
  return out || null;
}

function findMatchingBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

/** Strip RTF noise Outlook sometimes embeds inside htmltag destinations. */
function cleanHtmlTagContent(text) {
  return text
    .replace(/\\par[d]?\b\s?/gi, '')
    .replace(/\\tab\b\s?/gi, '')
    .replace(/\\line\b\s?/gi, '')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\([{}\\])/g, '$1')
    .replace(/\r?\n/g, '');
}

function mapAttachments(metas, reader) {
  const out = [];
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    // Nested .msg (forwarded message) — expose as a downloadable .msg blob.
    if (meta.innerMsgContent) {
      let content;
      try {
        content = reader.getAttachment(meta)?.content;
      } catch {
        content = undefined;
      }
      if (!content) continue;
      out.push({
        filename: ensureMsgExtension(meta.fileName || `forwarded-${i}.msg`),
        mimeType: 'application/vnd.ms-outlook',
        disposition: 'attachment',
        contentId: '',
        related: false,
        content: toArrayBuffer(content),
      });
      continue;
    }

    let file;
    try {
      file = reader.getAttachment(meta);
    } catch {
      continue;
    }
    const content = file?.content;
    if (!content || !(content.byteLength ?? content.length)) continue;

    const filename = file.fileName || meta.fileName || `attachment-${i}`;
    const contentId = (meta.pidContentId || '').replace(/^<|>$/g, '');
    // Content-ID means the part is referenced from the HTML body (inline).
    const related = Boolean(contentId);
    const mimeType =
      meta.attachMimeTag || guessMimeFromFilename(filename) || 'application/octet-stream';

    out.push({
      filename,
      mimeType,
      disposition: related ? 'inline' : 'attachment',
      contentId,
      related,
      content: toArrayBuffer(content),
    });
  }
  return out;
}

function ensureMsgExtension(name) {
  return /\.msg$/i.test(name) ? name : `${name}.msg`;
}

function guessMimeFromFilename(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.eml')) return 'message/rfc822';
  if (lower.endsWith('.msg')) return 'application/vnd.ms-outlook';
  return '';
}

function toUint8Array(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return Uint8Array.from(value);
}

function toArrayBuffer(value) {
  const bytes = toUint8Array(value);
  if (!bytes) return new ArrayBuffer(0);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
