# Email to myself (Workspace Gmail)

Viewer button that sends the open email **only** to the signed-in user’s
Workspace Gmail address, including non-inline attachments.

## Auth model

Uses `chrome.identity.getAuthToken` with a **Chrome Extension** OAuth client.

- No redirect URIs
- No `client_secret`
- Recipient from `chrome.identity.getProfileUserInfo`

**Do not use a Web application OAuth client** for this flow. Editing redirect
URIs on a Web client will not match `getAuthToken`, and a Web client ID in the
manifest will fail in confusing ways.

## GCP setup (exact)

1. Enable **Gmail API** in the GCP project.
2. OAuth consent screen → **Internal** → Data access → add:
   `https://www.googleapis.com/auth/gmail.send`
3. Credentials → Create credentials → **OAuth client ID** → Application type:
   **Chrome Extension**
4. **Item ID** = extension ID from `chrome://extensions` (Developer mode).
   Current unpacked ID: `gbgiaamhdfgbnjappjamaikpikdlcljh`
   For the public store listing use: `dfhaanhlejilnnkbpabpdffhnecfhoam`
5. Copy the client ID into `.env.local`:

   ```bash
   VITE_GOOGLE_OAUTH_CLIENT_ID=….apps.googleusercontent.com
   ```

6. Rebuild and reload the unpacked folder:

   ```bash
   npm run package
   ```

If you reinstall unpacked and the extension ID changes, update the Chrome
Extension client’s **Item ID** (or create a second Chrome Extension client for
the new ID). Changing redirect URIs on a Web client does nothing here.

## Verify you edited the right client

The client ID in GCP must match `manifest.json` → `oauth2.client_id` in the
loaded build. Updating a different OAuth client has no effect.
