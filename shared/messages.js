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
  GET_AI_STATUS: 'ai:status',
};

export const SETTINGS_KEY = 'clipboard-archive-settings';
export const PAUSE_STATE_KEY = 'clipboard-archive-pause';

export const DEFAULT_SETTINGS = {
  retentionDays: 90,
  aiEnabled: true,
  blocklist: [],
};
