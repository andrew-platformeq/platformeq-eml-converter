// @vitest-environment jsdom
// End-to-end: real sample .eml -> parse -> resolve cid -> sanitize.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEml } from '../src/lib/parse-eml.js';
import { resolveCidImages } from '../src/lib/cid-resolver.js';
import { sanitizeHtml } from '../src/lib/sanitize-html.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function readEml(name) {
  const buf = readFileSync(join(root, 'samples', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('inline-image.eml pipeline', () => {
  it('resolves the inline logo and keeps the regular attachment separate', async () => {
    const email = await parseEml(readEml('inline-image.eml'));

    // Two parts: the inline png (has contentId) and the note.txt attachment.
    const inline = email.attachments.filter((a) => a.contentId);
    const regular = email.attachments.filter((a) => !a.contentId);
    expect(inline.length).toBe(1);
    expect(regular.some((a) => a.filename === 'note.txt')).toBe(true);

    const resolved = resolveCidImages(email.html, email.attachments);
    expect(resolved).toContain('data:image/png;base64,');
    expect(resolved).not.toContain('cid:logo@example');

    // Sanitization must preserve the resolved data: image.
    const safe = sanitizeHtml(resolved);
    expect(safe).toContain('data:image/png;base64,');
  });
});

describe('malicious.eml pipeline', () => {
  it('strips scripts and event handlers but keeps the readable body', async () => {
    const email = await parseEml(readEml('malicious.eml'));
    const safe = sanitizeHtml(resolveCidImages(email.html, email.attachments));
    expect(safe.toLowerCase()).not.toContain('<script');
    expect(safe).not.toContain('onerror');
    expect(safe).not.toContain('alert(');
    // The javascript: href must be stripped (the words may remain in link TEXT).
    expect(safe).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
    expect(safe).toContain('Security test email');
    // External tracking pixel ref is preserved in markup (network blocked by CSP).
    expect(safe).toContain('tracker.example.com');
  });
});
