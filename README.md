# Clipboard AI Archive

A privacy-first Chrome extension that automatically archives your clipboard history with on-device AI categorization (Gemini Nano). **Nothing leaves your machine.**

## Features

- **Auto-capture** — every text/HTML copy is saved to a local archive
- **Secret filtering** — passwords, OTP codes, API keys, JWTs, and credit-card numbers are never stored
- **Heuristic typing** — clips are tagged as URL, Email, Phone, Color, Code, Address, or Text
- **AI topic tags** — Chrome's on-device Gemini Nano adds 1–3 topical tags per clip
- **Popup** — fast access to the last 20 clips, click to copy back
- **Side panel** — full browsable archive with type filters, tag rail, and detail pane
- **Configurable retention** — auto-delete after N days (default 90), pin clips to keep forever
- **Pause + per-domain blocklist** — default blocklist covers password managers; add your own
- **Export / Import** — JSON dump for backup or migration
- **Keyboard shortcut** — `Cmd/Ctrl + Shift + V` opens the popup

## Install (Developer Mode)

1. Open `chrome://extensions/`
2. Toggle **Developer mode** in the top right
3. Click **Load unpacked**
4. Select this folder (`clipboard extension`)
5. Pin the extension to your toolbar

The first time, Chrome will ask permission to read your clipboard — accept.

> **Gemini Nano requirements:** Chrome 127+, ~22GB free disk space, and the AI model must be available. If unavailable, the extension still works — just without AI topic tags. Check `chrome://flags` and enable "Prompt API for Gemini Nano" if needed.

## Use

- **Copy anything** — appears in the popup within ~1 second
- **Click an item in the popup** — copies it back to your clipboard
- **Shift-click** — copy and close the popup
- **Click "Open full view"** — opens the side panel
- **Pause button** — temporarily stop capturing (e.g. when working with sensitive data)
- **Settings** — change retention, AI toggle, blocked domains, export/import

## Develop

```bash
npm install      # one-time
npm test         # run unit tests
npm run test:watch
```

Reload the extension at `chrome://extensions/` after editing files.

## Architecture

- `manifest.json` — Manifest V3
- `background/service-worker.js` — orchestrates capture, AI, retention, UI messages
- `background/storage.js` — IndexedDB layer
- `background/capture-pipeline.js` — secret filter + classifier + dedup
- `background/tagger.js` — Gemini Nano integration
- `background/retention.js` — daily-alarm cleanup
- `offscreen/` — hidden document that polls the clipboard
- `popup/`, `sidepanel/`, `settings/` — UI surfaces
- `shared/` — pure modules (no Chrome APIs) used everywhere

Design spec: [docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md](docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md)
Implementation plan: [docs/superpowers/plans/2026-05-19-clipboard-ai-extension.md](docs/superpowers/plans/2026-05-19-clipboard-ai-extension.md)

## Privacy

- All data stored locally in browser IndexedDB.
- No network requests. No third-party services. No analytics.
- No `host_permissions` — the extension cannot read websites' contents, only your clipboard.
- `activeTab` is used only to capture the source URL/title of the page you copied from.
