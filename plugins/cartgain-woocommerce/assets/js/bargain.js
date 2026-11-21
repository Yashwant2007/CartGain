(function () {
    'use strict';

    var overlay = null;
    var panel = null;
    var drawerFrame = null;
    var closeButton = null;
    var opener = null;
    var closeTimer = null;
    var scrollState = null;
    var onKeyDown = null;

    function frames() {
        return Array.prototype.slice.call(document.querySelectorAll('.cartgain-bargain__frame'));
    }

    function frameOrigin(frame) {
        if (!frame) return null;
        try {
            return new URL(frame.getAttribute('src') || frame.src, window.location.href).origin;
        } catch (error) {
            return null;
        }
    }

    function trusted(event, frame) {
        if (!frame || event.source !== frame.contentWindow) return false;
        var origin = frameOrigin(frame);
        return !!origin && event.origin === origin;
    }

    function drawerSrc(src) {
        var url;
        try {
            url = new URL(src, window.location.href);
        } catch (error) {
            return src;
        }
        url.searchParams.set('view', 'drawer');
        url.searchParams.set('open', '1');
        return url.toString();
    }

    function variationData(variation) {
        if (!variation) return null;
        var data = {};
        if (variation.variation_id) data.variantId = String(variation.variation_id);
        if (variation.display_price !== undefined && variation.display_price !== null) {
            var price = Number(String(variation.display_price).replace(/,/g, ''));
            if (isFinite(price) && price > 0) data.price = price;
        }
        if (variation.title) data.title = String(variation.title);
        if (variation.image && variation.image.src && /^https?:\/\//i.test(variation.image.src)) {
            data.image = String(variation.image.src);
        }
        return Object.keys(data).length ? data : null;
    }

    function postProductUpdate(frame, variation) {
        var data = variationData(variation);
        if (!frame || !frame.contentWindow || !data) return;
        try {
            frame.contentWindow.postMessage(Object.assign({ type: 'cg_product_update' }, data), '*');
        } catch (error) {}
    }

    function updateInline(frame, variation) {
        if (!frame || !variation) return;
        var url;
        try {
            url = new URL(frame.getAttribute('src') || frame.src, window.location.href);
        } catch (error) {
            return;
        }
        if (variation.variation_id) url.searchParams.set('variationId', String(variation.variation_id));
        if (variation.display_price !== undefined && variation.display_price !== null) {
            url.searchParams.set('price', String(variation.display_price));
        }
        if (variation.title) url.searchParams.set('title', String(variation.title));
        if (variation.image && variation.image.src) url.searchParams.set('image', String(variation.image.src));
        frame.setAttribute('src', url.toString());
    }

    function isOpen() {
        return !!overlay && !overlay.hidden;
    }

    function lockScroll() {
        scrollState = {
            body: document.body.style.overflow,
            html: document.documentElement.style.overflow,
            y: window.scrollY || document.documentElement.scrollTop || 0
        };
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }

    function unlockScroll() {
        if (!scrollState) return;
        document.body.style.overflow = scrollState.body;
        document.documentElement.style.overflow = scrollState.html;
        window.scrollTo(0, scrollState.y);
        scrollState = null;
    }

    function closeDrawer() {
        if (!isOpen()) return;
        if (closeTimer) window.clearTimeout(closeTimer);
        overlay.classList.remove('is-visible');
        closeTimer = window.setTimeout(function () {
            closeTimer = null;
            if (!isOpen()) overlay.hidden = true;
        }, 180);
        document.removeEventListener('keydown', onKeyDown);
        unlockScroll();
        if (opener && opener.focus) {
            try {
                opener.focus();
            } catch (error) {}
        }
    }

    function buildDrawer(inlineFrame) {
        overlay = document.createElement('div');
        overlay.className = 'cartgain-bargain-drawer';
        overlay.setAttribute('hidden', '');
        overlay.setAttribute('role', 'presentation');

        panel = document.createElement('div');
        panel.className = 'cartgain-bargain-drawer__panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'CartGain price negotiation');

        closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'cartgain-bargain-drawer__close';
        closeButton.setAttribute('aria-label', 'Close negotiation');
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', closeDrawer);

        drawerFrame = document.createElement('iframe');
        drawerFrame.className = 'cartgain-bargain__frame cartgain-bargain-drawer__frame';
        drawerFrame.title = 'CartGain price negotiation';
        drawerFrame.setAttribute('allow', 'forms; clipboard-write; clipboard-read');
        drawerFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
        drawerFrame.setAttribute('referrerpolicy', 'origin');
        drawerFrame.setAttribute('src', drawerSrc(inlineFrame.getAttribute('src') || inlineFrame.src));
        drawerFrame.setAttribute('data-cg-drawer-source', inlineFrame.getAttribute('src') || inlineFrame.src);

        panel.appendChild(closeButton);
        panel.appendChild(drawerFrame);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('mousedown', function (event) {
            if (event.target === overlay) closeDrawer();
        });

        onKeyDown = function (event) {
            if (event.key === 'Escape') closeDrawer();
        };
    }

    function openDrawer(inlineFrame) {
        if (!inlineFrame || isOpen()) return;
        if (!overlay) buildDrawer(inlineFrame);
        var source = inlineFrame.getAttribute('src') || inlineFrame.src;
        if (drawerFrame.getAttribute('data-cg-drawer-source') !== source) {
            drawerFrame.setAttribute('data-cg-drawer-source', source);
            drawerFrame.setAttribute('src', drawerSrc(source));
        }
        opener = inlineFrame;
        if (closeTimer) {
            window.clearTimeout(closeTimer);
            closeTimer = null;
        }
        overlay.hidden = false;
        lockScroll();
        window.requestAnimationFrame(function () {
            overlay.classList.add('is-visible');
        });
        document.addEventListener('keydown', onKeyDown);
        try {
            closeButton.focus();
        } catch (error) {}
        try {
            inlineFrame.contentWindow.postMessage({ type: 'cg_drawer_opened' }, '*');
        } catch (error) {}
    }

    function handleMessages(event) {
        var list = frames();
        var i;
        var frame;
        for (i = 0; i < list.length; i++) {
            frame = list[i];
            if (!trusted(event, frame)) continue;
            var type = event.data && event.data.type;
            if (type === 'cg_open_drawer') {
                event.preventDefault();
                openDrawer(frame);
                return;
            }
            if (type === 'cg_resize' && !isOpen()) {
                var height = Number(event.data.height);
                if (isFinite(height)) {
                    height = Math.max(180, Math.min(900, Math.round(height)));
                    frame.style.height = height + 'px';
                    var container = frame.closest('.cartgain-bargain');
                    if (container) container.style.height = height + 'px';
                }
                return;
            }
            if (type === 'cg_empty') {
                var host = frame.closest('.cartgain-bargain');
                if (host) host.hidden = true;
                if (isOpen()) closeDrawer();
                return;
            }
        }
        if (drawerFrame && trusted(event, drawerFrame)) {
            if (event.data && event.data.type === 'cg_close') closeDrawer();
            if (event.data && event.data.type === 'cg_empty') closeDrawer();
        }
    }

    function handleVariation(event, variation) {
        var target = event.target;
        if (!target || !target.closest) return;
        var container = target.closest('[data-cartgain-bargain]');
        if (!container) return;
        var frame = container.querySelector('.cartgain-bargain__frame');
        updateInline(frame, variation);
        if (isOpen() && drawerFrame) postProductUpdate(drawerFrame, variation);
    }

    function initVariationEvents() {
        if (!window.jQuery) return;
        window.jQuery(document).on('found_variation show_variation', '.product', handleVariation);
    }

    window.addEventListener('message', handleMessages);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVariationEvents);
    } else {
        initVariationEvents();
    }
}());
