import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

/**
 * Build-time manifest enrichment:
 * - VITE_TELEMETRY_URL → host_permissions + alarms
 * - VITE_GOOGLE_OAUTH_CLIENT_ID → oauth2 (gmail.send) + Google API host_permissions
 */
function buildManifest(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  let next = { ...manifest, permissions: [...manifest.permissions] };
  const hostPermissions = new Set(manifest.host_permissions || []);

  const telemetryUrl = env.VITE_TELEMETRY_URL;
  if (telemetryUrl) {
    try {
      hostPermissions.add(`${new URL(telemetryUrl).origin}/*`);
      if (!next.permissions.includes('alarms')) {
        next.permissions = [...next.permissions, 'alarms'];
      }
    } catch {
      console.warn('[eml-viewer] invalid VITE_TELEMETRY_URL — skipping host_permissions');
    }
  }

  const clientId = (env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (clientId) {
    next = {
      ...next,
      oauth2: {
        client_id: clientId,
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
      },
    };
    // gmail.googleapis.com is a different host than www.googleapis.com
    hostPermissions.add('https://www.googleapis.com/*');
    hostPermissions.add('https://gmail.googleapis.com/*');
    hostPermissions.add('https://accounts.google.com/*');
    hostPermissions.add('https://oauth2.googleapis.com/*');
  } else {
    console.warn(
      '[eml-viewer] VITE_GOOGLE_OAUTH_CLIENT_ID unset — Email to myself will be disabled in this build'
    );
  }

  if (hostPermissions.size > 0) {
    next.host_permissions = [...hostPermissions];
  }

  return next;
}

// @crxjs/vite-plugin reads manifest.json, discovers the HTML pages it references
// (and pages we open at runtime via getURL), bundles their ESM, and rewrites
// asset paths in the emitted dist/ manifest.
export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest: buildManifest(mode) })],
  build: {
    // Extension pages opened at runtime (not linked from the manifest action)
    // must be declared as explicit rollup inputs so they get built.
    rollupOptions: {
      input: {
        import: 'src/pages/import/import.html',
        viewer: 'src/pages/viewer/viewer.html',
        attachment: 'src/pages/attachment/attachment.html',
        telemetryDebug: 'src/pages/debug/telemetry.html',
      },
    },
  },
}));
