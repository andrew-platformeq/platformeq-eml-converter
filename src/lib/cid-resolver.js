// Resolves inline `cid:` image references to self-contained `data:` URLs.
//
// Emails embed logos/signatures as separate MIME parts referenced from the
// HTML by Content-ID (e.g. <img src="cid:logo@acme">). We turn each referenced
// part into a base64 data: URL and rewrite the references, so the body is fully
// self-contained and needs zero network access to display.
//
// Runs BEFORE sanitization (which preserves data: URLs). DOM-tree based for
// HTML; CSS url(cid:) is handled with a targeted CSS regex (CSS, not HTML).

/** Strip surrounding angle brackets/whitespace and lowercase for lenient matching. */
function normalizeCid(raw) {
  return (raw || '').trim().replace(/^<|>$/g, '').trim().toLowerCase();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Build a map of normalized Content-ID -> data: URL for attachments that carry
 * a contentId (the inline parts).
 */
export function buildCidMap(attachments = []) {
  const map = new Map();
  for (const att of attachments) {
    if (!att.contentId || !att.content) continue;
    const mime = att.mimeType || 'application/octet-stream';
    const dataUrl = `data:${mime};base64,${arrayBufferToBase64(att.content)}`;
    map.set(normalizeCid(att.contentId), dataUrl);
  }
  return map;
}

function replaceCidInCss(css, map) {
  return css.replace(
    /url\(\s*['"]?\s*cid:([^'")\s]+)\s*['"]?\s*\)/gi,
    (whole, id) => {
      const key = normalizeCid(id);
      return map.has(key) ? `url("${map.get(key)}")` : whole;
    }
  );
}

/**
 * Replace cid: references in an HTML string with data: URLs.
 * @param {string} html
 * @param {Array} attachments parsed attachments (need contentId + content ArrayBuffer)
 * @returns {string} HTML with inline images resolved
 */
export function resolveCidImages(html, attachments = []) {
  if (!html) return html;
  const map = buildCidMap(attachments);
  if (map.size === 0) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // src / background / poster attributes that may hold cid:
  doc.querySelectorAll('[src],[background],[poster]').forEach((el) => {
    for (const attr of ['src', 'background', 'poster']) {
      const value = el.getAttribute(attr);
      if (value && /^\s*cid:/i.test(value)) {
        const key = normalizeCid(value.trim().slice(value.trim().indexOf(':') + 1));
        if (map.has(key)) el.setAttribute(attr, map.get(key));
      }
    }
  });

  // Inline style attributes: background:url(cid:...)
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style');
    if (style && /cid:/i.test(style)) {
      el.setAttribute('style', replaceCidInCss(style, map));
    }
  });

  // <style> blocks
  doc.querySelectorAll('style').forEach((styleEl) => {
    if (/cid:/i.test(styleEl.textContent)) {
      styleEl.textContent = replaceCidInCss(styleEl.textContent, map);
    }
  });

  return doc.body ? doc.body.innerHTML : html;
}
