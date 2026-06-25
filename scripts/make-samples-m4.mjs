// Builds Milestone 4 test-matrix samples:
//   samples/with-pdf.eml    - HTML body + a real (minimal, valid) PDF attachment
//   samples/nested.eml      - an email carrying another email (message/rfc822)
//   samples/empty-body.eml  - headers only, no body (edge case)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Build a tiny but structurally valid PDF with a correct xref table ---
function buildMinimalPdf() {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '<</Length 58>>\nstream\nBT /F1 24 Tf 40 70 Td (EML Viewer test PDF) Tj ET\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function b64(buf) {
  return buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

// --- with-pdf.eml ---
const pdfB64 = b64(buildMinimalPdf());
const withPdf = [
  'From: Reports <reports@example.com>',
  'To: You <you@example.com>',
  'Subject: [TEST] PDF attachment',
  'Date: Tue, 17 Jun 2026 14:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="mix"',
  '',
  '--mix',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><h1>PDF attachment test</h1><p>Click "report.pdf" above to preview it in a new tab.</p></body></html>',
  '',
  '--mix',
  'Content-Type: application/pdf',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="report.pdf"',
  '',
  pdfB64,
  '',
  '--mix--',
  '',
].join('\r\n');
writeFileSync(join(root, 'samples/with-pdf.eml'), withPdf);

// --- nested.eml (message/rfc822) ---
const inner = readFileSync(join(root, 'samples/basic.eml'), 'utf8').replace(/\r?\n/g, '\r\n');
const nested = [
  'From: Forwarder <fwd@example.com>',
  'To: You <you@example.com>',
  'Subject: [TEST] forwarded email (nested rfc822)',
  'Date: Tue, 17 Jun 2026 15:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="nst"',
  '',
  '--nst',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'See the forwarded message attached.',
  '',
  '--nst',
  'Content-Type: message/rfc822',
  'Content-Disposition: attachment; filename="forwarded.eml"',
  '',
  inner,
  '',
  '--nst--',
  '',
].join('\r\n');
writeFileSync(join(root, 'samples/nested.eml'), nested);

// --- empty-body.eml ---
const empty = [
  'From: Quiet <quiet@example.com>',
  'To: You <you@example.com>',
  'Subject: [TEST] no body',
  'Date: Tue, 17 Jun 2026 16:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '',
].join('\r\n');
writeFileSync(join(root, 'samples/empty-body.eml'), empty);

console.log('wrote samples/with-pdf.eml, samples/nested.eml, samples/empty-body.eml');
