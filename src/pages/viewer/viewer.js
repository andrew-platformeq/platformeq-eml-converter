import { getMail, getAttachments } from '../../lib/storage.js';
import { track, attachmentCountBucket, deriveBodyType } from '../../lib/telemetry.js';
import { isEmailToSelfConfigured, sendEmailToSelf } from '../../lib/email-to-self.js';

const metaEl = document.getElementById('meta');
const subjectEl = document.getElementById('meta-subject');
const fromEl = document.getElementById('meta-from');
const toEl = document.getElementById('meta-to');
const ccRow = document.querySelector('.meta__row--cc');
const ccEl = document.getElementById('meta-cc');
const dateEl = document.getElementById('meta-date');
const errorEl = document.getElementById('error');
const iframe = document.getElementById('email-body');
const attSection = document.getElementById('attachments');
const attCount = document.getElementById('att-count');
const attList = document.getElementById('att-list');
const emailToSelfBtn = document.getElementById('email-to-self');

/** @type {{ mail: object, attachments: Array } | null} */
let current = null;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

/**
 * Wrap the sanitized body in a minimal document with its own locked-down CSP.
 * `default-src 'none'` + `img-src data:` means external/tracking images cannot
 * load even if a reference slipped through sanitization; `base target=_blank`
 * routes link clicks to new tabs (functional thanks to the iframe's
 * allow-popups-to-escape-sandbox).
 */
function buildSrcdoc(bodyHtml) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;">
<base target="_blank">
<style>
  html,body{margin:0;padding:16px;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c2430;line-height:1.5;word-wrap:break-word;}
  img{max-width:100%;height:auto;}
</style>
</head><body>${bodyHtml}</body></html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderBody(mail) {
  let body;
  if (mail.hasHtml && mail.htmlSanitized) {
    body = mail.htmlSanitized;
  } else if (mail.text) {
    body = `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(mail.text)}</pre>`;
  } else {
    body = '<p style="color:#6b7585">(This email has no readable body.)</p>';
  }
  iframe.srcdoc = buildSrcdoc(body);
  iframe.hidden = false;
}

function renderMeta(mail) {
  subjectEl.textContent = mail.subject || '(no subject)';
  fromEl.textContent = mail.from || '';
  toEl.textContent = mail.to || '';
  if (mail.cc) {
    ccEl.textContent = mail.cc;
    ccRow.hidden = false;
  }
  dateEl.textContent = mail.date ? new Date(mail.date).toLocaleString() : '';
  document.title = `${mail.subject || 'Email'} — EML Viewer`;
  metaEl.hidden = false;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function renderAttachments(attachments, mailId) {
  // Inline parts (logos/signatures) are shown in the body, not listed here.
  const listed = attachments.filter((a) => !a.inline);
  if (listed.length === 0) return;

  attCount.textContent = String(listed.length);
  attList.innerHTML = '';
  for (const att of listed) {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'att-list__item';
    btn.title = `Open ${att.filename}`;
    btn.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `src/pages/attachment/attachment.html?mailId=${encodeURIComponent(mailId)}` +
        `&attachmentId=${encodeURIComponent(att.attachmentId)}`
      );
      chrome.tabs.create({ url });
    });

    const name = document.createElement('span');
    name.className = 'att-list__name';
    name.textContent = att.filename;

    const meta = document.createElement('span');
    meta.className = 'att-list__meta';
    meta.textContent = `${att.mimeType} · ${formatBytes(att.size)}`;

    btn.append(name, meta);
    li.append(btn);
    attList.append(li);
  }
  attSection.hidden = false;
}

function setEmailToSelfBusy(busy, label) {
  emailToSelfBtn.disabled = busy;
  emailToSelfBtn.textContent = label;
}

function classifySendError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('cancelled') || msg.includes('canceled')) return 'auth_cancelled';
  if (msg.includes('not configured')) return 'not_configured';
  if (msg.includes('too large')) return 'too_large';
  if (msg.includes('sign into chrome') || msg.includes('workspace gmail')) return 'no_identity';
  if (msg.includes('401') || msg.includes('auth')) return 'auth_error';
  return 'send_error';
}

async function onEmailToSelf() {
  if (!current) return;
  errorEl.hidden = true;
  setEmailToSelfBusy(true, 'Sending…');
  try {
    const result = await sendEmailToSelf(current.mail, current.attachments);
    track('email_to_self_sent', {
      attachment_count_bucket: attachmentCountBucket(result.attachmentCount),
      body_type: deriveBodyType({
        hasHtml: current.mail.hasHtml,
        text: current.mail.text,
      }),
    });
    setEmailToSelfBusy(false, 'Sent ✓');
    emailToSelfBtn.title = `Sent to ${result.email}`;
    setTimeout(() => {
      setEmailToSelfBusy(false, 'Email to myself');
      emailToSelfBtn.title =
        'Send this email (with attachments) to your Workspace Gmail only';
    }, 2500);
  } catch (err) {
    console.error('Email to myself failed', err);
    track('email_to_self_failed', { error_code: classifySendError(err) });
    setEmailToSelfBusy(false, 'Email to myself');
    showError(err.message || 'Could not send email to yourself.');
  }
}

document.getElementById('open-another').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/import/import.html') });
});

emailToSelfBtn.addEventListener('click', onEmailToSelf);

async function main() {
  if (isEmailToSelfConfigured()) {
    emailToSelfBtn.hidden = false;
    emailToSelfBtn.title =
      'Send this email (with attachments) to your Workspace Gmail only';
  }

  const mailId = new URLSearchParams(location.search).get('mailId');
  if (!mailId) {
    showError('No email specified (missing mailId).');
    return;
  }
  try {
    const mail = await getMail(mailId);
    if (!mail) {
      showError('This email is no longer available. Try importing it again.');
      return;
    }
    renderMeta(mail);
    renderBody(mail);
    const attachments = await getAttachments(mailId);
    current = { mail, attachments };
    const listed = attachments.filter((a) => !a.inline);
    track('viewer_opened', {
      body_type: deriveBodyType({ hasHtml: mail.hasHtml, text: mail.text }),
      attachment_count_bucket: attachmentCountBucket(listed.length),
    });
    renderAttachments(attachments, mailId);
  } catch (err) {
    console.error('Failed to load email', err);
    showError(`Could not load this email: ${err.message}`);
  }
}

main();
