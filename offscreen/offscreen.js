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
          try {
            const blob = await item.getType('text/html');
            html = await blob.text();
          } catch { /* ignore */ }
        }
        if (item.types.includes('text/plain')) {
          try {
            const blob = await item.getType('text/plain');
            text = await blob.text();
          } catch { /* ignore */ }
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
  } catch {
    // NotAllowedError when document not focused — expected, retry next tick
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
});

start();
