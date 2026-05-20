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
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
    const label = document.createElement('span');
    label.textContent = t;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(tCounts.get(t) || 0);
    li.append(label, count);
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
    const label = document.createElement('span');
    label.textContent = `#${tag}`;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(n);
    li.append(label, count);
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
      if (c.source_url?.toLowerCase().includes(q)) return true;
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
    const meta = document.createElement('div');
    meta.className = 'clip-meta';
    meta.textContent = `${clip.type} · ${relativeTime(clip.created_at)}${clip.pinned ? ' · 📌' : ''}`;
    const textEl = document.createElement('div');
    textEl.className = 'clip-text';
    textEl.textContent = clip.text.slice(0, 200);
    li.append(meta, textEl);
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
      const next = (clip.tags || []).filter((x) => x !== t);
      await chrome.runtime.sendMessage({
        type: MSG.SET_TAGS,
        payload: { id: clip.id, tags: next },
      });
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
  try {
    const clips = await chrome.runtime.sendMessage({
      type: MSG.GET_CLIPS,
      payload: { limit: 1000 },
    });
    state.clips = clips || [];
    renderAll();
  } catch (err) {
    console.warn('loadClips failed', err);
  }
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
  const tag = els.dTagInput.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!tag) return;
  const next = [...new Set([...(clip.tags || []), tag])];
  await chrome.runtime.sendMessage({
    type: MSG.SET_TAGS,
    payload: { id: clip.id, tags: next },
  });
  els.dTagInput.value = '';
});

els.dCopy.addEventListener('click', async () => {
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (clip) await navigator.clipboard.writeText(clip.text);
});

els.dDelete.addEventListener('click', async () => {
  if (!state.selectedId) return;
  if (!confirm('Delete this clip?')) return;
  await chrome.runtime.sendMessage({
    type: MSG.DELETE_CLIP,
    payload: { id: state.selectedId },
  });
  state.selectedId = null;
});

els.dPin.addEventListener('click', async () => {
  const clip = state.clips.find((c) => c.id === state.selectedId);
  if (!clip) return;
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
