import { looksLikeSecret, DEFAULT_BLOCKLIST } from '../shared/secrets.js';
import { classifyType } from '../shared/classifier.js';
import { addClip, findByHash } from './storage.js';

const MAX_CLIP_BYTES = 100 * 1024; // 100KB

// Strip <script>, <style>, and inline event handlers from HTML before storage.
// We don't render this HTML (we treat it as text), but we sanitize anyway as
// defense-in-depth in case a future feature renders it (e.g., HTML preview tab).
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return null;
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export async function processClipboardEvent({
  text,
  html,
  hash,
  source_url,
  source_title,
  blocklist = DEFAULT_BLOCKLIST,
} = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { stored: false, reason: 'empty' };
  }

  if (text.length > MAX_CLIP_BYTES) {
    return { stored: false, reason: 'too_large' };
  }

  const existing = await findByHash(hash);
  if (existing) {
    return { stored: false, reason: 'duplicate' };
  }

  if (
    looksLikeSecret({
      text,
      sourceUrl: source_url,
      sourceTitle: source_title || '',
      blocklist,
    })
  ) {
    return { stored: false, reason: 'secret' };
  }

  const type = classifyType(text);
  const cleanHtml = sanitizeHtml(html);

  const id = await addClip({
    text,
    html: cleanHtml,
    hash,
    type,
    tags: [],
    source_url: source_url || null,
    source_title: source_title || null,
    created_at: Date.now(),
    pinned: false,
  });

  return { stored: true, id, type };
}
