# Clipboard AI Archive — Chrome Extension Design

**Date:** 2026-05-19
**Status:** Approved for implementation planning

## 1. Purpose

A personal-productivity Chrome extension that automatically archives everything the user copies, categorizes each clip with on-device AI, and lets the user search and re-paste from a popup or side panel. Privacy-first: no network calls, no third-party APIs.

## 2. Core Requirements (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Audience | Personal productivity tool |
| 2 | AI | Local only — Chrome's built-in Gemini Nano |
| 3 | Content types | Plain text + HTML |
| 4 | Capture mode | Automatic with secret filtering |
| 5 | UI surfaces | Popup + side panel |
| 6 | Categorization | Heuristic types + AI topic tags |

## 3. Architecture

Manifest V3 extension, four runtime contexts:

- **Service worker (`background.js`)** — orchestration. Receives clipboard events, runs secret filter, runs heuristic classifier, calls Gemini Nano, writes to IndexedDB, broadcasts updates to open UI surfaces.
- **Offscreen document (`offscreen.html`)** — hidden page that polls `navigator.clipboard.read()` (~1s cadence, paused on blur). Required because MV3 service workers cannot read the clipboard directly.
- **Popup (`popup.html` + `popup.js`)** — 360px wide UI shown on toolbar click. Last 20 items, search bar, filter chips, click-to-copy-back.
- **Side panel (`sidepanel.html` + `sidepanel.js`)** — wider persistent UI. Tag rail, type filters, full list, detail pane.

Data flow on every copy:

```
User copies →
  offscreen polls and detects new content →
  posts message to service worker →
  hash-dedup check →
  secret filter (drop if matches) →
  heuristic type classifier →
  write to IndexedDB →
  notify popup/sidepanel via chrome.runtime →
  async: Gemini Nano tag generation →
  update IndexedDB row with tags →
  notify UIs again
```

## 4. Capture Pipeline

### 4.1 Polling

- Offscreen document polls `navigator.clipboard.read()` every 1000ms while the browser window has focus.
- Pauses polling on `window.blur`, resumes on `focus`.
- Each read content is hashed with SHA-1; if hash matches the previous read, no-op.
- On hash change, the offscreen document posts `{ text, html, hash }` to the service worker. The service worker then captures source context with `chrome.tabs.query({ active: true, lastFocusedWindow: true })` (the offscreen document cannot use the `chrome.tabs` API) and attaches `source_url` + `source_title` before running the pipeline.

### 4.2 Secret Filter

An item is **dropped** (never written) if ANY rule matches:

| Rule | Pattern |
|---|---|
| Password-shaped | 8-64 chars, contains upper + lower + digit + symbol, no spaces, no whitespace, no common dictionary words |
| 2FA / OTP | 6-8 digits AND source URL or title contains `verify\|code\|auth\|login\|otp\|2fa` (case-insensitive) |
| API key / token | Regex set: `sk-[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{36}`, `xox[bps]-[A-Za-z0-9-]+`, `AKIA[0-9A-Z]{16}`, JWT three-part base64 |
| Credit card | 13-19 digits passing Luhn checksum |
| Blocked domain | Source URL matches user blocklist OR default list (1password.com, lastpass.com, bitwarden.com, plus a small set of major banks the user can edit) |

On drop, a Chrome notification appears for ~2 seconds: "Skipped capture (looked like a secret)." No clip content is ever logged or persisted.

### 4.3 Pause

- Right-click toolbar icon → "Pause capture" → submenu: 10 min / 1 hour / until restart / forever.
- Pause state stored in `chrome.storage.local`. When paused, polling continues but the service worker drops all incoming events.
- Toolbar icon shows a small red dot badge when paused.

## 5. Storage — IndexedDB

Database name: `clipboard-archive`, version: 1.

### 5.1 Object store — `clips`

```
{
  id: number (auto-increment, primary key),
  text: string,                       // always present
  html: string | null,                // only if copied with rich formatting
  hash: string,                       // SHA-1 of text
  type: "URL" | "Email" | "Phone" | "Color" | "Code" | "Address" | "Text",
  tags: string[],                     // kebab-case, lowercase
  source_url: string | null,
  source_title: string | null,
  created_at: number,                 // epoch ms
  pinned: boolean
}
```

### 5.2 Indexes

- `by_created_at` on `created_at` (descending list use)
- `by_type` on `type`
- `by_tag` on `tags` (multi-entry)
- `by_hash` on `hash` (dedup lookup)
- Full-text search on `text`: implemented as a tokenized inverted index in a sidecar store `clips_fts` (see 5.3)

### 5.3 Full-text search store — `clips_fts`

```
{
  token: string (key),
  clip_ids: number[]
}
```

On insert: tokenize `text` (lowercase, split on non-word, drop stopwords, keep tokens >= 3 chars), upsert each token's row.
On delete: remove `id` from each token's list.

Search query: tokenize the query the same way, intersect the `clip_ids` lists, rank by recency. Good enough for personal-scale data (≤50k items).

### 5.4 Capacity & retention

- Soft target: 50,000 clips before noticeable slowdown.
- Default retention: unpinned clips older than 90 days are auto-deleted by a daily alarm (`chrome.alarms`).
- Retention configurable in settings: 30/90/180/365 days or "never delete".
- Export: "Download all" button writes JSON to a download.
- Import: "Restore from JSON" button reads and replays into IndexedDB (skipping dup hashes).
- "Delete all" with confirm modal.

## 6. AI Categorization

### 6.1 Type detection (synchronous, heuristic)

Order matters (first match wins):

1. `URL` — starts with `http://` or `https://`, parses with `URL()` without error.
2. `Email` — matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
3. `Phone` — matches a permissive phone regex (E.164 or common formats).
4. `Color` — matches `^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$` (case-insensitive), or `rgb(...)`, `hsl(...)`.
5. `Code` — heuristic score: presence of `function\|def\|import\|class\|const\|let\|var\|=>\|public\|private`, leading-whitespace indentation on multiple lines, ratio of brackets/punctuation. Threshold tuned empirically.
6. `Address` — multi-line text with a postal-code-shaped token and a city/state token. Conservative — better to fall through to `Text` than mislabel.
7. `Text` — fallback.

Type is assigned and stored before any AI call.

### 6.2 Topic tags (asynchronous, Gemini Nano)

After the clip is saved, a background task calls Chrome's built-in language model:

```js
const session = await chrome.ai.languageModel.create({
  systemPrompt:
    "You assign topical tags to clipboard items. " +
    "Reply with 1-3 short tags, lowercase, kebab-case, " +
    "comma-separated, no explanation."
});
const response = await session.prompt(clip.text.slice(0, 1500));
```

Parsing rules:

- Split on comma, trim whitespace.
- Discard tags >30 chars, with spaces, or with non-alphanumeric-hyphen characters.
- Cap at 3 tags.
- Normalize to lowercase kebab-case.
- Deduplicate case-insensitively against existing tags in DB (use canonical form already in DB).
- If the parsed result is empty or all-invalid, leave `tags: []`.

The clip row is updated with the resulting `tags` and the UI is notified.

### 6.3 AI availability fallback

- On first install, check `await chrome.ai.languageModel.capabilities()`. If `available !== "readily"`, show a one-time onboarding banner: "Topic tagging needs Chrome's built-in AI. <Learn how to enable>." The extension still works without it — type heuristics alone provide useful organization.
- If a tag call throws (model unloaded, quota, etc.), log the error to a ring buffer (last 50 errors, stored locally), leave tags empty, continue.

## 7. UI

### 7.1 Popup (`popup.html`)

- Width 360px, height up to 600px.
- Sticky header: search input + filter chips (`All`, `URL`, `Code`, `Color`, `Email`, `Phone`, `Address`, `Text`).
- List: last 20 items, newest first. Each item is a card:
  - Type icon + type label + relative time + pin indicator if pinned
  - Text preview (2 lines, ellipsized)
  - Tag chips (if any)
  - Source domain (favicon + hostname) if known
- Hover reveals: pin toggle, delete button.
- **Click** = copy `text` back to clipboard, show toast "Copied!", stay open.
- **Shift+Click** = copy and close popup.
- **Right-click on item** = context menu with "Copy as HTML" (if HTML present).
- Footer: `[Open full view]` (opens side panel) · `[⏸ Pause]` · `[⚙ Settings]`.

### 7.2 Side panel (`sidepanel.html`)

- Three-column layout: left rail (filters), center list, right detail.
- **Left rail** — collapsible sections:
  - Types with counts
  - Tags with counts (sorted by frequency, then alpha)
  - Pinned (toggle)
- **Center list** — same card style as popup, no 20-item cap. Virtualized list for performance at scale.
- **Right detail** — selected clip:
  - Full text (or HTML preview tab)
  - Source link with favicon
  - Created date (absolute + relative)
  - Editable tag chips (add/remove)
  - Pin / Delete / Copy buttons

### 7.3 Settings page (separate page opened from popup/sidepanel)

- Retention days (30/90/180/365/never)
- AI toggle (default on; off disables Gemini Nano calls)
- Blocklist editor (domains)
- Pause controls
- Export / Import / Delete all
- Keyboard shortcut info

### 7.4 Visual style

- Neutral palette, system font stack, light/dark mode follows `prefers-color-scheme`.
- Minimal chrome — this is a utility used dozens of times per day.
- All icons inline SVG, no external assets.

### 7.5 Keyboard shortcuts

- `Ctrl/Cmd+Shift+V` — open popup focused on search input. Configurable via `chrome://extensions/shortcuts`.

## 8. Manifest Permissions

```json
{
  "manifest_version": 3,
  "permissions": [
    "clipboardRead",
    "clipboardWrite",
    "storage",
    "offscreen",
    "sidePanel",
    "notifications",
    "activeTab",
    "alarms"
  ],
  "host_permissions": []
}
```

No host permissions. No `background` host. No `<all_urls>`.

## 9. File Layout

```
clipboard-extension/
├── manifest.json
├── background/
│   ├── service-worker.js          # entry point
│   ├── capture-pipeline.js        # secret filter + dedup + dispatch
│   ├── classifier.js              # type heuristics
│   ├── tagger.js                  # Gemini Nano integration
│   ├── storage.js                 # IndexedDB wrapper
│   └── retention.js               # alarm-driven cleanup
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js               # clipboard polling
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── settings/
│   ├── settings.html
│   └── settings.js
├── shared/
│   ├── messages.js                # typed message constants
│   ├── secrets.js                 # secret-detection rules (testable)
│   ├── fts.js                     # tokenizer + search
│   └── format.js                  # relative time, etc.
├── assets/icons/                  # 16/32/48/128 PNG
└── docs/                          # user docs
```

## 10. Testing

- Unit tests (vitest or similar) for: `secrets.js` (each rule + edge cases), `classifier.js` (each type), `fts.js` (tokenize + search), `storage.js` (CRUD against fake-indexeddb).
- Integration smoke test: load unpacked extension in headless Chrome via Playwright, simulate clipboard events, assert IndexedDB state.
- Manual test matrix documented in `docs/test-plan.md` for the bits that resist automation (popup interactions, side panel layout, Gemini Nano availability).

## 11. Out of Scope (v1)

- Image / file capture.
- Cloud sync across devices.
- Cloud LLM integration.
- Multi-language UI (English only at v1).
- Mobile / non-Chrome browsers.
- Cross-extension import (e.g. from Ditto / CopyClip).

## 12. Open Risks

- **Gemini Nano availability.** Not all users have it enabled. Onboarding banner mitigates.
- **Polling overhead.** 1s polling is light but non-zero. If profiling shows impact, reduce to 2s or switch to event-driven where possible.
- **Secret filter false negatives.** A determined password manager that produces unusual passwords might slip through. Mitigation: blocklist for the source domain.
- **Secret filter false positives.** Real text that looks like a credit card or token might get dropped silently. Mitigation: the "skipped" notification tells the user something happened so they can copy again from a blocklisted-by-error site.
