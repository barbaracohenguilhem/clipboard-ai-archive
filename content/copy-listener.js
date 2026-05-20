// Injected into every page. Listens for copy/cut events and forwards the
// copied content to the service worker. This replaces the offscreen-polling
// approach which fails without user activation.

(function () {
  if (window.__clipboardArchiveInstalled) return;
  window.__clipboardArchiveInstalled = true;

  function readFromEvent(e) {
    let text = '';
    let html = null;

    if (e.clipboardData) {
      try {
        text = e.clipboardData.getData('text/plain') || '';
        html = e.clipboardData.getData('text/html') || null;
      } catch {
        /* some pages block clipboardData access */
      }
    }

    if (!text) {
      const sel = document.getSelection();
      if (sel && sel.rangeCount > 0) {
        text = sel.toString();
        try {
          const range = sel.getRangeAt(0);
          const div = document.createElement('div');
          div.appendChild(range.cloneContents());
          html = div.innerHTML || null;
        } catch {
          /* ignore */
        }
      }
    }

    return { text, html };
  }

  function onCopy(e) {
    const { text, html } = readFromEvent(e);
    if (!text || text.length === 0) return;

    try {
      chrome.runtime
        .sendMessage({
          type: 'clipboard:changed',
          payload: {
            text,
            html,
            source_url: location.href,
            source_title: document.title,
          },
        })
        .catch(() => {});
    } catch {
      // Extension context can be invalidated on reload — silently skip
    }
  }

  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCopy, true);
})();
