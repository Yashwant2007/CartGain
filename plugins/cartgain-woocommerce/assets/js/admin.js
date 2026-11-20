(function () {
    'use strict';

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest || !target.closest('[data-cartgain-confirm]')) {
            return;
        }
        var message = window.cartgainAdmin && window.cartgainAdmin.confirmDisconnect
            ? window.cartgainAdmin.confirmDisconnect
            : 'Disconnect CartGain?';
        if (!window.confirm(message)) {
            event.preventDefault();
        }
    });
}());
