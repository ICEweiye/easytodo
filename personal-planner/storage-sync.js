(function initPlannerSharedStorage() {
    const META_KEY = '__planner_sync_updated_at';
    const RELOAD_TS_KEY = '__planner_sync_bootstrap_reload_ts';
    const ENDPOINT_CACHE_KEY = '__planner_sync_endpoint';
    const FAIL_UNTIL_KEY = '__planner_sync_fail_until';
    const PUSH_DELAY_MS = 350;
    const PULL_INTERVAL_MS = 5000;
    const REQUEST_TIMEOUT_MS = 900;
    const FAIL_COOLDOWN_MS = 30000;

    if (!window.localStorage) return;
    if (window.__plannerSharedStorageInitialized) return;
    window.__plannerSharedStorageInitialized = true;

    const storage = window.localStorage;
    const storageProto = Object.getPrototypeOf(storage);
    const rawGetItem = storageProto.getItem;
    const rawSetItem = storageProto.setItem;
    const rawRemoveItem = storageProto.removeItem;
    const rawClear = storageProto.clear;
    const rawKey = storageProto.key;

    let activeEndpoint = '';
    let pushTimer = null;
    let pullTimer = null;
    let applyingRemoteData = false;
    let pushing = false;
    let pendingPatchData = {};
    let pendingClearAllSyncKeys = false;

    function shouldSyncKey(key) {
        if (!key) return false;
        // Never sync auth credentials/session/prefs.
        if (key.startsWith('planner_auth_')) return false;
        return key === 'sidebarCollapsed'
            || key === 'reviews'
            || key.startsWith('planner_')
            || key.startsWith('life_');
    }

    function getLocalTimestamp() {
        const value = Number(rawGetItem.call(storage, META_KEY));
        return Number.isFinite(value) ? value : 0;
    }

    function setLocalTimestamp(value) {
        rawSetItem.call(storage, META_KEY, String(value));
    }

    function collectLocalData() {
        const data = {};
        for (let i = 0; i < storage.length; i += 1) {
            const key = rawKey.call(storage, i);
            if (!shouldSyncKey(key)) continue;
            const value = rawGetItem.call(storage, key);
            if (typeof value === 'string') data[key] = value;
        }
        return data;
    }

    function safeJsonParse(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (err) {
            return null;
        }
    }

    function normalizePayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const data = {};
        const rawData = payload.data && typeof payload.data === 'object' ? payload.data : {};
        Object.keys(rawData).forEach((key) => {
            if (!shouldSyncKey(key)) return;
            if (typeof rawData[key] === 'string') data[key] = rawData[key];
        });
        const updatedAt = Number(payload.updatedAt);
        return {
            updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
            data
        };
    }

    function requestJson(url, method, payload, callback) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.timeout = REQUEST_TIMEOUT_MS;
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    callback(normalizePayload(safeJsonParse(xhr.responseText)));
                } else {
                    callback(null);
                }
            };
            xhr.ontimeout = () => callback(null);
            xhr.onerror = () => callback(null);
            xhr.send(payload ? JSON.stringify(payload) : null);
        } catch (err) {
            callback(null);
        }
    }

    function readSessionNumber(key) {
        try {
            const value = Number(sessionStorage.getItem(key));
            return Number.isFinite(value) ? value : 0;
        } catch (err) {
            return 0;
        }
    }

    function writeSessionValue(key, value) {
        try {
            sessionStorage.setItem(key, String(value));
        } catch (err) {
            // ignore
        }
    }

    function getCandidateEndpoints() {
        const candidates = [];
        if (typeof window.__PLANNER_SYNC_ENDPOINT__ === 'string' && window.__PLANNER_SYNC_ENDPOINT__) {
            candidates.push(window.__PLANNER_SYNC_ENDPOINT__);
        }

        try {
            const cached = sessionStorage.getItem(ENDPOINT_CACHE_KEY);
            if (cached) candidates.push(cached);
        } catch (err) {
            // ignore
        }

        if (window.location && /^https?:$/i.test(window.location.protocol)) {
            const currentOriginEndpoint = `${window.location.origin}/api/storage`;
            candidates.push(currentOriginEndpoint);
        }

        candidates.push('http://127.0.0.1:8787/api/storage');
        candidates.push('http://localhost:8787/api/storage');

        return Array.from(new Set(candidates.filter(Boolean)));
    }

    function resolveEndpoint(callback) {
        if (activeEndpoint) {
            callback(activeEndpoint);
            return;
        }

        if (Date.now() < readSessionNumber(FAIL_UNTIL_KEY)) {
            callback('');
            return;
        }

        const candidates = getCandidateEndpoints();
        let index = 0;

        function tryNext() {
            if (index >= candidates.length) {
                writeSessionValue(FAIL_UNTIL_KEY, Date.now() + FAIL_COOLDOWN_MS);
                callback('');
                return;
            }

            const endpoint = candidates[index];
            index += 1;
            requestJson(endpoint, 'GET', null, (payload) => {
                if (!payload) {
                    tryNext();
                    return;
                }
                activeEndpoint = endpoint;
                writeSessionValue(ENDPOINT_CACHE_KEY, endpoint);
                callback(endpoint);
            });
        }

        tryNext();
    }

    function applyRemoteData(remote, options) {
        if (!remote) return false;

        const opts = options || {};
        let changed = false;
        const remoteData = remote.data || {};

        applyingRemoteData = true;
        try {
            const syncedKeys = [];
            for (let i = 0; i < storage.length; i += 1) {
                const key = rawKey.call(storage, i);
                if (shouldSyncKey(key)) syncedKeys.push(key);
            }

            syncedKeys.forEach((key) => {
                if (!(key in remoteData)) {
                    rawRemoveItem.call(storage, key);
                    changed = true;
                }
            });

            Object.keys(remoteData).forEach((key) => {
                const current = rawGetItem.call(storage, key);
                if (current !== remoteData[key]) {
                    rawSetItem.call(storage, key, remoteData[key]);
                    changed = true;
                }
            });

            setLocalTimestamp(remote.updatedAt || Date.now());
        } finally {
            applyingRemoteData = false;
        }

        if (changed) {
            window.dispatchEvent(new CustomEvent('planner-storage-synced', {
                detail: { updatedAt: remote.updatedAt || Date.now() }
            }));

            if (opts.allowReload) {
                const lastReloadTs = readSessionNumber(RELOAD_TS_KEY);
                const currentTs = remote.updatedAt || 0;
                if (currentTs > 0 && currentTs !== lastReloadTs) {
                    writeSessionValue(RELOAD_TS_KEY, currentTs);
                    window.location.reload();
                }
            }
        }

        return changed;
    }

    function schedulePush() {
        if (!activeEndpoint || applyingRemoteData) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            pushTimer = null;
            if (pushing) {
                schedulePush();
                return;
            }
            pushLocalData();
        }, PUSH_DELAY_MS);
    }

    function hasPendingPatch() {
        return pendingClearAllSyncKeys || Object.keys(pendingPatchData).length > 0;
    }

    function queuePatchValue(key, value) {
        if (!shouldSyncKey(key)) return;
        pendingPatchData[key] = value;
    }

    function buildPushPayload() {
        if (hasPendingPatch()) {
            return {
                updatedAt: Date.now(),
                mode: 'patch',
                clearAllSyncKeys: pendingClearAllSyncKeys,
                // Keep `data` as a full snapshot for backward compatibility with older servers.
                // Newer servers should prefer `patchData` when mode is patch.
                data: collectLocalData(),
                patchData: { ...pendingPatchData }
            };
        }

        // Fallback to patch mode even without a pending queue.
        // This avoids accidental full-overwrite when a tab only has a partial local key set.
        const snapshot = collectLocalData();
        return {
            updatedAt: Date.now(),
            mode: 'patch',
            clearAllSyncKeys: false,
            data: snapshot,
            patchData: snapshot
        };
    }

    function resetQueuedPatch() {
        pendingPatchData = {};
        pendingClearAllSyncKeys = false;
    }

    function requeuePushPayload(payload) {
        if (!payload || payload.mode !== 'patch') return;
        if (payload.clearAllSyncKeys) {
            pendingClearAllSyncKeys = true;
            pendingPatchData = {};
        }
        const patch = payload.patchData && typeof payload.patchData === 'object'
            ? payload.patchData
            : (payload.data && typeof payload.data === 'object' ? payload.data : {});
        Object.keys(patch).forEach((key) => {
            if (!shouldSyncKey(key)) return;
            const value = patch[key];
            if (typeof value === 'string' || value === null) {
                pendingPatchData[key] = value;
            }
        });
    }

    function pushLocalData() {
        if (!activeEndpoint || applyingRemoteData || pushing) return;

        const payload = buildPushPayload();
        const isPatchPayload = payload.mode === 'patch';
        if (isPatchPayload) {
            const patchKeys = Object.keys(payload.patchData || {});
            if (!payload.clearAllSyncKeys && patchKeys.length === 0) return;
            resetQueuedPatch();
        }

        pushing = true;

        requestJson(activeEndpoint, 'POST', payload, (remote) => {
            pushing = false;
            if (!remote) {
                setLocalTimestamp(payload.updatedAt);
                if (isPatchPayload) {
                    requeuePushPayload(payload);
                    schedulePush();
                }
                return;
            }
            if ((remote.updatedAt || 0) >= getLocalTimestamp()) {
                applyRemoteData(remote, { allowReload: false });
            }
            if (hasPendingPatch()) {
                schedulePush();
            }
        });
    }

    function pullRemoteData(options) {
        if (!activeEndpoint || applyingRemoteData) return;
        const opts = options || {};
        requestJson(activeEndpoint, 'GET', null, (remote) => {
            if (!remote) return;
            if ((remote.updatedAt || 0) > getLocalTimestamp()) {
                applyRemoteData(remote, { allowReload: !!opts.allowReload });
            }
        });
    }

    function installStorageHooks() {
        storageProto.setItem = function patchedSetItem(key, value) {
            rawSetItem.call(this, key, value);
            if (this !== storage || applyingRemoteData) return;
            const keyText = String(key || '');
            if (!shouldSyncKey(keyText)) return;
            queuePatchValue(keyText, String(value));
            setLocalTimestamp(Date.now());
            schedulePush();
        };

        storageProto.removeItem = function patchedRemoveItem(key) {
            rawRemoveItem.call(this, key);
            if (this !== storage || applyingRemoteData) return;
            const keyText = String(key || '');
            if (!shouldSyncKey(keyText)) return;
            queuePatchValue(keyText, null);
            setLocalTimestamp(Date.now());
            schedulePush();
        };

        storageProto.clear = function patchedClear() {
            rawClear.call(this);
            if (this !== storage || applyingRemoteData) return;
            pendingClearAllSyncKeys = true;
            pendingPatchData = {};
            setLocalTimestamp(Date.now());
            schedulePush();
        };
    }

    function startPolling() {
        if (pullTimer) clearInterval(pullTimer);
        pullTimer = setInterval(() => pullRemoteData({ allowReload: false }), PULL_INTERVAL_MS);

        window.addEventListener('focus', () => pullRemoteData({ allowReload: false }));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                pullRemoteData({ allowReload: false });
            }
        });
    }

    function bootstrap() {
        resolveEndpoint((endpoint) => {
            if (!endpoint) return;

            const localDataCount = Object.keys(collectLocalData()).length;
            requestJson(endpoint, 'GET', null, (remote) => {
                if (!remote) return;

                const remoteTs = remote.updatedAt || 0;
                const localTs = getLocalTimestamp();
                if (remoteTs > localTs) {
                    applyRemoteData(remote, { allowReload: true });
                    return;
                }

                if (localDataCount > 0) {
                    pushLocalData();
                } else {
                    setLocalTimestamp(remoteTs);
                }
            });

            startPolling();
        });
    }

    installStorageHooks();
    bootstrap();
})();
