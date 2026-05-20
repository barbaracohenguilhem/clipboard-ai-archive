# Chrome Web Store Listing — Submission Materials

Everything you need to fill the Web Store dashboard submission form. Copy-paste ready.

---

## 1. Item details

### Item name (≤ 45 chars)
```
Clipboard AI Archive
```

### Summary / Short description (≤ 132 chars)
```
Private clipboard history with on-device AI tagging. Nothing leaves your machine. Search, pin, and re-paste anything you copied.
```

### Detailed description (markdown not supported — plain text)

```
A privacy-first clipboard manager that automatically archives everything you copy and uses Chrome's built-in on-device AI (Gemini Nano) to add topical tags so you can find things later.

EVERYTHING STAYS LOCAL
• Stored in your browser only — IndexedDB on your device
• Zero network requests, zero analytics, zero third-party services
• On-device AI runs locally — clipboard text is never sent to any server

WHAT IT DOES
• Auto-captures everything you copy from web pages
• Heuristically classifies each clip as URL, Code, Color, Email, Phone, Address, or Text
• Adds 1–3 AI topic tags (e.g. "react, hooks, performance") using Chrome's on-device Gemini Nano model
• Popup for quick re-paste of recent clips
• Side panel for full archive browsing with tag and type filters
• Pin clips you want to keep forever

BUILT-IN SAFETY
• Detects and SKIPS items that look like secrets: passwords, OTP codes, API keys, JWTs, credit card numbers
• Default blocklist includes password manager and banking domains — add your own
• Pause capture anytime
• Configurable retention (default 90 days, pin to keep)
• Export everything as JSON or delete all in one click

REQUIREMENTS
• Chrome 116 or newer
• On-device AI tagging requires Gemini Nano to be available (Chrome 127+, optional)

The extension works fully without the AI — type-based organization, search, and pinning don't depend on it.
```

### Category
```
Productivity → Tools
```

### Language
```
English (primary). Add Portuguese (BR) translation later.
```

---

## 2. Single-purpose statement

**Required by Chrome Web Store policy.**

```
Archives the user's clipboard history locally with on-device AI-generated topic tags, so the user can search and reuse anything they previously copied.
```

---

## 3. Permission justifications

For each permission the dashboard will ask you why it's needed. Use the text below verbatim.

### `clipboardWrite`
```
Used to put a saved clipboard item back on the user's clipboard when they click it in the popup or side panel. Required so users can re-paste a previous copy.
```

### `storage`
```
Used to persist user preferences (retention period, AI toggle, blocklist, pause state) via chrome.storage.local. Does not store clipboard content (clips live in IndexedDB).
```

### `sidePanel`
```
Used to provide the side panel UI for browsing the full clipboard archive with filters and detail view.
```

### `notifications`
```
Used to show a brief notification when a copied item is filtered out because it matched a secret-detection pattern (e.g., looked like a password or API key). Helps the user understand why something didn't appear in their archive.
```

### `activeTab`
```
Used to read the URL and title of the active tab at the moment of a copy event, so the user can see where each clip came from. Read once per copy, never stored beyond the clip record.
```

### `alarms`
```
Used to schedule a daily background task that deletes unpinned clips older than the user's configured retention period.
```

### `downloads`
```
Used only when the user explicitly clicks "Export all as JSON" in settings. Generates a downloadable JSON file of their archive.
```

### Host permission: `<all_urls>` (via content_scripts)
```
The extension injects a lightweight content script on all pages whose ONLY job is to listen for copy and cut events. The content script does NOT read page DOM content or send anything to any server — it forwards only the user-initiated copy event data to the extension's service worker for local storage.

This is the standard pattern for clipboard manager extensions. Without all_urls access, the extension cannot detect when the user copies on a given site, defeating its purpose.

No host-permission-protected APIs (fetch, XMLHttpRequest, cookies, etc.) are used.
```

---

## 4. Privacy practices (dashboard form)

The Chrome Web Store dashboard will ask a series of questions. Use these answers:

- **Does your extension handle any user data?** Yes
- **Personally identifiable information?** No
- **Health information?** No
- **Financial and payment information?** No
- **Authentication information?** No (passwords are explicitly filtered out and never stored)
- **Personal communications?** No (the user may copy emails/messages, but no inbox access)
- **Location?** No
- **Web history?** Only the URL of the page the user was on at the moment of a copy event, stored locally, never transmitted
- **User activity?** Only clipboard copy events, stored locally, never transmitted
- **Website content?** No (only what the user explicitly copies, never page DOM)

- **Do you use the collected data for purposes unrelated to the single purpose?** No
- **Do you sell user data to third parties?** No
- **Do you transfer user data to third parties?** No
- **Do you use user data to determine creditworthiness?** No

**Privacy policy URL:** Paste the URL where `PRIVACY.md` is hosted (e.g. a GitHub raw URL, or your own site).

---

## 5. Required assets

The dashboard expects:

| Asset | Size | Status |
|---|---|---|
| Icon (small) | 128×128 PNG | ✓ `assets/icons/icon-128.png` |
| Screenshots | 1280×800 or 640×400 PNG/JPG | **TODO** — capture popup + side panel + settings in action |
| Promo tile (small) | 440×280 PNG | ✓ `assets/promo-440x280.png` |
| Promo tile (marquee) | 1400×560 PNG | Optional, skip for now |

### Screenshot capture checklist (you'll need to take these manually)

Use a 1280×800 viewport. Capture:

1. **Popup with a few clips visible** — show the type filter chips, source domain, AI tags
2. **Side panel with tag rail populated** — wide view, multiple types, a selected clip's detail pane
3. **Settings page** — retention/AI toggle/blocklist visible
4. **A "secret skipped" toast/notification** (optional but builds trust)

Save them as `assets/screenshots/01-popup.png` etc.

---

## 6. Pre-submission checklist

- [ ] Replace placeholder author name and contact email
- [ ] Bump version in `manifest.json` (currently 0.1.1) — Web Store rejects updates that don't bump
- [ ] Zip the extension folder: `zip -r clipboard-archive.zip . -x "node_modules/*" ".git/*" "docs/*" ".remember/*" "tests/*" "scripts/*" "*.md" "package*.json" "vitest.config.js" ".claude/*"`
- [ ] Test the zip by loading it as unpacked (extract, then `chrome://extensions/` → Load unpacked → extracted folder)
- [ ] Verify the manifest is valid: visit `chrome://extensions/`, check for warnings
- [ ] Take screenshots (1280×800)
- [ ] Host `PRIVACY.md` publicly and grab the URL
- [ ] Create a developer account at https://chrome.google.com/webstore/devconsole/ ($5 one-time fee)
- [ ] Submit, wait for review (usually 1–3 business days)

---

## 7. Things commonly flagged by review

Avoid these — none currently apply but worth knowing:

- **Excessive permissions** — only request what you use ✓
- **Remote code execution** — none ✓
- **Obfuscated code** — none, all source is readable ✓
- **Misleading description** — match what the extension actually does ✓
- **Single purpose violation** — extension does one thing (clipboard archive with tagging) ✓
- **Privacy policy missing/inaccessible** — make sure the URL works before submitting

---

## 8. Post-launch ideas (don't block v1)

- Sync via user-supplied end-to-end-encrypted storage (e.g., user's own GitHub gist with PGP)
- Optional cloud LLM (BYO key) for "ask my clipboard"
- Image capture support
- Mobile (Kiwi browser supports MV3)
