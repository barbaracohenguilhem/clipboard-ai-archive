import { looksLikeSecret, DEFAULT_BLOCKLIST } from '../shared/secrets.js';
import { classifyType } from '../shared/classifier.js';
import { addClip, findByHash } from './storage.js';

export async function processClipboardEvent({
  text,
  html,
  hash,
  source_url,
  source_title,
  blocklist = DEFAULT_BLOCKLIST,
} = {}) {
  if (!text || typeof text !== 'string') {
    return { stored: false, reason: 'empty' };
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

  const id = await addClip({
    text,
    html: html || null,
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
