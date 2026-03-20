#!/usr/bin/env node
// 生成一次性注册邀请码
// 用法:  node generate-invite.js [备注]
// 示例:  node generate-invite.js "给小王"

const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const label = process.argv.slice(2).join(' ').trim();
const DB_FILE = path.join(__dirname, 'planner-data.sqlite3');

let db;
try {
    db = new DatabaseSync(DB_FILE);
} catch (err) {
    console.error('无法打开数据库，请确认 planner-data.sqlite3 存在（先启动一次服务）。');
    process.exit(1);
}

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

const code = crypto.randomBytes(8).toString('base64url');
db.prepare('INSERT INTO invite_codes (code, label, created_by) VALUES (?, ?, ?)')
    .run(code, label, 'cli');

console.log();
console.log('  ✅ 邀请码已生成');
console.log();
console.log(`     ${code}`);
if (label) console.log(`     备注: ${label}`);
console.log();
console.log('  发给对方，注册时填入「注册码」即可（一人一码，用完失效）');
console.log();

const all = db.prepare(
    'SELECT code, label, used_by, created_at, used_at FROM invite_codes ORDER BY created_at DESC'
).all();

if (all.length > 1 || (all.length === 1 && all[0].used_by)) {
    console.log('  ─── 所有邀请码 ───');
    all.forEach(row => {
        const status = row.used_by
            ? `✗ 已使用 → ${row.used_by} (${row.used_at})`
            : '○ 未使用';
        const lbl = row.label ? ` [${row.label}]` : '';
        console.log(`  ${row.code}${lbl}  ${status}`);
    });
    console.log();
}

db.close();
