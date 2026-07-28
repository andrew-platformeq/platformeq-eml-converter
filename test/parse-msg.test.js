// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseMsg,
  msgFieldsToEmail,
  extractHtmlFromOutlookRtf,
  resolveHtmlBody,
} from '../src/lib/parse-msg.js';
import { resolveCidImages } from '../src/lib/cid-resolver.js';
import { sanitizeHtml } from '../src/lib/sanitize-html.js';
import { summarizeEml } from '../src/lib/parse-eml.js';
import { parseMail } from '../src/lib/parse-mail.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function readMsg(name) {
  const buf = readFileSync(join(root, 'samples', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('extractHtmlFromOutlookRtf', () => {
  it('keeps htmltag markup and text that sits after \\htmlrtf0', () => {
    // Mirrors Outlook MS-OXRTFEX: tags in htmltag groups, body text outside
    // \htmlrtf … \htmlrtf0 suppression.
    const rtf =
      '{\\rtf1\\ansi\\fromhtml1 ' +
      '{\\*\\htmltag0 <html>}' +
      '{\\*\\htmltag1 <body>}' +
      '{\\*\\htmltag2 <p>}' +
      '\\htmlrtf {\\htmlrtf0 Hello Bobby' +
      '{\\*\\htmltag3 </p>}' +
      '{\\*\\htmltag4 </body>}' +
      '{\\*\\htmltag5 </html>}}';
    const html = extractHtmlFromOutlookRtf(rtf);
    expect(html).toContain('<html>');
    expect(html).toContain('<p>');
    expect(html).toContain('Hello Bobby');
    expect(html).toContain('</html>');
  });

  it('returns null when RTF is not fromhtml', () => {
    expect(extractHtmlFromOutlookRtf('{\\rtf1\\ansi hello}')).toBeNull();
  });
});

describe('msgFieldsToEmail (synthetic)', () => {
  it('maps sender, recipients, and attachments into postal-mime shape', () => {
    const data = {
      subject: 'Hello MSG',
      senderName: 'Alice',
      senderEmail: 'alice@example.com',
      body: 'plain body',
      bodyHtml: '<p>html body</p>',
      messageDeliveryTime: 'Tue, 17 Jun 2026 10:00:00 GMT',
      recipients: [
        { name: 'Bob', email: 'bob@example.com', recipType: 'to' },
        { name: 'Carol', smtpAddress: 'carol@example.com', recipType: 'cc' },
      ],
      attachments: [
        {
          fileName: 'note.txt',
          attachMimeTag: 'text/plain',
          pidContentId: undefined,
        },
        {
          fileName: 'logo.png',
          attachMimeTag: 'image/png',
          pidContentId: 'logo@example',
          attachmentHidden: true,
        },
      ],
    };
    const contents = {
      'note.txt': new TextEncoder().encode('hi').buffer,
      'logo.png': new Uint8Array([137, 80, 78, 71]).buffer,
    };
    const reader = {
      getAttachment(meta) {
        return { fileName: meta.fileName, content: new Uint8Array(contents[meta.fileName]) };
      },
    };

    const email = msgFieldsToEmail(data, reader);
    const summary = summarizeEml(email);
    expect(summary.subject).toBe('Hello MSG');
    expect(summary.from).toContain('alice@example.com');
    expect(summary.to).toContain('bob@example.com');
    expect(summary.cc).toContain('carol@example.com');
    expect(email.html).toContain('<p>html body</p>');
    expect(email.attachments).toHaveLength(2);
    expect(email.attachments[0].related).toBe(false);
    expect(email.attachments[1].related).toBe(true);
    expect(email.attachments[1].contentId).toBe('logo@example');
  });

  it('resolveHtmlBody prefers bodyHtml over RTF', () => {
    expect(resolveHtmlBody({ bodyHtml: '<b>x</b>', compressedRtf: new Uint8Array([1]) })).toBe(
      '<b>x</b>'
    );
  });

  it('resolveHtmlBody decodes cp1252 french accents from HTML bytes', () => {
    const cp1252 = new Uint8Array([
      0x3c, 0x70, 0x3e, // <p>
      0x52, 0xe9, 0x73, 0x75, 0x6d, 0xe9, // R\xe9sum\xe9
      0x20,
      0x64, 0x27, 0xe9, 0x74, 0xe9, // d'\xe9t\xe9
      0x20,
      0x26, 0x20,
      0x63, 0x61, 0x66, 0xe9, // caf\xe9
      0x3c, 0x2f, 0x70, 0x3e, // </p>
    ]);
    expect(resolveHtmlBody({ html: cp1252.buffer })).toContain("Résumé d'été & café");
  });

  it('resolveHtmlBody decodes cp1252 symbols like euro and smart quotes', () => {
    const cp1252 = new Uint8Array([
      0x3c, 0x70, 0x3e, // <p>
      0x50, 0x72, 0x69, 0x78, 0x20, // Prix
      0x3a, 0x20,
      0x31, 0x30, 0x80, // 10€
      0x20, 0x93, // en dash
      0x20, 0x93, 0x62, 0x6f, 0x6e, 0x6a, 0x6f, 0x75, 0x72, 0x94, // “bonjour”
      0x3c, 0x2f, 0x70, 0x3e, // </p>
    ]);
    const decoded = resolveHtmlBody({ html: cp1252.buffer });
    expect(decoded).toContain('10€');
    expect(decoded).toContain('“bonjour”');
  });
});

describe('parseMsg samples', () => {
  it('parses sent.msg headers and plain body', async () => {
    const email = await parseMsg(readMsg('sent.msg'));
    expect(email.subject).toBe('Sent time');
    expect(summarizeEml(email).from).toContain('xmailuser@xmailserver.test');
    expect(email.to?.[0]?.address).toBe('xmailuser@xmailserver.test');
    expect(email.text.length).toBeGreaterThan(0);
  });

  it('parses attachments from with-attachment.msg', async () => {
    const email = await parseMsg(readMsg('with-attachment.msg'));
    expect(email.subject).toBe('attachmentFiles');
    expect(email.attachments.length).toBe(3);
    expect(email.attachments.map((a) => a.filename)).toEqual(
      expect.arrayContaining(['jpg.jpg', 'png.png', 'tif.tif'])
    );
    expect(email.attachments.every((a) => a.content.byteLength > 0)).toBe(true);
  });

  it('extracts HTML + resolves inline cid from attach-and-inline.msg', async () => {
    const email = await parseMsg(readMsg('attach-and-inline.msg'));
    expect(email.subject).toBe('Attach and inline');
    expect(email.html).toMatch(/<html/i);
    expect(email.html).toContain('cid:image001.png@01D78380.EF6DC500');

    const inline = email.attachments.filter((a) => a.contentId);
    const regular = email.attachments.filter((a) => !a.contentId);
    expect(inline.some((a) => a.filename === 'image001.png')).toBe(true);
    expect(regular.some((a) => a.filename === 'attach.png')).toBe(true);

    const resolved = resolveCidImages(email.html, email.attachments);
    expect(resolved).toContain('data:image/png;base64,');
    expect(resolved).not.toContain('cid:image001.png@01D78380.EF6DC500');

    const safe = sanitizeHtml(resolved);
    expect(safe).toContain('data:image/png;base64,');
  });
});

describe('parseMail dispatch', () => {
  it('routes .msg to the MSG parser', async () => {
    const email = await parseMail(readMsg('sent.msg'), 'sent.msg');
    expect(email.subject).toBe('Sent time');
  });
});
