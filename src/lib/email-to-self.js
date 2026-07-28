/**
 * Send the open email to the signed-in Workspace Gmail user only (Gmail API).
 *
 * Auth: chrome.identity.getAuthToken with a **Chrome Extension** OAuth client.
 * That path does not use redirect URIs (avoids redirect_uri_mismatch).
 * Do not use a Web application client ID here.
 *
 * Recipient email comes from chrome.identity.getProfileUserInfo (not Gmail profile).
 */

import { buildForwardMime } from './build-forward-mime.js';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';

export function isEmailToSelfConfigured() {
  const manifest = chrome.runtime.getManifest();
  return Boolean(
    manifest.oauth2?.client_id &&
      manifest.host_permissions?.some((p) => p.includes('googleapis.com'))
  );
}

/**
 * @param {object} mail
 * @param {Array} attachments
 * @returns {Promise<{ email: string, attachmentCount: number, messageId: string }>}
 */
export async function sendEmailToSelf(mail, attachments) {
  if (!isEmailToSelfConfigured()) {
    throw new Error(
      'Email to myself is not configured in this build. Ask PlatformEQ to enable Workspace Gmail send.'
    );
  }

  const profileEmail = await getChromeProfileEmail();
  if (!profileEmail) {
    throw new Error(
      'Could not read your Workspace Gmail address. Sign into Chrome with your work Google account.'
    );
  }

  const { raw, attachmentCount } = await buildForwardMime(mail, attachments, profileEmail);
  const token = await getAccessToken({ interactive: true });
  await assertHasSendScope(token);

  let res = await sendRaw(token, raw);
  if (res.status === 401) {
    await getAccessToken({ interactive: false, removeCached: true });
    const retryToken = await getAccessToken({ interactive: true });
    await assertHasSendScope(retryToken);
    res = await sendRaw(retryToken, raw);
  }

  if (!res.ok) {
    const used = res._token || token;
    throw new Error(await gmailErrorMessage(res, used));
  }

  const data = await res.json();
  return { email: profileEmail, attachmentCount, messageId: data.id || '' };
}

async function getChromeProfileEmail() {
  const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
  const email = (info?.email || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

/**
 * @param {{ interactive: boolean, removeCached?: boolean }} opts
 */
function getAccessToken({ interactive, removeCached = false }) {
  return new Promise((resolve, reject) => {
    const finish = (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(
          new Error(
            formatAuthError(err?.message || 'Google sign-in failed or was cancelled.')
          )
        );
        return;
      }
      resolve(token);
    };

    if (removeCached) {
      chrome.identity.getAuthToken({ interactive: false }, (existing) => {
        if (existing && !chrome.runtime.lastError) {
          chrome.identity.removeCachedAuthToken({ token: existing }, () => {
            chrome.identity.getAuthToken({ interactive }, finish);
          });
          return;
        }
        chrome.identity.getAuthToken({ interactive }, finish);
      });
      return;
    }

    chrome.identity.getAuthToken({ interactive }, finish);
  });
}

function formatAuthError(message) {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id || '(missing)';
  const extId = chrome.runtime.id;
  return (
    `${message} ` +
    `Use a Chrome Extension OAuth client (not Web). ` +
    `Set that client's Item ID to: ${extId}. ` +
    `Client ID in this build: ${clientId}. ` +
    `Consent screen must include ${GMAIL_SEND_SCOPE}.`
  );
}

async function sendRaw(token, raw) {
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  res._token = token;
  return res;
}

async function assertHasSendScope(token) {
  const scopes = await fetchTokenScopes(token);
  if (!scopes) return;
  const list = scopes.split(/[\s,]+/).filter(Boolean);
  if (!list.includes(GMAIL_SEND_SCOPE)) {
    throw new Error(
      'Google did not grant gmail.send. On OAuth consent screen → Data access, add ' +
        `${GMAIL_SEND_SCOPE} then revoke app access and retry. ` +
        `(token scopes: ${list.join(' ') || '(none)'})`
    );
  }
}

async function fetchTokenScopes(token) {
  try {
    const res = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.scope || '';
  } catch {
    return '';
  }
}

async function gmailErrorMessage(res, token) {
  let msg = res.statusText;
  try {
    const data = await res.json();
    msg = data?.error?.message || msg;
  } catch {
    // ignore
  }
  const scopes = token ? await fetchTokenScopes(token) : '';
  const scopeNote = scopes ? ` Token scopes: ${scopes}` : '';
  return `Gmail API error (${res.status}): ${msg}.${scopeNote}`;
}
