(function(){
'use strict';
if(window.CG_BARGAIN_CONTROLLER)return;window.CG_BARGAIN_CONTROLLER=true;
var NS='cg-bargain';
var drawer=null,activeRoot=null,scrollLock={overflow:'',html:'',body:'',y:0};
var variantTimer=null,lastSentVariant=null;
function qs(root,sel){return root?root.querySelector(sel):null;}
function ensureDrawer(){
  if(drawer)return drawer;
  var b=document.createElement('div');b.className=NS+'-backdrop';b.setAttribute('data-cg-backdrop','');
  var f=document.createElement('iframe');
  f.className=NS+'-frame';f.setAttribute('data-cg-drawer-frame','');f.title='CartGain price negotiation';
  f.setAttribute('loading','lazy');f.setAttribute('allow','clipboard-write; clipboard-read');
  f.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
  f.setAttribute('referrerpolicy','origin');f.setAttribute('aria-hidden','true');
  var w=document.createElement('div');w.className=NS+'-frame-wrap';w.appendChild(f);
  var a=document.createElement('aside');
  a.className=NS+'-drawer';a.setAttribute('role','dialog');a.setAttribute('aria-modal','true');a.setAttribute('aria-label','Price negotiation');
  a.appendChild(f);
  document.body.appendChild(b);document.body.appendChild(a);
  drawer={shell:a,backdrop:b,frame:f};
  b.addEventListener('click',close);
  a.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}});
  return drawer;
}
function widgetSrc(root){
  var src=root.getAttribute('data-cg-src')||'';if(!src)return'';
  return src.indexOf('view=')===-1?src+(src.indexOf('?')===-1?'?':'&')+'view=drawer':src;
}
function open(root){
  var d=ensureDrawer(),src=widgetSrc(root);if(!src)return;
  if(d.frame.dataset.src!==src){d.frame.dataset.src=src;d.frame.setAttribute('src',src);lastSentVariant=null;}
  else if(d.frame.getAttribute('src')!==src){d.frame.setAttribute('src',src);lastSentVariant=null;}
  activeRoot=root;lastSentVariant=null;
  var initial=readSelectedVariant(root);
  if(initial&&initial.id)pushProductUpdate(d,root,initial.id);
  window.setTimeout(function(){
    if(activeRoot!==root||!drawer.shell.classList.contains('is-open'))return;
    var sel=readSelectedVariant(root);if(sel&&sel.id)pushProductUpdate(drawer,root,sel.id);
  },450);
  lockScroll();
  document.body.classList.add(NS+'-modal-open');
  d.backdrop.classList.add('is-visible');
  d.shell.classList.add('is-open');
  d.frame.setAttribute('aria-hidden','false');
  if(root.getAttribute('aria-expanded'))root.setAttribute('aria-expanded','true');
  window.__cgOpener=qs(root,'[data-cg-bargain-open]')||root;
  d.frame.focus();
}
function close(){
  if(!drawer)return;
  drawer.backdrop.classList.remove('is-visible');
  drawer.shell.classList.remove('is-open');
  drawer.frame.setAttribute('aria-hidden','true');
  if(activeRoot)activeRoot.setAttribute('aria-expanded','false');
  unlockScroll();
  document.body.classList.remove(NS+'-modal-open');
  var o=window.__cgOpener;
  if(o&&typeof o.focus==='function'){try{o.focus();}catch(e){}}
}
function lockScroll(){
  var y=window.scrollY||document.documentElement.scrollTop;
  scrollLock.overflow=document.body.style.overflow;scrollLock.y=y;
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
}
function unlockScroll(){
  document.body.style.overflow=scrollLock.overflow;document.documentElement.style.overflow='';
  if(scrollLock.y)window.scrollTo(0,scrollLock.y);
}
function variantMap(root){
  try{return JSON.parse(root.getAttribute('data-cg-variants')||'[]');}catch(e){return[];}
}
function readSelectedVariant(root){
  var doc=document,idInput=null,id=null,all=doc.querySelectorAll('select[name="id"],input[name="id"]');
  for(var i=0;i<all.length;i++){var el=all[i];
    if(el instanceof HTMLSelectElement){if(el.value){idInput=el.value;break;}}
    else if(el.checked||el.hasAttribute('checked')){idInput=el.value;break;}}
  if(!idInput){
    var opts=doc.querySelectorAll('input[type="radio"][name*="option"],.product-form__input input[type="radio"],[data-option-value],[data-value]');
    for(var j=0;j<opts.length;j++){var o=opts[j],v=o.value||o.getAttribute('data-value')||o.getAttribute('data-option-value');
      if(v&&(o.checked||o.classList.contains('is-selected')||o.getAttribute('aria-checked')==='true')){idInput=v;break;}}}
  if(idInput&&typeof idInput==='string'&&idInput.indexOf('gid:')===-1&&/^\d+$/.test(idInput))id={id:idInput};
  return id;
}
function pushProductUpdate(d,root,variantId){
  if(!d||!d.frame.contentWindow)return;
  if(lastSentVariant===variantId)return;
  lastSentVariant=variantId;
  var variants=variantMap(root),match=null;
  for(var i=0;i<variants.length;i++){if(String(variants[i].id)===String(variantId)){match=variants[i];break;}}
  var msg={type:'cg_product_update',variantId:variantId};
  if(match){msg.price=typeof match.price==='number'?match.price:Number(match.price);
    if(match.image)msg.image=decodeURIComponent(match.image);}
  try{d.frame.contentWindow.postMessage(msg,'*');}catch(e){}
}
function onVariantMaybe(){
  if(!drawer||!drawer.shell.classList.contains('is-open')||!activeRoot)return;
  if(variantTimer)return;
  variantTimer=window.setTimeout(function(){
    variantTimer=null;
    if(!drawer||!drawer.shell.classList.contains('is-open')||!activeRoot)return;
    var sel=readSelectedVariant(activeRoot);
    if(sel&&sel.id)pushProductUpdate(drawer,activeRoot,sel.id);
  },250);
}
window.addEventListener('message',function(event){
  if(!event.data||typeof event.data!=='object')return;
  if(event.data.type==='cg_empty'){if(activeRoot)activeRoot.classList.add('is-hidden');close();}
  else if(event.data.type==='cg_close'){close();}
});
function bindRoot(root){
  var opener=qs(root,'[data-cg-bargain-open]');if(!opener)return;
  opener.addEventListener('click',function(e){e.preventDefault();open(root);});
}
function bindAll(){
  var roots=document.querySelectorAll('[data-cg-bargain-root]');
  for(var i=0;i<roots.length;i++)bindRoot(roots[i]);
}
bindAll();
document.addEventListener('click',onVariantMaybe,true);
document.addEventListener('change',onVariantMaybe,true);
document.addEventListener('input',onVariantMaybe,true);
if(typeof MutationObserver!=='undefined'){
  var mo=new MutationObserver(function(){
    var unbound=document.querySelectorAll('[data-cg-bargain-root]:not([data-cg-bound])');
    for(var i=0;i<unbound.length;i++){unbound[i].setAttribute('data-cg-bound','true');bindRoot(unbound[i]);}
  });
  if(document.documentElement)mo.observe(document.documentElement,{childList:true,subtree:true});
}
})();