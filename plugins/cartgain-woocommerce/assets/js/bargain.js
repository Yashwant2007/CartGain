(function () {
    'use strict';

    function update(frame, variation) {
        if (!frame || !variation || typeof URL !== 'function') {
            return;
        }
        var url;
        try {
            url = new URL(frame.getAttribute('src'));
        } catch (error) {
            return;
        }
        if (variation.variation_id) {
            url.searchParams.set('variationId', String(variation.variation_id));
        }
        if (variation.display_price !== undefined && variation.display_price !== null) {
            url.searchParams.set('price', String(variation.display_price));
        }
        if (variation.title) {
            url.searchParams.set('title', String(variation.title));
        }
        if (variation.image && variation.image.src) {
            url.searchParams.set('image', String(variation.image.src));
        }
        frame.setAttribute('src', url.toString());
    }

    function handle(event, variation) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }
        var container = target.closest('[data-cartgain-bargain]');
        if (!container) {
            return;
        }
        update(container.querySelector('.cartgain-bargain__frame'), variation);
    }

    function init() {
        if (!window.jQuery) {
            return;
        }
        window.jQuery(document).on('found_variation show_variation', '.product', handle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
