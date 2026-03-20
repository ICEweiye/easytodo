(function () {
    'use strict';

    var AUTH_USER_KEY = 'planner_auth_user_v1';
    var AUTH_USERS_KEY = 'planner_auth_users_v1';
    var LEGACY_STORAGE_OWNER_KEY = 'planner_legacy_storage_owner_v1';
    var AUTH_SESSION_KEY = 'planner_auth_session_v1';
    var AUTH_PREFS_KEY = 'planner_auth_prefs_v1';
    var LOGIN_PAGE = 'login.html';
    var PROFILE_PAGE = 'profile.html';
    var DEMO_ACCOUNT = 'demo';
    var DEMO_PASSWORD = '123456';
    var ALLOWED_PAGES = {
        'index.html': true,
        'nav.html': true,
        'stats.html': true,
        'review.html': true,
        'archive.html': true,
        'profile.html': true,
        'login.html': true
    };

    var SERVER_SESSION_VALID = false;

    function getApiBaseUrl() {
        if (window.location && /^https?:$/i.test(window.location.protocol)) {
            return window.location.origin;
        }
        return '';
    }

    function checkServerSessionAsync(callback) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', getApiBaseUrl() + '/api/auth/session', true);
            xhr.withCredentials = true;
            xhr.timeout = 5000;
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        var ok = data && data.ok === true;
                        SERVER_SESSION_VALID = ok;
                        callback(ok);
                    } catch (e) { callback(false); }
                    return;
                }
                if (xhr.status === 401 || xhr.status === 403) {
                    SERVER_SESSION_VALID = false;
                    callback(false);
                    return;
                }
                callback(SERVER_SESSION_VALID);
            };
            xhr.onerror = function () { callback(SERVER_SESSION_VALID); };
            xhr.ontimeout = function () { callback(SERVER_SESSION_VALID); };
            xhr.send();
        } catch (e) { callback(SERVER_SESSION_VALID); }
    }

    function serverAuthPost(apiPath, body, callback) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', getApiBaseUrl() + apiPath, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = 8000;
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if (xhr.status === 200) {
                    SERVER_SESSION_VALID = true;
                    callback(true, null);
                } else {
                    var msg = '服务器错误 (' + xhr.status + ')';
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data && data.error) msg = data.error;
                    } catch (e) {}
                    callback(false, msg);
                }
            };
            xhr.onerror = function () { callback(false, '网络连接失败'); };
            xhr.ontimeout = function () { callback(false, '请求超时'); };
            xhr.send(JSON.stringify(body));
        } catch (e) { callback(false, '请求异常'); }
    }

    function readJson(key) {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (err) {
            return null;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function simpleHash(text) {
        var value = String(text || '');
        var hash = 5381;
        for (var i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
            hash = hash >>> 0;
        }
        return hash.toString(16);
    }

    function normalizeAccount(input) {
        return String(input || '').trim();
    }

    function isPhoneAccount(account) {
        return /^1\d{10}$/.test(account);
    }

    function isUsernameAccount(account) {
        return /^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/.test(account);
    }

    function validateAccount(account) {
        if (isPhoneAccount(account)) {
            return { ok: true, type: 'phone' };
        }
        if (isUsernameAccount(account)) {
            return { ok: true, type: 'username' };
        }
        return {
            ok: false,
            message: '请输入 11 位手机号，或 3-20 位用户名（中文/字母/数字/下划线）。'
        };
    }

    function validatePassword(password) {
        var value = String(password || '');
        if (value.length < 6) {
            return { ok: false, message: '请输入不少于6位数密码' };
        }
        if (value.length > 32) {
            return { ok: false, message: '密码最多 32 位。' };
        }
        return { ok: true };
    }

    function readUsersMap() {
        var map = readJson(AUTH_USERS_KEY);
        if (!map || typeof map !== 'object') map = {};
        var legacy = readJson(AUTH_USER_KEY);
        if (legacy && typeof legacy.account === 'string' && legacy.account && !map[legacy.account]) {
            map[legacy.account] = legacy;
            writeJson(AUTH_USERS_KEY, map);
        }
        return map;
    }

    function writeUsersMap(map) {
        writeJson(AUTH_USERS_KEY, map || {});
    }

    function findUserByAccount(account) {
        var acc = normalizeAccount(account);
        if (!acc) return null;
        var map = readUsersMap();
        var user = map[acc];
        if (user && typeof user.passwordHash === 'string') return user;
        return null;
    }

    function userExists(account) {
        return Boolean(findUserByAccount(account));
    }

    function saveRegisteredUser(user) {
        if (!user || typeof user.account !== 'string') return;
        var map = readUsersMap();
        map[user.account] = user;
        writeUsersMap(map);
    }

    function getPlannerDataKeyPrefix() {
        var id = getCurrentAuthIdentity();
        if (!id) return '';
        return 'planner_acc_' + accountStorageSegment(id.account) + '_';
    }

    function ensureLegacyStorageOwner() {
        if (readJson(LEGACY_STORAGE_OWNER_KEY)) return;
        var legacy = readJson(AUTH_USER_KEY);
        if (legacy && legacy.account) {
            writeJson(LEGACY_STORAGE_OWNER_KEY, { account: legacy.account });
            return;
        }
        var map = readUsersMap();
        var keys = Object.keys(map);
        if (keys.length === 1 && map[keys[0]] && map[keys[0]].account) {
            writeJson(LEGACY_STORAGE_OWNER_KEY, { account: map[keys[0]].account });
        }
    }

    function accountStorageSegment(account) {
        var a = normalizeAccount(account);
        if (a === DEMO_ACCOUNT) return 'demo';
        if (/^1\d{10}$/.test(a)) return a;
        return 'u' + simpleHash(a);
    }

    function scopedStorageKey(logicalKey) {
        var id = getCurrentAuthIdentity();
        if (!id || !logicalKey) return logicalKey;
        var seg = accountStorageSegment(id.account);
        return 'planner_acc_' + seg + '_' + logicalKey;
    }

    function isUnscopedPlannerDataKey(key) {
        if (!key || key.indexOf('planner_acc_') === 0) return false;
        if (key.indexOf('planner_auth_') === 0) return false;
        if (key === 'planner_user_profile_v1') return false;
        if (key.indexOf('planner_legacy_') === 0) return false;
        if (key.indexOf('__planner_') === 0) return false;
        if (key === 'sidebarCollapsed' || key === 'reviews') return true;
        if (key.indexOf('planner_') === 0) return true;
        if (key.indexOf('life_') === 0) return true;
        return false;
    }

    function runScopedStorageMigration(account, isDemo) {
        if (isDemo) return;
        ensureLegacyStorageOwner();
        var seg = accountStorageSegment(account);
        var doneKey = 'planner_acc_ns_done_v1_' + seg;
        if (localStorage.getItem(doneKey)) return;

        var owner = readJson(LEGACY_STORAGE_OWNER_KEY);
        var ownerAccount = owner && owner.account;
        if (!ownerAccount || normalizeAccount(account) !== normalizeAccount(ownerAccount)) {
            localStorage.setItem(doneKey, '1');
            return;
        }

        var hasLegacy = false;
        var i;
        for (i = 0; i < localStorage.length; i += 1) {
            var k = localStorage.key(i);
            if (isUnscopedPlannerDataKey(k)) {
                var v = localStorage.getItem(k);
                if (v != null && v !== '') {
                    hasLegacy = true;
                    break;
                }
            }
        }
        if (!hasLegacy) {
            localStorage.setItem(doneKey, '1');
            return;
        }

        var toRemove = [];
        for (i = 0; i < localStorage.length; i += 1) {
            var k2 = localStorage.key(i);
            if (!isUnscopedPlannerDataKey(k2)) continue;
            var v2 = localStorage.getItem(k2);
            if (v2 == null) continue;
            var scoped = 'planner_acc_' + seg + '_' + k2;
            if (!localStorage.getItem(scoped)) {
                localStorage.setItem(scoped, v2);
            }
            toRemove.push(k2);
        }
        toRemove.forEach(function (rk) {
            localStorage.removeItem(rk);
        });
        localStorage.setItem(doneKey, '1');
    }

    function getStoredSession() {
        var session = readJson(AUTH_SESSION_KEY);
        if (!session || typeof session !== 'object') return null;
        if (typeof session.account !== 'string' || typeof session.token !== 'string') return null;
        return session;
    }

    function createSession(user, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var session = {
            account: user.account,
            token: Math.random().toString(36).slice(2) + Date.now().toString(36),
            createdAt: Date.now(),
            isDemo: Boolean(opts.isDemo)
        };
        writeJson(AUTH_SESSION_KEY, session);
        return session;
    }

    function clearSession() {
        localStorage.removeItem(AUTH_SESSION_KEY);
    }

    function normalizeAuthPrefs(rawPrefs) {
        var prefs = rawPrefs && typeof rawPrefs === 'object' ? rawPrefs : {};
        var normalized = {
            rememberPassword: Boolean(prefs.rememberPassword),
            autoLogin: Boolean(prefs.autoLogin),
            rememberedAccount: typeof prefs.rememberedAccount === 'string' ? prefs.rememberedAccount : '',
            rememberedPassword: typeof prefs.rememberedPassword === 'string' ? prefs.rememberedPassword : ''
        };

        if (normalized.autoLogin) {
            normalized.rememberPassword = true;
        }

        if (!normalized.rememberPassword) {
            normalized.autoLogin = false;
            normalized.rememberedAccount = '';
            normalized.rememberedPassword = '';
        }

        return normalized;
    }

    function getAuthPrefs() {
        return normalizeAuthPrefs(readJson(AUTH_PREFS_KEY));
    }

    function saveAuthPrefs(prefs) {
        var normalized = normalizeAuthPrefs(prefs);
        writeJson(AUTH_PREFS_KEY, normalized);
        return normalized;
    }

    function saveLoginPrefsFromInputs(account, password, rememberPassword, autoLogin) {
        var prefs = {
            rememberPassword: Boolean(rememberPassword),
            autoLogin: Boolean(autoLogin),
            rememberedAccount: '',
            rememberedPassword: ''
        };

        if (prefs.rememberPassword) {
            prefs.rememberedAccount = normalizeAccount(account);
            prefs.rememberedPassword = String(password || '');
        }

        return saveAuthPrefs(prefs);
    }

    function disableAutoLogin() {
        var prefs = getAuthPrefs();
        if (!prefs.autoLogin) return;
        prefs.autoLogin = false;
        saveAuthPrefs(prefs);
    }

    function canUseAutoLogin(prefs) {
        if (!prefs.autoLogin || !prefs.rememberPassword) return false;
        if (!prefs.rememberedAccount || !prefs.rememberedPassword) return false;
        var user = findUserByAccount(prefs.rememberedAccount);
        if (!user) return false;
        if (normalizeAccount(prefs.rememberedAccount) !== user.account) return false;
        return simpleHash(prefs.rememberedPassword) === user.passwordHash;
    }

    function tryRestoreSessionByAutoLogin() {
        var prefs = getAuthPrefs();
        if (!canUseAutoLogin(prefs)) return false;
        var user = findUserByAccount(prefs.rememberedAccount);
        createSession(user);
        runScopedStorageMigration(user.account, false);
        return true;
    }

    function isDemoCredential(account, password) {
        return normalizeAccount(account) === DEMO_ACCOUNT && String(password || '') === DEMO_PASSWORD;
    }

    function getCurrentAuthIdentity() {
        var session = getStoredSession();
        if (!session) return null;

        var user = findUserByAccount(session.account);
        if (user && !session.isDemo) {
            return {
                account: user.account,
                accountType: user.accountType || 'username',
                isDemo: false
            };
        }

        if (session.isDemo && session.account === DEMO_ACCOUNT) {
            return {
                account: DEMO_ACCOUNT,
                accountType: 'demo',
                isDemo: true
            };
        }

        return null;
    }

    function isAuthenticated() {
        return Boolean(getCurrentAuthIdentity());
    }

    function getCurrentPageName() {
        var pathname = String(window.location.pathname || '');
        var lastSegment = pathname.split('/').pop() || '';
        if (!lastSegment) return 'index.html';
        return lastSegment.toLowerCase();
    }

    function getCurrentRelativePath() {
        var page = getCurrentPageName();
        var search = window.location.search || '';
        var hash = window.location.hash || '';
        return page + search + hash;
    }

    function normalizeRedirectTarget(rawTarget) {
        var target = String(rawTarget || '').trim();
        if (!target) return 'index.html';

        try {
            target = decodeURIComponent(target);
        } catch (err) {
            // keep raw value
        }

        var lower = target.toLowerCase();
        if (
            lower.startsWith('http://') ||
            lower.startsWith('https://') ||
            lower.startsWith('//') ||
            lower.startsWith('javascript:')
        ) {
            return 'index.html';
        }

        var pathPart = target.split('?')[0].split('#')[0];
        var page = pathPart.split('/').pop().toLowerCase();
        if (!ALLOWED_PAGES[page] || page === LOGIN_PAGE) {
            return 'index.html';
        }

        return target;
    }

    function buildLoginUrl() {
        var loginUrl = new URL(LOGIN_PAGE, window.location.href);
        loginUrl.searchParams.set('redirect', getCurrentRelativePath());
        return loginUrl.toString();
    }

    function redirectToLogin() {
        if (getCurrentPageName() === LOGIN_PAGE) return;
        document.documentElement.style.visibility = 'hidden';
        window.location.replace(buildLoginUrl());
    }

    function redirectAfterLogin() {
        window.location.replace('index.html');
    }

    function goToProfilePage() {
        window.location.href = PROFILE_PAGE;
    }

    function getAvatarMark(account) {
        var value = normalizeAccount(account);
        if (!value) return 'U';
        return value.charAt(0).toUpperCase();
    }

    function getProfileStore() {
        var rawStore = readJson('planner_user_profile_v1');
        return rawStore && typeof rawStore === 'object' ? rawStore : {};
    }

    function getUserDisplayInfo(account) {
        var store = getProfileStore();
        var profile = store[account] && typeof store[account] === 'object' ? store[account] : {};
        var nickname = normalizeAccount(profile.nickname);
        var phone = normalizeAccount(profile.phone);
        var displayName = nickname || account;
        var displaySub = phone ? (phone + ' · ' + account) : account;
        return {
            name: displayName,
            sub: displaySub,
            mark: getAvatarMark(displayName)
        };
    }

    function ensureGlobalAvatarMenuStyles() {
        if (document.getElementById('plannerGlobalAvatarMenuStyle')) return;

        var styleEl = document.createElement('style');
        styleEl.id = 'plannerGlobalAvatarMenuStyle';
        styleEl.textContent = [
            '.global-topbar-actions.planner-avatar-menu-host {',
            '    position: relative;',
            '}',
            '.planner-avatar-dropdown {',
            '    position: absolute;',
            '    top: calc(100% + 10px);',
            '    right: calc(var(--topbar-avatar-size, 36px) / 2 - 10px);',
            '    width: 280px;',
            '    padding: 20px 14px 14px;',
            '    border-radius: 14px;',
            '    border: 1px solid rgba(222, 214, 204, 0.85);',
            '    background: rgba(255, 255, 255, 0.98);',
            '    box-shadow: 0 18px 34px rgba(35, 30, 25, 0.16);',
            '    opacity: 0;',
            '    transform: translateY(-6px);',
            '    pointer-events: none;',
            '    transition: opacity 0.18s ease, transform 0.18s ease;',
            '    z-index: 80;',
            '}',
            '.planner-avatar-dropdown.is-open {',
            '    opacity: 1;',
            '    transform: translateY(0);',
            '    pointer-events: auto;',
            '}',
            '.planner-avatar-dropdown-head {',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: flex-start;',
            '    padding-bottom: 12px;',
            '    border-bottom: 1px solid rgba(224, 216, 208, 0.9);',
            '    margin-bottom: 10px;',
            '}',
            '.planner-avatar-dropdown-avatar {',
            '    position: absolute;',
            '    right: -34px;',
            '    top: -28px;',
            '    width: 88px;',
            '    height: 88px;',
            '    border-radius: 999px;',
            '    display: inline-flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    font-size: 32px;',
            '    font-weight: 700;',
            '    color: #fff;',
            '    background: linear-gradient(140deg, #1f2937, #4b5563);',
            '    box-shadow: 0 8px 18px rgba(17, 24, 39, 0.28);',
            '    flex-shrink: 0;',
            '    transform: translate(0, 0) scale(1);',
            '    transition: transform 0.28s cubic-bezier(0.22, 0.62, 0.36, 1);',
            '}',
            '.planner-avatar-dropdown-name {',
            '    margin: 0;',
            '    font-size: 15px;',
            '    font-weight: 700;',
            '    color: var(--warm-gray-900);',
            '    line-height: 1.2;',
            '}',
            '.planner-avatar-dropdown-sub {',
            '    margin: 4px 0 0;',
            '    font-size: 12px;',
            '    color: var(--warm-gray-500);',
            '    word-break: break-word;',
            '}',
            '.planner-avatar-dropdown-list {',
            '    display: grid;',
            '    gap: 4px;',
            '}',
            '.planner-avatar-dropdown-item {',
            '    border: none;',
            '    background: transparent;',
            '    width: 100%;',
            '    text-align: left;',
            '    border-radius: 10px;',
            '    color: var(--warm-gray-800);',
            '    font-size: 13px;',
            '    padding: 9px 10px;',
            '    cursor: pointer;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: space-between;',
            '    transition: background 0.18s ease, color 0.18s ease;',
            '}',
            '.planner-avatar-dropdown-item:hover {',
            '    background: var(--warm-gray-50);',
            '    color: var(--warm-gray-900);',
            '}',
            '.planner-avatar-dropdown-item::after {',
            '    content: "›";',
            '    font-size: 14px;',
            '    color: var(--warm-gray-400);',
            '    line-height: 1;',
            '}',
            '.planner-avatar-dropdown-item.is-danger {',
            '    color: #a53535;',
            '}',
            '.planner-avatar-dropdown-item.is-danger:hover {',
            '    background: rgba(181, 68, 68, 0.1);',
            '    color: #8f2f2f;',
            '}',
            '.planner-avatar-dropdown-item.is-danger::after {',
            '    content: "";',
            '}',
            '.global-avatar-btn.planner-avatar-hidden {',
            '    opacity: 0;',
            '    visibility: hidden;',
            '}'
        ].join('\n');
        document.head.appendChild(styleEl);
    }

    function setupAvatarAndLogout() {
        var authIdentity = getCurrentAuthIdentity();
        if (!authIdentity) return;

        document.addEventListener('DOMContentLoaded', function () {
            var avatarMark = document.querySelector('.global-avatar-mark');
            var avatarBtn = document.querySelector('.global-avatar-btn');
            var topbarActions = document.querySelector('.global-topbar-actions');
            if (!avatarBtn || !topbarActions) return;

            var displayInfo = getUserDisplayInfo(authIdentity.account);
            if (authIdentity.isDemo) {
                displayInfo.name = '演示账号';
                displayInfo.sub = 'Demo Account';
                displayInfo.mark = 'D';
            }
            if (avatarMark) {
                avatarMark.textContent = displayInfo.mark;
            }

            avatarBtn.style.cursor = 'pointer';
            var title = '当前账号：' + displayInfo.name + '（悬停查看菜单）';
            avatarBtn.title = title;
            avatarBtn.setAttribute('aria-label', title);

            if (document.getElementById('profileAvatarMenuWrap')) {
                return;
            }

            ensureGlobalAvatarMenuStyles();
            topbarActions.classList.add('planner-avatar-menu-host');

            var dropdown = topbarActions.querySelector('.planner-avatar-dropdown');
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.className = 'planner-avatar-dropdown';
                dropdown.innerHTML = [
                    '<span class="planner-avatar-dropdown-avatar" data-avatar-large>U</span>',
                    '<div class="planner-avatar-dropdown-head">',
                    '  <div>',
                    '    <p class="planner-avatar-dropdown-name" data-display-name>用户</p>',
                    '    <p class="planner-avatar-dropdown-sub" data-display-sub>账号信息</p>',
                    '  </div>',
                    '</div>',
                    '<div class="planner-avatar-dropdown-list">',
                    '  <button type="button" class="planner-avatar-dropdown-item" data-menu-action="userinfo">用户信息</button>',
                    '  <button type="button" class="planner-avatar-dropdown-item" data-menu-action="appearance">个性化设置</button>',
                    '  <button type="button" class="planner-avatar-dropdown-item" data-menu-action="privacy">安全隐私</button>',
                    '  <button type="button" class="planner-avatar-dropdown-item is-danger" data-menu-action="logout">退出登录</button>',
                    '</div>'
                ].join('\n');
                topbarActions.appendChild(dropdown);
            }

            var largeAvatarEl = dropdown.querySelector('[data-avatar-large]');
            var displayNameEl = dropdown.querySelector('[data-display-name]');
            var displaySubEl = dropdown.querySelector('[data-display-sub]');
            if (largeAvatarEl) largeAvatarEl.textContent = displayInfo.mark;
            if (displayNameEl) displayNameEl.textContent = displayInfo.name;
            if (displaySubEl) displaySubEl.textContent = displayInfo.sub;

            var AVATAR_RESTORE_DELAY_MS = 250;
            var closeTimer = 0;
            var closeToken = 0;
            var flybackAvatarEl = null;
            var removeFlybackAvatar = function () {
                if (!flybackAvatarEl) return;
                if (flybackAvatarEl.parentNode) {
                    flybackAvatarEl.parentNode.removeChild(flybackAvatarEl);
                }
                flybackAvatarEl = null;
            };
            var resetAvatarMotion = function () {
                if (!largeAvatarEl) return;
                largeAvatarEl.style.transition = '';
                largeAvatarEl.style.transform = 'translate(0px, 0px) scale(1)';
            };
            var animateAvatarMotion = function () {
                if (!largeAvatarEl) return;
                if (!dropdown.classList.contains('is-open')) return;
                var btnRect = avatarBtn.getBoundingClientRect();
                var targetRect = largeAvatarEl.getBoundingClientRect();
                if (!btnRect.width || !targetRect.width) return;

                var fromX = (btnRect.left + btnRect.width / 2) - (targetRect.left + targetRect.width / 2);
                var fromY = (btnRect.top + btnRect.height / 2) - (targetRect.top + targetRect.height / 2);
                var fromScale = Math.max(0.2, Math.min(1.2, btnRect.width / targetRect.width));

                largeAvatarEl.style.transition = 'none';
                largeAvatarEl.style.transform = 'translate(' + fromX.toFixed(2) + 'px, ' + fromY.toFixed(2) + 'px) scale(' + fromScale.toFixed(4) + ')';
                largeAvatarEl.getBoundingClientRect();
                largeAvatarEl.style.transition = '';
                largeAvatarEl.style.transform = 'translate(0px, 0px) scale(1)';
            };
            var animateAvatarBackToButton = function (startRect, done) {
                if (!largeAvatarEl) {
                    done();
                    return;
                }

                var btnRect = avatarBtn.getBoundingClientRect();
                var sourceRect = startRect && startRect.width ? startRect : largeAvatarEl.getBoundingClientRect();
                if (!btnRect.width || !sourceRect.width) {
                    done();
                    return;
                }

                var toX = (btnRect.left + btnRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
                var toY = (btnRect.top + btnRect.height / 2) - (sourceRect.top + sourceRect.height / 2);
                var toScale = Math.max(0.2, Math.min(1.2, btnRect.width / sourceRect.width));
                removeFlybackAvatar();
                var computed = window.getComputedStyle(largeAvatarEl);
                flybackAvatarEl = document.createElement('span');
                flybackAvatarEl.textContent = largeAvatarEl.textContent || displayInfo.mark;
                flybackAvatarEl.setAttribute('aria-hidden', 'true');
                flybackAvatarEl.style.position = 'fixed';
                flybackAvatarEl.style.left = sourceRect.left + 'px';
                flybackAvatarEl.style.top = sourceRect.top + 'px';
                flybackAvatarEl.style.width = sourceRect.width + 'px';
                flybackAvatarEl.style.height = sourceRect.height + 'px';
                flybackAvatarEl.style.display = 'inline-flex';
                flybackAvatarEl.style.alignItems = 'center';
                flybackAvatarEl.style.justifyContent = 'center';
                flybackAvatarEl.style.borderRadius = computed.borderRadius || '999px';
                flybackAvatarEl.style.background = computed.background || 'linear-gradient(140deg, #1f2937, #4b5563)';
                flybackAvatarEl.style.boxShadow = computed.boxShadow || '0 8px 18px rgba(17, 24, 39, 0.28)';
                flybackAvatarEl.style.color = computed.color || '#fff';
                flybackAvatarEl.style.fontSize = computed.fontSize || '32px';
                flybackAvatarEl.style.fontWeight = computed.fontWeight || '700';
                flybackAvatarEl.style.transform = 'translate(0px, 0px) scale(1)';
                flybackAvatarEl.style.transition = 'transform 0.28s cubic-bezier(0.22, 0.62, 0.36, 1)';
                flybackAvatarEl.style.pointerEvents = 'none';
                flybackAvatarEl.style.zIndex = '9999';
                flybackAvatarEl.style.willChange = 'transform';
                document.body.appendChild(flybackAvatarEl);
                var completed = false;
                var finish = function () {
                    if (completed) return;
                    completed = true;
                    if (flybackAvatarEl) {
                        flybackAvatarEl.removeEventListener('transitionend', onEnd);
                    }
                    removeFlybackAvatar();
                    done();
                };
                var onEnd = function (event) {
                    if (!event || event.propertyName === 'transform') finish();
                };

                flybackAvatarEl.addEventListener('transitionend', onEnd);
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        if (!flybackAvatarEl) return;
                        flybackAvatarEl.style.transform = 'translate(' + toX.toFixed(2) + 'px, ' + toY.toFixed(2) + 'px) scale(' + toScale.toFixed(4) + ')';
                    });
                });
                setTimeout(finish, 360);
            };
            var openMenu = function () {
                if (closeTimer) {
                    clearTimeout(closeTimer);
                    closeTimer = 0;
                }
                closeToken += 1;
                removeFlybackAvatar();
                resetAvatarMotion();
                var wasOpen = dropdown.classList.contains('is-open');
                dropdown.classList.add('is-open');
                avatarBtn.classList.add('planner-avatar-hidden');
                if (!wasOpen) {
                    requestAnimationFrame(animateAvatarMotion);
                }
            };
            var closeMenu = function (delayMs) {
                if (closeTimer) clearTimeout(closeTimer);
                var token = ++closeToken;
                var delay = typeof delayMs === 'number' ? delayMs : AVATAR_RESTORE_DELAY_MS;
                closeTimer = setTimeout(function () {
                    closeTimer = 0;
                    if (token !== closeToken) return;
                    if (!dropdown.classList.contains('is-open')) {
                        removeFlybackAvatar();
                        avatarBtn.classList.remove('planner-avatar-hidden');
                        resetAvatarMotion();
                        return;
                    }
                    var startRect = largeAvatarEl ? largeAvatarEl.getBoundingClientRect() : null;
                    dropdown.classList.remove('is-open');
                    resetAvatarMotion();
                    animateAvatarBackToButton(startRect, function () {
                        if (token !== closeToken) return;
                        avatarBtn.classList.remove('planner-avatar-hidden');
                        resetAvatarMotion();
                    });
                }, delay);
            };

            avatarBtn.addEventListener('mouseenter', openMenu);
            avatarBtn.addEventListener('mouseleave', function () { closeMenu(AVATAR_RESTORE_DELAY_MS); });
            dropdown.addEventListener('mouseenter', openMenu);
            dropdown.addEventListener('mouseleave', function () { closeMenu(AVATAR_RESTORE_DELAY_MS); });

            avatarBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (dropdown.classList.contains('is-open')) {
                    closeMenu(0);
                } else {
                    openMenu();
                }
            });

            dropdown.addEventListener('click', function (event) {
                var target = event.target instanceof Element ? event.target.closest('[data-menu-action]') : null;
                if (!target) return;
                var action = target.getAttribute('data-menu-action');

                if (action === 'userinfo') {
                    goToProfilePage();
                    return;
                }

                if (action === 'appearance') {
                    window.location.href = 'profile.html#profileAppearanceSection';
                    closeMenu(0);
                    return;
                }

                if (action === 'privacy') {
                    window.location.href = 'profile.html#privacySecuritySection';
                    closeMenu(0);
                    return;
                }

                if (action === 'logout') {
                    var shouldLogout = window.confirm('确认退出登录吗？');
                    if (!shouldLogout) return;
                    clearSession();
                    disableAutoLogin();
                    window.location.replace(buildLoginUrl());
                }
            });

            document.addEventListener('pointerdown', function (event) {
                var target = event.target;
                if (!(target instanceof Element)) return;
                if (topbarActions.contains(target)) return;
                if (!dropdown.classList.contains('is-open')) return;
                closeMenu(0);
            });
        });
    }

    function setError(message) {
        var errorEl = document.getElementById('authError');
        if (!errorEl) return;
        errorEl.textContent = message || '';
        errorEl.style.display = message ? 'block' : 'none';
    }

    function setStatus(message, isSuccess) {
        var statusEl = document.getElementById('authStatus');
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.style.display = message ? 'block' : 'none';
        statusEl.classList.toggle('is-success', Boolean(isSuccess));
    }

    function setModeText(mode) {
        var titleEl = document.getElementById('authTitle');
        var subtitleEl = document.getElementById('authSubtitle');
        var submitEl = document.getElementById('authSubmit');
        var hintEl = document.getElementById('authHint');
        var confirmWrap = document.getElementById('authConfirmWrap');
        var accountInput = document.getElementById('authAccount');
        var confirmInput = document.getElementById('authPasswordConfirm');
        var passwordInput = document.getElementById('authPassword');
        var switchLabel = document.getElementById('authSwitchLabel');
        var switchBtn = document.getElementById('authSwitchBtn');

        if (
            !titleEl ||
            !subtitleEl ||
            !submitEl ||
            !hintEl ||
            !confirmWrap ||
            !accountInput ||
            !confirmInput ||
            !passwordInput ||
            !switchLabel ||
            !switchBtn
        ) {
            return;
        }

        if (mode === 'register') {
            titleEl.textContent = '';
            subtitleEl.textContent = '';
            titleEl.style.display = 'none';
            subtitleEl.style.display = 'none';
            submitEl.textContent = '注册并登录';
            hintEl.textContent = '';
            hintEl.style.display = 'none';
            confirmWrap.style.display = 'block';
            confirmInput.disabled = false;
            confirmInput.value = '';
            passwordInput.setAttribute('autocomplete', 'new-password');
            accountInput.placeholder = '用户名或手机号';
            accountInput.value = '';
            switchLabel.textContent = '已有账号？';
            switchBtn.textContent = '去登录';
        } else {
            titleEl.textContent = '';
            subtitleEl.textContent = '';
            titleEl.style.display = 'none';
            subtitleEl.style.display = 'none';
            submitEl.textContent = '登录';
            hintEl.textContent = '';
            hintEl.style.display = 'none';
            confirmWrap.style.display = 'none';
            confirmInput.disabled = true;
            confirmInput.value = '';
            passwordInput.setAttribute('autocomplete', 'current-password');
            accountInput.placeholder = '用户名或手机号';
            accountInput.value = '';
            switchLabel.textContent = '没有账号？';
            switchBtn.textContent = '去注册';
        }
    }

    function initLoginPage() {
        var _loginParams = new URLSearchParams(window.location.search || '');
        var _serverSessionExpired = _loginParams.get('server_session') === 'expired';

        if (!_serverSessionExpired) {
            if (isAuthenticated()) {
                redirectAfterLogin();
                return;
            }
            if (tryRestoreSessionByAutoLogin()) {
                redirectAfterLogin();
                return;
            }
        }

        document.addEventListener('DOMContentLoaded', function () {
            var form = document.getElementById('authForm');
            var accountInput = document.getElementById('authAccount');
            var passwordInput = document.getElementById('authPassword');
            var confirmInput = document.getElementById('authPasswordConfirm');
            var submitBtn = document.getElementById('authSubmit');
            var switchBtn = document.getElementById('authSwitchBtn');
            var rememberCheckbox = document.getElementById('authRemember');
            var autoLoginCheckbox = document.getElementById('authAutoLogin');

            if (!form || !accountInput || !passwordInput || !confirmInput || !submitBtn || !switchBtn || !rememberCheckbox || !autoLoginCheckbox) {
                return;
            }

            var mode = 'login';
            setModeText(mode);

            var applyPrefsToForm = function () {
                var prefs = getAuthPrefs();
                rememberCheckbox.checked = prefs.rememberPassword;
                autoLoginCheckbox.checked = prefs.autoLogin;

                if (mode === 'login' && prefs.rememberPassword) {
                    accountInput.value = prefs.rememberedAccount || '';
                    passwordInput.value = prefs.rememberedPassword || '';
                }
            };

            var persistPrefsFromSelection = function () {
                if (autoLoginCheckbox.checked) {
                    rememberCheckbox.checked = true;
                }
                if (!rememberCheckbox.checked) {
                    autoLoginCheckbox.checked = false;
                }

                saveLoginPrefsFromInputs(
                    accountInput.value,
                    passwordInput.value,
                    rememberCheckbox.checked,
                    autoLoginCheckbox.checked
                );
            };

            applyPrefsToForm();

            checkServerSessionAsync(function (valid) {
                if (valid) SERVER_SESSION_VALID = true;
            });

            rememberCheckbox.addEventListener('change', function () {
                persistPrefsFromSelection();
            });

            autoLoginCheckbox.addEventListener('change', function () {
                persistPrefsFromSelection();
            });

            var inviteCodeWrap = document.getElementById('authAccessCodeWrap');

            switchBtn.addEventListener('click', function () {
                mode = mode === 'login' ? 'register' : 'login';
                setModeText(mode);
                passwordInput.value = '';
                confirmInput.value = '';
                if (inviteCodeWrap) {
                    inviteCodeWrap.style.display = mode === 'register' ? '' : 'none';
                }
                if (mode === 'login') {
                    applyPrefsToForm();
                }
                submitBtn.disabled = false;
                setError('');
                setStatus('');
            });

            form.addEventListener('submit', function (event) {
                event.preventDefault();
                setError('');
                setStatus('');

                var account = normalizeAccount(accountInput.value);
                var password = String(passwordInput.value || '');
                var confirmPassword = String(confirmInput.value || '');
                var rememberPassword = Boolean(rememberCheckbox.checked);
                var autoLogin = Boolean(autoLoginCheckbox.checked);

                if (autoLogin) {
                    rememberPassword = true;
                    rememberCheckbox.checked = true;
                }
                if (!rememberPassword) {
                    autoLogin = false;
                    autoLoginCheckbox.checked = false;
                }

                var accountValidation = validateAccount(account);
                if (!accountValidation.ok) {
                    setError(accountValidation.message);
                    return;
                }

                var passwordValidation = validatePassword(password);
                if (!passwordValidation.ok) {
                    setError(passwordValidation.message);
                    return;
                }

                submitBtn.disabled = true;

                function finishLogin(userObj, opts) {
                    saveLoginPrefsFromInputs(account, password, rememberPassword, autoLogin);
                    createSession(userObj, opts);
                    runScopedStorageMigration(account, Boolean(opts && opts.isDemo));
                    setStatus((opts && opts.isDemo ? '演示账号' : '') + '登录成功，正在进入系统...', true);
                    setTimeout(redirectAfterLogin, 180);
                }

                if (mode === 'register') {
                    if (password !== confirmPassword) {
                        setError('两次输入的密码不一致。');
                        submitBtn.disabled = false;
                        return;
                    }
                    var inviteInput = document.getElementById('authAccessCode');
                    var inviteCode = inviteInput ? inviteInput.value.trim() : '';
                    serverAuthPost('/api/auth/register', { account: account, password: password, inviteCode: inviteCode }, function (ok, msg) {
                        if (!ok) {
                            setError(msg || '注册失败');
                            submitBtn.disabled = false;
                            return;
                        }
                        var userToSave = {
                            account: account,
                            accountType: accountValidation.type,
                            passwordHash: simpleHash(password),
                            createdAt: Date.now()
                        };
                        saveRegisteredUser(userToSave);
                        ensureLegacyStorageOwner();
                        finishLogin(userToSave, {});
                    });
                    return;
                }

                serverAuthPost('/api/auth/login', { account: account, password: password }, function (ok, msg) {
                    if (!ok) {
                        setError('用户名 / 手机号或密码错误');
                        submitBtn.disabled = false;
                        return;
                    }
                    var isDemo = isDemoCredential(account, password);
                    if (!findUserByAccount(account)) {
                        saveRegisteredUser({
                            account: account,
                            accountType: accountValidation.type,
                            passwordHash: simpleHash(password),
                            createdAt: Date.now()
                        });
                    }
                    finishLogin({ account: isDemo ? DEMO_ACCOUNT : account }, isDemo ? { isDemo: true } : {});
                });
            });
        });
    }

    function deregisterAccount(password, options) {
        var id = getCurrentAuthIdentity();
        if (!id) return;
        var account = id.account;
        var passwordText = String(password || '');
        var onError = options && typeof options.onError === 'function' ? options.onError : null;
        var reportError = function (msg) {
            if (onError) onError(msg); else window.alert(msg);
        };
        if (!passwordText) {
            reportError('请输入密码后再注销。');
            return;
        }
        if (id.isDemo || account === DEMO_ACCOUNT) {
            clearSession();
            disableAutoLogin();
            window.location.replace(buildLoginUrl());
            return;
        }
        var apiBase = getApiBaseUrl();
        var doLocalCleanup = function () {
            var seg = accountStorageSegment(account);
            var map = readUsersMap();
            delete map[account];
            writeUsersMap(map);
            var legacy = readJson(AUTH_USER_KEY);
            if (legacy && legacy.account && normalizeAccount(legacy.account) === normalizeAccount(account)) {
                localStorage.removeItem(AUTH_USER_KEY);
            }
            clearSession();
            var prefs = getAuthPrefs();
            if (prefs.rememberedAccount && normalizeAccount(prefs.rememberedAccount) === normalizeAccount(account)) {
                saveAuthPrefs({ rememberPassword: false, autoLogin: false, rememberedAccount: '', rememberedPassword: '' });
            }
            var owner = readJson(LEGACY_STORAGE_OWNER_KEY);
            if (owner && owner.account && normalizeAccount(owner.account) === normalizeAccount(account)) {
                localStorage.removeItem(LEGACY_STORAGE_OWNER_KEY);
            }
            var prefix = 'planner_acc_' + seg + '_';
            var toRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(prefix) === 0) toRemove.push(k);
            }
            toRemove.forEach(function (k) { localStorage.removeItem(k); });
            var profileStore = readJson('planner_user_profile_v1');
            if (profileStore && typeof profileStore === 'object') {
                delete profileStore[account];
                writeJson('planner_user_profile_v1', profileStore);
            }
            window.location.replace(buildLoginUrl());
        };
        if (apiBase) {
            serverAuthPost('/api/auth/deregister', { account: account, password: passwordText }, function (ok, msg) {
                if (!ok) {
                    reportError(msg || '密码错误或注销失败，请重试。');
                    return;
                }
                doLocalCleanup();
            });
        } else {
            var user = findUserByAccount(account);
            if (user && user.passwordHash && simpleHash(passwordText) !== user.passwordHash) {
                reportError('密码错误，无法注销账号。');
                return;
            }
            doLocalCleanup();
        }
    }

    window.PlannerAuth = {
        isAuthenticated: isAuthenticated,
        getCurrentUser: getCurrentAuthIdentity,
        scopedStorageKey: scopedStorageKey,
        getPlannerDataKeyPrefix: getPlannerDataKeyPrefix,
        accountStorageSegment: accountStorageSegment,
        logout: function () {
            clearSession();
            disableAutoLogin();
            window.location.replace(buildLoginUrl());
        },
        deregister: deregisterAccount
    };

    if (getCurrentPageName() === LOGIN_PAGE) {
        initLoginPage();
        return;
    }

    if (!isAuthenticated()) {
        if (!tryRestoreSessionByAutoLogin()) {
            redirectToLogin();
            return;
        }
    }

    ensureLegacyStorageOwner();
    var __authIdentity = getCurrentAuthIdentity();
    if (__authIdentity) {
        runScopedStorageMigration(__authIdentity.account, Boolean(__authIdentity.isDemo));
    }

    setupAvatarAndLogout();

    checkServerSessionAsync(function (valid) {
        if (!valid) {
            document.documentElement.style.visibility = 'hidden';
            var loginUrl = buildLoginUrl();
            window.location.replace(loginUrl);
        }
    });
})();
