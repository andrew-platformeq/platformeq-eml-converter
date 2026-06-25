import { describe, it, expect } from 'vitest';
import { classifyPreview } from '../src/lib/preview.js';

describe('classifyPreview', () => {
  it('routes images to inline preview', () => {
    expect(classifyPreview('image/png')).toBe('image');
    expect(classifyPreview('image/jpeg')).toBe('image');
    expect(classifyPreview('IMAGE/GIF')).toBe('image');
  });

  it('routes PDFs to the pdf viewer', () => {
    expect(classifyPreview('application/pdf')).toBe('pdf');
  });

  it('routes everything else to download', () => {
    expect(classifyPreview('message/rfc822')).toBe('download');
    expect(classifyPreview('application/octet-stream')).toBe('download');
    expect(classifyPreview('text/csv')).toBe('download');
    expect(classifyPreview('')).toBe('download');
    expect(classifyPreview(undefined)).toBe('download');
  });
});
