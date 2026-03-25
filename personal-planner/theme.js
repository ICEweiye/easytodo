/**
 * 界面皮肤（默认暖灰 / Serene Canvas / Midnight Focus）与 data-app-skin
 */
(function () {
    var STORAGE_KEY = 'planner_app_skin';

    function applySkin(skin) {
        if (skin === 'serene') {
            document.documentElement.setAttribute('data-app-skin', 'serene');
        } else if (skin === 'midnight') {
            document.documentElement.setAttribute('data-app-skin', 'midnight');
        } else {
            document.documentElement.removeAttribute('data-app-skin');
        }
    }

    function initFromStorage() {
        try {
            var s = localStorage.getItem(STORAGE_KEY);
            if (s === 'serene' || s === 'midnight') {
                applySkin(s);
            } else {
                applySkin('classic');
            }
        } catch (e) {
            applySkin('classic');
        }
    }

    initFromStorage();

    window.PlannerAppSkin = {
        setSkin: function (skin) {
            var next = skin === 'serene' ? 'serene' : (skin === 'midnight' ? 'midnight' : 'classic');
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch (e) { /* ignore */ }
            applySkin(next);
            try {
                document.dispatchEvent(new CustomEvent('planner-app-skin-change', { detail: { skin: next } }));
            } catch (e2) { /* ignore */ }
        },
        getSkin: function () {
            var v = document.documentElement.getAttribute('data-app-skin');
            if (v === 'serene') return 'serene';
            if (v === 'midnight') return 'midnight';
            return 'classic';
        }
    };
})();
