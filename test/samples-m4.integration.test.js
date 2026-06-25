// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEml } from '../src/lib/parse-eml.js';
import { classifyPreview } from '../src/lib/preview.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function readEml(name) {
  const buf = readFileSync(join(root, 'samples', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('with-pdf.eml', () => {
  it('exposes a PDF attachment that routes to the pdf viewer', async () => {
    const email = await parseEml(readEml('with-pdf.eml'));
    const pdf = email.attachments.find((a) => a.filename === 'report.pdf');
    expect(pdf).toBeTruthy();
    expect(pdf.mimeType).toBe('application/pdf');
    expect(classifyPreview(pdf.mimeType)).toBe('pdf');
  });
});

describe('nested.eml', () => {
  it('exposes the forwarded email as a downloadable rfc822 attachment', async () => {
    const email = await parseEml(readEml('nested.eml'));
    const fwd = email.attachments.find((a) => (a.mimeType || '').includes('rfc822'));
    expect(fwd).toBeTruthy();
    expect(classifyPreview(fwd.mimeType)).toBe('download');
  });
});

describe('empty-body.eml', () => {
  it('parses with no html and (effectively) no text body', async () => {
    const email = await parseEml(readEml('empty-body.eml'));
    expect(email.html).toBeFalsy();
    expect((email.text || '').trim()).toBe('');
  });
});
