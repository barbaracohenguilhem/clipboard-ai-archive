import { updateTags } from './storage.js';

const SYSTEM_PROMPT =
  'You assign topical tags to clipboard items. ' +
  'Reply with 1-3 short tags, lowercase, kebab-case, ' +
  'comma-separated, no explanation. Example: react, hooks, performance';

const MAX_INPUT_CHARS = 1500;

export function buildTaggerPrompt(text) {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

export function parseTagResponse(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .map((t) => t.replace(/\s+/g, '-'))
    .map((t) => t.replace(/[^a-z0-9-]/g, ''))
    .map((t) => t.replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter((t) => t.length > 0 && t.length <= 30)
    .slice(0, 3);
}

async function getModel() {
  // Chrome's built-in language model. API path has shifted between versions;
  // try the modern global first, then legacy paths.
  try {
    // eslint-disable-next-line no-undef
    if (typeof LanguageModel !== 'undefined' && LanguageModel?.create) {
      // eslint-disable-next-line no-undef
      return await LanguageModel.create({ initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }] });
    }
  } catch { /* try next */ }
  try {
    if (typeof self !== 'undefined' && self.ai?.languageModel?.create) {
      return await self.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });
    }
  } catch { /* try next */ }
  try {
    if (typeof globalThis !== 'undefined' && globalThis.ai?.languageModel?.create) {
      return await globalThis.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });
    }
  } catch { /* fall through */ }
  return null;
}

export async function isAvailable() {
  try {
    const session = await getModel();
    if (!session) return false;
    if (typeof session.destroy === 'function') session.destroy();
    return true;
  } catch {
    return false;
  }
}

export async function tagClip(clipId, text) {
  let session = null;
  try {
    session = await getModel();
    if (!session) return [];
    const prompt = buildTaggerPrompt(text);
    const raw = await session.prompt(prompt);
    const tags = parseTagResponse(raw);
    if (tags.length > 0) await updateTags(clipId, tags);
    return tags;
  } catch (err) {
    console.warn('tagger failed', err);
    return [];
  } finally {
    if (session && typeof session.destroy === 'function') {
      try { session.destroy(); } catch { /* noop */ }
    }
  }
}
