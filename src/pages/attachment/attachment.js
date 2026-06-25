import { getAttachment } from '../../lib/storage.js';
import { classifyPreview } from '../../lib/preview.js';
import { track, mimeCategory } from '../../lib/telemetry.js';

const bar = document.getElementById('bar');
const nameEl = document.getElementById('att-name');
const metaEl = document.getElementById('att-meta');
const downloadEl = document.getElementById('download');
const errorEl = document.getElementById('error');
const previewEl = document.getElementById('preview');

// Object URLs are revoked when the tab is torn down.
const objectUrls = [];
function makeObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}
window.addEventListener('pagehide', () => objectUrls.forEach((u) => URL.revokeObjectURL(u)));

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function renderImage(url) {
  const img = document.createElement('img');
  img.className = 'att__image';
  img.src = url;
  img.alt = nameEl.textContent;
  previewEl.append(img);
}

function renderPdf(url) {
  // Non-sandboxed iframe on our trusted extension page => Chrome's native PDF
  // viewer renders the team-uploaded blob. (No sandboxed <embed>, which a
  // plugin-less sandbox would block.)
  const frame = document.createElement('iframe');
  frame.className = 'att__pdf';
  frame.src = url;
  frame.title = nameEl.textContent;
  previewEl.append(frame);
}

function renderNoPreview() {
  const msg = document.createElement('p');
  msg.className = 'att__nopreview';
  msg.textContent = 'No preview available for this file type. Use Download to save it.';
  previewEl.append(msg);
}

async function main() {
  const params = new URLSearchParams(location.search);
  const mailId = params.get('mailId');
  const attachmentId = params.get('attachmentId');
  if (!mailId || !attachmentId) {
    showError('No attachment specified.');
    return;
  }

  let record;
  try {
    record = await getAttachment(mailId, attachmentId);
  } catch (err) {
    console.error('Failed to load attachment', err);
    showError(`Could not load this attachment: ${err.message}`);
    return;
  }
  if (!record || !record.blob) {
    showError('This attachment is no longer available. Try importing the email again.');
    return;
  }

  nameEl.textContent = record.filename;
  metaEl.textContent = `${record.mimeType} · ${formatBytes(record.size || record.blob.size)}`;
  document.title = `${record.filename} — EML Viewer`;

  const url = makeObjectUrl(record.blob);
  downloadEl.href = url;
  downloadEl.download = record.filename;
  downloadEl.addEventListener('click', () => {
    track('attachment_downloaded', { mime_category: mimeCategory(record.mimeType) });
  });
  bar.hidden = false;

  const previewType = classifyPreview(record.mimeType);
  track('attachment_opened', {
    preview_type: previewType,
    mime_category: mimeCategory(record.mimeType),
  });

  switch (previewType) {
    case 'image':
      renderImage(url);
      break;
    case 'pdf':
      renderPdf(url);
      break;
    default:
      renderNoPreview();
  }
}

main();
