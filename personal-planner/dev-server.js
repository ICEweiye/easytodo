const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const HOST = '127.0.0.1';
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
        'Access-Control-Allow-Origin': '*',
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
        if (typeof value === 'string' || value === null) {
            patch[key] = value;
        }
    });

    return patch;
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
    const data = {};
    rows.forEach((row) => {
        if (!row || typeof row.key !== 'string') return;
        if (!shouldSyncKey(row.key)) return;
        if (typeof row.value !== 'string') return;
        data[row.key] = row.value;
    });
    return data;
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
    return path.isAbsolute(normalized)
        ? normalized
        : path.resolve(ROOT_DIR, normalized);
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
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString('utf8');
            if (body.length > 5 * 1024 * 1024) {
                reject(new Error('Payload too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
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
}

initStorageLayer();

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

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

    serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
    console.log(`Planner server running: http://${HOST}:${PORT}`);
    console.log(`Shared storage API: http://${HOST}:${PORT}/api/storage`);
    console.log(`SQLite database file: ${DB_FILE}`);
    console.log(`SQLite backup directory: ${BACKUP_DIR}`);
    console.log(`Legacy JSON (migration source): ${LEGACY_STORAGE_FILE}`);
});
