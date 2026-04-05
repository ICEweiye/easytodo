/**
 * 总资产（流动 + 实物）与总负债（短期 + 长期）读写与编辑，
 * 供财务统计展示与安全隐私「财务信息」编辑共用。
 */
(function (global) {
    'use strict';

    var ASSET_CATEGORY_KEYS = ['cash_deposit', 'physical_asset'];
    var LIABILITY_CATEGORY_KEYS = ['short_term_liability', 'long_term_liability'];
    /** 财务无数据场景下，流动资产已做过首次保存后，后续修改才走校对差额 */
    var LIQUID_FIRST_SAVE_DONE_KEY = 'planner_liquid_first_save_done';

    function plannerScopedKey(logicalKey) {
        if (global.PlannerAuth && typeof global.PlannerAuth.scopedStorageKey === 'function') {
            return global.PlannerAuth.scopedStorageKey(logicalKey);
        }
        return logicalKey;
    }

    function roundFinanceAmount(value) {
        var amount = Number(value);
        if (!Number.isFinite(amount)) return 0;
        var rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
        return Math.abs(rounded) < 0.000000000001 ? 0 : rounded;
    }

    function sanitizeCategoryValues(raw, allowedKeys) {
        var result = {};
        var source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        allowedKeys.forEach(function (key) {
            var value = Number(source[key]);
            result[key] = Number.isFinite(value) && value >= 0 ? roundFinanceAmount(value) : 0;
        });
        return result;
    }

    function sumCategoryValues(values, keys) {
        return roundFinanceAmount(keys.reduce(function (sum, key) {
            return sum + (Number(values[key]) || 0);
        }, 0));
    }

    function safeJsonValue(raw, fallback) {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (err) {
            return fallback;
        }
    }

    function parseStoredNumber(raw) {
        if (raw === null) return 0;
        try {
            var parsed = JSON.parse(raw);
            var value = Number(parsed);
            return Number.isFinite(value) ? roundFinanceAmount(value) : 0;
        } catch (e) {
            var n = Number(raw);
            return Number.isFinite(n) ? roundFinanceAmount(n) : 0;
        }
    }

    function getTotalAssetsCategories() {
        var raw = safeJsonValue(localStorage.getItem(plannerScopedKey('planner_total_assets_categories')), null);
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return sanitizeCategoryValues(raw, ASSET_CATEGORY_KEYS);
        }

        var rawBase = localStorage.getItem(plannerScopedKey('planner_total_assets_base'));
        var rawLegacy = localStorage.getItem(plannerScopedKey('planner_total_assets'));
        var rawValue = rawBase !== null ? rawBase : rawLegacy;
        var legacyBase = parseStoredNumber(rawValue);
        return sanitizeCategoryValues({
            cash_deposit: legacyBase,
            physical_asset: 0
        }, ASSET_CATEGORY_KEYS);
    }

    function setTotalAssetsCategories(values) {
        localStorage.setItem(plannerScopedKey('planner_total_assets_categories'), JSON.stringify(sanitizeCategoryValues(values, ASSET_CATEGORY_KEYS)));
    }

    function getTotalAssets() {
        return roundFinanceAmount(sumCategoryValues(getTotalAssetsCategories(), ASSET_CATEGORY_KEYS));
    }

    function getLiquidAssets() {
        var categories = getTotalAssetsCategories();
        return roundFinanceAmount(Number(categories.cash_deposit) || 0);
    }

    function applyNetBalanceDeltaToLiquidAssets(deltaNetBalance) {
        var d = roundFinanceAmount(Number(deltaNetBalance) || 0);
        if (Math.abs(d) < 0.000001) return;
        var categories = getTotalAssetsCategories();
        categories.cash_deposit = roundFinanceAmount((Number(categories.cash_deposit) || 0) + d);
        setTotalAssetsCategories(categories);
    }

    function getFinanceDataVisible() {
        var v = localStorage.getItem(plannerScopedKey('planner_finance_data_visible'));
        if (v === '0' || v === 'false') return false;
        return true;
    }

    function getCurrentMonthKey(date) {
        var d = date || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    /** 无周度财务记录（无支出/收入等周记录）视为「财务无数据」 */
    function isFinanceDataEmpty() {
        var raw = localStorage.getItem(plannerScopedKey('planner_weekly_expenses'));
        if (!raw || raw === '[]') return true;
        try {
            var arr = JSON.parse(raw);
            return !Array.isArray(arr) || arr.length === 0;
        } catch (e) {
            return true;
        }
    }

    function hasLiquidFirstSaveDone() {
        return localStorage.getItem(plannerScopedKey(LIQUID_FIRST_SAVE_DONE_KEY)) === '1';
    }

    function setLiquidFirstSaveDone() {
        try {
            localStorage.setItem(plannerScopedKey(LIQUID_FIRST_SAVE_DONE_KEY), '1');
        } catch (e) {
            // ignore
        }
    }

    function notifyLiquidAssetsChanged() {
        try {
            if (global.dispatchEvent) {
                global.dispatchEvent(new CustomEvent('planner-liquid-assets-updated', {
                    detail: { monthKey: getCurrentMonthKey(new Date()) }
                }));
            }
        } catch (e) {
            // ignore
        }
    }

    function getReconcileAdjustmentStorageKey() {
        return plannerScopedKey('planner_month_reconcile_adjustments');
    }

    function getReconcileAdjustments() {
        var raw = safeJsonValue(localStorage.getItem(getReconcileAdjustmentStorageKey()), {});
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

        var result = {};
        Object.keys(raw).forEach(function (key) {
            var value = Number(raw[key]);
            if (Number.isFinite(value)) {
                result[key] = roundFinanceAmount(value);
            }
        });
        return result;
    }

    function setReconcileAdjustment(monthKey, delta) {
        var adjustments = getReconcileAdjustments();
        var normalizedDelta = roundFinanceAmount(delta);
        if (Math.abs(normalizedDelta) < 0.000001) {
            delete adjustments[monthKey];
        } else {
            adjustments[monthKey] = normalizedDelta;
        }
        localStorage.setItem(getReconcileAdjustmentStorageKey(), JSON.stringify(adjustments));
    }

    function formatAmountWithTwoDecimals(value) {
        return roundFinanceAmount(value).toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatCurrency(num) {
        var rounded = roundFinanceAmount(num);
        var absText = formatAmountWithTwoDecimals(Math.abs(rounded));
        return rounded < 0 ? '-¥' + absText : '¥' + absText;
    }

    var FINANCE_DATA_MASK = '***';

    function normalizeAmountForInput(amount, options) {
        var opts = options || {};
        var allowBlank = Boolean(opts.allowBlank);
        var parsed = Number(amount);
        if (!Number.isFinite(parsed)) return allowBlank ? '' : '0.00';
        var rounded = roundFinanceAmount(parsed);
        if (Math.abs(rounded) < 0.005) return allowBlank ? '' : '0.00';
        return rounded.toFixed(2);
    }

    function syncAmountInputWidth(inputEl) {
        if (!inputEl) return;
        var text = (inputEl.value || inputEl.placeholder || '0').trim();
        var length = Math.max(1, text.length);
        var widthCh = Math.min(14, length + 0.6);
        inputEl.style.width = widthCh + 'ch';
    }

    function formatAmountNumberPart(num) {
        var rounded = roundFinanceAmount(num);
        var absText = formatAmountWithTwoDecimals(Math.abs(rounded));
        return rounded < 0 ? '-' + absText : absText;
    }

    function normalizeArithmeticExpression(raw) {
        return String(raw || '')
            .replace(/\s+/g, '')
            .replace(/[＋﹢]/g, '+')
            .replace(/[－﹣—–]/g, '-')
            .replace(/[×xX＊]/g, '*')
            .replace(/[÷／]/g, '/')
            .replace(/（/g, '(')
            .replace(/）/g, ')');
    }

    function evaluateArithmeticExpression(raw) {
        var expression = normalizeArithmeticExpression(raw);
        if (!expression) return null;
        if (!/^[0-9+\-*/().]+$/.test(expression)) return null;

        var index = 0;
        var length = expression.length;

        function parseNumber() {
            var start = index;
            var hasDigit = false;
            var dotCount = 0;

            while (index < length) {
                var ch = expression[index];
                if (ch >= '0' && ch <= '9') {
                    hasDigit = true;
                    index += 1;
                    continue;
                }
                if (ch === '.') {
                    if (dotCount > 0) break;
                    dotCount += 1;
                    index += 1;
                    continue;
                }
                break;
            }

            if (!hasDigit) return null;
            var value = Number(expression.slice(start, index));
            return Number.isFinite(value) ? value : null;
        }

        function parseFactor() {
            if (index >= length) return null;
            var ch = expression[index];
            if (ch === '+') {
                index += 1;
                return parseFactor();
            }
            if (ch === '-') {
                index += 1;
                var value = parseFactor();
                return value === null ? null : -value;
            }
            if (ch === '(') {
                index += 1;
                var inner = parseExpression();
                if (inner === null || expression[index] !== ')') return null;
                index += 1;
                return inner;
            }
            return parseNumber();
        }

        function parseTerm() {
            var value = parseFactor();
            if (value === null) return null;

            while (index < length) {
                var operator = expression[index];
                if (operator !== '*' && operator !== '/') break;
                index += 1;
                var right = parseFactor();
                if (right === null) return null;
                if (operator === '*') {
                    value *= right;
                } else {
                    if (Math.abs(right) < 0.000000000001) return null;
                    value /= right;
                }
                if (!Number.isFinite(value)) return null;
            }

            return value;
        }

        function parseExpression() {
            var value = parseTerm();
            if (value === null) return null;

            while (index < length) {
                var operator = expression[index];
                if (operator !== '+' && operator !== '-') break;
                index += 1;
                var right = parseTerm();
                if (right === null) return null;
                value = operator === '+' ? value + right : value - right;
                if (!Number.isFinite(value)) return null;
            }

            return value;
        }

        var result = parseExpression();
        if (result === null || index !== length) return null;
        return Number.isFinite(result) ? result : null;
    }

    function parseFinancialAmount(raw, options) {
        var opts = options || {};
        var allowNegative = opts.allowNegative !== false;
        var allowBlank = opts.allowBlank !== false;
        var text = String(raw || '').trim();
        if (text === '') {
            return allowBlank
                ? { ok: true, empty: true, value: undefined }
                : { ok: false, empty: true, value: null };
        }

        var value = Number(text);
        if (!Number.isFinite(value)) {
            value = evaluateArithmeticExpression(text);
        }
        if (!Number.isFinite(value)) {
            return { ok: false, empty: false, value: null };
        }

        var normalized = roundFinanceAmount(value);
        if (!allowNegative && normalized < 0) {
            return { ok: false, empty: false, value: null };
        }
        return { ok: true, empty: false, value: normalized };
    }

    function applyArithmeticToInputValue(inputEl, options) {
        var opts = options || {};
        var allowNegative = opts.allowNegative !== false;
        var syncWidth = Boolean(opts.syncWidth);
        if (!inputEl) return false;
        var parsed = parseFinancialAmount(inputEl.value, { allowNegative: allowNegative, allowBlank: true });
        if (!parsed.ok || parsed.empty) return false;
        inputEl.value = normalizeAmountForInput(parsed.value);
        if (syncWidth) syncAmountInputWidth(inputEl);
        return true;
    }

    function formatFinanceDisplay(num) {
        return getFinanceDataVisible() ? formatCurrency(num) : '¥' + FINANCE_DATA_MASK;
    }

    /**
     * @param {Object} ids - { cashDisplay?, physicalDisplay?, totalDisplay?, cashInput?, physicalInput? }
     */
    function renderAssetCard(ids) {
        var cashEl = ids.cashDisplay ? document.getElementById(ids.cashDisplay) : null;
        var physicalEl = ids.physicalDisplay ? document.getElementById(ids.physicalDisplay) : null;
        var totalEl = ids.totalDisplay ? document.getElementById(ids.totalDisplay) : null;
        var cashInput = ids.cashInput ? document.getElementById(ids.cashInput) : null;
        var physicalInput = ids.physicalInput ? document.getElementById(ids.physicalInput) : null;

        if (!cashEl && !physicalEl && !totalEl && !cashInput && !physicalInput) return;

        var masked = !getFinanceDataVisible();
        var categories = getTotalAssetsCategories();

        if (cashEl) {
            cashEl.textContent = masked ? FINANCE_DATA_MASK : formatAmountNumberPart(categories.cash_deposit);
        }
        if (physicalEl) {
            physicalEl.textContent = masked ? FINANCE_DATA_MASK : formatAmountNumberPart(categories.physical_asset);
        }

        function syncInput(el, amount, placeholderVisible, placeholderMasked) {
            if (!el || document.activeElement === el) return;
            if (masked) {
                el.value = '';
                el.readOnly = true;
                el.placeholder = placeholderMasked || '数据已隐藏';
            } else {
                el.readOnly = false;
                el.placeholder = placeholderVisible || '';
                var amt = Number(amount) || 0;
                if (Math.abs(roundFinanceAmount(amt)) < 0.000001) {
                    el.value = '';
                } else {
                    el.value = normalizeAmountForInput(amt);
                }
            }
        }

        syncInput(cashInput, categories.cash_deposit, '流动资产金额', '数据已隐藏');
        syncInput(physicalInput, categories.physical_asset, '实物资产金额', '数据已隐藏');

        if (totalEl) totalEl.textContent = formatFinanceDisplay(getTotalAssets());
    }

    function startAssetEdit(category, ids) {
        if (!getFinanceDataVisible()) return;
        var inputId = category === 'cash_deposit' ? ids.cashInput : ids.physicalInput;
        var inputEl = document.getElementById(inputId);
        var row = inputEl && inputEl.closest('.balance-editable-row');
        if (!inputEl || !row) return;
        var categories = getTotalAssetsCategories();
        inputEl.value = normalizeAmountForInput(Number(categories[category]) || 0);
        syncAmountInputWidth(inputEl);
        row.classList.add('is-editing');
        inputEl.focus();
        inputEl.select();
    }

    function saveAssetCategoryFromInput(inputEl, onAfterSave) {
        if (!inputEl) return;
        var cardType = inputEl.dataset.card;
        var category = inputEl.dataset.category;
        var row = inputEl.closest('.balance-editable-row');
        if (cardType !== 'assets' || !category) return;

        var raw = inputEl.value.trim();
        var parsed = parseFinancialAmount(raw, { allowNegative: false, allowBlank: true });
        var value = parsed.ok && !parsed.empty ? roundFinanceAmount(parsed.value) : 0;

        if (category === 'cash_deposit') {
            var oldCategories = getTotalAssetsCategories();
            var oldCash = roundFinanceAmount(Number(oldCategories.cash_deposit) || 0);
            var delta = roundFinanceAmount(value - oldCash);
            if (Math.abs(delta) >= 0.000001) {
                var financeEmpty = isFinanceDataEmpty();
                var skipReconcileFirst = financeEmpty && !hasLiquidFirstSaveDone();

                if (skipReconcileFirst) {
                    oldCategories.cash_deposit = value;
                    setTotalAssetsCategories(oldCategories);
                    setLiquidFirstSaveDone();
                    if (row) row.classList.remove('is-editing');
                    renderAssetCard(inputEl._financeAssetIds || {});
                    notifyLiquidAssetsChanged();
                    if (typeof onAfterSave === 'function') onAfterSave();
                    return;
                }

                var direction = delta > 0 ? '增加' : '减少';
                var ok = global.confirm(
                    '流动资产与当前账面差额 ' + formatCurrency(Math.abs(delta)) + '（' + direction + '）。\n确认后差值将计入当月校对差额。\n\n点「取消」则保留原值 ' + formatCurrency(oldCash) + '。'
                );
                if (!ok) {
                    var masked = !getFinanceDataVisible();
                    if (masked) {
                        inputEl.value = '';
                    } else if (Math.abs(oldCash) < 0.000001) {
                        inputEl.value = '';
                    } else {
                        inputEl.value = normalizeAmountForInput(oldCash);
                    }
                    if (row) row.classList.remove('is-editing');
                    return;
                }
                oldCategories.cash_deposit = value;
                setTotalAssetsCategories(oldCategories);
                var monthKey = getCurrentMonthKey(new Date());
                var adjustments = getReconcileAdjustments();
                var currentDelta = roundFinanceAmount(adjustments[monthKey] || 0);
                setReconcileAdjustment(monthKey, roundFinanceAmount(currentDelta + delta));
                if (row) row.classList.remove('is-editing');
                renderAssetCard(inputEl._financeAssetIds || {});
                notifyLiquidAssetsChanged();
                if (typeof onAfterSave === 'function') onAfterSave();
                return;
            }
        }

        var categories = getTotalAssetsCategories();
        categories[category] = value;
        setTotalAssetsCategories(categories);

        if (row) row.classList.remove('is-editing');
        renderAssetCard(inputEl._financeAssetIds || {});
        if (typeof onAfterSave === 'function') onAfterSave();
    }

    function bindAssetInputIds(inputEl, ids) {
        if (inputEl) inputEl._financeAssetIds = ids;
    }

    /**
     * @param {Object} ids - element id strings: cashDisplay, physicalDisplay, totalDisplay, cashInput, physicalInput
     * @param {Function} [onAfterSave]
     */
    function initAssetEditors(ids, onAfterSave) {
        ['cashInput', 'physicalInput'].forEach(function (key) {
            var id = ids[key];
            if (!id) return;
            var inputEl = document.getElementById(id);
            if (!inputEl) return;
            bindAssetInputIds(inputEl, ids);
            inputEl.addEventListener('click', function (e) { e.stopPropagation(); });
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyArithmeticToInputValue(inputEl, {
                        allowNegative: false,
                        syncWidth: inputEl.classList.contains('finance-balance-category-input')
                    });
                    inputEl.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    var row = inputEl.closest('.balance-editable-row');
                    if (row) row.classList.remove('is-editing');
                    renderAssetCard(ids);
                    inputEl.blur();
                }
            });
            inputEl.addEventListener('blur', function () {
                saveAssetCategoryFromInput(inputEl, onAfterSave);
            });
            inputEl.addEventListener('input', function () {
                if (inputEl.classList.contains('finance-balance-category-input')) {
                    syncAmountInputWidth(inputEl);
                }
            });
        });

        renderAssetCard(ids);
    }

    function getTotalLiabilitiesCategories() {
        var raw = safeJsonValue(localStorage.getItem(plannerScopedKey('planner_total_liabilities_categories')), null);
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return sanitizeCategoryValues(raw, LIABILITY_CATEGORY_KEYS);
        }

        var legacy = parseStoredNumber(localStorage.getItem(plannerScopedKey('planner_total_liabilities')));
        return sanitizeCategoryValues({
            short_term_liability: legacy,
            long_term_liability: 0
        }, LIABILITY_CATEGORY_KEYS);
    }

    function setTotalLiabilitiesCategories(values) {
        localStorage.setItem(
            plannerScopedKey('planner_total_liabilities_categories'),
            JSON.stringify(sanitizeCategoryValues(values, LIABILITY_CATEGORY_KEYS))
        );
    }

    function getTotalLiabilities() {
        return roundFinanceAmount(sumCategoryValues(getTotalLiabilitiesCategories(), LIABILITY_CATEGORY_KEYS));
    }

    function notifyLiabilitiesChanged() {
        try {
            if (global.dispatchEvent) {
                global.dispatchEvent(new CustomEvent('planner-liabilities-updated'));
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * 还款：从流动资产（cash_deposit）扣除，并减少对应短期/长期负债。
     * @param {string} liabilityCategory 'short_term_liability' | 'long_term_liability'
     * @param {*} amountRaw
     * @returns {{ ok: boolean, paid?: number, error?: string }}
     */
    function applyRepayment(liabilityCategory, amountRaw) {
        if (liabilityCategory !== 'short_term_liability' && liabilityCategory !== 'long_term_liability') {
            return { ok: false, error: 'invalid_type' };
        }
        if (!getFinanceDataVisible()) {
            return { ok: false, error: 'hidden' };
        }
        var amount = roundFinanceAmount(Number(amountRaw));
        if (!Number.isFinite(amount) || amount <= 0) {
            return { ok: false, error: 'invalid_amount' };
        }
        var assets = getTotalAssetsCategories();
        var liabs = getTotalLiabilitiesCategories();
        var liquid = roundFinanceAmount(Number(assets.cash_deposit) || 0);
        var owed = roundFinanceAmount(Number(liabs[liabilityCategory]) || 0);
        if (owed <= 0) {
            return { ok: false, error: 'no_debt' };
        }
        if (amount > liquid) {
            return { ok: false, error: 'insufficient_liquid' };
        }
        if (amount > owed) {
            return { ok: false, error: 'exceeds_liability' };
        }
        assets.cash_deposit = roundFinanceAmount(liquid - amount);
        liabs[liabilityCategory] = roundFinanceAmount(owed - amount);
        setTotalAssetsCategories(assets);
        setTotalLiabilitiesCategories(liabs);
        notifyLiquidAssetsChanged();
        notifyLiabilitiesChanged();
        return { ok: true, paid: amount };
    }

    /**
     * @param {Object} ids - shortDisplay?, longDisplay?, totalDisplay?, shortInput?, longInput?
     */
    function renderLiabilityCard(ids) {
        var shortEl = ids.shortDisplay ? document.getElementById(ids.shortDisplay) : null;
        var longEl = ids.longDisplay ? document.getElementById(ids.longDisplay) : null;
        var totalEl = ids.totalDisplay ? document.getElementById(ids.totalDisplay) : null;
        var shortInput = ids.shortInput ? document.getElementById(ids.shortInput) : null;
        var longInput = ids.longInput ? document.getElementById(ids.longInput) : null;

        if (!shortEl && !longEl && !totalEl && !shortInput && !longInput) return;

        var masked = !getFinanceDataVisible();
        var categories = getTotalLiabilitiesCategories();

        if (shortEl) {
            shortEl.textContent = masked ? FINANCE_DATA_MASK : formatAmountNumberPart(categories.short_term_liability);
        }
        if (longEl) {
            longEl.textContent = masked ? FINANCE_DATA_MASK : formatAmountNumberPart(categories.long_term_liability);
        }

        function syncInput(el, amount, placeholderVisible, placeholderMasked) {
            if (!el || document.activeElement === el) return;
            if (masked) {
                el.value = '';
                el.readOnly = true;
                el.placeholder = placeholderMasked || '数据已隐藏';
            } else {
                el.readOnly = false;
                el.placeholder = placeholderVisible || '';
                var amt = Number(amount) || 0;
                if (Math.abs(roundFinanceAmount(amt)) < 0.000001) {
                    el.value = '';
                } else {
                    el.value = normalizeAmountForInput(amt);
                }
            }
        }

        syncInput(shortInput, categories.short_term_liability, '短期负债金额', '数据已隐藏');
        syncInput(longInput, categories.long_term_liability, '长期负债金额', '数据已隐藏');

        if (totalEl) totalEl.textContent = formatFinanceDisplay(getTotalLiabilities());
    }

    function saveLiabilityCategoryFromInput(inputEl, onAfterSave) {
        if (!inputEl) return;
        var cardType = inputEl.dataset.card;
        var category = inputEl.dataset.category;
        if (cardType !== 'liabilities' || !category) return;

        var raw = inputEl.value.trim();
        var parsed = parseFinancialAmount(raw, { allowNegative: false, allowBlank: true });
        var value = parsed.ok && !parsed.empty ? roundFinanceAmount(parsed.value) : 0;

        var categories = getTotalLiabilitiesCategories();
        categories[category] = value;
        setTotalLiabilitiesCategories(categories);

        renderLiabilityCard(inputEl._financeLiabilityIds || {});
        notifyLiabilitiesChanged();
        if (typeof onAfterSave === 'function') onAfterSave();
    }

    function bindLiabilityInputIds(inputEl, ids) {
        if (inputEl) inputEl._financeLiabilityIds = ids;
    }

    /**
     * @param {Object} ids - totalDisplay, shortInput, longInput（统计页可仅传展示 id，无 input）
     * @param {Function} [onAfterSave]
     */
    function initLiabilityEditors(ids, onAfterSave) {
        ['shortInput', 'longInput'].forEach(function (key) {
            var id = ids[key];
            if (!id) return;
            var inputEl = document.getElementById(id);
            if (!inputEl) return;
            bindLiabilityInputIds(inputEl, ids);
            inputEl.addEventListener('click', function (e) { e.stopPropagation(); });
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyArithmeticToInputValue(inputEl, {
                        allowNegative: false,
                        syncWidth: inputEl.classList.contains('finance-balance-category-input')
                    });
                    inputEl.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    renderLiabilityCard(ids);
                    inputEl.blur();
                }
            });
            inputEl.addEventListener('blur', function () {
                saveLiabilityCategoryFromInput(inputEl, onAfterSave);
            });
            inputEl.addEventListener('input', function () {
                if (inputEl.classList.contains('finance-balance-category-input')) {
                    syncAmountInputWidth(inputEl);
                }
            });
        });

        renderLiabilityCard(ids);
    }

    global.FinanceAssets = {
        ASSET_CATEGORY_KEYS: ASSET_CATEGORY_KEYS,
        LIABILITY_CATEGORY_KEYS: LIABILITY_CATEGORY_KEYS,
        plannerScopedKey: plannerScopedKey,
        roundFinanceAmount: roundFinanceAmount,
        sanitizeCategoryValues: sanitizeCategoryValues,
        sumCategoryValues: sumCategoryValues,
        getTotalAssetsCategories: getTotalAssetsCategories,
        setTotalAssetsCategories: setTotalAssetsCategories,
        getTotalAssets: getTotalAssets,
        getLiquidAssets: getLiquidAssets,
        applyNetBalanceDeltaToLiquidAssets: applyNetBalanceDeltaToLiquidAssets,
        getFinanceDataVisible: getFinanceDataVisible,
        parseFinancialAmount: parseFinancialAmount,
        normalizeAmountForInput: normalizeAmountForInput,
        syncAmountInputWidth: syncAmountInputWidth,
        formatCurrency: formatCurrency,
        formatFinanceDisplay: formatFinanceDisplay,
        formatAmountNumberPart: formatAmountNumberPart,
        getReconcileAdjustments: getReconcileAdjustments,
        setReconcileAdjustment: setReconcileAdjustment,
        getCurrentMonthKey: getCurrentMonthKey,
        isFinanceDataEmpty: isFinanceDataEmpty,
        notifyLiquidAssetsChanged: notifyLiquidAssetsChanged,
        renderAssetCard: renderAssetCard,
        initAssetEditors: initAssetEditors,
        startAssetEdit: startAssetEdit,
        saveAssetCategoryFromInput: saveAssetCategoryFromInput,
        applyArithmeticToInputValue: applyArithmeticToInputValue,
        getTotalLiabilitiesCategories: getTotalLiabilitiesCategories,
        setTotalLiabilitiesCategories: setTotalLiabilitiesCategories,
        getTotalLiabilities: getTotalLiabilities,
        renderLiabilityCard: renderLiabilityCard,
        initLiabilityEditors: initLiabilityEditors,
        saveLiabilityCategoryFromInput: saveLiabilityCategoryFromInput,
        notifyLiabilitiesChanged: notifyLiabilitiesChanged,
        applyRepayment: applyRepayment
    };
})(typeof window !== 'undefined' ? window : globalThis);
