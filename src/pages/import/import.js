import { summarizeEml } from '../../lib/parse-eml.js';
import { parseMail } from '../../lib/parse-mail.js';
import { resolveCidImages } from '../../lib/cid-resolver.js';
import { sanitizeHtml } from '../../lib/sanitize-html.js';
import { saveMailWithAttachments } from '../../lib/storage.js';
import { newMailId, registerMail } from '../../lib/mail-session.js';
import { MAX_FILE_BYTES, ACCEPTED_EXTENSIONS } from '../../lib/constants.js';
import {
  track,
  fileSizeBucket,
  attachmentCountBucket,
  deriveBodyType,
  safeFileExtension,
  computeContentFingerprint,
} from '../../lib/telemetry.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');

function setStatus(message, kind = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function setBusy(busy) {
  spinnerEl.hidden = !busy;
  dropzone.classList.toggle('dropzone--busy', busy);
}

function hasAcceptedExtension(name) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Turn parsed attachments into storable records. Bodies become Blobs so the
 * attachment tab (Milestone 4) can mint blob: URLs without re-encoding.
 */
function toAttachmentRecords(attachments = []) {
  return attachments.map((att, i) => {
    const related = Boolean(att.related);
    const disposition = att.disposition || '';
    // Inline parts (referenced from the body via Content-ID) are shown in the
    // body, not in the attachment list.
    const inline = related || disposition === 'inline' || Boolean(att.contentId && related);
    return {
      attachmentId: `att-${i}`,
      filename: att.filename || `attachment-${i}`,
      mimeType: att.mimeType || 'application/octet-stream',
      disposition,
      related,
      inline,
      contentId: att.contentId || '',
      size: att.content ? att.content.byteLength : 0,
      blob: new Blob([att.content], { type: att.mimeType || 'application/octet-stream' }),
    };
  });
}

async function handleFile(file, method) {
  if (!file) return;

  if (!hasAcceptedExtension(file.name)) {
    track('import_rejected', { reason: 'bad_extension' });
    setStatus(`"${file.name}" is not an accepted file type.`, 'error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    track('import_rejected', { reason: 'too_large' });
    const mb = (MAX_FILE_BYTES / (1024 * 1024)).toFixed(0);
    setStatus(`File is too large (max ${mb} MB).`, 'error');
    return;
  }

  setStatus(`Parsing "${file.name}"…`);
  setBusy(true);
  const parseStart = Date.now();
  let failureTracked = false;
  let contentFingerprint;
  try {
    const buffer = await file.arrayBuffer();
    contentFingerprint = await computeContentFingerprint(buffer);

    track('import_started', {
      method,
      file_ext: safeFileExtension(file.name),
      file_size_bucket: fileSizeBucket(file.size),
      content_fingerprint: contentFingerprint,
    });

    let email;
    try {
      email = await parseMail(buffer, file.name);
    } catch (err) {
      track('import_failed', { error_code: 'parse_error', content_fingerprint: contentFingerprint });
      failureTracked = true;
      throw err;
    }
    const summary = summarizeEml(email);

    // Resolve inline cid: images to data: URLs, THEN sanitize. Order matters:
    // sanitization preserves data: URLs, so resolved images survive.
    const resolvedHtml = resolveCidImages(email.html, email.attachments);
    const htmlSanitized = sanitizeHtml(resolvedHtml);

    const mailId = newMailId();
    const createdAt = Date.now();
    const attachments = toAttachmentRecords(email.attachments);

    const mail = {
      mailId,
      subject: summary.subject,
      from: summary.from,
      to: summary.to,
      cc: summary.cc,
      date: summary.date,
      htmlSanitized,
      hasHtml: Boolean(email.html),
      text: email.text || '',
      createdAt,
    };

    setStatus(`Saving "${file.name}"…`);
    try {
      await saveMailWithAttachments(mail, attachments);
      await registerMail({
        mailId,
        subject: mail.subject,
        from: mail.from,
        date: mail.date,
        attachmentIds: attachments.map((a) => a.attachmentId),
        createdAt,
      });
    } catch (err) {
      track('import_failed', {
        error_code: 'storage_error',
        content_fingerprint: contentFingerprint,
      });
      failureTracked = true;
      throw err;
    }

    const nonInline = attachments.filter((a) => !a.inline);
    track('import_succeeded', {
      parse_ms: Date.now() - parseStart,
      body_type: deriveBodyType({ hasHtml: mail.hasHtml, text: mail.text }),
      attachment_count_bucket: attachmentCountBucket(nonInline.length),
      inline_image_count: attachments.filter((a) => a.inline).length,
      has_pdf: nonInline.some((a) => a.mimeType === 'application/pdf'),
      content_fingerprint: contentFingerprint,
    });

    setStatus(`Opening "${mail.subject}"…`, 'success');
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`src/pages/viewer/viewer.html?mailId=${encodeURIComponent(mailId)}`),
    });
  } catch (err) {
    if (!failureTracked) {
      track('import_failed', {
        error_code: 'unknown',
        ...(contentFingerprint ? { content_fingerprint: contentFingerprint } : {}),
      });
    }
    console.error('Failed to import mail', err);
    setStatus(`Could not open "${file.name}": ${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// --- File picker ---
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  handleFile(fileInput.files[0], 'picker');
  fileInput.value = ''; // allow re-picking the same file
});

// --- Drag and drop ---
['dragenter', 'dragover'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  })
);
['dragleave', 'drop'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
    dropzone.classList.remove('dropzone--active');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  handleFile(file, 'drop');
});
