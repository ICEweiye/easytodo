(function initPlannerDbBackupClient() {
    const API_PATH = '/api/backup-db';
    const PICKER_API_PATH = '/api/pick-folder';
    const OPEN_FOLDER_API_PATH = '/api/open-folder';
    const REQUEST_TIMEOUT_MS = 15000;
    const PICKER_TIMEOUT_MS = 120000;

    const TARGET_DIR_KEY = '__planner_backup_target_dir';
    const OPEN_AFTER_BACKUP_KEY = '__planner_backup_open_dir_after_backup';
    const START_PAGE_KEY = '__planner_start_page';

    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
    const ALLOWED_START_PAGES = ['index.html', 'life.html', 'stats.html', 'review.html', 'archive.html'];

    const SETTINGS_MODAL_ID = 'plannerSettingsModal';
    const SETTINGS_INPUT_ID = 'plannerSettingsTargetDir';
    const SETTINGS_AUTO_OPEN_ID = 'plannerSettingsAutoOpenDir';
    const SETTINGS_SIDEBAR_COLLAPSE_ID = 'plannerSettingsSidebarCollapsed';
    const SETTINGS_START_PAGE_ID = 'plannerSettingsStartPage';

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
        return normalizeStartPage(localStorage.getItem(START_PAGE_KEY));
    }

    function setStartPage(page) {
        const normalized = normalizeStartPage(page);
        localStorage.setItem(START_PAGE_KEY, normalized);
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
        return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    }

    function applySidebarCollapsedPreference(collapsed) {
        const sidebars = document.querySelectorAll('.sidebar');
        sidebars.forEach((sidebar) => {
            sidebar.classList.toggle('collapsed', !!collapsed);
        });
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
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
        return fetch(url, { ...(options || {}), signal: controller.signal })
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
        return String(localStorage.getItem(TARGET_DIR_KEY) || '').trim();
    }

    function setSavedTargetDir(value) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            localStorage.removeItem(TARGET_DIR_KEY);
            return '';
        }
        localStorage.setItem(TARGET_DIR_KEY, normalized);
        return normalized;
    }

    function getOpenDirAfterBackup() {
        return localStorage.getItem(OPEN_AFTER_BACKUP_KEY) === 'true';
    }

    function setOpenDirAfterBackup(enabled) {
        localStorage.setItem(OPEN_AFTER_BACKUP_KEY, enabled ? 'true' : 'false');
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

                <div class="planner-settings-section">
                    <h4 class="planner-settings-subtitle">站点适配</h4>
                    <label class="planner-settings-check">
                        <input type="checkbox" id="${SETTINGS_SIDEBAR_COLLAPSE_ID}">
                        <span>默认折叠左侧导航栏</span>
                    </label>
                    <div class="form-group">
                        <label class="form-label" for="${SETTINGS_START_PAGE_ID}">启动页</label>
                        <select class="form-input" id="${SETTINGS_START_PAGE_ID}">
                            <option value="index.html">主页</option>
                            <option value="life.html">生活</option>
                            <option value="stats.html">统计</option>
                            <option value="review.html">复盘</option>
                            <option value="archive.html">归档</option>
                        </select>
                    </div>
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
        const sidebarCollapsed = document.getElementById(SETTINGS_SIDEBAR_COLLAPSE_ID);
        const startPageSelect = document.getElementById(SETTINGS_START_PAGE_ID);

        if (pathInput) pathInput.value = getSavedTargetDir();
        if (autoOpen) autoOpen.checked = getOpenDirAfterBackup();
        if (sidebarCollapsed) sidebarCollapsed.checked = getSidebarCollapsedPreference();
        if (startPageSelect) startPageSelect.value = getStartPage();
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
        const sidebarCollapsed = document.getElementById(SETTINGS_SIDEBAR_COLLAPSE_ID);
        const startPageSelect = document.getElementById(SETTINGS_START_PAGE_ID);
        if (!pathInput) return false;

        const targetDir = setSavedTargetDir(pathInput.value);
        const openAfter = !!(autoOpen && autoOpen.checked);
        const collapseSidebar = !!(sidebarCollapsed && sidebarCollapsed.checked);
        const startPage = normalizeStartPage(startPageSelect && startPageSelect.value);

        setOpenDirAfterBackup(openAfter);
        applySidebarCollapsedPreference(collapseSidebar);
        setStartPage(startPage);

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
})();
