/**
 * 界面皮肤（默认暖灰 / Serene Canvas / Midnight Focus）与 data-app-skin
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

    function readSkinFromStorage() {
        var scopedKey = getStorageKey();
        var scopedValue = localStorage.getItem(scopedKey);

        if (scopedValue === 'crystal-flow') {
            try {
                localStorage.setItem(scopedKey, 'classic');
            } catch (e) { /* ignore */ }
            return 'classic';
        }

        if (scopedValue === 'serene' || scopedValue === 'midnight' || scopedValue === 'classic') {
            return scopedValue;
        }

        // 兼容旧版本：把全局主题迁移到当前账号作用域
        if (scopedKey !== LEGACY_STORAGE_KEY) {
            var legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyValue === 'crystal-flow') {
                try {
                    localStorage.setItem(scopedKey, 'classic');
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                } catch (e) { /* ignore */ }
                return 'classic';
            }
            if (legacyValue === 'serene' || legacyValue === 'midnight' || legacyValue === 'classic') {
                localStorage.setItem(scopedKey, legacyValue);
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
        } else {
            document.documentElement.removeAttribute('data-app-skin');
        }
    }

    function initFromStorage() {
        try {
            var s = readSkinFromStorage();
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
            var next = skin === 'serene'
                ? 'serene'
                : (skin === 'midnight' ? 'midnight' : 'classic');
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
            return 'classic';
        }
    };
})();
