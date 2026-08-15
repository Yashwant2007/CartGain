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
    if (event.data.type === 'cg_resize') {
      var frames = getFrames();
      for (var i = 0; i < frames.length; i++) applyHeight(frames[i], event.data.height);
    }
  });

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
