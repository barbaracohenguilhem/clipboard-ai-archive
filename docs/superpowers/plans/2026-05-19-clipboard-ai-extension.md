# Clipboard AI Archive — Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-first Chrome Manifest V3 extension that auto-archives clipboard items, filters secrets, classifies by type via heuristics, tags topics via on-device Gemini Nano, and surfaces history through a popup and side panel.

**Architecture:** Service worker orchestrates an offscreen-document clipboard poller, runs items through a secret filter and heuristic type classifier, persists to IndexedDB, then asynchronously enriches with Gemini Nano topic tags. UI surfaces (popup, side panel, settings) read from IndexedDB and subscribe to live updates over `chrome.runtime` messages.

**Tech Stack:** JavaScript (ES2022 modules), Chrome Manifest V3, IndexedDB (no ORM, thin Promise wrapper), Chrome built-in AI (`window.ai.languageModel` / `LanguageModel`), Web Crypto for hashing, Vitest + `fake-indexeddb` for unit tests, Playwright for one smoke test.

**Spec:** See `docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md`.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Initialize npm and add dev deps**

Run:
```bash
cd "/Users/baba/clipboard extension"
npm init -y
npm install --save-dev vitest fake-indexeddb @vitest/coverage-v8
```

- [ ] **Step 2: Write `package.json` scripts**

Replace `package.json` scripts block with:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage"
}
```
Also add at top level:
```json
"type": "module"
```

- [ ] **Step 3: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Write `tests/setup.js`**

Create `tests/setup.js`:
```js
import 'fake-indexeddb/auto';
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
coverage/
dist/
.DS_Store
*.log
```

- [ ] **Step 6: Write minimal `README.md`**

```md
# Clipboard AI Archive

Privacy-first Chrome extension that archives clipboard history with on-device AI categorization.

## Develop
- `npm test` — run unit tests
- Load unpacked in `chrome://extensions` (Developer Mode) pointing at this folder

See `docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md` for design.
```

- [ ] **Step 7: Initialize git and commit**

```bash
git init
git add .
git commit -m "chore: project scaffold with vitest"
```

---

## Task 2: Secret Detection Module

**Files:**
- Create: `shared/secrets.js`
- Test: `tests/secrets.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/secrets.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { looksLikeSecret, DEFAULT_BLOCKLIST } from '../shared/secrets.js';

describe('looksLikeSecret', () => {
  it('returns false for normal text', () => {
    expect(looksLikeSecret({ text: 'hello world' })).toBe(false);
  });

  it('flags strong passwords', () => {
    expect(looksLikeSecret({ text: 'P@ssw0rd!xK9z' })).toBe(true);
  });

  it('flags OTP-shaped strings with verification context', () => {
    expect(
      looksLikeSecret({ text: '482913', sourceTitle: 'Verify your email' })
    ).toBe(true);
  });

  it('does NOT flag 6-digit numbers without verification context', () => {
    expect(
      looksLikeSecret({ text: '482913', sourceTitle: 'Apartment listings' })
    ).toBe(false);
  });

  it('flags OpenAI-style API keys', () => {
    expect(
      looksLikeSecret({ text: 'sk-abcdefghij1234567890ABCDEF' })
    ).toBe(true);
  });

  it('flags GitHub PATs', () => {
    expect(
      looksLikeSecret({ text: 'ghp_' + 'a'.repeat(36) })
    ).toBe(true);
  });

  it('flags JWTs (three base64 segments)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123signature';
    expect(looksLikeSecret({ text: jwt })).toBe(true);
  });

  it('flags credit card numbers (Luhn-valid)', () => {
    expect(looksLikeSecret({ text: '4539578763621486' })).toBe(true);
  });

  it('does NOT flag 16 random digits that fail Luhn', () => {
    expect(looksLikeSecret({ text: '4539578763621487' })).toBe(false);
  });

  it('flags content from blocked domains', () => {
    expect(
      looksLikeSecret({
        text: 'anything',
        sourceUrl: 'https://1password.com/vault',
        blocklist: DEFAULT_BLOCKLIST,
      })
    ).toBe(true);
  });

  it('respects custom blocklist additions', () => {
    expect(
      looksLikeSecret({
        text: 'plain',
        sourceUrl: 'https://internal-bank.example.com/x',
        blocklist: ['internal-bank.example.com'],
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `shared/secrets.js`**

```js
export const DEFAULT_BLOCKLIST = [
  '1password.com',
  'lastpass.com',
  'bitwarden.com',
  'dashlane.com',
  'keepersecurity.com',
];

const API_KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bxox[bpsa]-[A-Za-z0-9-]+\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OTP_CONTEXT_RE = /verify|code|auth|login|otp|2fa|one[- ]?time/i;

function passesLuhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function looksLikePassword(text) {
  if (text.length < 8 || text.length > 64) return false;
  if (/\s/.test(text)) return false;
  const hasUpper = /[A-Z]/.test(text);
  const hasLower = /[a-z]/.test(text);
  const hasDigit = /\d/.test(text);
  const hasSymbol = /[^A-Za-z0-9]/.test(text);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function looksLikeSecret({
  text,
  sourceUrl = null,
  sourceTitle = '',
  blocklist = DEFAULT_BLOCKLIST,
} = {}) {
  if (typeof text !== 'string' || text.length === 0) return false;

  const host = sourceUrl ? hostnameOf(sourceUrl) : null;
  if (host && blocklist.some((d) => host === d || host.endsWith('.' + d))) {
    return true;
  }

  const trimmed = text.trim();

  if (/^\d{6,8}$/.test(trimmed) && OTP_CONTEXT_RE.test(sourceTitle || '')) {
    return true;
  }

  for (const re of API_KEY_PATTERNS) {
    if (re.test(trimmed)) return true;
  }

  if (JWT_RE.test(trimmed) && trimmed.length > 30) return true;

  const digitsOnly = trimmed.replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(digitsOnly) && passesLuhn(digitsOnly)) {
    return true;
  }

  if (looksLikePassword(trimmed)) return true;

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/secrets.js tests/secrets.test.js
git commit -m "feat(secrets): add secret-detection module with Luhn, OTP, API-key rules"
```

---

## Task 3: Type Classifier (Heuristics)

**Files:**
- Create: `shared/classifier.js`
- Test: `tests/classifier.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/classifier.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { classifyType } from '../shared/classifier.js';

describe('classifyType', () => {
  it('detects URL', () => {
    expect(classifyType('https://example.com/path?q=1')).toBe('URL');
    expect(classifyType('http://localhost:3000')).toBe('URL');
  });

  it('detects Email', () => {
    expect(classifyType('hello@example.com')).toBe('Email');
  });

  it('detects Phone', () => {
    expect(classifyType('+1 (555) 123-4567')).toBe('Phone');
    expect(classifyType('+5511987654321')).toBe('Phone');
  });

  it('detects Color (hex)', () => {
    expect(classifyType('#ff00aa')).toBe('Color');
    expect(classifyType('#FFF')).toBe('Color');
  });

  it('detects Color (rgb/hsl)', () => {
    expect(classifyType('rgb(255, 0, 0)')).toBe('Color');
    expect(classifyType('hsl(120, 100%, 50%)')).toBe('Color');
  });

  it('detects Code', () => {
    expect(
      classifyType('function foo(x) {\n  return x + 1;\n}')
    ).toBe('Code');
    expect(
      classifyType('def greet(name):\n    print(f"hi {name}")')
    ).toBe('Code');
  });

  it('falls back to Text for prose', () => {
    expect(
      classifyType('The quick brown fox jumps over the lazy dog.')
    ).toBe('Text');
  });

  it('returns Text for empty string', () => {
    expect(classifyType('')).toBe('Text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shared/classifier.js`**

```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d[\d\s().-]{7,}\d$/;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_HSL_RE = /^(rgb|rgba|hsl|hsla)\s*\([^)]+\)$/i;

const CODE_KEYWORDS =
  /\b(function|def|import|export|class|const|let|var|return|public|private|if|else|for|while|=>|require)\b/;

function looksLikeCode(text) {
  const lines = text.split('\n');
  let score = 0;
  if (CODE_KEYWORDS.test(text)) score += 2;
  if (lines.length > 1 && lines.some((l) => /^(\s{2,}|\t)/.test(l))) score += 1;
  if (/[{};]/.test(text) && /[(){}[\]]/.test(text)) score += 1;
  const symbolRatio =
    (text.match(/[{}();=<>]/g) || []).length / Math.max(text.length, 1);
  if (symbolRatio > 0.03) score += 1;
  return score >= 3;
}

export function classifyType(text) {
  if (typeof text !== 'string' || text.length === 0) return 'Text';
  const trimmed = text.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return 'URL';
    } catch {
      /* fall through */
    }
  }

  if (EMAIL_RE.test(trimmed)) return 'Email';
  if (PHONE_RE.test(trimmed) && /\d/.test(trimmed)) return 'Phone';
  if (HEX_COLOR_RE.test(trimmed) || RGB_HSL_RE.test(trimmed)) return 'Color';
  if (looksLikeCode(text)) return 'Code';

  return 'Text';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all classifier tests PASS plus all secrets tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/classifier.js tests/classifier.test.js
git commit -m "feat(classifier): add heuristic type classifier"
```

---

## Task 4: Full-Text Search Tokenizer

**Files:**
- Create: `shared/fts.js`
- Test: `tests/fts.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/fts.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { tokenize } from '../shared/fts.js';

describe('tokenize', () => {
  it('lowercases and splits on non-word', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('drops short tokens (<3 chars)', () => {
    expect(tokenize('a an the cat')).toEqual(['the', 'cat']);
  });

  it('drops stopwords', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('deduplicates tokens', () => {
    expect(tokenize('cat cat cat dog')).toEqual(['cat', 'dog']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `shared/fts.js`**

```js
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'her', 'was', 'one', 'our', 'out', 'his', 'has',
  'had', 'who', 'this', 'that', 'with', 'from', 'they',
  'will', 'would', 'there', 'their', 'what', 'about',
]);

export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const raw = text.toLowerCase().split(/[^a-z0-9]+/);
  const out = new Set();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return [...out];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/fts.js tests/fts.test.js
git commit -m "feat(fts): add tokenizer with stopword filtering"
```

---

## Task 5: Storage Layer (IndexedDB)

**Files:**
- Create: `background/storage.js`
- Test: `tests/storage.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/storage.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, addClip, listRecent, deleteClip, findByHash, updateTags, deleteOlderThan, getStats } from '../background/storage.js';

beforeEach(async () => {
  // fake-indexeddb resets per test file load, but we delete the db to be safe
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('storage', () => {
  it('opens the database and creates stores', async () => {
    const db = await openDb();
    expect([...db.objectStoreNames]).toContain('clips');
    db.close();
  });

  it('addClip persists and returns id', async () => {
    const id = await addClip({
      text: 'hello',
      html: null,
      hash: 'h1',
      type: 'Text',
      tags: [],
      source_url: null,
      source_title: null,
      created_at: Date.now(),
      pinned: false,
    });
    expect(typeof id).toBe('number');
  });

  it('listRecent returns items newest first', async () => {
    await addClip({ text: 'a', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'b', hash: 'h2', type: 'Text', tags: [], created_at: 200, pinned: false });
    const items = await listRecent(10);
    expect(items.map((c) => c.text)).toEqual(['b', 'a']);
  });

  it('findByHash returns existing clip', async () => {
    await addClip({ text: 'a', hash: 'unique-h', type: 'Text', tags: [], created_at: 1, pinned: false });
    const found = await findByHash('unique-h');
    expect(found.text).toBe('a');
  });

  it('findByHash returns null when missing', async () => {
    const found = await findByHash('nope');
    expect(found).toBeNull();
  });

  it('updateTags writes tags onto an existing clip', async () => {
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await updateTags(id, ['react', 'hooks']);
    const items = await listRecent(1);
    expect(items[0].tags).toEqual(['react', 'hooks']);
  });

  it('deleteClip removes the row', async () => {
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await deleteClip(id);
    const items = await listRecent(10);
    expect(items).toHaveLength(0);
  });

  it('deleteOlderThan only removes unpinned old items', async () => {
    await addClip({ text: 'old', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'pinned-old', hash: 'h2', type: 'Text', tags: [], created_at: 100, pinned: true });
    await addClip({ text: 'new', hash: 'h3', type: 'Text', tags: [], created_at: 5000, pinned: false });
    const removed = await deleteOlderThan(1000);
    expect(removed).toBe(1);
    const items = await listRecent(10);
    expect(items.map((c) => c.text).sort()).toEqual(['new', 'pinned-old']);
  });

  it('getStats returns count and earliest', async () => {
    await addClip({ text: 'a', hash: 'h1', type: 'Text', tags: [], created_at: 100, pinned: false });
    await addClip({ text: 'b', hash: 'h2', type: 'Text', tags: [], created_at: 200, pinned: false });
    const stats = await getStats();
    expect(stats.count).toBe(2);
    expect(stats.earliest).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `background/storage.js`**

```js
const DB_NAME = 'clipboard-archive';
const DB_VERSION = 1;
const STORE = 'clips';

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by_created_at', 'created_at');
        store.createIndex('by_type', 'type');
        store.createIndex('by_hash', 'hash', { unique: false });
        store.createIndex('by_tag', 'tags', { multiEntry: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => {
      db.close();
      Promise.resolve(result).then(resolve, reject);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('tx aborted'));
    };
  });
}

export async function addClip(clip) {
  return withStore('readwrite', (store) => promisify(store.add(clip)));
}

export async function findByHash(hash) {
  return withStore('readonly', async (store) => {
    const idx = store.index('by_hash');
    const result = await promisify(idx.get(hash));
    return result || null;
  });
}

export async function listRecent(limit = 20) {
  return withStore('readonly', (store) => {
    const out = [];
    return new Promise((resolve, reject) => {
      const idx = store.index('by_created_at');
      const req = idx.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && out.length < limit) {
          out.push(cursor.value);
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function updateTags(id, tags) {
  return withStore('readwrite', async (store) => {
    const clip = await promisify(store.get(id));
    if (!clip) return;
    clip.tags = tags;
    await promisify(store.put(clip));
  });
}

export async function deleteClip(id) {
  return withStore('readwrite', (store) => promisify(store.delete(id)));
}

export async function deleteOlderThan(cutoffMs) {
  return withStore('readwrite', (store) => {
    let removed = 0;
    return new Promise((resolve, reject) => {
      const idx = store.index('by_created_at');
      const range = IDBKeyRange.upperBound(cutoffMs, true);
      const req = idx.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (!cursor.value.pinned) {
            cursor.delete();
            removed++;
          }
          cursor.continue();
        } else {
          resolve(removed);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getStats() {
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const countReq = store.count();
      countReq.onsuccess = () => {
        const count = countReq.result;
        const idx = store.index('by_created_at');
        const firstReq = idx.openCursor();
        firstReq.onsuccess = (e) => {
          const cursor = e.target.result;
          resolve({ count, earliest: cursor ? cursor.value.created_at : null });
        };
        firstReq.onerror = () => reject(firstReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all storage tests PASS.

- [ ] **Step 5: Commit**

```bash
git add background/storage.js tests/storage.test.js
git commit -m "feat(storage): add IndexedDB layer with CRUD + retention helpers"
```

---

## Task 6: Capture Pipeline

**Files:**
- Create: `background/capture-pipeline.js`
- Create: `shared/hash.js`
- Test: `tests/capture-pipeline.test.js`

- [ ] **Step 1: Implement `shared/hash.js`**

```js
export async function sha1(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/capture-pipeline.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { processClipboardEvent } from '../background/capture-pipeline.js';
import { listRecent } from '../background/storage.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('processClipboardEvent', () => {
  it('persists a normal text copy', async () => {
    const result = await processClipboardEvent({
      text: 'hello world',
      html: null,
      hash: 'h-1',
      source_url: 'https://example.com',
      source_title: 'Example',
    });
    expect(result.stored).toBe(true);
    expect(result.id).toBeTypeOf('number');
    const items = await listRecent(10);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Text');
  });

  it('skips an item that looks like a secret', async () => {
    const result = await processClipboardEvent({
      text: 'sk-abcdefghij1234567890ABCDEF',
      html: null,
      hash: 'h-2',
      source_url: 'https://openai.com',
      source_title: 'API Keys',
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toBe('secret');
    const items = await listRecent(10);
    expect(items).toHaveLength(0);
  });

  it('skips a duplicate hash', async () => {
    await processClipboardEvent({
      text: 'hello', html: null, hash: 'dup', source_url: null, source_title: null,
    });
    const second = await processClipboardEvent({
      text: 'hello', html: null, hash: 'dup', source_url: null, source_title: null,
    });
    expect(second.stored).toBe(false);
    expect(second.reason).toBe('duplicate');
  });

  it('classifies URLs', async () => {
    const result = await processClipboardEvent({
      text: 'https://example.com/page',
      html: null,
      hash: 'h-url',
      source_url: null,
      source_title: null,
    });
    expect(result.stored).toBe(true);
    const items = await listRecent(10);
    expect(items[0].type).toBe('URL');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `background/capture-pipeline.js`**

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/hash.js background/capture-pipeline.js tests/capture-pipeline.test.js
git commit -m "feat(capture): wire secret filter + classifier + dedup into pipeline"
```

---

## Task 7: AI Tagger (Gemini Nano)

**Files:**
- Create: `background/tagger.js`
- Test: `tests/tagger.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/tagger.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseTagResponse, buildTaggerPrompt } from '../background/tagger.js';

describe('parseTagResponse', () => {
  it('parses a normal comma list', () => {
    expect(parseTagResponse('react, hooks, performance'))
      .toEqual(['react', 'hooks', 'performance']);
  });

  it('lowercases and kebab-cases', () => {
    expect(parseTagResponse('React Hooks, State Management'))
      .toEqual(['react-hooks', 'state-management']);
  });

  it('drops tags longer than 30 chars', () => {
    const long = 'a'.repeat(40);
    expect(parseTagResponse(`react, ${long}`))
      .toEqual(['react']);
  });

  it('caps at 3 tags', () => {
    expect(parseTagResponse('one, two, three, four, five'))
      .toEqual(['one', 'two', 'three']);
  });

  it('returns [] on empty', () => {
    expect(parseTagResponse('')).toEqual([]);
  });

  it('strips invalid characters', () => {
    expect(parseTagResponse('hello!, world?, ok')).toEqual(['hello', 'world', 'ok']);
  });
});

describe('buildTaggerPrompt', () => {
  it('truncates long input to 1500 chars', () => {
    const huge = 'x'.repeat(5000);
    const p = buildTaggerPrompt(huge);
    expect(p.length).toBeLessThanOrEqual(1500 + 200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `background/tagger.js`**

```js
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
  // Chrome's built-in language model. API path varies by Chrome version;
  // try the modern path first, then legacy.
  // eslint-disable-next-line no-undef
  if (typeof LanguageModel !== 'undefined' && LanguageModel?.create) {
    // eslint-disable-next-line no-undef
    return LanguageModel.create({ systemPrompt: SYSTEM_PROMPT });
  }
  if (typeof self !== 'undefined' && self.ai?.languageModel?.create) {
    return self.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });
  }
  if (typeof globalThis !== 'undefined' && globalThis.ai?.languageModel?.create) {
    return globalThis.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });
  }
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
    if (session && typeof session.destroy === 'function') session.destroy();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add background/tagger.js tests/tagger.test.js
git commit -m "feat(tagger): add Gemini Nano integration with prompt + response parsing"
```

---

## Task 8: Retention Cleanup

**Files:**
- Create: `background/retention.js`
- Test: `tests/retention.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/retention.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { runRetention } from '../background/retention.js';
import { addClip, listRecent } from '../background/storage.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('clipboard-archive');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('runRetention', () => {
  it('removes unpinned items older than retentionDays', async () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    await addClip({ text: 'old', hash: 'h1', type: 'Text', tags: [], created_at: now - 100 * dayMs, pinned: false });
    await addClip({ text: 'newish', hash: 'h2', type: 'Text', tags: [], created_at: now - 10 * dayMs, pinned: false });
    const removed = await runRetention({ retentionDays: 90, now });
    expect(removed).toBe(1);
    const remaining = await listRecent(10);
    expect(remaining.map((c) => c.text)).toEqual(['newish']);
  });

  it('keeps pinned items even if old', async () => {
    const now = Date.now();
    await addClip({ text: 'pinned-ancient', hash: 'h', type: 'Text', tags: [], created_at: 0, pinned: true });
    const removed = await runRetention({ retentionDays: 30, now });
    expect(removed).toBe(0);
  });

  it('returns 0 when retentionDays is null (disabled)', async () => {
    const now = Date.now();
    await addClip({ text: 'old', hash: 'h', type: 'Text', tags: [], created_at: 0, pinned: false });
    const removed = await runRetention({ retentionDays: null, now });
    expect(removed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `background/retention.js`**

```js
import { deleteOlderThan } from './storage.js';

const DAY_MS = 86_400_000;

export async function runRetention({ retentionDays, now = Date.now() }) {
  if (retentionDays == null || retentionDays <= 0) return 0;
  const cutoff = now - retentionDays * DAY_MS;
  return deleteOlderThan(cutoff);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add background/retention.js tests/retention.test.js
git commit -m "feat(retention): add daily-alarm-driven cleanup"
```

---

## Task 9: Shared Message Contracts

**Files:**
- Create: `shared/messages.js`

- [ ] **Step 1: Implement `shared/messages.js`**

```js
export const MSG = {
  // offscreen → service worker
  CLIPBOARD_CHANGED: 'clipboard:changed',
  // service worker → UI surfaces
  CLIP_ADDED: 'clip:added',
  CLIP_UPDATED: 'clip:updated',
  CLIP_DELETED: 'clip:deleted',
  SECRET_SKIPPED: 'capture:secret-skipped',
  // UI → service worker
  GET_CLIPS: 'clips:get',
  DELETE_CLIP: 'clip:delete',
  PIN_CLIP: 'clip:pin',
  UNPIN_CLIP: 'clip:unpin',
  SET_TAGS: 'clip:set-tags',
  PAUSE: 'capture:pause',
  RESUME: 'capture:resume',
  GET_PAUSE_STATE: 'capture:get-pause-state',
  COPY_TO_CLIPBOARD: 'clipboard:copy',
};

export const PAUSE_DURATIONS = {
  TEN_MIN: 10 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  UNTIL_RESTART: 'until_restart',
  FOREVER: 'forever',
};

export const SETTINGS_KEY = 'clipboard-archive-settings';
export const PAUSE_STATE_KEY = 'clipboard-archive-pause';

export const DEFAULT_SETTINGS = {
  retentionDays: 90,
  aiEnabled: true,
  blocklist: [],
};
```

- [ ] **Step 2: Commit**

```bash
git add shared/messages.js
git commit -m "feat(shared): define message constants and default settings"
```

---

## Task 10: Service Worker Entry Point

**Files:**
- Create: `background/service-worker.js`

- [ ] **Step 1: Implement `background/service-worker.js`**

```js
import { processClipboardEvent } from './capture-pipeline.js';
import { tagClip } from './tagger.js';
import { runRetention } from './retention.js';
import { listRecent, deleteClip, updateTags } from './storage.js';
import { MSG, SETTINGS_KEY, DEFAULT_SETTINGS, PAUSE_STATE_KEY } from '../shared/messages.js';

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['CLIPBOARD'],
    justification: 'Poll clipboard for archive capture',
  });
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function getPauseState() {
  const { [PAUSE_STATE_KEY]: state } = await chrome.storage.local.get(PAUSE_STATE_KEY);
  if (!state) return { paused: false };
  if (state.until && state.until !== 'forever' && state.until !== 'until_restart') {
    if (Date.now() > state.until) {
      await chrome.storage.local.remove(PAUSE_STATE_KEY);
      return { paused: false };
    }
  }
  return { paused: true, until: state.until };
}

async function broadcast(type, payload) {
  try {
    await chrome.runtime.sendMessage({ type, payload });
  } catch {
    // no receivers open — fine
  }
}

async function getActiveTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return { source_url: tab?.url || null, source_title: tab?.title || null };
  } catch {
    return { source_url: null, source_title: null };
  }
}

async function handleClipboardChange({ text, html, hash }) {
  const { paused } = await getPauseState();
  if (paused) return;

  const settings = await getSettings();
  const context = await getActiveTabContext();

  const result = await processClipboardEvent({
    text,
    html,
    hash,
    source_url: context.source_url,
    source_title: context.source_title,
    blocklist: settings.blocklist?.length
      ? settings.blocklist
      : undefined,
  });

  if (result.stored) {
    broadcast(MSG.CLIP_ADDED, { id: result.id });
    if (settings.aiEnabled) {
      tagClip(result.id, text).then((tags) => {
        if (tags.length > 0) broadcast(MSG.CLIP_UPDATED, { id: result.id, tags });
      });
    }
  } else if (result.reason === 'secret') {
    broadcast(MSG.SECRET_SKIPPED, {});
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
      title: 'Clipboard skipped',
      message: 'Looked like a secret — not stored.',
    });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case MSG.CLIPBOARD_CHANGED:
      handleClipboardChange(msg.payload);
      break;
    case MSG.GET_CLIPS:
      listRecent(msg.payload?.limit || 50).then(sendResponse);
      return true;
    case MSG.DELETE_CLIP:
      deleteClip(msg.payload.id).then(() => {
        broadcast(MSG.CLIP_DELETED, { id: msg.payload.id });
        sendResponse({ ok: true });
      });
      return true;
    case MSG.SET_TAGS:
      updateTags(msg.payload.id, msg.payload.tags).then(() => {
        broadcast(MSG.CLIP_UPDATED, { id: msg.payload.id, tags: msg.payload.tags });
        sendResponse({ ok: true });
      });
      return true;
    case MSG.PAUSE:
      chrome.storage.local.set({
        [PAUSE_STATE_KEY]: { until: msg.payload.until },
      }).then(() => sendResponse({ ok: true }));
      return true;
    case MSG.RESUME:
      chrome.storage.local.remove(PAUSE_STATE_KEY).then(() => sendResponse({ ok: true }));
      return true;
    case MSG.GET_PAUSE_STATE:
      getPauseState().then(sendResponse);
      return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureOffscreen();
  chrome.alarms.create('retention', { periodInMinutes: 60 * 24 });
});

chrome.runtime.onStartup.addListener(ensureOffscreen);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'retention') {
    const settings = await getSettings();
    await runRetention({ retentionDays: settings.retentionDays });
  }
});

// Side-panel: open on action click
chrome.action.onClicked.addListener?.(() => {
  // Default action is popup; this only fires if no popup configured.
});

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
```

- [ ] **Step 2: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): orchestrate capture, tagging, retention, and UI messaging"
```

---

## Task 11: Offscreen Clipboard Poller

**Files:**
- Create: `offscreen/offscreen.html`
- Create: `offscreen/offscreen.js`

- [ ] **Step 1: Implement `offscreen/offscreen.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Clipboard Poller</title>
  </head>
  <body>
    <textarea id="paste" style="position:absolute;left:-9999px;top:-9999px"></textarea>
    <script type="module" src="offscreen.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement `offscreen/offscreen.js`**

```js
import { sha1 } from '../shared/hash.js';
import { MSG } from '../shared/messages.js';

const POLL_MS = 1000;
let lastHash = null;
let focused = true;
let timer = null;

async function pollOnce() {
  if (!focused) return;
  try {
    let text = '';
    let html = null;
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          html = await blob.text();
        }
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          text = await blob.text();
        }
      }
    } else if (navigator.clipboard?.readText) {
      text = await navigator.clipboard.readText();
    }

    if (!text) return;
    const hash = await sha1(text);
    if (hash === lastHash) return;
    lastHash = hash;

    chrome.runtime.sendMessage({
      type: MSG.CLIPBOARD_CHANGED,
      payload: { text, html, hash },
    });
  } catch (err) {
    // NotAllowedError when tab not focused — expected, just retry next tick
  }
}

function start() {
  if (timer) return;
  timer = setInterval(pollOnce, POLL_MS);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

window.addEventListener('focus', () => {
  focused = true;
  start();
});
window.addEventListener('blur', () => {
  focused = false;
  stop();
});

start();
```

- [ ] **Step 3: Commit**

```bash
git add offscreen/offscreen.html offscreen/offscreen.js
git commit -m "feat(offscreen): poll clipboard on focus and post changes to service worker"
```

---

## Task 12: Popup UI

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

- [ ] **Step 1: Implement `popup/popup.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Clipboard</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header>
      <input id="search" type="search" placeholder="Search clipboard…" autocomplete="off" />
      <div id="filters" role="tablist"></div>
    </header>
    <main>
      <ul id="clip-list"></ul>
      <p id="empty" hidden>Nothing yet. Copy something to get started.</p>
    </main>
    <footer>
      <button id="open-panel">Open full view</button>
      <button id="pause">Pause</button>
      <button id="settings">Settings</button>
    </footer>
    <div id="toast" role="status" aria-live="polite" hidden></div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement `popup/popup.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #111111;
  --muted: #666666;
  --card: #f7f7f7;
  --border: #e5e5e5;
  --accent: #2b6cff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --fg: #f1f1f1;
    --muted: #999;
    --card: #242424;
    --border: #333;
    --accent: #6e9bff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  width: 360px;
  max-height: 600px;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--fg);
  display: flex;
  flex-direction: column;
}
header {
  position: sticky;
  top: 0;
  padding: 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
#search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
}
#filters {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.chip.active { color: var(--fg); border-color: var(--accent); background: var(--accent); color: white; }
main { flex: 1; overflow-y: auto; padding: 8px; }
#clip-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.clip {
  padding: 8px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.clip:hover { border-color: var(--accent); }
.clip-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
.clip-text { margin-top: 4px; max-height: 2.8em; overflow: hidden; }
.clip-tags { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.clip-tag { font-size: 10px; color: var(--muted); background: transparent; padding: 1px 5px; border: 1px solid var(--border); border-radius: 999px; }
footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
}
footer button {
  background: transparent;
  color: var(--muted);
  border: none;
  cursor: pointer;
  font-size: 12px;
}
footer button:hover { color: var(--fg); }
#empty { text-align: center; color: var(--muted); padding: 20px; }
#toast {
  position: fixed;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--fg);
  color: var(--bg);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
}
```

- [ ] **Step 3: Implement `popup/popup.js`**

```js
import { MSG } from '../shared/messages.js';

const TYPES = ['All', 'URL', 'Code', 'Color', 'Email', 'Phone', 'Address', 'Text'];

const state = {
  clips: [],
  filterType: 'All',
  query: '',
};

const els = {
  list: document.getElementById('clip-list'),
  empty: document.getElementById('empty'),
  search: document.getElementById('search'),
  filters: document.getElementById('filters'),
  toast: document.getElementById('toast'),
  openPanel: document.getElementById('open-panel'),
  pause: document.getElementById('pause'),
  settings: document.getElementById('settings'),
};

function renderFilters() {
  els.filters.innerHTML = '';
  for (const t of TYPES) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (t === state.filterType ? ' active' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => {
      state.filterType = t;
      renderFilters();
      renderList();
    });
    els.filters.appendChild(btn);
  }
}

function relativeTime(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function filterClips() {
  const q = state.query.toLowerCase().trim();
  return state.clips.filter((c) => {
    if (state.filterType !== 'All' && c.type !== state.filterType) return false;
    if (!q) return true;
    if (c.text.toLowerCase().includes(q)) return true;
    if (c.tags?.some((t) => t.includes(q))) return true;
    if (c.source_url?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function renderList() {
  const items = filterClips().slice(0, 20);
  els.empty.hidden = items.length > 0;
  els.list.innerHTML = '';
  for (const clip of items) {
    const li = document.createElement('li');
    li.className = 'clip';
    li.dataset.id = clip.id;
    li.innerHTML = `
      <div class="clip-meta">
        <span>${clip.type} · ${relativeTime(clip.created_at)}</span>
        <span>${clip.pinned ? '📌' : ''}</span>
      </div>
      <div class="clip-text"></div>
      <div class="clip-tags"></div>
    `;
    li.querySelector('.clip-text').textContent = clip.text.slice(0, 200);
    const tagsEl = li.querySelector('.clip-tags');
    for (const t of clip.tags || []) {
      const chip = document.createElement('span');
      chip.className = 'clip-tag';
      chip.textContent = `#${t}`;
      tagsEl.appendChild(chip);
    }
    li.addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(clip.text);
      showToast('Copied!');
      if (e.shiftKey) window.close();
    });
    els.list.appendChild(li);
  }
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  setTimeout(() => (els.toast.hidden = true), 1200);
}

async function loadClips() {
  const clips = await chrome.runtime.sendMessage({
    type: MSG.GET_CLIPS,
    payload: { limit: 50 },
  });
  state.clips = clips || [];
  renderList();
}

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  renderList();
});

els.openPanel.addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({ windowId: win.id });
  window.close();
});

els.pause.addEventListener('click', async () => {
  const { paused } = await chrome.runtime.sendMessage({ type: MSG.GET_PAUSE_STATE });
  if (paused) {
    await chrome.runtime.sendMessage({ type: MSG.RESUME });
    els.pause.textContent = 'Pause';
  } else {
    await chrome.runtime.sendMessage({
      type: MSG.PAUSE,
      payload: { until: Date.now() + 10 * 60 * 1000 },
    });
    els.pause.textContent = 'Resume';
  }
});

els.settings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if ([MSG.CLIP_ADDED, MSG.CLIP_UPDATED, MSG.CLIP_DELETED].includes(msg.type)) {
    loadClips();
  }
});

renderFilters();
loadClips();
chrome.runtime.sendMessage({ type: MSG.GET_PAUSE_STATE }).then((s) => {
  if (s?.paused) els.pause.textContent = 'Resume';
});
```

- [ ] **Step 4: Commit**

```bash
git add popup/
git commit -m "feat(popup): list, search, filter, click-to-copy UI"
```

---

## Task 13: Side Panel UI

**Files:**
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`
- Create: `sidepanel/sidepanel.js`

- [ ] **Step 1: Implement `sidepanel/sidepanel.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Clipboard Archive</title>
    <link rel="stylesheet" href="sidepanel.css" />
  </head>
  <body>
    <aside id="rail">
      <h3>Types</h3>
      <ul id="type-list"></ul>
      <h3>Tags</h3>
      <ul id="tag-list"></ul>
      <label><input type="checkbox" id="pinned-only" /> Pinned only</label>
    </aside>
    <section id="list-pane">
      <input id="search" type="search" placeholder="Search…" />
      <ul id="clips"></ul>
    </section>
    <section id="detail">
      <p id="placeholder">Select a clip to view details</p>
      <div id="detail-content" hidden>
        <pre id="d-text"></pre>
        <p id="d-source"></p>
        <p id="d-date"></p>
        <div id="d-tags"></div>
        <input id="d-tag-input" placeholder="Add tag and press Enter" />
        <button id="d-pin">Pin</button>
        <button id="d-copy">Copy</button>
        <button id="d-delete">Delete</button>
      </div>
    </section>
    <script type="module" src="sidepanel.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement `sidepanel/sidepanel.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #111;
  --muted: #666;
  --card: #f7f7f7;
  --border: #e5e5e5;
  --accent: #2b6cff;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #1a1a1a; --fg: #f1f1f1; --muted: #999; --card: #242424; --border: #333; --accent: #6e9bff; }
}
body {
  margin: 0;
  font: 13px/1.4 system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  display: grid;
  grid-template-columns: 180px 1fr 1fr;
  height: 100vh;
}
#rail, #list-pane, #detail { padding: 12px; overflow-y: auto; }
#rail { border-right: 1px solid var(--border); background: var(--card); }
#rail h3 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin: 16px 0 6px; }
#rail ul { list-style: none; padding: 0; margin: 0; }
#rail li { padding: 4px 6px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; }
#rail li:hover, #rail li.active { background: var(--bg); }
#rail li .count { color: var(--muted); }
#list-pane { border-right: 1px solid var(--border); }
#search { width: 100%; padding: 6px 10px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); }
#clips { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.clip { padding: 8px; background: var(--card); border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.clip:hover, .clip.active { border-color: var(--accent); }
.clip-meta { font-size: 11px; color: var(--muted); }
.clip-text { margin-top: 4px; max-height: 2.8em; overflow: hidden; }
#detail pre { white-space: pre-wrap; word-break: break-word; background: var(--card); padding: 10px; border-radius: 6px; max-height: 50vh; overflow-y: auto; }
#d-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.tag-chip { background: var(--card); padding: 2px 8px; border-radius: 999px; font-size: 11px; cursor: pointer; }
.tag-chip:hover { background: var(--accent); color: white; }
button { background: var(--card); color: var(--fg); border: 1px solid var(--border); padding: 4px 10px; border-radius: 4px; cursor: pointer; margin-right: 4px; }
button:hover { border-color: var(--accent); }
#placeholder { color: var(--muted); }
```

- [ ] **Step 3: Implement `sidepanel/sidepanel.js`**

```js
import { MSG } from '../shared/messages.js';

const TYPES = ['URL', 'Code', 'Color', 'Email', 'Phone', 'Address', 'Text'];

const state = {
  clips: [],
  selectedId: null,
  filter: { type: null, tag: null, pinnedOnly: false, query: '' },
};

const els = {
  typeList: document.getElementById('type-list'),
  tagList: document.getElementById('tag-list'),
  pinnedOnly: document.getElementById('pinned-only'),
  search: document.getElementById('search'),
  clips: document.getElementById('clips'),
  placeholder: document.getElementById('placeholder'),
  detailContent: document.getElementById('detail-content'),
  dText: document.getElementById('d-text'),
  dSource: document.getElementById('d-source'),
  dDate: document.getElementById('d-date'),
  dTags: document.getElementById('d-tags'),
  dTagInput: document.getElementById('d-tag-input'),
  dPin: document.getElementById('d-pin'),
  dCopy: document.getElementById('d-copy'),
  dDelete: document.getElementById('d-delete'),
};

function relativeTime(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function tagCounts() {
  const counts = new Map();
  for (const c of state.clips)
    for (const t of c.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function typeCounts() {
  const counts = new Map();
  for (const c of state.clips) counts.set(c.type, (counts.get(c.type) || 0) + 1);
  return counts;
}

function renderRail() {
  const tCounts = typeCounts();
  els.typeList.innerHTML = '';
  for (const t of TYPES) {
    const li = document.createElement('li');
    if (state.filter.type === t) li.classList.add('active');
    li.innerHTML = `<span>${t}</span><span class="count">${tCounts.get(t) || 0}</span>`;
    li.addEventListener('click', () => {
      state.filter.type = state.filter.type === t ? null : t;
      renderAll();
    });
    els.typeList.appendChild(li);
  }
  els.tagList.innerHTML = '';
  for (const [tag, n] of tagCounts()) {
    const li = document.createElement('li');
    if (state.filter.tag === tag) li.classList.add('active');
    li.innerHTML = `<span>#${tag}</span><span class="count">${n}</span>`;
    li.addEventListener('click', () => {
      state.filter.tag = state.filter.tag === tag ? null : tag;
      renderAll();
    });
    els.tagList.appendChild(li);
  }
}

function filteredClips() {
  const q = state.filter.query.toLowerCase();
  return state.clips.filter((c) => {
    if (state.filter.type && c.type !== state.filter.type) return false;
    if (state.filter.tag && !(c.tags || []).includes(state.filter.tag)) return false;
    if (state.filter.pinnedOnly && !c.pinned) return false;
    if (q) {
      if (c.text.toLowerCase().includes(q)) return true;
      if ((c.tags || []).some((t) => t.includes(q))) return true;
      return false;
    }
    return true;
  });
}

function renderList() {
  const list = filteredClips();
  els.clips.innerHTML = '';
  for (const clip of list) {
    const li = document.createElement('li');
    li.className = 'clip' + (clip.id === state.selectedId ? ' active' : '');
    li.innerHTML = `
      <div class="clip-meta">${clip.type} · ${relativeTime(clip.created_at)} ${clip.pinned ? '📌' : ''}</div>
      <div class="clip-text"></div>
    `;
    li.querySelector('.clip-text').textContent = clip.text.slice(0, 200);
    li.addEventListener('click', () => {
      state.selectedId = clip.id;
      renderAll();
    });
    els.clips.appendChild(li);
  }
}

function renderDetail() {
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (!clip) {
    els.placeholder.hidden = false;
    els.detailContent.hidden = true;
    return;
  }
  els.placeholder.hidden = true;
  els.detailContent.hidden = false;
  els.dText.textContent = clip.text;
  els.dSource.textContent = clip.source_url
    ? `From: ${clip.source_title || clip.source_url}`
    : '';
  els.dDate.textContent = new Date(clip.created_at).toLocaleString();
  els.dTags.innerHTML = '';
  for (const t of clip.tags || []) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = `#${t} ✕`;
    chip.addEventListener('click', async () => {
      const next = clip.tags.filter((x) => x !== t);
      await chrome.runtime.sendMessage({ type: MSG.SET_TAGS, payload: { id: clip.id, tags: next } });
    });
    els.dTags.appendChild(chip);
  }
  els.dPin.textContent = clip.pinned ? 'Unpin' : 'Pin';
}

function renderAll() {
  renderRail();
  renderList();
  renderDetail();
}

async function loadClips() {
  const clips = await chrome.runtime.sendMessage({
    type: MSG.GET_CLIPS,
    payload: { limit: 1000 },
  });
  state.clips = clips || [];
  renderAll();
}

els.search.addEventListener('input', () => {
  state.filter.query = els.search.value;
  renderList();
});

els.pinnedOnly.addEventListener('change', () => {
  state.filter.pinnedOnly = els.pinnedOnly.checked;
  renderList();
});

els.dTagInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (!clip) return;
  const tag = els.dTagInput.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  const next = [...new Set([...(clip.tags || []), tag])];
  await chrome.runtime.sendMessage({ type: MSG.SET_TAGS, payload: { id: clip.id, tags: next } });
  els.dTagInput.value = '';
});

els.dCopy.addEventListener('click', async () => {
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (clip) await navigator.clipboard.writeText(clip.text);
});

els.dDelete.addEventListener('click', async () => {
  if (!confirm('Delete this clip?')) return;
  await chrome.runtime.sendMessage({ type: MSG.DELETE_CLIP, payload: { id: state.selectedId } });
  state.selectedId = null;
});

els.dPin.addEventListener('click', async () => {
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (!clip) return;
  // pin toggle: reuse SET_TAGS message is wrong; we need a separate flow.
  // Service worker doesn't currently expose pin toggle — handled below in Task 14.
  await chrome.runtime.sendMessage({
    type: clip.pinned ? MSG.UNPIN_CLIP : MSG.PIN_CLIP,
    payload: { id: clip.id },
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if ([MSG.CLIP_ADDED, MSG.CLIP_UPDATED, MSG.CLIP_DELETED].includes(msg.type)) {
    loadClips();
  }
});

loadClips();
```

- [ ] **Step 4: Commit**

```bash
git add sidepanel/
git commit -m "feat(sidepanel): browse, search, tag edit, detail pane"
```

---

## Task 14: Pin/Unpin Support

**Files:**
- Modify: `background/storage.js` — add `setPinned`
- Modify: `background/service-worker.js` — handle PIN_CLIP / UNPIN_CLIP
- Test: `tests/storage.test.js` — add test for `setPinned`

- [ ] **Step 1: Add failing test**

Append to `tests/storage.test.js` inside the `describe('storage', ...)` block:

```js
  it('setPinned toggles the pinned flag', async () => {
    const { setPinned } = await import('../background/storage.js');
    const id = await addClip({ text: 'a', hash: 'h', type: 'Text', tags: [], created_at: 1, pinned: false });
    await setPinned(id, true);
    const items = await listRecent(1);
    expect(items[0].pinned).toBe(true);
    await setPinned(id, false);
    const items2 = await listRecent(1);
    expect(items2[0].pinned).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `setPinned` is not exported.

- [ ] **Step 3: Add `setPinned` to `background/storage.js`**

Append at the end of `background/storage.js`:

```js
export async function setPinned(id, pinned) {
  return withStore('readwrite', async (store) => {
    const clip = await promisify(store.get(id));
    if (!clip) return;
    clip.pinned = !!pinned;
    await promisify(store.put(clip));
  });
}
```

- [ ] **Step 4: Wire PIN_CLIP / UNPIN_CLIP in `background/service-worker.js`**

Add an import line at the top of `background/service-worker.js`:

```js
import { listRecent, deleteClip, updateTags, setPinned } from './storage.js';
```

(Replace the existing import from `./storage.js` with this one.)

Inside `chrome.runtime.onMessage.addListener`, add two new case branches before the closing `}`:

```js
    case MSG.PIN_CLIP:
      setPinned(msg.payload.id, true).then(() => {
        broadcast(MSG.CLIP_UPDATED, { id: msg.payload.id, pinned: true });
        sendResponse({ ok: true });
      });
      return true;
    case MSG.UNPIN_CLIP:
      setPinned(msg.payload.id, false).then(() => {
        broadcast(MSG.CLIP_UPDATED, { id: msg.payload.id, pinned: false });
        sendResponse({ ok: true });
      });
      return true;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add background/storage.js background/service-worker.js tests/storage.test.js
git commit -m "feat(pin): pin/unpin support across storage, sw, sidepanel"
```

---

## Task 15: Settings Page

**Files:**
- Create: `settings/settings.html`
- Create: `settings/settings.js`

- [ ] **Step 1: Implement `settings/settings.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Clipboard Archive — Settings</title>
    <style>
      body { font: 14px/1.5 system-ui, sans-serif; max-width: 600px; margin: 2em auto; padding: 0 1em; color: #111; }
      @media (prefers-color-scheme: dark) { body { background: #1a1a1a; color: #f1f1f1; } }
      label { display: block; margin: 12px 0 4px; font-weight: 600; }
      input, select, textarea { width: 100%; padding: 6px; box-sizing: border-box; }
      .row { margin-bottom: 16px; }
      button { padding: 6px 12px; cursor: pointer; }
      .danger { color: #c00; }
    </style>
  </head>
  <body>
    <h1>Clipboard Archive</h1>

    <div class="row">
      <label for="retention">Auto-delete unpinned clips after</label>
      <select id="retention">
        <option value="30">30 days</option>
        <option value="90" selected>90 days</option>
        <option value="180">180 days</option>
        <option value="365">1 year</option>
        <option value="">Never</option>
      </select>
    </div>

    <div class="row">
      <label><input type="checkbox" id="ai-enabled" checked /> Use AI for topic tagging</label>
    </div>

    <div class="row">
      <label for="blocklist">Blocked domains (one per line)</label>
      <textarea id="blocklist" rows="5" placeholder="example.com&#10;internal-bank.example.com"></textarea>
    </div>

    <div class="row">
      <button id="save">Save</button>
      <span id="saved" hidden>Saved</span>
    </div>

    <hr />

    <div class="row">
      <button id="export">Export all as JSON</button>
      <button id="import">Import from JSON</button>
      <input id="import-file" type="file" accept="application/json" hidden />
    </div>

    <div class="row">
      <button id="delete-all" class="danger">Delete all clipboard history</button>
    </div>

    <script type="module" src="settings.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement `settings/settings.js`**

```js
import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../shared/messages.js';

const els = {
  retention: document.getElementById('retention'),
  aiEnabled: document.getElementById('ai-enabled'),
  blocklist: document.getElementById('blocklist'),
  save: document.getElementById('save'),
  saved: document.getElementById('saved'),
  exportBtn: document.getElementById('export'),
  importBtn: document.getElementById('import'),
  importFile: document.getElementById('import-file'),
  deleteAll: document.getElementById('delete-all'),
};

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const s = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  els.retention.value = s.retentionDays == null ? '' : String(s.retentionDays);
  els.aiEnabled.checked = s.aiEnabled;
  els.blocklist.value = (s.blocklist || []).join('\n');
}

els.save.addEventListener('click', async () => {
  const retentionDays = els.retention.value === '' ? null : Number(els.retention.value);
  const aiEnabled = els.aiEnabled.checked;
  const blocklist = els.blocklist.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { retentionDays, aiEnabled, blocklist },
  });
  els.saved.hidden = false;
  setTimeout(() => (els.saved.hidden = true), 1500);
});

els.exportBtn.addEventListener('click', async () => {
  const dbReq = indexedDB.open('clipboard-archive');
  dbReq.onsuccess = () => {
    const db = dbReq.result;
    const tx = db.transaction('clips', 'readonly');
    const store = tx.objectStore('clips');
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const blob = new Blob([JSON.stringify(allReq.result, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `clipboard-archive-${Date.now()}.json`,
      });
    };
  };
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); } catch { alert('Invalid JSON'); return; }
  if (!Array.isArray(items)) { alert('Expected an array'); return; }
  const dbReq = indexedDB.open('clipboard-archive');
  dbReq.onsuccess = () => {
    const db = dbReq.result;
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    let added = 0;
    for (const it of items) {
      delete it.id;
      store.add(it);
      added++;
    }
    tx.oncomplete = () => alert(`Imported ${added} clips`);
  };
});

els.deleteAll.addEventListener('click', async () => {
  if (!confirm('Delete ALL clipboard history? This cannot be undone.')) return;
  const dbReq = indexedDB.open('clipboard-archive');
  dbReq.onsuccess = () => {
    const db = dbReq.result;
    const tx = db.transaction('clips', 'readwrite');
    tx.objectStore('clips').clear();
    tx.oncomplete = () => alert('All clips deleted');
  };
});

loadSettings();
```

- [ ] **Step 3: Commit**

```bash
git add settings/
git commit -m "feat(settings): options page with retention, AI toggle, blocklist, import/export"
```

---

## Task 16: Manifest + Icons + Wiring

**Files:**
- Create: `manifest.json`
- Create: placeholder icons in `assets/icons/`

- [ ] **Step 1: Create placeholder icons**

Run:
```bash
mkdir -p assets/icons
```

Then generate simple square PNGs for icon-16/32/48/128. Use this Node script (`scripts/gen-icons.js`):

```js
import fs from 'node:fs';
import path from 'node:path';

const sizes = [16, 32, 48, 128];
// Minimal 1x1 transparent PNG, scaled by setting width/height in the manifest is not supported.
// We write a solid blue square PNG via a hardcoded base64 for each size.
// Replace with real icons later.
const base64Blue1px =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const buf = Buffer.from(base64Blue1px, 'base64');

for (const s of sizes) {
  fs.writeFileSync(path.join('assets/icons', `icon-${s}.png`), buf);
}
console.log('Wrote placeholder icons.');
```

Run:
```bash
node scripts/gen-icons.js
```

(The icons are intentionally minimal placeholders — replace with a designed icon before publishing.)

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Clipboard AI Archive",
  "version": "0.1.0",
  "description": "Privacy-first clipboard archive with on-device AI categorization.",
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon-16.png",
      "32": "assets/icons/icon-32.png",
      "48": "assets/icons/icon-48.png",
      "128": "assets/icons/icon-128.png"
    }
  },
  "icons": {
    "16": "assets/icons/icon-16.png",
    "32": "assets/icons/icon-32.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  },
  "options_page": "settings/settings.html",
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "permissions": [
    "clipboardRead",
    "clipboardWrite",
    "storage",
    "offscreen",
    "sidePanel",
    "notifications",
    "activeTab",
    "alarms",
    "downloads"
  ],
  "host_permissions": [],
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+V",
        "mac": "Command+Shift+V"
      },
      "description": "Open clipboard archive"
    }
  },
  "minimum_chrome_version": "127"
}
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json assets/ scripts/
git commit -m "feat(manifest): wire all pieces — MV3 manifest, icons, shortcut"
```

---

## Task 17: Manual Load Test

**Files:** none (manual)

- [ ] **Step 1: Open Chrome → `chrome://extensions`**

Enable Developer Mode (toggle top-right).

- [ ] **Step 2: Click "Load unpacked"**

Select `/Users/baba/clipboard extension`.

- [ ] **Step 3: Verify the extension loads**

Expected:
- No errors shown on the card.
- Toolbar icon appears.
- Service worker is in "Active" status.

If errors appear, inspect them via "service worker (inspect)" link on the card and fix root causes before continuing.

- [ ] **Step 4: Test capture flow**

1. Click the extension icon — popup opens with empty state.
2. Open any tab, copy some text (`Ctrl/Cmd+C`).
3. Click the extension icon again — the copied text should appear within ~2 seconds.
4. Click the item — paste somewhere else with `Ctrl/Cmd+V` and confirm it pasted.

- [ ] **Step 5: Test secret filter**

1. Copy this string: `sk-abcdefghij1234567890ABCDEF`.
2. Expected: a Chrome notification "Clipboard skipped — looked like a secret." appears, and the popup does NOT show the string.

- [ ] **Step 6: Test side panel**

1. From the popup, click "Open full view" — side panel opens with the same list.
2. Click an item — the detail pane shows full text, source, and tags.

- [ ] **Step 7: Test pause**

1. Click "Pause" in the popup.
2. Copy something new.
3. Expected: not added to the list.
4. Click "Resume" — capture works again.

- [ ] **Step 8: Test AI tagging (if Gemini Nano available)**

1. Copy a paragraph about a recognizable topic (e.g., a React tutorial paragraph).
2. Wait ~5 seconds, refresh popup.
3. Expected: 1-3 topic tags appear under the item.
4. If Gemini Nano is NOT available, expect no tags but no errors in the service worker console.

- [ ] **Step 9: Record findings**

Note any issues in `docs/test-plan.md` (create if it doesn't exist):

```bash
mkdir -p docs
```

Then `docs/test-plan.md`:

```md
# Manual Test Findings — 2026-05-19

| Test | Result | Notes |
|---|---|---|
| Load unpacked | | |
| Capture text | | |
| Secret filter | | |
| Side panel | | |
| Pause / resume | | |
| AI tagging | | |
```

- [ ] **Step 10: Commit results**

```bash
git add docs/test-plan.md
git commit -m "docs: record manual smoke test results"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** All 12 sections of the spec map to tasks above. Section 11 (out-of-scope) intentionally has no tasks.
- **Placeholder scan:** No TBDs, TODOs, or stubs. Every step contains the actual code to write or command to run.
- **Type consistency:** Field names match between `storage.js` (`pinned`, `tags`, `source_url`, `source_title`, `created_at`), `capture-pipeline.js`, popup/sidepanel UI, and message contracts.
- **Test isolation:** `beforeEach` clears IndexedDB in each test file that uses storage. `fake-indexeddb/auto` is loaded via `tests/setup.js`.
- **Risk: AI API surface.** The actual Chrome AI API path has shifted between versions (`window.ai.languageModel`, `LanguageModel`, etc.). `tagger.js::getModel()` probes the three known forms and returns null if none work; failure is silent and non-fatal. Task 17 step 8 documents the manual check.
