import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

/** Phase B: inject host_permissions + alarms when VITE_TELEMETRY_URL is set at build time. */
function buildManifest(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const url = env.VITE_TELEMETRY_URL;
  if (!url) return manifest;

  try {
    const origin = new URL(url).origin;
    const permissions = manifest.permissions.includes('alarms')
      ? manifest.permissions
      : [...manifest.permissions, 'alarms'];
    return {
      ...manifest,
      permissions,
      host_permissions: [`${origin}/*`],
    };
  } catch {
    console.warn('[eml-viewer] invalid VITE_TELEMETRY_URL — skipping host_permissions');
    return manifest;
  }
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
