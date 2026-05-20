# Privacy Policy — Clipboard AI Archive

**Last updated:** 2026-05-19

## TL;DR

Clipboard AI Archive is a **local-only** Chrome extension. Everything you copy stays on your device in your browser's local storage. **Nothing is ever sent to any server, third party, or analytics service.**

## What data the extension handles

When you copy text on a web page, the extension stores the following **locally in your browser** (using IndexedDB):

- The copied text (plain text and, if available, rich HTML)
- A timestamp
- The URL and page title of the tab you copied from (to help you find clips later)
- AI-generated topical tags (1–3 short keywords)
- A pin flag and a duplicate-detection hash

The extension does **not** capture:

- Anything detected as a password, one-time code, API key, JWT, or credit-card number (these are filtered out before storage and never written to disk)
- Anything copied from domains on the blocklist (password managers, banking sites, plus any domain you add)
- Anything copied while capture is paused

## Where data is stored

All data is stored in your browser's local IndexedDB database, scoped to this extension. The data:

- Lives only on the device where you copied it
- Is never synchronized to a Google account or cloud service
- Is never sent to a server
- Can be exported as JSON, imported, or deleted at any time from the Settings page
- Is automatically deleted after a retention period you configure (default 90 days for unpinned clips; pinned clips kept forever)

## AI processing

Topic tags are generated using **Chrome's built-in on-device AI (Gemini Nano)**. This model runs locally on your computer. Clipboard text is **never sent to Google, OpenAI, Anthropic, or any other AI service over the network.**

If your Chrome installation does not have Gemini Nano available, the extension simply skips tag generation. All other features continue to work.

## Permissions used and why

| Permission | Why |
|---|---|
| `clipboardWrite` | Lets the popup put a previously copied item back on your clipboard when you click it. |
| `storage` | Stores your settings (retention period, blocklist, AI toggle, pause state) using `chrome.storage.local`. |
| `sidePanel` | Powers the side panel UI. |
| `notifications` | Shows a brief notification when content is skipped because it looked like a secret, so you know why something didn't get saved. |
| `activeTab` | Reads the URL and title of the active tab so you can see where a clip came from. Only accessed at the moment of capture. |
| `alarms` | Schedules the daily retention cleanup. |
| `downloads` | Powers the "Export all as JSON" feature when you explicitly click it. |
| `<all_urls>` (content script) | Lets the extension listen for `copy` and `cut` events on any web page you visit. The content script does NOT read page contents — it only sees what you copy. |

## No tracking

The extension contains **no analytics, telemetry, crash reporters, or third-party SDKs**. It makes **no network requests** of any kind.

## Your control

- **Delete a single clip** — click the trash icon next to it
- **Delete all clips** — Settings → "Delete all clipboard history"
- **Pause capture** — toolbar button or Settings
- **Disable AI tagging** — Settings → uncheck "Use AI for topic tagging"
- **Block domains** — Settings → add domains to blocklist; nothing copied from those will be saved
- **Export your data** — Settings → "Export all as JSON"
- **Uninstall** — removes everything, including the local database

## Children

This extension does not target or knowingly collect data from children. No data is sent off-device under any circumstances, so the answer to "what data do you collect about children" is the same as for everyone: none leaves the device.

## Changes to this policy

If the privacy behavior of the extension ever changes (for example, if a future version adds optional cloud sync), this document will be updated before that version is published, and the change will be noted in `CHANGELOG.md`.

## Contact

Open an issue on the repository for any privacy concern or question.
