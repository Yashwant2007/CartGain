(function () {
  // CartGain Bargain storefront helper — sizes the widget iframe to fit the
  // embedded app and passes the merchant-facing heading accent through.
  function getFrames() {
    return document.querySelectorAll('iframe[data-cg-bargain]');
  }

  function applyHeight(frame, height) {
    var h = parseInt(height, 10);
    if (!frame || !isFinite(h) || h < 60 || h > 2400) return;
    if (frame.style.height !== h + 'px') frame.style.height = h + 'px';
  }

  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'cg_empty') {
      // Bargaining is disabled for this store (or the embed could not resolve
      // the store) — the iframe asked us to hide. Identify the sender frame
      // and hide its block entirely so nothing shows on the theme.
      var frames = getFrames();
      for (var i = 0; i < frames.length; i++) {
        if (event.source === frames[i].contentWindow || !event.source) {
          hideBlock(frames[i]);
        }
      }
      if (!event.source) {
        // No usable source — hide every bargain block on the page.
        for (var j = 0; j < frames.length; j++) hideBlock(frames[j]);
      }
      return;
    }
    if (event.data.type === 'cg_resize') {
      var frames = getFrames();
      for (var i = 0; i < frames.length; i++) applyHeight(frames[i], event.data.height);
    }
  });

  function hideBlock(frame) {
    var root = frame;
    if (frame.closest) {
      root = frame.closest('[data-cg-bargain-root]') || frame.parentElement;
    } else {
      root = frame.parentElement;
    }
    if (root) root.classList.add('is-hidden');
  }

  // The app may render/init after we attach the listener — re-ask for height
  // periodically until the iframe becomes interactive.
  var asked = 0;
  var timer = setInterval(function () {
    var frames = getFrames();
    if (!frames.length && asked++ < 40) return;
    if (frames.length) {
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow) {
          try { frames[i].contentWindow.postMessage({ type: 'cg_get_height' }, '*'); } catch (e) {}
        }
      }
    }
    if (asked++ > 40) clearInterval(timer);
  }, 500);

  // A block can be added by merchants while the theme editor is open; keep
  // resizing any newly inserted frames.
  var mo = new MutationObserver(function () {
    var frames = getFrames();
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow) {
        try { frames[i].contentWindow.postMessage({ type: 'cg_get_height' }, '*'); } catch (e) {}
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
