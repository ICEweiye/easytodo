(function initPlannerDbBackupClient() {
    const API_PATH = '/api/backup-db';
    const PICKER_API_PATH = '/api/pick-folder';
    const OPEN_FOLDER_API_PATH = '/api/open-folder';
    const REQUEST_TIMEOUT_MS = 15000;
    const PICKER_TIMEOUT_MS = 120000;

    const TARGET_DIR_KEY = '__planner_backup_target_dir';
    const OPEN_AFTER_BACKUP_KEY = '__planner_backup_open_dir_after_backup';
    const START_PAGE_KEY = '__planner_start_page';
    const FONT_SIZE_KEY = '__planner_font_size';
    const LANGUAGE_KEY = '__planner_language';
    const CONTENT_OVERFLOW_KEY = '__planner_content_overflow';
    const FOLD_LONG_CONTENT_KEY = '__planner_fold_long_content';
    const USER_CONTENT_FOLD_THRESHOLD = 300;

    function getScopedSettingKey(logicalKey) {
        if (window.PlannerAuth && typeof window.PlannerAuth.scopedStorageKey === 'function') {
            return window.PlannerAuth.scopedStorageKey(logicalKey);
        }
        return logicalKey;
    }

    function readSetting(logicalKey) {
        const scopedKey = getScopedSettingKey(logicalKey);
        const scopedValue = localStorage.getItem(scopedKey);
        if (scopedValue !== null) return scopedValue;
        if (scopedKey !== logicalKey) {
            const legacyValue = localStorage.getItem(logicalKey);
            if (legacyValue !== null) {
                localStorage.setItem(scopedKey, legacyValue);
                return legacyValue;
            }
        }
        return null;
    }

    function writeSetting(logicalKey, value) {
        localStorage.setItem(getScopedSettingKey(logicalKey), value);
    }

    function removeSetting(logicalKey) {
        localStorage.removeItem(getScopedSettingKey(logicalKey));
    }

    function getSidebarCollapsedStorageKey() {
        if (window.PlannerAuth && typeof PlannerAuth.scopedStorageKey === 'function') {
            return PlannerAuth.scopedStorageKey('sidebarCollapsed');
        }
        return 'sidebarCollapsed';
    }

    function getSidebarRetractedStorageKey() {
        if (window.PlannerAuth && typeof PlannerAuth.scopedStorageKey === 'function') {
            return PlannerAuth.scopedStorageKey('planner_sidebar_retracted');
        }
        return 'planner_sidebar_retracted';
    }

    (function applyPlannerSidebarRetractedClassFromStorage() {
        try {
            if (typeof localStorage === 'undefined') return;
            if (localStorage.getItem(getSidebarRetractedStorageKey()) === '1') {
                document.documentElement.classList.add('planner-sidebar-retracted');
            }
        } catch (e) {
            /* ignore */
        }
    })();

    const ALLOWED_START_PAGES = ['index.html', 'nav.html', 'stats.html', 'review.html', 'archive.html'];

    const SETTINGS_MODAL_ID = 'plannerSettingsModal';
    const SETTINGS_INPUT_ID = 'plannerSettingsTargetDir';
    const SETTINGS_AUTO_OPEN_ID = 'plannerSettingsAutoOpenDir';

    let activeEndpoint = '';
    let backupInProgress = false;
    let backupAfterSettings = false;

    function getCurrentPageName() {
        const path = (window.location && window.location.pathname) || '';
        const fileName = path.split('/').pop();
        return fileName || 'index.html';
    }

    function normalizeStartPage(raw) {
        const text = String(raw || '').trim();
        return ALLOWED_START_PAGES.includes(text) ? text : 'index.html';
    }

    function getStartPage() {
        return normalizeStartPage(readSetting(START_PAGE_KEY));
    }

    function setStartPage(page) {
        const normalized = normalizeStartPage(page);
        writeSetting(START_PAGE_KEY, normalized);
        return normalized;
    }

    function applyStartPageRedirect() {
        const target = getStartPage();
        const current = getCurrentPageName();
        const params = new URLSearchParams(window.location.search || '');
        const skip = params.get('noStartRedirect') === '1';
        if (!skip && current === 'index.html' && target !== 'index.html') {
            window.location.replace(target);
        }
    }

    applyStartPageRedirect();

    function getSidebarCollapsedPreference() {
        return localStorage.getItem(getSidebarCollapsedStorageKey()) === 'true';
    }

    function applySidebarCollapsedPreference(collapsed) {
        const sidebars = document.querySelectorAll('.sidebar');
        sidebars.forEach((sidebar) => {
            sidebar.classList.toggle('collapsed', !!collapsed);
        });
        localStorage.setItem(getSidebarCollapsedStorageKey(), collapsed ? 'true' : 'false');
    }

    function isPlannerSidebarRetracted() {
        return document.documentElement.classList.contains('planner-sidebar-retracted');
    }

    function setPlannerSidebarRetracted(retracted) {
        const on = !!retracted;
        document.documentElement.classList.toggle('planner-sidebar-retracted', on);
        try {
            localStorage.setItem(getSidebarRetractedStorageKey(), on ? '1' : '0');
        } catch (e) {
            /* ignore */
        }
        syncGlobalTopbarLogoForSidebarRetracted();
    }

    function togglePlannerSidebarRetracted() {
        setPlannerSidebarRetracted(!isPlannerSidebarRetracted());
    }

    function syncGlobalTopbarLogoForSidebarRetracted() {
        if (typeof document === 'undefined' || !document.querySelectorAll) return;
        const expanded = !isPlannerSidebarRetracted();
        document.querySelectorAll('a.global-topbar-logo').forEach((el) => {
            el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            const side = document.getElementById('sidebar');
            if (side) el.setAttribute('aria-controls', side.id);
            el.title = expanded ? '收起主导航' : '展开主导航';
            el.setAttribute('aria-label', expanded ? '收起主导航' : '展开主导航');
        });
    }

    let plannerTopbarLogoToggleBound = false;
    function initPlannerTopbarLogoSidebarToggle() {
        if (!plannerTopbarLogoToggleBound) {
            plannerTopbarLogoToggleBound = true;
            document.addEventListener(
                'click',
                (ev) => {
                    const logo = ev.target.closest('a.global-topbar-logo');
                    if (!logo) return;
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    togglePlannerSidebarRetracted();
                },
                true
            );
        }
        syncGlobalTopbarLogoForSidebarRetracted();
    }

    const FONT_SIZE_VALUES = { small: 0.875, standard: 1, medium: 1.1, large: 1.2, xlarge: 1.3 };
    function getFontSizePreference() {
        const v = readSetting(FONT_SIZE_KEY) || 'standard';
        return FONT_SIZE_VALUES[v] ? v : 'standard';
    }
    function setFontSizePreference(v) {
        const valid = Object.keys(FONT_SIZE_VALUES).includes(v) ? v : 'standard';
        writeSetting(FONT_SIZE_KEY, valid);
        return valid;
    }
    function applyFontSizePreference() {
        const v = getFontSizePreference();
        const scale = FONT_SIZE_VALUES[v] || 1;
        document.documentElement.style.setProperty('--planner-font-scale', String(scale));
        document.documentElement.classList.remove('font-size-small', 'font-size-standard', 'font-size-medium', 'font-size-large', 'font-size-xlarge');
        document.documentElement.classList.add('font-size-' + v);
    }

    const ALLOWED_LANGUAGES = ['zh-CN', 'en'];
    function getLanguagePreference() {
        const v = readSetting(LANGUAGE_KEY) || 'zh-CN';
        return ALLOWED_LANGUAGES.includes(v) ? v : 'zh-CN';
    }
    function setLanguagePreference(v) {
        const valid = ALLOWED_LANGUAGES.includes(v) ? v : 'zh-CN';
        writeSetting(LANGUAGE_KEY, valid);
        return valid;
    }

    function userRecordedCharCount(text) {
        return Array.from(String(text || '')).length;
    }

    function getFoldLongContentEnabled() {
        const v = readSetting(FOLD_LONG_CONTENT_KEY);
        if (v === '1' || v === 'true') return true;
        if (v === '0' || v === 'false') return false;
        const old = readSetting(CONTENT_OVERFLOW_KEY);
        if (old === 'wrap') return false;
        return true;
    }

    function setFoldLongContentEnabled(enabled) {
        writeSetting(FOLD_LONG_CONTENT_KEY, enabled ? '1' : '0');
        return !!enabled;
    }

    function userContentFoldClass(text) {
        if (!getFoldLongContentEnabled()) return '';
        if (userRecordedCharCount(text) <= USER_CONTENT_FOLD_THRESHOLD) return '';
        return 'is-user-text-overlong';
    }

    function userReviewBodyFoldClass(combinedText) {
        if (!getFoldLongContentEnabled()) return '';
        if (userRecordedCharCount(combinedText) <= USER_CONTENT_FOLD_THRESHOLD) return '';
        return 'is-user-review-body-folded';
    }

    function applyFoldLongContentPreference() {
        document.documentElement.classList.remove('planner-content-overflow-wrap', 'planner-content-overflow-ellipsis');
        document.documentElement.classList.toggle('planner-fold-long-enabled', getFoldLongContentEnabled());
    }

    function applyAppearancePrefs() {
        applyFoldLongContentPreference();
    }

    function moveToolsAboveCollapseButton() {
        const sidebars = document.querySelectorAll('.sidebar');
        sidebars.forEach((sidebar) => {
            const toolsRow = sidebar.querySelector('.nav-tools-row');
            const footer = sidebar.querySelector('.sidebar-footer');
            const collapseBtn = sidebar.querySelector('.collapse-btn');
            if (!toolsRow || !footer) return;

            if (toolsRow.parentElement !== footer) {
                if (toolsRow.parentElement) {
                    toolsRow.parentElement.removeChild(toolsRow);
                }
                if (collapseBtn && collapseBtn.parentElement === footer) {
                    footer.insertBefore(toolsRow, collapseBtn);
                } else {
                    footer.appendChild(toolsRow);
                }
            }
            toolsRow.classList.add('nav-tools-row-in-footer');
        });

        applySidebarCollapsedPreference(getSidebarCollapsedPreference());
        applyAppearancePrefs();
        initPlannerTopbarLogoSidebarToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', moveToolsAboveCollapseButton, { once: true });
    } else {
        moveToolsAboveCollapseButton();
    }

    function getCandidateEndpoints() {
        const candidates = [];
        if (window.location && /^https?:$/i.test(window.location.protocol)) {
            candidates.push(`${window.location.origin}${API_PATH}`);
        }
        candidates.push('http://127.0.0.1:8787/api/backup-db');
        candidates.push('http://localhost:8787/api/backup-db');
        return Array.from(new Set(candidates));
    }

    function buildApiUrl(endpoint, apiPath) {
        try {
            const url = new URL(endpoint);
            url.pathname = apiPath;
            url.search = '';
            url.hash = '';
            return url.toString();
        } catch (err) {
            return endpoint.replace(API_PATH, apiPath);
        }
    }

    function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS);
        return fetch(url, { ...(options || {}), signal: controller.signal, credentials: 'include' })
            .finally(() => clearTimeout(timeout));
    }

    async function resolveEndpoint() {
        if (activeEndpoint) return activeEndpoint;
        const candidates = getCandidateEndpoints();
        for (let i = 0; i < candidates.length; i += 1) {
            try {
                const response = await fetchWithTimeout(candidates[i], { method: 'OPTIONS' }, 3000);
                if (response.status === 204 || response.ok) {
                    activeEndpoint = candidates[i];
                    return activeEndpoint;
                }
            } catch (err) {
                // try next endpoint
            }
        }
        return '';
    }

    function getSavedTargetDir() {
        return String(readSetting(TARGET_DIR_KEY) || '').trim();
    }

    function setSavedTargetDir(value) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            removeSetting(TARGET_DIR_KEY);
            return '';
        }
        writeSetting(TARGET_DIR_KEY, normalized);
        return normalized;
    }

    function getOpenDirAfterBackup() {
        return readSetting(OPEN_AFTER_BACKUP_KEY) === 'true';
    }

    function setOpenDirAfterBackup(enabled) {
        writeSetting(OPEN_AFTER_BACKUP_KEY, enabled ? 'true' : 'false');
    }

    function setButtonsBusy(isBusy) {
        const buttons = document.querySelectorAll('.nav-backup-btn');
        buttons.forEach((button) => {
            button.disabled = !!isBusy;
            button.classList.toggle('is-busy', !!isBusy);
        });
    }

    async function postJson(endpoint, apiPath, body, timeoutMs) {
        const url = buildApiUrl(endpoint, apiPath);
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body || {})
        }, timeoutMs || REQUEST_TIMEOUT_MS);

        if (response.status === 401) {
            window.location.replace('login.html?server_session=expired');
            throw new Error('Unauthorized');
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (err) {
            payload = null;
        }

        return { response, payload };
    }

    async function backupToTargetPath(endpoint, targetDir) {
        const { response, payload } = await postJson(endpoint, API_PATH, { targetDir });
        if (!response.ok || !payload || payload.ok !== true) {
            const message = payload && payload.error
                ? payload.error
                : `备份失败（${response.status}）`;
            throw new Error(message);
        }
        return payload;
    }

    async function openFolderByPath(endpoint, targetDir) {
        const { response, payload } = await postJson(endpoint, OPEN_FOLDER_API_PATH, { targetDir });
        if (!response.ok || !payload || payload.ok !== true) {
            const message = payload && payload.error
                ? payload.error
                : `打开目录失败（${response.status}）`;
            throw new Error(message);
        }
        return payload;
    }

    function ensureSettingsModal() {
        let overlay = document.getElementById(SETTINGS_MODAL_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = SETTINGS_MODAL_ID;
        overlay.className = 'modal-overlay planner-settings-overlay';
        overlay.innerHTML = `
            <div class="modal planner-settings-modal" role="dialog" aria-modal="true" aria-labelledby="plannerSettingsTitle">
                <h3 class="modal-title" id="plannerSettingsTitle">设置</h3>

                <div class="planner-settings-section">
                    <h4 class="planner-settings-subtitle">备份</h4>
                    <div class="form-group">
                        <label class="form-label" for="${SETTINGS_INPUT_ID}">默认备份目录</label>
                        <input type="text" class="form-input planner-settings-path-input" id="${SETTINGS_INPUT_ID}" placeholder="例如 D:\\\\PlannerDBBackups">
                    </div>

                    <div class="planner-settings-picker-row">
                        <button type="button" class="btn btn-secondary planner-settings-pick-btn" data-action="pick-dir">浏览选择目录</button>
                        <button type="button" class="btn btn-secondary planner-settings-open-btn" data-action="open-dir">打开目录</button>
                    </div>

                    <label class="planner-settings-check">
                        <input type="checkbox" id="${SETTINGS_AUTO_OPEN_ID}">
                        <span>备份完成后自动打开目录</span>
                    </label>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-action="cancel">取消</button>
                    <button type="button" class="btn btn-primary" data-action="save">保存</button>
                </div>
            </div>
        `;

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closePlannerSettings();
            }
        });

        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            closePlannerSettings();
        });

        overlay.querySelector('[data-action="pick-dir"]').addEventListener('click', () => {
            pickDirectoryFromExplorer();
        });

        overlay.querySelector('[data-action="open-dir"]').addEventListener('click', () => {
            openDirectoryFromSettings();
        });

        overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
            savePlannerSettingsFromModal({ closeAfterSave: true, showSavedAlert: true });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('active')) {
                closePlannerSettings();
            }
        });

        document.body.appendChild(overlay);
        return overlay;
    }

    async function pickDirectoryFromExplorer() {
        const input = document.getElementById(SETTINGS_INPUT_ID);
        const endpoint = await resolveEndpoint();
        if (!endpoint) {
            window.alert('未找到可用服务，请先运行 start-planner.bat。');
            return;
        }

        let response = null;
        let payload = null;
        try {
            const result = await postJson(endpoint, PICKER_API_PATH, {}, PICKER_TIMEOUT_MS);
            response = result.response;
            payload = result.payload;
        } catch (err) {
            window.alert('打开资源管理器失败，请确认服务在本机运行。');
            return;
        }

        if (!response.ok || !payload || payload.ok !== true) {
            const errorMessage = payload && payload.error
                ? payload.error
                : `目录选择失败（${response.status}）`;
            window.alert(errorMessage);
            return;
        }

        if (payload.cancelled || !payload.path) return;

        if (input) {
            input.value = payload.path;
            input.focus();
        }
    }

    async function openDirectoryFromSettings() {
        const input = document.getElementById(SETTINGS_INPUT_ID);
        const targetDir = String((input && input.value) || getSavedTargetDir() || '').trim();
        if (!targetDir) {
            window.alert('请先设置备份目录。');
            return;
        }

        const endpoint = await resolveEndpoint();
        if (!endpoint) {
            window.alert('未找到可用服务，请先运行 start-planner.bat。');
            return;
        }

        try {
            await openFolderByPath(endpoint, targetDir);
        } catch (err) {
            window.alert(`打开目录失败：${err && err.message ? err.message : '未知错误'}`);
        }
    }

    async function openPlannerSettings(options) {
        const overlay = ensureSettingsModal();
        const pathInput = document.getElementById(SETTINGS_INPUT_ID);
        const autoOpen = document.getElementById(SETTINGS_AUTO_OPEN_ID);

        if (pathInput) pathInput.value = getSavedTargetDir();
        if (autoOpen) autoOpen.checked = getOpenDirAfterBackup();
        overlay.classList.add('active');

        const opts = options || {};
        if (opts.requirePath) {
            window.alert('请先在设置中配置备份目录。');
        }

        window.requestAnimationFrame(() => {
            if (pathInput) pathInput.focus();
        });
    }

    function closePlannerSettings(keepPendingBackup) {
        const overlay = document.getElementById(SETTINGS_MODAL_ID);
        if (!overlay) return;
        overlay.classList.remove('active');
        if (!keepPendingBackup) backupAfterSettings = false;
    }

    function savePlannerSettingsFromModal(options) {
        const pathInput = document.getElementById(SETTINGS_INPUT_ID);
        const autoOpen = document.getElementById(SETTINGS_AUTO_OPEN_ID);
        if (!pathInput) return false;

        const targetDir = setSavedTargetDir(pathInput.value);
        const openAfter = !!(autoOpen && autoOpen.checked);

        setOpenDirAfterBackup(openAfter);

        if (!targetDir) {
            window.alert('请先选择或填写备份目录。');
            pathInput.focus();
            return false;
        }

        const opts = options || {};
        if (opts.closeAfterSave) {
            closePlannerSettings(true);
        }
        if (opts.showSavedAlert) {
            window.alert('设置已保存。');
        }
        if (backupAfterSettings) {
            backupAfterSettings = false;
            runBackupFlow();
        }
        return true;
    }

    async function runBackupFlow() {
        if (backupInProgress) return;

        const targetDir = getSavedTargetDir();
        if (!targetDir) {
            backupAfterSettings = true;
            openPlannerSettings({ requirePath: true });
            return;
        }

        backupInProgress = true;
        setButtonsBusy(true);
        try {
            const endpoint = await resolveEndpoint();
            if (!endpoint) {
                throw new Error('未找到可用备份服务，请先运行 start-planner.bat');
            }

            const result = await backupToTargetPath(endpoint, targetDir);

            if (getOpenDirAfterBackup()) {
                try {
                    await openFolderByPath(endpoint, targetDir);
                } catch (err) {
                    // keep backup success even if opening folder failed
                }
            }

            window.alert(`备份完成：${result.backupPath}`);
        } catch (err) {
            window.alert(`备份失败：${err && err.message ? err.message : '未知错误'}`);
        } finally {
            backupInProgress = false;
            setButtonsBusy(false);
        }
    }

    window.runDatabaseBackup = runBackupFlow;
    window.openPlannerSettings = (options) => {
        openPlannerSettings(options).catch((err) => {
            window.alert(`设置打开失败：${err && err.message ? err.message : '未知错误'}`);
        });
    };

    window.PlannerBackup = {
        getSidebarCollapsedPreference,
        applySidebarCollapsedPreference,
        isPlannerSidebarRetracted,
        setPlannerSidebarRetracted,
        togglePlannerSidebarRetracted,
        getStartPage,
        setStartPage,
        getFontSizePreference,
        setFontSizePreference,
        applyFontSizePreference,
        getLanguagePreference,
        setLanguagePreference,
        getFoldLongContentEnabled,
        setFoldLongContentEnabled,
        userContentFoldClass,
        userReviewBodyFoldClass,
        userRecordedCharCount,
        applyAppearancePrefs,
        applyFoldLongContentPreference
    };

    function handleReviewCardExpandClick(btn, ev) {
        if (!btn) return;
        if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }
        const wrap = btn.closest('.review-compact-wrap');
        if (!wrap) return;
        const expanded = wrap.classList.toggle('is-expanded');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        const label = btn.querySelector('.review-card-expand-label');
        const icon = btn.querySelector('.review-card-expand-icon');
        if (label) label.textContent = expanded ? '收起' : '展开';
        if (icon) icon.textContent = expanded ? '▲' : '▼';
    }

    window.handleReviewCardExpandClick = handleReviewCardExpandClick;

    function plannerShouldAutosizeTextarea(el) {
        if (!el || el.tagName !== 'TEXTAREA') return false;
        if (el.closest('.modal-overlay')) return true;
        return el.id === 'profileBio';
    }

    function plannerModalOverlayIsUsable(overlay) {
        return overlay && overlay.classList && overlay.classList.contains('active');
    }

    function plannerAutosizeTextarea(el) {
        if (!plannerShouldAutosizeTextarea(el)) return;
        const overlay = el.closest('.modal-overlay');
        if (overlay && !plannerModalOverlayIsUsable(overlay)) {
            el.style.removeProperty('height');
            return;
        }
        el.style.overflowY = 'hidden';
        el.style.height = '0px';
        void el.offsetHeight;
        el.style.height = `${el.scrollHeight}px`;
    }

    function plannerAutosizeTextareasInRoot(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('textarea').forEach((ta) => {
            if (!plannerShouldAutosizeTextarea(ta)) return;
            const overlay = ta.closest('.modal-overlay');
            if (overlay && !plannerModalOverlayIsUsable(overlay)) {
                ta.style.removeProperty('height');
                return;
            }
            plannerAutosizeTextarea(ta);
        });
    }

    /** 弹层带 visibility + modal transform 动画，首帧测高常偏小，需多拍与 transition 结束后重测 */
    function schedulePlannerOverlayTextareaAutosize(overlay) {
        if (!overlay || !plannerModalOverlayIsUsable(overlay)) return;
        const run = () => {
            if (!plannerModalOverlayIsUsable(overlay)) return;
            plannerAutosizeTextareasInRoot(overlay);
        };
        requestAnimationFrame(() => requestAnimationFrame(run));
        window.setTimeout(run, 0);
        window.setTimeout(run, 50);
        window.setTimeout(run, 240);
        window.setTimeout(run, 400);
    }

    function initPlannerEditTextareaAutosize() {
        document.addEventListener(
            'input',
            (e) => {
                const t = e.target;
                if (t && t.tagName === 'TEXTAREA' && plannerShouldAutosizeTextarea(t)) {
                    queueMicrotask(() => plannerAutosizeTextarea(t));
                }
            },
            true
        );
        document.addEventListener(
            'focusin',
            (e) => {
                const t = e.target;
                if (t && t.tagName === 'TEXTAREA' && plannerShouldAutosizeTextarea(t)) {
                    queueMicrotask(() => plannerAutosizeTextarea(t));
                }
            },
            true
        );

        const overlayObserver = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i += 1) {
                const m = mutations[i];
                if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
                const node = m.target;
                if (!(node instanceof Element) || !node.classList.contains('modal-overlay')) continue;
                if (!node.classList.contains('active')) {
                    plannerAutosizeTextareasInRoot(node);
                    continue;
                }
                schedulePlannerOverlayTextareaAutosize(node);
            }
        });

        function wireModalOverlay(el) {
            if (!(el instanceof Element) || !el.classList.contains('modal-overlay')) return;
            if (el.dataset.plannerTextareaAutosizeObserved === '1') return;
            el.dataset.plannerTextareaAutosizeObserved = '1';
            overlayObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
            if (el.dataset.plannerModalTransitionAutosize !== '1') {
                el.dataset.plannerModalTransitionAutosize = '1';
                el.addEventListener('transitionend', (ev) => {
                    if (!plannerModalOverlayIsUsable(el)) return;
                    if (ev.propertyName !== 'transform') return;
                    const tgt = ev.target;
                    if (!(tgt instanceof Element) || !tgt.classList.contains('modal')) return;
                    plannerAutosizeTextareasInRoot(el);
                });
            }
        }

        let plannerModalTextareaBodyObserverStarted = false;
        function wirePlannerModalTextareaObserversWhenDomReady() {
            document.querySelectorAll('.modal-overlay').forEach(wireModalOverlay);
            if (!document.body || plannerModalTextareaBodyObserverStarted) return;
            plannerModalTextareaBodyObserverStarted = true;
            const bodyObserver = new MutationObserver(() => {
                document.querySelectorAll('.modal-overlay').forEach(wireModalOverlay);
            });
            bodyObserver.observe(document.body, { childList: true, subtree: true });
        }

        function kickAutosizeVisibleTextareas() {
            plannerAutosizeTextareasInRoot(document);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                wirePlannerModalTextareaObserversWhenDomReady();
                kickAutosizeVisibleTextareas();
            });
        } else {
            wirePlannerModalTextareaObserversWhenDomReady();
            kickAutosizeVisibleTextareas();
        }
    }

    initPlannerEditTextareaAutosize();

    window.PlannerBackup.autosizeTextareasInRoot = plannerAutosizeTextareasInRoot;
    window.PlannerBackup.scheduleOverlayTextareaAutosize = schedulePlannerOverlayTextareaAutosize;
})();
