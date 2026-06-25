// Builds samples/inline-image.eml: a multipart/related email with an inline
// CID image (reusing the blue icon PNG) plus a regular .txt attachment.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// base64, wrapped at 76 chars (standard for email transfer encoding)
function b64(buf) {
  return buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

const logo = b64(readFileSync(join(root, 'public/icons/icon-128.png')));
const note = b64(Buffer.from('This is a plain-text attachment for the EML Viewer test.\n', 'utf8'));

const eml = [
  'From: Marketing <marketing@example.com>',
  'To: You <you@example.com>',
  'Subject: [TEST] inline logo + attachment',
  'Date: Tue, 17 Jun 2026 13:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related; boundary="rel-boundary"',
  '',
  '--rel-boundary',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body>',
  '<h1>Inline image test</h1>',
  '<p>The blue square below should appear as a real image (resolved from cid:):</p>',
  '<p><img src="cid:logo@example" width="96" height="96" alt="logo"></p>',
  '<p>There should also be one attachment listed above the body (note.txt).</p>',
  '</body></html>',
  '',
  '--rel-boundary',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <logo@example>',
  'Content-Disposition: inline; filename="logo.png"',
  '',
  logo,
  '',
  '--rel-boundary',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="note.txt"',
  '',
  note,
  '',
  '--rel-boundary--',
  '',
].join('\r\n');

const out = join(root, 'samples/inline-image.eml');
writeFileSync(out, eml);
console.log('wrote', out);
