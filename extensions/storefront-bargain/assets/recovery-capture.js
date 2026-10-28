(function () {
  if (window.__cgRecoveryCaptureLoaded) return;
  window.__cgRecoveryCaptureLoaded = true;

  function safeGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (e) {
      /* storage may be disabled in private mode */
    }
  }

  function makeSessionId(shop) {
    var key = 'cg_reminder_sid:' + shop;
    var existing = safeGet(window.localStorage, key);
    if (existing) return existing;
    var next = '';
    try {
      next = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : 'cg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    } catch (e) {
      next = 'cg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    safeSet(window.localStorage, key, next);
    return next;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setStatus(el, message, tone) {
    if (!el) return;
    el.textContent = message || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
  }

  function init(root) {
    if (!root || root.getAttribute('data-cg-bound') === '1') return;
    root.setAttribute('data-cg-bound', '1');

    var shop = root.getAttribute('data-cg-shop') || '';
    if (!shop) return;

    var doneKey = 'cg_reminder_done:' + shop;
    var dismissedKey = 'cg_reminder_dismissed:' + shop;
    if (safeGet(window.localStorage, doneKey) || safeGet(window.sessionStorage, dismissedKey)) {
      root.remove();
      return;
    }

    var form = root.querySelector('[data-cg-reminder-form]');
    var status = root.querySelector('[data-cg-reminder-status]');
    var close = root.querySelector('[data-cg-reminder-close]');
    if (!form || !status) return;

    form.email.value = root.getAttribute('data-cg-email') || '';
    form.phone.value = root.getAttribute('data-cg-phone') || '';

    var delay = parseInt(root.getAttribute('data-cg-delay') || '20', 10);
    if (isNaN(delay) || delay < 0) delay = 20;
    var showTimer = window.setTimeout(function () {
      root.hidden = false;
    }, delay * 1000);

    function hide() {
      window.clearTimeout(showTimer);
      root.hidden = true;
      safeSet(window.sessionStorage, dismissedKey, '1');
    }

    if (close) close.addEventListener('click', hide);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !root.hidden) hide();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      setStatus(status, '');

      var email = form.email.value.trim();
      var phone = form.phone.value.trim();
      var whatsapp = form.whatsapp.checked;
      var wantsEmail = form.email_opt_in.checked && Boolean(email);

      if (email && !isValidEmail(email)) {
        setStatus(status, 'Enter a valid email address.', 'error');
        form.email.focus();
        return;
      }
      if (whatsapp && phone.replace(/\D/g, '').length < 8) {
        setStatus(status, 'Enter a valid WhatsApp number or untick the box.', 'error');
        form.phone.focus();
        return;
      }
      if (form.email_opt_in.checked && !email) {
        setStatus(status, 'Enter an email address or untick email.', 'error');
        form.email.focus();
        return;
      }
      if (!wantsEmail && !whatsapp) {
        setStatus(status, 'Tick email or WhatsApp for a reminder.', 'error');
        form.email_opt_in.focus();
        return;
      }

      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      setStatus(status, 'Saving…');

      fetch('https://cart-gain.com/api/recovery/opt-in', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shop,
          email: email || null,
          phone: phone || null,
          consentEmail: wantsEmail,
          consentWhatsApp: whatsapp && Boolean(phone),
          source: root.getAttribute('data-cg-surface') === 'cart' ? 'storefront_cart' : 'storefront_product',
          cartToken: root.getAttribute('data-cg-cart-token') || null,
          productId: root.getAttribute('data-cg-product-id') || null,
          productTitle: root.getAttribute('data-cg-product-title') || null,
          productUrl: root.getAttribute('data-cg-product-url') || null,
          productImage: root.getAttribute('data-cg-product-image') || null,
          sessionId: makeSessionId(shop),
        }),
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) throw new Error(data.message || 'Could not save your reminder.');
            return data;
          });
        })
        .then(function () {
          window.clearTimeout(showTimer);
          safeSet(window.localStorage, doneKey, '1');
          setStatus(status, 'Saved. We will remind you if you leave.', 'success');
          if (submit) submit.textContent = 'Reminder saved';
          window.setTimeout(function () {
            root.hidden = true;
          }, 3200);
        })
        .catch(function (error) {
          if (submit) submit.disabled = false;
          setStatus(status, error.message || 'Could not save your reminder. Please try again.', 'error');
        });
    });
  }

  function boot() {
    var roots = document.querySelectorAll('[data-cg-recovery]');
    if (!roots.length) return;
    for (var i = 1; i < roots.length; i++) roots[i].remove();
    init(roots[0]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
