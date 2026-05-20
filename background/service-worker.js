import { processClipboardEvent } from './capture-pipeline.js';
import { tagClip, isAvailable as isAiAvailable } from './tagger.js';
import { runRetention } from './retention.js';
import { listRecent, deleteClip, updateTags, setPinned } from './storage.js';
import { sha1 } from '../shared/hash.js';
import {
  MSG,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  PAUSE_STATE_KEY,
} from '../shared/messages.js';

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function getPauseState() {
  const { [PAUSE_STATE_KEY]: state } =
    await chrome.storage.local.get(PAUSE_STATE_KEY);
  if (!state) return { paused: false };
  if (
    state.until &&
    state.until !== 'forever' &&
    state.until !== 'until_restart'
  ) {
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
    // no receivers — fine
  }
}

async function handleClipboardChange({ text, html, source_url, source_title }) {
  const { paused } = await getPauseState();
  if (paused) return;
  if (!text) return;

  const settings = await getSettings();
  const hash = await sha1(text);

  const result = await processClipboardEvent({
    text,
    html,
    hash,
    source_url: source_url || null,
    source_title: source_title || null,
    blocklist:
      settings.blocklist && settings.blocklist.length > 0
        ? settings.blocklist
        : undefined,
  });

  if (result.stored) {
    broadcast(MSG.CLIP_ADDED, { id: result.id });
    if (settings.aiEnabled) {
      tagClip(result.id, text).then((tags) => {
        if (tags.length > 0)
          broadcast(MSG.CLIP_UPDATED, { id: result.id, tags });
      });
    }
  } else if (result.reason === 'secret') {
    broadcast(MSG.SECRET_SKIPPED, {});
    try {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
        title: 'Clipboard skipped',
        message: 'Looked like a secret — not stored.',
      });
    } catch {
      /* notifications may be unavailable */
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case MSG.CLIPBOARD_CHANGED:
      handleClipboardChange(msg.payload);
      return;
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
        broadcast(MSG.CLIP_UPDATED, {
          id: msg.payload.id,
          tags: msg.payload.tags,
        });
        sendResponse({ ok: true });
      });
      return true;
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
    case MSG.PAUSE:
      chrome.storage.local
        .set({ [PAUSE_STATE_KEY]: { until: msg.payload.until } })
        .then(() => sendResponse({ ok: true }));
      return true;
    case MSG.RESUME:
      chrome.storage.local
        .remove(PAUSE_STATE_KEY)
        .then(() => sendResponse({ ok: true }));
      return true;
    case MSG.GET_PAUSE_STATE:
      getPauseState().then(sendResponse);
      return true;
    case MSG.GET_AI_STATUS:
      isAiAvailable().then((available) => sendResponse({ available }));
      return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('retention', { periodInMinutes: 60 * 24 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'retention') {
    const settings = await getSettings();
    await runRetention({ retentionDays: settings.retentionDays });
  }
});

chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: false })
  .catch(() => {});
