/**
 * 界面皮肤（默认暖灰 / Serene Canvas / 冰雪蓝 / Crystal Flow 晶面 / Midnight Focus）与 data-app-skin
 */
(function () {
    var STORAGE_KEY = 'planner_app_skin';
    var LEGACY_STORAGE_KEY = STORAGE_KEY;

    function getStorageKey() {
        if (window.PlannerAuth && typeof window.PlannerAuth.scopedStorageKey === 'function') {
            return window.PlannerAuth.scopedStorageKey(STORAGE_KEY);
        }
        return STORAGE_KEY;
    }

    function normalizeSkin(skin) {
        if (skin === 'serene') return 'serene';
        if (skin === 'midnight') return 'midnight';
        if (skin === 'crystal-flow') return 'crystal-flow';
        if (skin === 'easyos-crystal') return 'easyos-crystal';
        return 'classic';
    }

    function readSkinFromStorage() {
        var scopedKey = getStorageKey();
        var scopedValue = localStorage.getItem(scopedKey);

        if (scopedValue === 'serene' || scopedValue === 'midnight' || scopedValue === 'classic'
            || scopedValue === 'crystal-flow' || scopedValue === 'easyos-crystal') {
            return scopedValue;
        }

        if (scopedKey !== LEGACY_STORAGE_KEY) {
            var legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyValue === 'serene' || legacyValue === 'midnight' || legacyValue === 'classic'
                || legacyValue === 'crystal-flow' || legacyValue === 'easyos-crystal') {
                try {
                    localStorage.setItem(scopedKey, legacyValue);
                } catch (e) { /* ignore */ }
                return legacyValue;
            }
        }
        return null;
    }

    function applySkin(skin) {
        if (skin === 'serene') {
            document.documentElement.setAttribute('data-app-skin', 'serene');
        } else if (skin === 'midnight') {
            document.documentElement.setAttribute('data-app-skin', 'midnight');
        } else if (skin === 'crystal-flow') {
            document.documentElement.setAttribute('data-app-skin', 'crystal-flow');
        } else if (skin === 'easyos-crystal') {
            document.documentElement.setAttribute('data-app-skin', 'easyos-crystal');
        } else {
            document.documentElement.removeAttribute('data-app-skin');
        }
    }

    function initFromStorage() {
        try {
            var s = readSkinFromStorage();
            if (s === 'serene' || s === 'midnight' || s === 'crystal-flow' || s === 'easyos-crystal') {
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
            var next = normalizeSkin(skin);
            try {
                localStorage.setItem(getStorageKey(), next);
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
            if (v === 'crystal-flow') return 'crystal-flow';
            if (v === 'easyos-crystal') return 'easyos-crystal';
            return 'classic';
        }
    };
})();
