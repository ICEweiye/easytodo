const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const Utf8Utils = require('./utf8-utils.js');

/** 监听地址：本机仅自己访问用 127.0.0.1；局域网或其它机器访问需 0.0.0.0（FRP 本机转发仍可用 127.0.0.1） */
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;

const DB_FILE = path.join(ROOT_DIR, 'planner-data.sqlite3');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups', 'db');
const MAX_BACKUP_FILES = Math.max(5, Number(process.env.PLANNER_MAX_BACKUPS || 120) || 120);
const BACKUP_MIN_INTERVAL_MS = Math.max(0, Number(process.env.PLANNER_BACKUP_MIN_INTERVAL_MS || 60 * 1000) || 60 * 1000);

const LEGACY_STORAGE_FILE = path.join(ROOT_DIR, '.planner-shared-storage.json');
const LEGACY_LAST_GOOD_FILE = path.join(ROOT_DIR, '.planner-shared-storage.last-good.json');

let db = null;
let lastBackupAt = 0;

// ===== Access Code & Session Authentication =====
const ACCESS_CODE_FILE = path.join(ROOT_DIR, '.planner-access-code');
const SESSION_COOKIE = 'planner_sid';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 体验账号 demo：仅本地试用，会话 30 分钟 */
const EXPERIENCE_ACCOUNT = 'demo';
const EXPERIENCE_SESSION_MS = 30 * 60 * 1000;
const activeSessions = new Map();

function loadOrCreateAccessCode() {
    const envCode = (process.env.PLANNER_ACCESS_CODE || '').trim();
    if (envCode.length >= 6) return envCode;
    try {
        if (fs.existsSync(ACCESS_CODE_FILE)) {
            const stored = fs.readFileSync(ACCESS_CODE_FILE, 'utf8').trim();
            if (stored.length >= 6) return stored;
        }
    } catch (_) { /* regenerate */ }
    const generated = crypto.randomBytes(16).toString('base64url');
    try { fs.writeFileSync(ACCESS_CODE_FILE, generated + '\n', { mode: 0o600 }); } catch (_) {}
    return generated;
}

const ACCESS_CODE = loadOrCreateAccessCode();

function createSession(ttlMs) {
    const token = crypto.randomBytes(32).toString('hex');
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : SESSION_MAX_AGE_MS;
    activeSessions.set(token, Date.now() + ttl);
    if (activeSessions.size > 200) {
        const now = Date.now();
        for (const [k, exp] of activeSessions) { if (now > exp) activeSessions.delete(k); }
    }
    return token;
}

function isValidSession(token) {
    if (!token) return false;
    const exp = activeSessions.get(token);
    if (!exp) return false;
    if (Date.now() > exp) { activeSessions.delete(token); return false; }
    return true;
}

function parseCookies(cookieHeader) {
    const map = {};
    (cookieHeader || '').split(';').forEach(part => {
        const eq = part.indexOf('=');
        if (eq > 0) map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    });
    return map;
}

function getReqSession(req) {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
}

function isReqAuthenticated(req) {
    return isValidSession(getReqSession(req));
}

function sessionCookieHeader(token, ttlMs) {
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : SESSION_MAX_AGE_MS;
    const maxAge = Math.floor(ttl / 1000);
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

function getCorsHeaders(extraHeaders = {}) {
    return {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...extraHeaders
    };
}

function shouldSyncKey(key) {
    return key === 'sidebarCollapsed'
        || key === 'reviews'
        || key.startsWith('planner_')
        || key.startsWith('life_');
}

function sanitizeData(rawData) {
    const data = {};
    if (!rawData || typeof rawData !== 'object') return data;

    Object.keys(rawData).forEach((key) => {
        if (!shouldSyncKey(key)) return;
        const value = rawData[key];
        if (typeof value === 'string') {
            data[key] = value;
        }
    });

    return data;
}

function sanitizePatchData(rawData) {
    const patch = {};
    if (!rawData || typeof rawData !== 'object') return patch;

    Object.keys(rawData).forEach((key) => {
        if (!shouldSyncKey(key)) return;
        const value = rawData[key];
        if (value === null) {
            patch[key] = null;
        } else if (typeof value === 'string') {
            patch[key] = value;
        }
    });

    return patch;
}

/**
 * 复盘类存储值为 JSON 数组、元素带 id。PATCH 时按 id 并集合并，避免一端较旧整包覆盖另一端（复盘消失根因之一）。
 */
function isMergeablePlannerEntryArrayKey(key) {
    if (!key || typeof key !== 'string') return false;
    return key === 'planner_review_entries'
        || key === 'planner_review_archive_entries'
        || key.endsWith('_planner_review_entries')
        || key.endsWith('_planner_review_archive_entries')
        || key.endsWith('_planner_weekly_reviews')
        || key.endsWith('_planner_weekly_review_archive_entries')
        || key.endsWith('_planner_monthly_reviews');
}

function pickBetterPlannerEntry(a, b) {
    const ta = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
    if (tb !== ta) return tb > ta ? b : a;
    const weight = (e) => (typeof e === 'object' && e ? JSON.stringify(e).length : 0);
    return weight(b) >= weight(a) ? b : a;
}

function mergePlannerEntryArraysJson(serverRaw, clientRaw) {
    let serverArr;
    let clientArr;
    try {
        serverArr = JSON.parse(serverRaw);
    } catch (err) {
        return clientRaw;
    }
    try {
        clientArr = JSON.parse(clientRaw);
    } catch (err) {
        return serverRaw;
    }
    if (!Array.isArray(serverArr) || !Array.isArray(clientArr)) {
        return clientRaw;
    }
    const byId = new Map();
    serverArr.forEach((entry) => {
        if (!entry || entry.id === undefined || entry.id === null) return;
        byId.set(String(entry.id), entry);
    });
    clientArr.forEach((entry) => {
        if (!entry || entry.id === undefined || entry.id === null) return;
        const id = String(entry.id);
        const prev = byId.get(id);
        if (!prev) {
            byId.set(id, entry);
            return;
        }
        byId.set(id, pickBetterPlannerEntry(prev, entry));
    });
    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
        const da = String(a.date || a.weekKey || a.monthKey || '');
        const dbKey = String(b.date || b.weekKey || b.monthKey || '');
        if (da !== dbKey) return dbKey.localeCompare(da);
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return JSON.stringify(merged);
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function formatBackupName(ts) {
    return formatNamedBackup('planner-db', ts);
}

function formatNamedBackup(prefix, ts) {
    const date = new Date(ts);
    const pad2 = (value) => String(value).padStart(2, '0');
    const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const timePart = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
    return `${prefix}-${datePart}_${timePart}-${ts}.sqlite3`;
}

function getBackupFiles() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
        .filter(name => /^planner-db-.*\.sqlite3$/.test(name))
        .map((name) => {
            const fullPath = path.join(BACKUP_DIR, name);
            const stat = fs.statSync(fullPath);
            return { fullPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneBackups() {
    const backups = getBackupFiles();
    backups.slice(MAX_BACKUP_FILES).forEach((file) => {
        try {
            fs.unlinkSync(file.fullPath);
        } catch (err) {
            // ignore
        }
    });
}

function escapeSqlString(value) {
    return String(value || '').replace(/'/g, "''");
}

function recoverDatabaseFromBackup() {
    const backups = getBackupFiles();
    if (!backups.length) return false;

    for (let i = 0; i < backups.length; i += 1) {
        try {
            fs.copyFileSync(backups[i].fullPath, DB_FILE);
            return true;
        } catch (err) {
            // continue trying older backup
        }
    }

    return false;
}

function openDatabase() {
    try {
        return new DatabaseSync(DB_FILE);
    } catch (err) {
        const recovered = recoverDatabaseFromBackup();
        if (!recovered) throw err;
        return new DatabaseSync(DB_FILE);
    }
}

function initDatabaseSchema() {
    db.exec('PRAGMA journal_mode=DELETE');
    db.exec('PRAGMA synchronous=FULL');
    db.exec('PRAGMA foreign_keys=ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS storage_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            updated_at INTEGER NOT NULL DEFAULT 0
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS storage_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    db.exec(`
        INSERT INTO storage_meta (id, updated_at)
        VALUES (1, 0)
        ON CONFLICT(id) DO NOTHING
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS invite_codes (
            code TEXT PRIMARY KEY,
            label TEXT DEFAULT '',
            created_by TEXT DEFAULT '',
            used_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            used_at TEXT
        )
    `);
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
}

function accountHasExistingData(account) {
    const prefix = 'planner_acc_' + account + '_';
    const row = db.prepare("SELECT 1 FROM storage_kv WHERE key LIKE ? || '%' LIMIT 1").get(prefix);
    return !!row;
}

function tryUseInviteCode(code, account) {
    if (!code) return false;
    const row = db.prepare('SELECT code FROM invite_codes WHERE code = ? AND used_by IS NULL').get(code);
    if (!row) return false;
    db.prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE code = ?").run(account, code);
    return true;
}

function seedExperienceAccountUser() {
    try {
        const row = db.prepare('SELECT id FROM users WHERE account = ?').get(EXPERIENCE_ACCOUNT);
        if (!row) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = hashPassword('123456', salt);
            db.prepare('INSERT INTO users (account, password_hash, salt) VALUES (?, ?, ?)').run(EXPERIENCE_ACCOUNT, hash, salt);
        }
    } catch (_) {}
}

/** 合并账号：移除已废弃的 test 行（体验账号现为 demo） */
function removeObsoleteTestUser() {
    try {
        db.prepare('DELETE FROM users WHERE account = ?').run('test');
    } catch (_) {}
}

function readLegacyStorageFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            updatedAt: Number(parsed && parsed.updatedAt) || 0,
            data: sanitizeData(parsed && parsed.data)
        };
    } catch (err) {
        return null;
    }
}

function loadBestLegacyStorage() {
    const candidates = [
        readLegacyStorageFile(LEGACY_STORAGE_FILE),
        readLegacyStorageFile(LEGACY_LAST_GOOD_FILE)
    ].filter(Boolean);

    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return candidates[0];
}

function getDbUpdatedAt() {
    const row = db.prepare('SELECT updated_at FROM storage_meta WHERE id = 1').get();
    return Number(row && row.updated_at) || 0;
}

function getDbDataMap() {
    const rows = db.prepare('SELECT key, value FROM storage_kv').all();
    const raw = {};
    rows.forEach((row) => {
        if (!row || typeof row.key !== 'string') return;
        if (!shouldSyncKey(row.key)) return;
        if (typeof row.value !== 'string') return;
        raw[row.key] = row.value;
    });
    if (Utf8Utils && typeof Utf8Utils.repairStorageData === 'function') {
        return Utf8Utils.repairStorageData(raw);
    }
    return raw;
}

function seedDatabaseFromLegacyIfNeeded() {
    const countRow = db.prepare('SELECT COUNT(1) AS count FROM storage_kv').get();
    const kvCount = Number(countRow && countRow.count) || 0;
    const updatedAt = getDbUpdatedAt();
    if (kvCount > 0 || updatedAt > 0) return;

    const legacy = loadBestLegacyStorage();
    if (!legacy) return;
    if (!legacy.data || Object.keys(legacy.data).length === 0) return;

    writeStorage({
        updatedAt: legacy.updatedAt || Date.now(),
        data: legacy.data,
        mode: 'full'
    }, { skipBackup: true });
}

function writeDbBackupSnapshot() {
    const now = Date.now();
    if (now - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return;

    ensureDir(BACKUP_DIR);
    const backupPath = path.join(BACKUP_DIR, formatBackupName(now));
    const escapedPath = escapeSqlString(backupPath);
    db.exec(`VACUUM INTO '${escapedPath}'`);
    lastBackupAt = now;
    pruneBackups();
}

function readStorage() {
    return {
        updatedAt: getDbUpdatedAt(),
        data: getDbDataMap()
    };
}

function resolveTargetDirectory(rawTargetDir) {
    const targetText = String(rawTargetDir || '').trim();
    if (!targetText) {
        throw new Error('targetDir is required');
    }
    if (targetText.includes('\0')) {
        throw new Error('targetDir contains invalid characters');
    }

    const normalized = path.normalize(targetText);
    const resolved = path.isAbsolute(normalized)
        ? normalized
        : path.resolve(ROOT_DIR, normalized);

    if (!resolved.startsWith(ROOT_DIR + path.sep) && resolved !== ROOT_DIR) {
        throw new Error('Backup directory must be within the application directory');
    }
    return resolved;
}

function createManualBackupSnapshot(targetDir, prefix) {
    const now = Date.now();
    ensureDir(targetDir);

    let fileName = formatNamedBackup(prefix || 'planner-db-manual', now);
    let backupPath = path.join(targetDir, fileName);
    let suffix = 0;
    while (fs.existsSync(backupPath)) {
        suffix += 1;
        fileName = `${formatNamedBackup(prefix || 'planner-db-manual', now).replace(/\.sqlite3$/, '')}-${suffix}.sqlite3`;
        backupPath = path.join(targetDir, fileName);
    }

    const escapedPath = escapeSqlString(backupPath);
    db.exec(`VACUUM INTO '${escapedPath}'`);

    return {
        ok: true,
        fileName,
        backupPath,
        createdAt: now
    };
}

function pickDirectoryWithExplorer() {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            reject(new Error('Folder picker is only supported on Windows'));
            return;
        }

        const script = [
            'Add-Type -AssemblyName System.Windows.Forms',
            'Add-Type -AssemblyName System.Drawing',
            '$owner = New-Object System.Windows.Forms.Form',
            '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
            '$owner.Size = New-Object System.Drawing.Size(1,1)',
            '$owner.ShowInTaskbar = $false',
            '$owner.TopMost = $true',
            '$owner.Opacity = 0',
            '$owner.Show()',
            '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
            "$dialog.Description = '请选择备份目录'",
            '$dialog.ShowNewFolderButton = $true',
            '$dialog.AutoUpgradeEnabled = $true',
            '$result = $dialog.ShowDialog($owner)',
            '$owner.Close()',
            'if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {',
            '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
            '  Write-Output $dialog.SelectedPath',
            '}'
        ].join('; ');

        const child = spawn('powershell.exe', ['-NoProfile', '-Sta', '-Command', script], {
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (err) => {
            reject(err);
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `Folder picker exited with code ${code}`));
                return;
            }

            const pickedPath = stdout
                .split(/\r?\n/)
                .map(text => text.trim())
                .filter(Boolean)
                .pop() || '';

            if (!pickedPath) {
                resolve({ cancelled: true, path: '' });
                return;
            }

            resolve({ cancelled: false, path: pickedPath });
        });
    });
}

function openFolderInExplorer(targetDir) {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            reject(new Error('Open folder is only supported on Windows'));
            return;
        }

        const normalized = path.normalize(targetDir);
        try {
            if (!fs.existsSync(normalized)) {
                ensureDir(normalized);
            }
        } catch (err) {
            reject(new Error('Failed to prepare target directory'));
            return;
        }

        let stat = null;
        try {
            stat = fs.statSync(normalized);
        } catch (err) {
            reject(new Error('Target path is not accessible'));
            return;
        }

        if (!stat.isDirectory()) {
            reject(new Error('Target path is not a directory'));
            return;
        }

        const escaped = normalized.replace(/'/g, "''");
        const command = `Start-Process explorer.exe -ArgumentList @('${escaped}')`;
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
            windowsHide: true
        });

        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (err) => {
            reject(err || new Error('Failed to start explorer'));
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `Open folder process exited with code ${code}`));
        });
    });
}

function buildNextStorage(current, payload) {
    const mode = payload && payload.mode === 'patch' ? 'patch' : 'full';
    const updatedAt = Number(payload && payload.updatedAt) || Date.now();

    if (mode === 'patch') {
        const nextData = payload && payload.clearAllSyncKeys === true
            ? {}
            : { ...(current && current.data ? current.data : {}) };
        const patchSource = payload && payload.patchData && typeof payload.patchData === 'object'
            ? payload.patchData
            : (payload && payload.data);
        const patch = sanitizePatchData(patchSource);
        Object.keys(patch).forEach((key) => {
            if (patch[key] === null) {
                delete nextData[key];
            } else if (isMergeablePlannerEntryArrayKey(key) && typeof nextData[key] === 'string' && typeof patch[key] === 'string') {
                nextData[key] = mergePlannerEntryArraysJson(nextData[key], patch[key]);
            } else {
                nextData[key] = patch[key];
            }
        });
        return { updatedAt, data: nextData };
    }

    return {
        updatedAt,
        data: sanitizeData(payload && payload.data)
    };
}

const clearStorageStmt = () => db.prepare('DELETE FROM storage_kv');
const upsertStorageStmt = () => db.prepare('INSERT OR REPLACE INTO storage_kv (key, value) VALUES (?, ?)');
const updateStorageMetaStmt = () => db.prepare('UPDATE storage_meta SET updated_at = ? WHERE id = 1');

function writeStorage(payload, options = {}) {
    const current = options.current || readStorage();
    const next = buildNextStorage(current, payload || {});

    if (!options.skipBackup) {
        writeDbBackupSnapshot();
    }

    const clearStmt = clearStorageStmt();
    const upsertStmt = upsertStorageStmt();
    const metaStmt = updateStorageMetaStmt();

    db.exec('BEGIN IMMEDIATE');
    try {
        clearStmt.run();
        Object.keys(next.data || {}).forEach((key) => {
            const value = next.data[key];
            if (typeof value === 'string') {
                upsertStmt.run(key, value);
            }
        });
        metaStmt.run(next.updatedAt);
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }

    return next;
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalLen = 0;
        req.on('data', (chunk) => {
            chunks.push(chunk);
            totalLen += chunk.length;
            if (totalLen > 5 * 1024 * 1024) {
                reject(new Error('Payload too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, code, payload) {
    res.writeHead(code, getCorsHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }));
    res.end(JSON.stringify(payload));
}

function handleStorageApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
            'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
    }

    if (req.method === 'GET') {
        sendJson(res, 200, readStorage());
        return;
    }

    if (req.method === 'POST') {
        parseBody(req)
            .then((payload) => {
                const current = readStorage();
                const incoming = {
                    updatedAt: Number(payload.updatedAt) || Date.now(),
                    data: payload.data,
                    patchData: payload.patchData,
                    mode: payload.mode === 'patch' ? 'patch' : 'full',
                    clearAllSyncKeys: payload.clearAllSyncKeys === true
                };

                if (incoming.updatedAt >= current.updatedAt) {
                    const next = writeStorage(incoming, { current });
                    sendJson(res, 200, next);
                    return;
                }

                sendJson(res, 200, current);
            })
            .catch((err) => {
                sendJson(res, 400, { error: err.message || 'Bad request' });
            });
        return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
}

function handleBackupApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
            'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
    }

    if (req.method === 'GET') {
        let snapshot = null;
        try {
            snapshot = createManualBackupSnapshot(BACKUP_DIR, 'planner-db-export');
        } catch (err) {
            sendJson(res, 500, { ok: false, error: err.message || 'Failed to create backup snapshot' });
            return;
        }

        fs.readFile(snapshot.backupPath, (err, data) => {
            try {
                fs.unlinkSync(snapshot.backupPath);
            } catch (unlinkErr) {
                // ignore
            }

            if (err) {
                sendJson(res, 500, { ok: false, error: 'Failed to read backup snapshot' });
                return;
            }

            res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${snapshot.fileName}"`,
                'Content-Length': String(data.length),
                'X-Backup-Filename': snapshot.fileName,
                'Access-Control-Expose-Headers': 'X-Backup-Filename, Content-Disposition',
                'Cache-Control': 'no-store'
            }));
            res.end(data);
        });
        return;
    }

    if (req.method === 'POST') {
        parseBody(req)
            .then((payload) => {
                const targetDir = resolveTargetDirectory(payload && payload.targetDir);
                const snapshot = createManualBackupSnapshot(targetDir, 'planner-db-manual');
                sendJson(res, 200, {
                    ok: true,
                    targetDir,
                    backupPath: snapshot.backupPath,
                    fileName: snapshot.fileName,
                    createdAt: snapshot.createdAt
                });
            })
            .catch((err) => {
                sendJson(res, 400, { ok: false, error: err.message || 'Backup request failed' });
            });
        return;
    }

    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
}

function handleFolderPickerApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
            'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }

    pickDirectoryWithExplorer()
        .then((result) => {
            sendJson(res, 200, {
                ok: true,
                cancelled: result.cancelled === true,
                path: result.path || ''
            });
        })
        .catch((err) => {
            sendJson(res, 500, {
                ok: false,
                error: err && err.message ? err.message : 'Failed to open folder picker'
            });
        });
}

function handleRestoreListApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({ 'Access-Control-Max-Age': '86400' }));
        res.end();
        return;
    }
    if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }
    const backups = getBackupFiles();
    const list = backups.map((b, idx) => ({
        index: idx,
        fileName: path.basename(b.fullPath),
        mtimeMs: b.mtimeMs,
        mtime: new Date(b.mtimeMs).toISOString()
    }));
    sendJson(res, 200, { ok: true, backups: list });
}

function restoreFromBackupFile(backupFullPath) {
    const backupDb = new DatabaseSync(backupFullPath);
    const rows = backupDb.prepare('SELECT key, value FROM storage_kv').all();
    const metaRow = backupDb.prepare('SELECT updated_at FROM storage_meta WHERE id = 1').get();
    const updatedAt = Number(metaRow && metaRow.updated_at) || 0;
    backupDb.close();

    const clearStmt = db.prepare('DELETE FROM storage_kv');
    const upsertStmt = db.prepare('INSERT OR REPLACE INTO storage_kv (key, value) VALUES (?, ?)');
    const metaStmt = db.prepare('UPDATE storage_meta SET updated_at = ? WHERE id = 1');

    db.exec('BEGIN IMMEDIATE');
    try {
        clearStmt.run();
        rows.forEach((row) => {
            if (row && typeof row.key === 'string' && typeof row.value === 'string') {
                upsertStmt.run(row.key, row.value);
            }
        });
        metaStmt.run(updatedAt);
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function handleRestoreApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({ 'Access-Control-Max-Age': '86400' }));
        res.end();
        return;
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }
    parseBody(req)
        .then((payload) => {
            const backups = getBackupFiles();
            const index = Number(payload && payload.index);
            if (!backups.length) {
                sendJson(res, 400, { ok: false, error: '没有可用的备份文件' });
                return;
            }
            const idx = Number.isFinite(index) && index >= 0
                ? Math.min(index, backups.length - 1)
                : 0;
            const backup = backups[idx];
            const normalizedPath = path.normalize(backup.fullPath);
            if (!normalizedPath.startsWith(BACKUP_DIR + path.sep) && path.dirname(normalizedPath) !== BACKUP_DIR) {
                sendJson(res, 403, { ok: false, error: 'Invalid backup path' });
                return;
            }
            restoreFromBackupFile(backup.fullPath);
            sendJson(res, 200, {
                ok: true,
                restoredFrom: path.basename(backup.fullPath),
                message: '数据已从备份恢复，请刷新页面'
            });
        })
        .catch((err) => {
            sendJson(res, 500, { ok: false, error: err && err.message ? err.message : '恢复失败' });
        });
}

function handleOpenFolderApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
            'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }

    parseBody(req)
        .then((payload) => {
            const targetDir = resolveTargetDirectory(payload && payload.targetDir);
            return openFolderInExplorer(targetDir)
                .then(() => {
                    sendJson(res, 200, {
                        ok: true,
                        targetDir
                    });
                });
        })
        .catch((err) => {
            sendJson(res, 400, {
                ok: false,
                error: err && err.message ? err.message : 'Failed to open folder'
            });
        });
}

function serveStatic(req, res, pathname) {
    let relativePath = pathname === '/' ? '/index.html' : pathname;
    try {
        relativePath = decodeURIComponent(relativePath);
    } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
    }

    const absolutePath = path.normalize(path.join(ROOT_DIR, relativePath));
    if (!absolutePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    const BLOCKED_PATTERNS = [
        /\.sqlite3$/i, /\.env$/i, /^\/\.planner-/i, /^\/backups(\/|$)/i,
        /^\/node_modules(\/|$)/i, /^\/deploy(\/|$)/i, /^\/dev-server\.js$/i,
        /^\/generate-invite\.js$/i, /^\/package\.json$/i, /^\/package-lock\.json$/i, /^\/\.nvmrc$/i,
        /\.bat$/i, /\.bak$/i, /\.sh$/i, /^\/tmp-/i, /^\/__(.*?)\.js$/i,
    ];
    if (BLOCKED_PATTERNS.some(p => p.test(relativePath))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(absolutePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const type = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
}

function initStorageLayer() {
    ensureDir(path.dirname(DB_FILE));
    db = openDatabase();
    initDatabaseSchema();
    seedDatabaseFromLegacyIfNeeded();
    removeObsoleteTestUser();
    seedExperienceAccountUser();
}

initStorageLayer();

function handleAuth(req, res, pathname) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({ 'Access-Control-Max-Age': '86400' }));
        res.end();
        return;
    }

    if (pathname === '/api/auth/session') {
        if (req.method === 'GET') {
            sendJson(res, 200, { ok: isReqAuthenticated(req) });
            return;
        }
        if (req.method === 'DELETE') {
            const token = getReqSession(req);
            if (token) activeSessions.delete(token);
            res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/json; charset=utf-8',
                'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
            }));
            res.end(JSON.stringify({ ok: true }));
            return;
        }
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
        parseBody(req).then(body => {
            const account = String((body && body.account) || '').trim();
            const password = String((body && body.password) || '');
            if (!account || !password) {
                sendJson(res, 400, { ok: false, error: '请输入账号和密码' });
                return;
            }
            let user = db.prepare('SELECT * FROM users WHERE account = ?').get(account);
            if (!user) {
                if (accountHasExistingData(account)) {
                    const salt = crypto.randomBytes(16).toString('hex');
                    const hash = hashPassword(password, salt);
                    db.prepare('INSERT INTO users (account, password_hash, salt) VALUES (?, ?, ?)').run(account, hash, salt);
                    user = db.prepare('SELECT * FROM users WHERE account = ?').get(account);
                } else {
                    sendJson(res, 401, { ok: false, error: '账号未注册，请先注册。' });
                    return;
                }
            } else if (hashPassword(password, user.salt) !== user.password_hash) {
                sendJson(res, 401, { ok: false, error: '密码错误' });
                return;
            }
            const isExperience = user.account.toLowerCase() === EXPERIENCE_ACCOUNT;
            const sessionTtl = isExperience ? EXPERIENCE_SESSION_MS : SESSION_MAX_AGE_MS;
            const token = createSession(sessionTtl);
            res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Set-Cookie': sessionCookieHeader(token, sessionTtl)
            }));
            res.end(JSON.stringify({
                ok: true,
                account: user.account,
                ...(isExperience ? { experienceTest: true, sessionTtlMs: EXPERIENCE_SESSION_MS } : {})
            }));
        }).catch(() => sendJson(res, 400, { ok: false, error: 'Bad request' }));
        return;
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
        parseBody(req).then(body => {
            const account = String((body && body.account) || '').trim();
            const password = String((body && body.password) || '');
            const inviteCode = String((body && body.inviteCode) || '').trim();
            if (!account || !password) {
                sendJson(res, 400, { ok: false, error: '请输入账号和密码' });
                return;
            }
            if (account.toLowerCase() === EXPERIENCE_ACCOUNT) {
                sendJson(res, 400, { ok: false, error: '体验账号 demo 由系统预留，不可注册。' });
                return;
            }
            const existing = db.prepare('SELECT id FROM users WHERE account = ?').get(account);
            if (existing) {
                sendJson(res, 409, { ok: false, error: '该账号已注册，请直接登录。' });
                return;
            }
            const isAdminCode = inviteCode && inviteCode === ACCESS_CODE;
            const isValidInvite = !isAdminCode && tryUseInviteCode(inviteCode, account);
            const hasData = accountHasExistingData(account);
            if (!isAdminCode && !isValidInvite && !hasData) {
                sendJson(res, 403, { ok: false, error: '注册码无效。新用户注册需要有效的注册码。' });
                return;
            }
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = hashPassword(password, salt);
            db.prepare('INSERT INTO users (account, password_hash, salt) VALUES (?, ?, ?)').run(account, hash, salt);
            const token = createSession();
            res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Set-Cookie': sessionCookieHeader(token)
            }));
            res.end(JSON.stringify({ ok: true, account }));
        }).catch(() => sendJson(res, 400, { ok: false, error: 'Bad request' }));
        return;
    }

    if (pathname === '/api/auth/deregister' && req.method === 'POST') {
        if (!isReqAuthenticated(req)) {
            sendJson(res, 401, { ok: false, error: '请先登录' });
            return;
        }
        parseBody(req).then(body => {
            const account = String((body && body.account) || '').trim();
            const password = String((body && body.password) || '');
            if (!account) {
                sendJson(res, 400, { ok: false, error: '请提供账号' });
                return;
            }
            if (!password) {
                sendJson(res, 400, { ok: false, error: '请输入密码' });
                return;
            }
            if (account.toLowerCase() === EXPERIENCE_ACCOUNT) {
                sendJson(res, 400, { ok: false, error: '体验账号不可注销' });
                return;
            }
            const user = db.prepare('SELECT * FROM users WHERE account = ?').get(account);
            if (!user) {
                sendJson(res, 404, { ok: false, error: '账号不存在' });
                return;
            }
            if (hashPassword(password, user.salt) !== user.password_hash) {
                sendJson(res, 401, { ok: false, error: '密码错误' });
                return;
            }
            const deleted = db.prepare('DELETE FROM users WHERE account = ?').run(account);
            const token = getReqSession(req);
            if (token) activeSessions.delete(token);
            res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/json; charset=utf-8',
                'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
            }));
            res.end(JSON.stringify({ ok: true, deleted: deleted.changes > 0 }));
        }).catch(() => sendJson(res, 400, { ok: false, error: 'Bad request' }));
        return;
    }

    if (pathname === '/api/auth/invite' && req.method === 'POST') {
        if (!isReqAuthenticated(req)) {
            sendJson(res, 401, { error: 'Unauthorized' });
            return;
        }
        parseBody(req).then(body => {
            const label = String((body && body.label) || '').trim();
            const code = crypto.randomBytes(8).toString('base64url');
            const createdBy = getReqSession(req);
            db.prepare('INSERT INTO invite_codes (code, label, created_by) VALUES (?, ?, ?)').run(code, label, createdBy);
            sendJson(res, 200, { ok: true, code, label });
        }).catch(() => sendJson(res, 400, { ok: false, error: 'Bad request' }));
        return;
    }

    if (pathname === '/api/auth/invite' && req.method === 'GET') {
        if (!isReqAuthenticated(req)) {
            sendJson(res, 401, { error: 'Unauthorized' });
            return;
        }
        const codes = db.prepare('SELECT code, label, used_by, created_at, used_at FROM invite_codes ORDER BY created_at DESC').all();
        sendJson(res, 200, { ok: true, codes });
        return;
    }

    sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    const origin = req.headers.origin || '';
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }

    if (url.pathname.startsWith('/api/auth/')) {
        handleAuth(req, res, url.pathname);
        return;
    }

    if (url.pathname.startsWith('/api/') && req.method !== 'OPTIONS') {
        if (!isReqAuthenticated(req)) {
            sendJson(res, 401, { error: 'Unauthorized' });
            return;
        }
    }

    if (url.pathname === '/api/storage') {
        handleStorageApi(req, res);
        return;
    }

    if (url.pathname === '/api/backup-db') {
        handleBackupApi(req, res);
        return;
    }

    if (url.pathname === '/api/pick-folder') {
        handleFolderPickerApi(req, res);
        return;
    }

    if (url.pathname === '/api/open-folder') {
        handleOpenFolderApi(req, res);
        return;
    }

    if (url.pathname === '/api/restore/list') {
        handleRestoreListApi(req, res);
        return;
    }

    if (url.pathname === '/api/restore') {
        handleRestoreApi(req, res);
        return;
    }

    serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
    console.log(`Planner server running: http://${HOST}:${PORT}`);
    console.log(`Shared storage API: http://${HOST}:${PORT}/api/storage`);
    console.log(`SQLite database file: ${DB_FILE}`);
    console.log(`SQLite backup directory: ${BACKUP_DIR}`);
    console.log(`Legacy JSON (migration source): ${LEGACY_STORAGE_FILE}`);
    console.log();
    console.log('========================================');
    console.log(`  注册码: ${ACCESS_CODE}`);
    console.log('  (新用户注册时需要输入此码)');
    console.log('  已有账号直接输入账号密码登录即可');
    console.log('========================================');
    console.log();
});
