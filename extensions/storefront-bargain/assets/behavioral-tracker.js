(function(){
  'use strict';
  if(window.CG_BEHAVIORAL_TRACKER) return;
  window.CG_BEHAVIORAL_TRACKER = true;

  var API_BASE = window.CG_API_BASE || 'https://cart-gain.com';
  var STORE_ID = null;
  var SESSION_ID = (function(){
    try {
      var k='cg_sid';
      var s = sessionStorage.getItem(k);
      if(!s){ s = Math.random().toString(36).slice(2)+Date.now().toString(36); sessionStorage.setItem(k,s); }
      return s;
    } catch(e){ return 'cg_'+Date.now().toString(36); }
  })();

  function getStoreId(){
    if(STORE_ID) return STORE_ID;
    var m = document.querySelector('meta[name="cg-store-id"]');
    if(m && m.content){ STORE_ID = m.content; return STORE_ID; }
    var root = document.querySelector('[data-cg-store-id]');
    if(root){ STORE_ID = root.getAttribute('data-cg-store-id'); return STORE_ID; }
    var s = document.querySelector('script[data-cg-store-id]');
    if(s){ STORE_ID = s.getAttribute('data-cg-store-id'); return STORE_ID; }
    return null;
  }

  function track(eventType, data){
    var storeId = getStoreId();
    if(!storeId) return;
    var payload = {
      storeId: storeId,
      sessionId: SESSION_ID,
      eventType: eventType,
      productId: data && data.productId || null,
      variantId: data && data.variantId || null,
      cartId: data && data.cartId || null,
      checkoutId: data && data.checkoutId || null,
      orderId: data && data.orderId || null,
      properties: data || {}
    };
    try {
      if(navigator.sendBeacon){
        var blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
        navigator.sendBeacon(API_BASE + '/api/events/behavioral', blob);
      } else {
        fetch(API_BASE + '/api/events/behavioral', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function(){});
      }
    } catch(e){}
  }

  // Product view
  if(/\/products\//.test(location.pathname)){
    var pid = null;
    var m = location.pathname.match(/\/products\/([^\/]+)/);
    if(m) pid = m[1];
    track('product_viewed', { productId: pid, path: location.pathname });
    // Engagement threshold after 90s visible
    var visible = 0, timer = null;
    function tick(){
      if(document.visibilityState === 'hidden') return;
      visible += 1000;
      if(visible >= 90000){
        if(timer) clearInterval(timer);
        timer = null;
        track('product_engagement_threshold_reached', { productId: pid, dwellMs: visible });
      }
    }
    timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function(){ /* counting visible only via check */ });
  }

  // Cart events via fetch/XHR interception (best effort)
  var origFetch = window.fetch;
  if(origFetch){
    window.fetch = function(){
      var args = arguments;
      return origFetch.apply(this, args).then(function(res){
        try {
          var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          if(url.indexOf('/cart/add') >= 0 || url.indexOf('cart/add.js') >= 0){
            track('cart_item_added', { path: url });
          }
          if(url.indexOf('/checkout') >= 0){
            track('checkout_started', { path: url });
          }
        } catch(e){}
        return res;
      });
    };
  }

  // Form submits to cart/checkout
  document.addEventListener('submit', function(e){
    try {
      var form = e.target;
      var action = form.getAttribute('action') || '';
      if(action.indexOf('/cart/add') >= 0){
        track('cart_item_added', { action: action });
      }
      if(action.indexOf('/checkout') >= 0){
        track('checkout_started', { action: action });
      }
    } catch(e){}
  }, true);

  // Listen for bargain events
  window.addEventListener('message', function(e){
    if(!e.data || typeof e.data !== 'object') return;
    if(e.data.type === 'cg_checkout_started') track('checkout_started', e.data);
    if(e.data.type === 'cg_payment_failed') track('payment_failed', e.data);
  });
})();
