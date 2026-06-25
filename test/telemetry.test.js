import { describe, it, expect } from 'vitest';
import {
  fileSizeBucket,
  attachmentCountBucket,
  mimeCategory,
  deriveBodyType,
  safeFileExtension,
  assertSafeProperties,
  pruneQueue,
  computeContentFingerprint,
  FORBIDDEN_PROPERTY_KEYS,
  MAX_QUEUE_EVENTS,
  MAX_QUEUE_AGE_MS,
} from '../src/lib/telemetry.js';

describe('fileSizeBucket', () => {
  it('buckets by coarse size bands', () => {
    expect(fileSizeBucket(0)).toBe('0-100kb');
    expect(fileSizeBucket(100 * 1024)).toBe('0-100kb');
    expect(fileSizeBucket(100 * 1024 + 1)).toBe('100kb-1mb');
    expect(fileSizeBucket(1024 * 1024)).toBe('100kb-1mb');
    expect(fileSizeBucket(1024 * 1024 + 1)).toBe('1-10mb');
    expect(fileSizeBucket(10 * 1024 * 1024)).toBe('1-10mb');
    expect(fileSizeBucket(10 * 1024 * 1024 + 1)).toBe('10mb+');
  });
});

describe('attachmentCountBucket', () => {
  it('buckets attachment counts', () => {
    expect(attachmentCountBucket(0)).toBe('0');
    expect(attachmentCountBucket(1)).toBe('1-3');
    expect(attachmentCountBucket(3)).toBe('1-3');
    expect(attachmentCountBucket(4)).toBe('4-10');
    expect(attachmentCountBucket(10)).toBe('4-10');
    expect(attachmentCountBucket(11)).toBe('10+');
  });
});

describe('mimeCategory', () => {
  it('maps to coarse categories only', () => {
    expect(mimeCategory('image/png')).toBe('image/*');
    expect(mimeCategory('IMAGE/JPEG')).toBe('image/*');
    expect(mimeCategory('application/pdf')).toBe('application/pdf');
    expect(mimeCategory('text/csv')).toBe('other');
    expect(mimeCategory('')).toBe('other');
  });
});

describe('deriveBodyType', () => {
  it('classifies body presence', () => {
    expect(deriveBodyType({ hasHtml: false, text: '' })).toBe('empty');
    expect(deriveBodyType({ hasHtml: true, text: '' })).toBe('html');
    expect(deriveBodyType({ hasHtml: false, text: 'hello' })).toBe('text');
    expect(deriveBodyType({ hasHtml: true, text: 'hello' })).toBe('both');
    expect(deriveBodyType({ hasHtml: true, text: '   ' })).toBe('html');
  });
});

describe('safeFileExtension', () => {
  it('returns extension only, never full filename', () => {
    expect(safeFileExtension('report.eml')).toBe('.eml');
    expect(safeFileExtension('Patient_John_Doe.msg.eml')).toBe('.eml');
    expect(safeFileExtension('noext')).toBe('unknown');
  });
});

describe('assertSafeProperties', () => {
  it('passes through safe properties', () => {
    expect(assertSafeProperties({ method: 'drop', parse_ms: 42 })).toEqual({
      method: 'drop',
      parse_ms: 42,
    });
    expect(assertSafeProperties({ content_fingerprint: 'abc123' })).toEqual({
      content_fingerprint: 'abc123',
    });
  });

  it('rejects forbidden keys', () => {
    for (const key of ['subject', 'filename', 'mailId', 'body']) {
      expect(() => assertSafeProperties({ [key]: 'x' })).toThrow(/forbidden/i);
    }
  });

  it('forbidden list covers PHI-risk fields', () => {
    expect(FORBIDDEN_PROPERTY_KEYS.has('subject')).toBe(true);
    expect(FORBIDDEN_PROPERTY_KEYS.has('filename')).toBe(true);
  });
});

describe('computeContentFingerprint', () => {
  it('returns the same hex hash for identical bytes', async () => {
    const data = new TextEncoder().encode('From: test@example.com');
    const a = await computeContentFingerprint(data);
    const b = await computeContentFingerprint(data.buffer);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different hashes for different bytes', async () => {
    const a = await computeContentFingerprint(new TextEncoder().encode('email-a'));
    const b = await computeContentFingerprint(new TextEncoder().encode('email-b'));
    expect(a).not.toBe(b);
  });
});

describe('pruneQueue', () => {
  const now = Date.parse('2026-06-23T12:00:00.000Z');

  it('drops events older than seven days', () => {
    const events = [
      { ts: '2026-06-23T11:00:00.000Z' },
      { ts: '2026-06-15T12:00:00.000Z' },
    ];
    expect(pruneQueue(events, now)).toHaveLength(1);
  });

  it('caps queue at MAX_QUEUE_EVENTS', () => {
    const events = Array.from({ length: MAX_QUEUE_EVENTS + 10 }, (_, i) => ({
      ts: new Date(now - i * 1000).toISOString(),
    }));
    expect(pruneQueue(events, now)).toHaveLength(MAX_QUEUE_EVENTS);
  });

  it('respects MAX_QUEUE_AGE_MS constant', () => {
    expect(MAX_QUEUE_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
