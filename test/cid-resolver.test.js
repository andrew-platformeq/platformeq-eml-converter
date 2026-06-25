// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveCidImages, buildCidMap } from '../src/lib/cid-resolver.js';

// 3-byte payload; exact bytes don't matter, only that they round-trip to base64.
function bytes(...vals) {
  return new Uint8Array(vals).buffer;
}

const attachments = [
  { contentId: '<logo@acme>', mimeType: 'image/png', content: bytes(1, 2, 3) },
  { contentId: 'sig@acme', mimeType: 'image/gif', content: bytes(4, 5, 6) },
];

describe('buildCidMap', () => {
  it('normalizes angle brackets and case', () => {
    const map = buildCidMap(attachments);
    expect(map.has('logo@acme')).toBe(true);
    expect(map.has('sig@acme')).toBe(true);
    expect(map.get('logo@acme')).toMatch(/^data:image\/png;base64,/);
  });

  it('ignores attachments without a contentId', () => {
    const map = buildCidMap([{ mimeType: 'application/pdf', content: bytes(0) }]);
    expect(map.size).toBe(0);
  });
});

describe('resolveCidImages', () => {
  it('rewrites <img src="cid:..."> to a data URL', () => {
    const html = '<img src="cid:logo@acme">';
    const out = resolveCidImages(html, attachments);
    expect(out).toMatch(/<img src="data:image\/png;base64,/);
    expect(out).not.toContain('cid:logo@acme');
  });

  it('matches contentId case-insensitively and with brackets', () => {
    const out = resolveCidImages('<img src="cid:LOGO@ACME">', attachments);
    expect(out).toContain('data:image/png;base64,');
  });

  it('resolves cid: inside a style attribute background', () => {
    const out = resolveCidImages('<div style="background:url(cid:sig@acme)"></div>', attachments);
    expect(out).toContain('data:image/gif;base64,');
    expect(out).not.toContain('cid:sig@acme');
  });

  it('leaves unknown cid references untouched', () => {
    const out = resolveCidImages('<img src="cid:missing@acme">', attachments);
    expect(out).toContain('cid:missing@acme');
  });

  it('returns html unchanged when there are no inline attachments', () => {
    const html = '<p>hello</p>';
    expect(resolveCidImages(html, [])).toBe(html);
  });
});
