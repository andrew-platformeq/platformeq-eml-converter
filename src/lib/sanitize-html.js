// DOM-tree-based HTML sanitizer. NO regex on HTML strings, NO dependencies.
//
// This is defense-in-depth, NOT the security boundary: the viewer renders this
// inside a `sandbox` iframe with no `allow-scripts`, so scripts cannot execute
// regardless. Sanitization reduces attack surface and cleans up rendering.

// Elements removed entirely (active content, navigation hijacks, external refs).
const BLOCKED_ELEMENTS = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'link', 'base', 'meta', 'noscript', 'template',
];

// URL-bearing attributes we scheme-check.
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'background', 'poster', 'cite'];

// Schemes allowed in URL attributes. `cid:` stays so Milestone 3 can resolve
// inline images; `data:` stays for resolved inline images.
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'cid:', 'data:']);

function hasUnsafeScheme(value) {
  const v = (value || '').trim();
  // Strip whitespace (tab/newline/CR/FF) that can hide a scheme, e.g.
  // "java\tscript:" — browsers normalize these, so we must too before matching.
  const collapsed = v.replace(/\s+/g, '').toLowerCase();
  const match = collapsed.match(/^([a-z][a-z0-9+.\-]*):/);
  if (!match) return false; // relative URL, anchor, or no scheme — safe
  return !SAFE_SCHEMES.has(`${match[1]}:`);
}

/**
 * Sanitize an email HTML string into a safe-to-render fragment.
 * @param {string} html
 * @returns {string} sanitized inner HTML of <body>
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1. Remove dangerous elements outright.
  doc.querySelectorAll(BLOCKED_ELEMENTS.join(',')).forEach((el) => el.remove());

  // 2. Walk every remaining element and clean its attributes.
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      // Drop all inline event handlers (onclick, onerror, onload, ...).
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      // Drop URL attributes carrying an unsafe scheme (javascript:, vbscript:, ...).
      if (URL_ATTRS.includes(name) && hasUnsafeScheme(attr.value)) {
        el.removeAttribute(attr.name);
        continue;
      }
      // srcset can carry multiple URLs; if any candidate is unsafe, drop it whole.
      if (name === 'srcset' && hasUnsafeScheme(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // 3. Neutralize forms so nothing can be submitted anywhere.
  doc.querySelectorAll('form').forEach((form) => {
    form.removeAttribute('action');
    form.removeAttribute('method');
  });

  return doc.body ? doc.body.innerHTML : '';
}
