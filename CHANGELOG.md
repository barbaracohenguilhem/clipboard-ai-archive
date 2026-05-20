# Changelog

## [0.2.0] - 2026-05-19

Polish release. First version intended for Chrome Web Store submission.

### Added
- Real designed icon (clipboard glyph with AI sparkle) at 16/32/48/128 px
- Promotional tile asset (440×280) for store listing
- Privacy policy (`PRIVACY.md`)
- Store submission materials (`STORE.md`) — listing copy, permissions justifications, checklist
- Empty-state with onboarding tip in the popup
- AI availability indicator in Settings with help link
- Keyboard navigation in popup (↑/↓ to highlight, Enter to copy, Esc to close)
- Paused-state banner in the popup
- ARIA labels and roles on side panel for screen-reader support
- HTML sanitization on capture (strips `<script>`, `<style>`, inline event handlers, `javascript:` URLs)
- Reject clips larger than 100 KB
- Reject whitespace-only clips
- 3 new edge-case tests (total 52 passing)

### Changed
- Bumped to version 0.2.0
- Service worker now exposes an `ai:status` message for the settings page

## [0.1.1] - 2026-05-19

Critical fix.

### Fixed
- Replaced broken offscreen-document polling with a content-script copy listener.
  `navigator.clipboard.read()` in offscreen documents requires user activation,
  which polling loops don't have, so the previous version silently captured
  nothing. The standard pattern (content script listening to `copy`/`cut` events
  on every page) now powers capture.

### Removed
- `offscreen/` directory and the `offscreen` and `clipboardRead` permissions
- Minimum Chrome lowered from 127 to 116 (no more offscreen-API requirement)

## [0.1.0] - 2026-05-19

Initial implementation. 49 passing tests across secrets, classifier, FTS, storage,
capture pipeline, retention, and tagger modules.
