import { parseEml } from './parse-eml.js';
import { parseMsg } from './parse-msg.js';

/**
 * Dispatch to the right parser based on filename extension.
 * Both paths return a postal-mime-shaped email object.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} filename
 */
export async function parseMail(arrayBuffer, filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.msg')) {
    return parseMsg(arrayBuffer);
  }
  return parseEml(arrayBuffer);
}
