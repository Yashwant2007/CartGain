(function () {
  // CartGain Bargain app-embed controller — turns a floating badge into the
  // interactive widget and resizes the iframe to its content via postMessage.
  var root = document.querySelector('[data-cg-bargain-embed]');
  if (!root) return;

  var badge = root.querySelector('.cg-bargain-embed__badge');
  var panel = root.querySelector('.cg-bargain-embed__panel');
  var frame = root.querySelector('iframe[data-cg-bargain]');
  var open = false;

  function applyHeight(h) {
    var v = parseInt(h, 10);
    if (!frame || !isFinite(v) || v < 60 || v > 2400) return;
    if (frame.style.height !== v + 'px') frame.style.height = v + 'px';
  }

  function toggle(force) {
    open = force !== undefined ? force : !open;
    if (open) root.classList.add('is-open');
    else root.classList.remove('is-open');
  }

  if (badge) {
    badge.addEventListener('click', function () {
      toggle();
      // Re-ask the iframe for its height once the panel opens.
      if (open && frame && frame.contentWindow) {
        try { frame.contentWindow.postMessage({ type: 'cg_get_height' }, '*'); } catch (e) {}
      }
    });
  }

  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'cg_empty') {
      // Bargaining is disabled for this store — hide the entire embed so the
      // badge/panel never appear on the theme. Also stop the auto-open below.
      if (root) root.classList.add('is-hidden');
      return;
    }
    if (event.data.type === 'cg_resize') applyHeight(event.data.height);
  });

  // Ask for height once the iframe is interactive.
  var asked = 0;
  var timer = setInterval(function () {
    if (!frame) { clearInterval(timer); return; }
    if (frame.contentWindow) {
      try { frame.contentWindow.postMessage({ type: 'cg_get_height' }, '*'); } catch (e) {}
      if (asked++ > 40) clearInterval(timer);
    } else if (asked++ > 40) {
      clearInterval(timer);
    }
  }, 500);

  // Auto-open after a short delay so the widget is immediately visible.
  setTimeout(function () {
    if (root && !root.classList.contains('is-hidden')) toggle(true);
  }, 600);
})();
