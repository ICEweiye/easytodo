/**
 * 复盘偏好：系统标签、同级自定义标签(ct_*) 、新建默认项、热力图等。
 * 存储键经 PlannerAuth 作用域隔离（多用户）。
 */
(function initReviewSettings() {
    var LOGICAL_KEY = '__planner_review_settings_v1';
    var MAX_CUSTOM_TAGS = 32;

    var BUILTIN_LABELS = {
        none: '无',
        life: '生活',
        work: '工作',
        study: '学习',
        important: '重要',
        goal: '目标'
    };

    var DEFAULT_CATEGORY_COLORS = {
        none: '#8b847d',
        life: '#8a6a00',
        work: '#2f6a3a',
        study: '#2e5f8d',
        important: '#8a2f2f',
        goal: '#a65a00'
    };

    var CATEGORY_KEYS = Object.keys(BUILTIN_LABELS);

    function scopedStorageKey() {
        if (window.PlannerAuth && typeof window.PlannerAuth.scopedStorageKey === 'function') {
            return window.PlannerAuth.scopedStorageKey(LOGICAL_KEY);
        }
        return LOGICAL_KEY;
    }

    function readRaw() {
        try {
            var raw = localStorage.getItem(scopedStorageKey());
            if (!raw) return {};
            var o = JSON.parse(raw);
            return typeof o === 'object' && o ? o : {};
        } catch (e) {
            return {};
        }
    }

    function writeRaw(obj) {
        try {
            localStorage.setItem(scopedStorageKey(), JSON.stringify(obj));
        } catch (e) {
            /* ignore */
        }
    }

    function clampInt(n, min, max, fallback) {
        var v = Math.floor(Number(n));
        if (!Number.isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    }

    function normalizeHexColor(raw, fallback) {
        var s = String(raw || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
        return fallback;
    }

    function hexToRgb(hex) {
        var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function categoryColorAlpha(hex, a) {
        var rgb = hexToRgb(hex);
        if (!rgb) return 'rgba(0,0,0,' + a + ')';
        return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
    }

    function generateCustomTagId() {
        return 'ct_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function normalizeCustomTags(raw) {
        var arr = Array.isArray(raw.customTags) ? raw.customTags : [];
        var out = [];
        var seen = {};
        for (var i = 0; i < arr.length; i++) {
            var t = arr[i];
            if (!t || typeof t !== 'object') continue;
            var id = String(t.id || '').trim();
            if (!/^ct_[a-z0-9_]+$/i.test(id) || seen[id]) continue;
            var label = String(t.label || '').trim().slice(0, 32);
            if (!label) continue;
            var color = normalizeHexColor(t.color, '#6b7280');
            seen[id] = true;
            out.push({ id: id, label: label, color: color });
            if (out.length >= MAX_CUSTOM_TAGS) break;
        }
        return out;
    }

    function normalizeSettings(raw) {
        var labels = {};
        if (raw.categoryLabels && typeof raw.categoryLabels === 'object') {
            CATEGORY_KEYS.forEach(function (k) {
                var t = raw.categoryLabels[k];
                if (typeof t === 'string') {
                    var s = t.trim();
                    if (s && s.length <= 32) labels[k] = s;
                }
            });
        }

        var colors = {};
        if (raw.categoryColors && typeof raw.categoryColors === 'object') {
            CATEGORY_KEYS.forEach(function (k) {
                var def = DEFAULT_CATEGORY_COLORS[k] || '#888888';
                var v = raw.categoryColors[k];
                if (typeof v === 'string') {
                    var h = normalizeHexColor(v, def);
                    if (h.toLowerCase() !== def.toLowerCase()) colors[k] = h;
                }
            });
        }

        var customTags = normalizeCustomTags(raw);
        var customIds = customTags.map(function (t) {
            return t.id;
        });

        var dc = String(raw.defaultDailyCategory || 'none');
        var allowedDefault = CATEGORY_KEYS.concat(customIds);
        if (allowedDefault.indexOf(dc) === -1) dc = 'none';

        var ds = raw.defaultDailyScore;
        if (ds === null || ds === undefined || ds === '') {
            ds = 7;
        } else {
            ds = clampInt(ds, 1, 10, 7);
        }

        var showHeatmap = raw.showHeatmap !== false;
        var openDailyFocus = raw.openDailyFocus === 'score' ? 'score' : 'summary';

        return {
            categoryLabels: labels,
            categoryColors: colors,
            customTags: customTags,
            defaultDailyCategory: dc,
            defaultDailyScore: ds,
            showHeatmap: showHeatmap,
            openDailyFocus: openDailyFocus
        };
    }

    function getSettings() {
        return normalizeSettings(readRaw());
    }

    function setSettings(partial) {
        var cur = normalizeSettings(readRaw());
        var merged = Object.assign({}, cur, partial || {});
        if (partial && Object.prototype.hasOwnProperty.call(partial, 'categoryLabels')) {
            merged.categoryLabels = partial.categoryLabels || {};
        }
        if (partial && Object.prototype.hasOwnProperty.call(partial, 'categoryColors')) {
            merged.categoryColors = partial.categoryColors || {};
        }
        if (partial && Object.prototype.hasOwnProperty.call(partial, 'customTags')) {
            merged.customTags = partial.customTags;
        }
        var next = normalizeSettings(merged);
        writeRaw(next);
        return getSettings();
    }

    function getBuiltinLabel(key) {
        return BUILTIN_LABELS[key] || key;
    }

    function getCustomTags() {
        return getSettings().customTags.slice();
    }

    function getCustomTagById(id) {
        var tags = getSettings().customTags;
        var want = String(id || '').trim();
        for (var i = 0; i < tags.length; i++) {
            if (tags[i].id === want) return tags[i];
        }
        return null;
    }

    function isCustomTagId(key) {
        return /^ct_[a-z0-9_]+$/i.test(String(key || '')) && !!getCustomTagById(key);
    }

    function getCategoryLabel(key) {
        var k = String(key || '').trim();
        if (k.indexOf('ct_') === 0) {
            var tag = getCustomTagById(k);
            return tag ? tag.label : '标签';
        }
        if (CATEGORY_KEYS.indexOf(k) === -1) k = 'none';
        var s = getSettings();
        var custom = s.categoryLabels && s.categoryLabels[k];
        if (typeof custom === 'string' && custom.trim()) return custom.trim().slice(0, 32);
        return getBuiltinLabel(k);
    }

    function getCategoryColor(key) {
        var k = String(key || '').trim();
        if (k.indexOf('ct_') === 0) {
            var tag = getCustomTagById(k);
            return tag ? tag.color : '#6b7280';
        }
        if (CATEGORY_KEYS.indexOf(k) === -1) k = 'none';
        var def = DEFAULT_CATEGORY_COLORS[k] || '#666666';
        var s = getSettings();
        var c = s.categoryColors && s.categoryColors[k];
        if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
        return def;
    }

    function addCustomTag(labelRaw, colorRaw) {
        var label = String(labelRaw || '').trim().slice(0, 32);
        if (!label) return { ok: false, error: 'empty' };
        var color = normalizeHexColor(colorRaw, '#6b7280');
        var cur = getCustomTags();
        if (cur.length >= MAX_CUSTOM_TAGS) return { ok: false, error: 'limit' };
        var id = generateCustomTagId();
        var next = cur.concat([{ id: id, label: label, color: color }]);
        setSettings({ customTags: next });
        return { ok: true, id: id };
    }

    function removeCustomTag(id) {
        var want = String(id || '').trim();
        var cur = getCustomTags();
        var next = cur.filter(function (t) {
            return t.id !== want;
        });
        if (next.length === cur.length) return false;
        var s = getSettings();
        var dc = s.defaultDailyCategory;
        var patch = { customTags: next };
        if (dc === want) patch.defaultDailyCategory = 'none';
        setSettings(patch);
        return true;
    }

    function updateCustomTag(id, labelRaw, colorRaw) {
        var want = String(id || '').trim();
        if (!getCustomTagById(want)) return { ok: false, error: 'missing' };
        var label = String(labelRaw || '').trim().slice(0, 32);
        if (!label) return { ok: false, error: 'empty' };
        var color = normalizeHexColor(colorRaw, '#6b7280');
        var cur = getCustomTags();
        var next = cur.map(function (t) {
            if (t.id !== want) return t;
            return { id: t.id, label: label, color: color };
        });
        setSettings({ customTags: next });
        return { ok: true, id: want };
    }

    function setCategoryLabelsFromForm(map) {
        var cur = getSettings().categoryLabels || {};
        var next = Object.assign({}, cur);
        CATEGORY_KEYS.forEach(function (k) {
            if (!map || !Object.prototype.hasOwnProperty.call(map, k)) return;
            var v = map[k];
            if (typeof v !== 'string') return;
            var t = v.trim().slice(0, 32);
            if (!t || t === getBuiltinLabel(k)) {
                delete next[k];
            } else {
                next[k] = t;
            }
        });
        return setSettings({ categoryLabels: next });
    }

    function setCategoryAppearanceFromModal(labelsMap, colorsMap) {
        var nextLabels = {};
        var nextColors = {};
        CATEGORY_KEYS.forEach(function (k) {
            if (labelsMap && Object.prototype.hasOwnProperty.call(labelsMap, k)) {
                var v = labelsMap[k];
                if (typeof v === 'string') {
                    var t = v.trim().slice(0, 32);
                    if (t && t !== getBuiltinLabel(k)) nextLabels[k] = t;
                }
            }
            if (colorsMap && Object.prototype.hasOwnProperty.call(colorsMap, k)) {
                var cv = colorsMap[k];
                if (typeof cv === 'string') {
                    var def = DEFAULT_CATEGORY_COLORS[k] || '#888888';
                    var h = normalizeHexColor(cv, def);
                    if (h.toLowerCase() !== def.toLowerCase()) nextColors[k] = h;
                }
            }
        });
        return setSettings({ categoryLabels: nextLabels, categoryColors: nextColors });
    }

    function resetCategoryAppearance() {
        return setSettings({ categoryLabels: {}, categoryColors: {} });
    }

    function resetAllTagsToDefault() {
        return setSettings({ categoryLabels: {}, categoryColors: {}, customTags: [] });
    }

    function applyHeatmapVisibility() {
        var panel = document.getElementById('reviewHeatPanel');
        if (!panel) return;
        var show = getSettings().showHeatmap !== false;
        panel.hidden = !show;
        panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    function cssAttrSafe(val) {
        return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function applyReviewCategoryStylesInjection() {
        var el = document.getElementById('planner-review-category-custom-css');
        if (!el) {
            el = document.createElement('style');
            el.id = 'planner-review-category-custom-css';
            document.head.appendChild(el);
        }
        var parts = [];
        CATEGORY_KEYS.forEach(function (k) {
            var hex = getCategoryColor(k);
            var c = hex;
            var bg = categoryColorAlpha(hex, 0.16);
            var bd = categoryColorAlpha(hex, 0.5);
            var bgP = categoryColorAlpha(hex, 0.22);
            var bdP = categoryColorAlpha(hex, 0.4);
            var vk = cssAttrSafe(k);
            parts.push('#reviewModal .review-category-select.category-' + k + '{border-color:' + bd + '!important;background:' + bg + '!important;color:' + c + '!important;}');
            parts.push('#reviewModal #reviewCategory option[value="' + vk + '"]{color:' + c + '!important;}');
            parts.push('#weeklyReviewModal .weekly-review-category-option.category-' + k + ',#monthlyReviewModal .weekly-review-category-option.category-' + k + '{color:' + c + '!important;}');
            parts.push('#weeklyReviewModal .weekly-review-category-row .weekly-review-pill.category-' + k + ',#monthlyReviewModal .weekly-review-category-row .weekly-review-pill.category-' + k + '{background:' + bgP + '!important;color:' + c + '!important;border-color:' + bdP + '!important;}');
            parts.push('.weekly-review-record-card__cat-pill.category-' + k + '{background:' + bgP + '!important;color:' + c + '!important;border-color:' + bdP + '!important;}');
        });
        getCustomTags().forEach(function (t) {
            var hex = t.color;
            var c = hex;
            var bg = categoryColorAlpha(hex, 0.16);
            var bd = categoryColorAlpha(hex, 0.5);
            var bgP = categoryColorAlpha(hex, 0.22);
            var bdP = categoryColorAlpha(hex, 0.4);
            var vid = cssAttrSafe(t.id);
            parts.push('#reviewModal #reviewCategory option[value="' + vid + '"]{color:' + c + '!important;}');
            parts.push('#weeklyReviewModal .weekly-review-category-option[data-value="' + vid + '"][data-custom-tag="1"],#monthlyReviewModal .weekly-review-category-option[data-value="' + vid + '"][data-custom-tag="1"]{color:' + c + '!important;}');
            parts.push('#weeklyReviewModal .weekly-review-category-row .weekly-review-pill[data-cat-key="' + vid + '"],#monthlyReviewModal .weekly-review-category-row .weekly-review-pill[data-cat-key="' + vid + '"]{background:' + bgP + '!important;color:' + c + '!important;border-color:' + bdP + '!important;}');
            parts.push('.weekly-review-record-card__cat-pill[data-cat-key="' + vid + '"]{background:' + bgP + '!important;color:' + c + '!important;border-color:' + bdP + '!important;}');
        });
        el.textContent = parts.join('\n');
    }

    window.ReviewSettings = {
        CATEGORY_KEYS: CATEGORY_KEYS,
        MAX_CUSTOM_TAGS: MAX_CUSTOM_TAGS,
        DEFAULT_CATEGORY_COLORS: DEFAULT_CATEGORY_COLORS,
        getSettings: getSettings,
        setSettings: setSettings,
        getBuiltinLabel: getBuiltinLabel,
        getCustomTags: getCustomTags,
        getCustomTagById: getCustomTagById,
        isCustomTagId: isCustomTagId,
        addCustomTag: addCustomTag,
        updateCustomTag: updateCustomTag,
        removeCustomTag: removeCustomTag,
        getCategoryLabel: getCategoryLabel,
        getCategoryColor: getCategoryColor,
        categoryColorAlpha: categoryColorAlpha,
        setCategoryLabelsFromForm: setCategoryLabelsFromForm,
        setCategoryAppearanceFromModal: setCategoryAppearanceFromModal,
        resetCategoryAppearance: resetCategoryAppearance,
        resetCategoryLabels: resetCategoryAppearance,
        resetAllTagsToDefault: resetAllTagsToDefault,
        applyHeatmapVisibility: applyHeatmapVisibility,
        applyReviewCategoryStylesInjection: applyReviewCategoryStylesInjection
    };
})();
