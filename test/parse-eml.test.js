import { describe, it, expect } from 'vitest';
import { parseEml, summarizeEml, formatAddressList } from '../src/lib/parse-eml.js';

const SAMPLE_EML = `From: Alice Example <alice@example.com>
To: Bob <bob@example.com>, Carol <carol@example.com>
Subject: Hello multipart
Date: Tue, 17 Jun 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b1"

--b1
Content-Type: text/plain; charset=utf-8

Hello in plain text.
--b1
Content-Type: text/html; charset=utf-8

<p>Hello in <b>HTML</b>.</p>
--b1--
`;

function toArrayBuffer(str) {
  return new TextEncoder().encode(str).buffer;
}

describe('parseEml', () => {
  it('extracts headers, bodies and addresses from a multipart email', async () => {
    const email = await parseEml(toArrayBuffer(SAMPLE_EML));
    expect(email.subject).toBe('Hello multipart');
    expect(formatAddressList(email.from)).toContain('alice@example.com');
    expect(email.text).toContain('plain text');
    expect(email.html).toContain('<b>HTML</b>');
  });

  it('summarizeEml produces a stable debug summary', async () => {
    const email = await parseEml(toArrayBuffer(SAMPLE_EML));
    const summary = summarizeEml(email);
    expect(summary.subject).toBe('Hello multipart');
    expect(summary.hasHtml).toBe(true);
    expect(summary.hasText).toBe(true);
    expect(summary.to).toContain('bob@example.com');
    expect(summary.to).toContain('carol@example.com');
    expect(summary.attachmentCount).toBe(0);
  });
});
