(function(){
'use strict';
/* CartGain Bargain — product-page dwell nudge.
   Kept in its own small asset so the main controller (bargain.js) stays under
   Shopify's suggested 10 KB JavaScript threshold. Soft prompt only: after the
   shopper lingers on a product page we pulse the launcher and show a dismissible
   "want a better price?" bubble. It NEVER opens the drawer on its own — the
   shopper must click — and it stops for the session once they engage. Timing
   counts VISIBLE time only. Config comes from
   GET /api/bargain/dwell-config?shop=<domain>, which fails safe to disabled. */
if(window.CG_BARGAIN_DWELL)return;window.CG_BARGAIN_DWELL=true;
var STORE='cg-dwell:v1:';
var dwell=null,started=false,engaged=false;
function key(shop){return STORE+shop+'|'+(window.location.pathname||'');}
function sGet(k){try{return window.sessionStorage.getItem(k);}catch(e){return null;}}
function sSet(k){try{window.sessionStorage.setItem(k,'1');}catch(e){}}
function origin(root){
  var m=(root.getAttribute('data-cg-src')||'').match(/^(https?:\/\/[^\/]+)/);
  return m?m[1]:'https://cart-gain.com';
}
function shopOf(root){
  var s=root.getAttribute('data-cg-shop');if(s)return s;
  var m=(root.getAttribute('data-cg-src')||'').match(/[?&]shop=([^&]+)/);
  return m?decodeURIComponent(m[1]):'';
}
function remove(root){
  if(!root)return;
  root.classList.remove('cg-bargain-nudge');
  var b=root.querySelector('[data-cg-nudge]');
  if(b&&b.parentNode)b.parentNode.removeChild(b);
}
function ensureBubble(root){
  var b=root.querySelector('[data-cg-nudge]');if(b)return b;
  b=document.createElement('div');
  b.className='cg-bargain-nudge-bubble';b.setAttribute('data-cg-nudge','');
  b.setAttribute('role','status');b.setAttribute('aria-live','polite');
  var close=document.createElement('button');
  close.type='button';close.className='cg-bargain-nudge-close';
  close.setAttribute('data-cg-nudge-close','');close.setAttribute('aria-label','Dismiss');
  close.innerHTML='&times;';
  var title=document.createElement('p');title.className='cg-bargain-nudge-title';title.setAttribute('data-cg-nudge-title','');
  var sub=document.createElement('p');sub.className='cg-bargain-nudge-sub';sub.setAttribute('data-cg-nudge-sub','');
  var act=document.createElement('button');act.type='button';act.className='cg-bargain-nudge-cta';act.setAttribute('data-cg-nudge-open','');
  b.appendChild(close);b.appendChild(title);b.appendChild(sub);b.appendChild(act);root.appendChild(b);
  close.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();stop();});
  /* Engage the real widget by activating its own opener (the controller binds
     [data-cg-bargain-open]); we never call into the controller directly. */
  act.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();stop();var o=root.querySelector('[data-cg-bargain-open]');if(o)o.click();});
  return b;
}
function show(reminder){
  if(!dwell||!dwell.root)return;
  var b=ensureBubble(dwell.root);
  b.querySelector('[data-cg-nudge-title]').textContent=reminder?'Still thinking it over?':'Want a better price?';
  b.querySelector('[data-cg-nudge-sub]').textContent=reminder
    ?'Make an offer and see if we can meet your price.'
    :'Tell us what you would pay - the store may say yes.';
  b.querySelector('[data-cg-nudge-open]').textContent='Make an offer';
  /* Retrigger the finite pulse animation. */
  dwell.root.classList.remove('cg-bargain-nudge');
  void dwell.root.offsetWidth;
  dwell.root.classList.add('cg-bargain-nudge');
}
function stop(){
  engaged=true;
  if(!dwell)return;
  if(dwell.timer)window.clearInterval(dwell.timer);
  if(dwell.key)sSet(dwell.key);
  remove(dwell.root);
  dwell=null;
}
function abort(){
  if(!dwell)return;
  if(dwell.timer)window.clearInterval(dwell.timer);
  remove(dwell.root);
  dwell=null;
}
function tick(){
  if(!dwell||!dwell.timer)return;
  var now=Date.now(),delta=now-dwell.last;dwell.last=now;
  if(typeof document.visibilityState==='string'&&document.visibilityState!=='visible')return;
  if(delta<0||delta>3000)delta=1000;
  dwell.visible+=delta;
  if(dwell.stage===0&&dwell.visible>=dwell.dwellMs){
    dwell.stage=1;show(false);
  }else if(dwell.stage===1&&dwell.visible>=dwell.dwellMs+dwell.reminderMs){
    if(dwell.timer)window.clearInterval(dwell.timer);
    dwell.timer=null;
    show(true);
  }
}
function clamp(v,fallback){return Math.min(600,Math.max(5,Math.round(typeof v==='number'&&isFinite(v)?v:fallback)));}
function start(root,cfg){
  if(dwell||engaged)return;
  var shop=shopOf(root);if(!shop)return;
  var k=key(shop);if(sGet(k))return;
  dwell={
    root:root,key:k,
    dwellMs:clamp(cfg.dwellSeconds,60)*1000,
    reminderMs:clamp(cfg.reminderSeconds,60)*1000,
    visible:0,stage:0,last:Date.now(),timer:null,
  };
  dwell.timer=window.setInterval(tick,1000);
}
function init(){
  if(started)return;
  var roots=document.querySelectorAll('[data-cg-bargain-root][data-cg-surface="product"]');
  if(!roots.length)return;
  var root=roots[0];
  var shop=shopOf(root);if(!shop)return;
  started=true;
  if(sGet(key(shop)))return;
  try{
    fetch(origin(root)+'/api/bargain/dwell-config?shop='+encodeURIComponent(shop),{credentials:'omit'})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(cfg){if(cfg&&cfg.enabled)start(root,cfg);})
      .catch(function(){});
  }catch(e){}
}
/* Retire the nudge the moment the shopper engages with the real widget. */
document.addEventListener('click',function(e){
  var t=e.target;
  while(t&&t!==document){
    if(t.getAttribute&&t.getAttribute('data-cg-bargain-open')!==null){stop();return;}
    t=t.parentNode;
  }
},true);
window.addEventListener('message',function(e){
  if(!e.data||typeof e.data!=='object')return;
  if(e.data.type==='cg_empty')abort();
  else if(e.data.type==='cg_close')stop();
});
init();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else window.setTimeout(init,0);
window.addEventListener('load',init);
if(typeof MutationObserver!=='undefined'&&document.documentElement){
  new MutationObserver(function(){if(!started)init();}).observe(document.documentElement,{childList:true,subtree:true});
}
})();
