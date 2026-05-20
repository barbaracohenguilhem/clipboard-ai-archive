# Clipboard AI Archive

A privacy-first Chrome extension that automatically archives clipboard history with on-device AI categorization (Gemini Nano). Nothing leaves your machine.

## Features

- **Automatic capture** of everything you copy (text + rich HTML)
- **Secret filtering** — passwords, OTPs, API keys, credit cards never get stored
- **Heuristic typing** — items tagged as URL, Email, Phone, Color, Code, etc.
- **AI topic tags** — on-device Gemini Nano adds 1-3 topical tags
- **Popup + side panel** UI with search, filters, tag rail
- **Local-only** — IndexedDB, no network, no cloud
- **Configurable retention** — auto-delete after N days, pin to keep forever
- **Pause + per-domain blocklist** built in

## Install (developer mode)

1. Open Chrome → `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`clipboard extension`)

Pin the extension to your toolbar. Use `Cmd/Ctrl+Shift+V` to open the popup.

## Develop

```bash
npm test            # run unit tests
npm run test:watch  # watch mode
```

## Architecture

See [docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md](docs/superpowers/specs/2026-05-19-clipboard-ai-extension-design.md) for the design, and [docs/superpowers/plans/2026-05-19-clipboard-ai-extension.md](docs/superpowers/plans/2026-05-19-clipboard-ai-extension.md) for the implementation plan.
