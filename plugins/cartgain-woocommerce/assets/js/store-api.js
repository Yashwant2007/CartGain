(function () {
    'use strict';

    var cg = window.cartgainWC || {};
    var restUrl = cg.restUrl || '';
    var nonce = cg.nonce || '';
    var lastCartSignature = '';
    var checkoutSent = false;
    var customerTimers = {};
    var cartTimer = null;
    var attempts = 0;

    function post(path, payload) {
        if (!restUrl || !nonce) {
            return;
        }
        fetch(restUrl + path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': nonce
            },
            body: JSON.stringify(payload || {})
        }).catch(function () {});
    }

    function cartToken() {
        if (window.wp && wp.data && wp.data.select) {
            var cartStore = wp.data.select('wc/store/cart');
            if (cartStore && typeof cartStore.getCartToken === 'function') {
                var token = cartStore.getCartToken();
                if (token) {
                    return String(token);
                }
            }
        }
        var match = document.cookie.match(/(?:^|;\s*)wc_cart_hash=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function customerContact() {
        var email = document.querySelector('#billing_email, input[name="billing_email"]');
        var phone = document.querySelector('#billing_phone, input[name="billing_phone"]');
        return {
            customerEmail: email && email.value ? email.value : '',
            customerPhone: phone && phone.value ? phone.value : ''
        };
    }

    function cartSnapshot() {
        var cart = {};
        if (window.wp && wp.data && wp.data.select) {
            var store = wp.data.select('wc/store/cart');
            if (store && typeof store.getCartData === 'function') {
                cart = store.getCartData() || {};
            }
        }
        var items = [];
        if (Array.isArray(cart.items)) {
            cart.items.slice(0, 100).forEach(function (item) {
                items.push({
                    productId: Number(item.id || item.product_id || 0),
                    variationId: Number(item.variation_id || item.variationId || 0),
                    quantity: Number(item.quantity || 0)
                });
            });
        }
        var totals = cart.totals || {};
        return {
            cartToken: cartToken(),
            cartHash: typeof cart.hash === 'string' ? cart.hash : '',
            items: items,
            totals: {
                subtotal: Number(totals.total_price || 0) / 100,
                total: Number(totals.total_price || 0) / 100
            },
            currency: cart.currencyCode || ''
        };
    }

    function sendCart() {
        var snapshot = cartSnapshot();
        if (!snapshot.cartToken || !cg.cartEnabled) {
            return;
        }
        var signature = JSON.stringify([snapshot.cartToken, snapshot.items, snapshot.totals, snapshot.currency]);
        if (signature === lastCartSignature) {
            return;
        }
        lastCartSignature = signature;
        post('/events', { type: 'store_api_cart', payload: snapshot });
    }

    function queueCart() {
        if (cartTimer) {
            clearTimeout(cartTimer);
        }
        cartTimer = setTimeout(sendCart, 400);
    }

    function sendCheckout() {
        if (checkoutSent || !cg.isCheckout || !cg.cartEnabled) {
            return;
        }
        var token = cartToken();
        if (!token) {
            return;
        }
        checkoutSent = true;
        post('/events', { type: 'checkout_started', payload: { cartToken: token } });
    }

    function sendCustomer(field, value) {
        var token = cartToken();
        if (!token || !cg.cartEnabled || !value) {
            return;
        }
        var payload = { cartToken: token };
        payload[field] = value;
        post('/events', { type: 'customer_identified', payload: payload });
    }

    function watchCustomerFields() {
        var fields = [
            { selector: '#billing_email, input[name="billing_email"]', field: 'email' },
            { selector: '#billing_phone, input[name="billing_phone"]', field: 'phone' }
        ];
        fields.forEach(function (entry) {
            var elements = document.querySelectorAll(entry.selector);
            Array.prototype.forEach.call(elements, function (element) {
                element.addEventListener('input', function () {
                    if (customerTimers[entry.field]) {
                        clearTimeout(customerTimers[entry.field]);
                    }
                    customerTimers[entry.field] = setTimeout(function () {
                        sendCustomer(entry.field, element.value);
                    }, 800);
                });
            });
        });
    }

    function consentFromCheckbox(element) {
        var box = element.closest('[data-cartgain-consent-box]');
        if (!box) {
            var email = document.querySelector('input[name="cartgain_email_consent"]');
            var whatsapp = document.querySelector('input[name="cartgain_whatsapp_consent"]');
            var phone = document.querySelector('input[name="cartgain_whatsapp_phone"]');
            var contact = customerContact();
            post('/consent', {
                source: 'checkout',
                cartToken: cartToken(),
                customerEmail: contact.customerEmail,
                customerPhone: contact.customerPhone,
                email: email ? email.checked : undefined,
                whatsapp: whatsapp ? whatsapp.checked : undefined,
                whatsappPhone: phone ? phone.value : undefined
            });
            return;
        }
        var emailBox = box.querySelector('[data-cartgain-consent="email"]');
        var whatsappBox = box.querySelector('[data-cartgain-consent="whatsapp"]');
        var whatsappPhone = box.querySelector('[data-cartgain-whatsapp-phone]');
        var contact = customerContact();
        post('/consent', {
            source: box.getAttribute('data-cartgain-source') || 'shortcode',
            cartToken: cartToken(),
            customerEmail: contact.customerEmail,
            customerPhone: contact.customerPhone,
            email: emailBox ? emailBox.checked : undefined,
            whatsapp: whatsappBox ? whatsappBox.checked : undefined,
            whatsappPhone: whatsappPhone ? whatsappPhone.value : undefined
        });
    }

    function watchConsent() {
        document.addEventListener('change', function (event) {
            var target = event.target;
            if (!target || !target.matches) {
                return;
            }
            if (target.matches('[data-cartgain-consent], input[name="cartgain_email_consent"], input[name="cartgain_whatsapp_consent"]')) {
                consentFromCheckbox(target);
            }
        });
    }

    function start() {
        if (window.wp && wp.data && wp.data.select && wp.data.select('wc/store/cart')) {
            wp.data.subscribe(queueCart);
            sendCart();
            sendCheckout();
            return;
        }
        attempts += 1;
        if (attempts < 25) {
            setTimeout(start, 200);
        } else {
            sendCheckout();
        }
    }

    function init() {
        watchConsent();
        watchCustomerFields();
        start();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
