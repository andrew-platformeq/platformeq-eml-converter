import { describe, it, expect } from 'vitest';
import { buildForwardMime } from '../src/lib/build-forward-mime.js';

describe('buildForwardMime', () => {
  it('builds a self-addressed multipart message with attachment', async () => {
    const mail = {
      subject: 'Quote info',
      from: 'agent@example.com',
      to: 'client@example.com',
      date: 'Mon, 27 Jul 2026 12:00:00 GMT',
      hasHtml: true,
      htmlSanitized: '<p>Hello</p>',
      text: 'Hello',
    };
    const attachments = [
      {
        inline: false,
        filename: 'note.txt',
        mimeType: 'text/plain',
        blob: new Blob(['hi'], { type: 'text/plain' }),
      },
      {
        inline: true,
        filename: 'logo.png',
        mimeType: 'image/png',
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    ];

    const { raw, attachmentCount } = await buildForwardMime(
      mail,
      attachments,
      'you@platformeq.com'
    );
    expect(attachmentCount).toBe(1);

    // Decode base64url back to RFC822 for assertions.
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const rfc822 = atob(padded);

    expect(rfc822).toContain('From: you@platformeq.com');
    expect(rfc822).toContain('To: you@platformeq.com');
    expect(rfc822).toContain('Subject: Fwd: Quote info');
    expect(rfc822).toContain('multipart/mixed');
    expect(rfc822).toContain('filename="note.txt"');
    expect(rfc822).not.toContain('logo.png');
  });

  it('rejects missing self email', async () => {
    await expect(
      buildForwardMime({ subject: 'x', hasHtml: false, text: 'hi' }, [], '')
    ).rejects.toThrow(/Missing Workspace email/);
  });
});
