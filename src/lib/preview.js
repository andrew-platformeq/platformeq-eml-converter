// Decides how an attachment should be presented. Pure function so it can be
// unit-tested without the DOM.
import { PREVIEW_IMAGE, PREVIEW_PDF } from './constants.js';

/**
 * @param {string} mimeType
 * @returns {'image' | 'pdf' | 'download'}
 */
export function classifyPreview(mimeType) {
  const type = (mimeType || '').toLowerCase();
  if (PREVIEW_IMAGE.test(type)) return 'image';
  if (type === PREVIEW_PDF) return 'pdf';
  return 'download';
}
