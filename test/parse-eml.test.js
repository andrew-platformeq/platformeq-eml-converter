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

const SAMPLE_EML_LATIN1_QP = `From: Alice Example <alice@example.com>
To: Bob <bob@example.com>
Subject: French accents
Date: Tue, 17 Jun 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b2"

--b2
Content-Type: text/plain; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

R=E9sum=E9 d'=E9t=E9 & caf=E9 =80 10
--b2
Content-Type: text/html; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

<p>R=E9sum=E9 d'=E9t=E9 &amp; caf=E9 =80 10</p>
--b2--
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

  it('decodes latin1 quoted-printable accents and symbols', async () => {
    const email = await parseEml(toArrayBuffer(SAMPLE_EML_LATIN1_QP));
    expect(email.text).toContain("Résumé d'été");
    expect(email.text).toContain('café');
    expect(email.html).toContain("Résumé d'été");
    expect(email.html).toContain('café');
  });
});
