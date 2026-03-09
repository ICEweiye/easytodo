const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;
const STORAGE_FILE = path.join(ROOT_DIR, '.planner-shared-storage.json');

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

function readStorage() {
    try {
        const content = fs.readFileSync(STORAGE_FILE, 'utf8');
        const parsed = JSON.parse(content);
        return {
            updatedAt: Number(parsed.updatedAt) || 0,
            data: sanitizeData(parsed.data)
        };
    } catch (err) {
        return { updatedAt: 0, data: {} };
    }
}

function writeStorage(payload) {
    const data = {
        updatedAt: Number(payload.updatedAt) || Date.now(),
        data: sanitizeData(payload.data)
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return data;
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
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function handleStorageApi(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        });
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
                const incoming = {
                    updatedAt: Number(payload.updatedAt) || Date.now(),
                    data: sanitizeData(payload.data)
                };

                const current = readStorage();
                if (incoming.updatedAt >= current.updatedAt) {
                    const next = writeStorage(incoming);
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

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (url.pathname === '/api/storage') {
        handleStorageApi(req, res);
        return;
    }

    serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
    console.log(`Planner server running: http://${HOST}:${PORT}`);
    console.log(`Shared storage API: http://${HOST}:${PORT}/api/storage`);
});
