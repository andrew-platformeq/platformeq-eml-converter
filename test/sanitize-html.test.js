// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../src/lib/sanitize-html.js';

describe('sanitizeHtml', () => {
  it('removes <script> elements', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('hi');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<img src="data:," onerror="alert(1)"><div onclick="x()">z</div>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
  });

  it('removes javascript: URLs but keeps safe ones', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">a</a><a href="https://ok.com">b</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('https://ok.com');
  });

  it('defeats whitespace-obfuscated javascript: schemes', () => {
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">a</a>');
    expect(out.toLowerCase()).not.toContain('script:alert');
  });

  it('keeps cid: and data: image references for later resolution', () => {
    const out = sanitizeHtml('<img src="cid:logo123"><img src="data:image/png;base64,AAAA">');
    expect(out).toContain('cid:logo123');
    expect(out).toContain('data:image/png');
  });

  it('keeps external https image refs (network blocked by CSP, not sanitizer)', () => {
    const out = sanitizeHtml('<img src="https://tracker.example/pixel.gif">');
    expect(out).toContain('https://tracker.example/pixel.gif');
  });

  it('removes iframes, objects, embeds and meta refresh', () => {
    const out = sanitizeHtml(
      '<iframe src="x"></iframe><object data="x"></object><embed src="x"><meta http-equiv="refresh" content="0;url=x">'
    );
    expect(out.toLowerCase()).not.toMatch(/<iframe|<object|<embed|<meta/);
  });

  it('neutralizes form actions', () => {
    const out = sanitizeHtml('<form action="https://evil.com" method="post"><input></form>');
    expect(out).not.toContain('evil.com');
    expect(out).not.toContain('action=');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });
});
