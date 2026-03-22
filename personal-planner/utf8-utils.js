/**
 * UTF-8 乱码检测与修复工具
 * 用于防止和修复 UTF-8 被错误解析为 Latin-1/GBK 等编码导致的乱码
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (typeof window !== 'undefined') {
        root.Utf8Utils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** 已知乱码 → 正确文本的映射（UTF-8 被误读为 Latin-1 的常见结果） */
    var KNOWN_MOJIBAKE_MAP = {
        '甯哥敤宸ュ叿': '常用工具',
        '瀛︿範璧勬簮': '学习资源',
        '濞变箰浼戦棽': '娱乐休闲',
        '鎼滅储寮曟搸': '搜索引擎',
        '浠ｇ爜鎵樼骞冲彴': '代码托管平台',
        '瑙嗛缃戠珯': '视频网站',
        '寮€鍙戞枃妗': 'Web 开发文档'
    };

    /**
     * 尝试修复 UTF-8 被误读为 Latin-1 的乱码
     * 仅当字符串全部为 Latin-1 可表示字符（0-255）时尝试，否则返回 null
     */
    function tryRepairLatin1Mojibake(str) {
        if (typeof str !== 'string' || str.length === 0) return null;
        var bytes = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i += 1) {
            var c = str.charCodeAt(i);
            if (c > 0xFF) return null;
            bytes[i] = c;
        }
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return null;
        }
    }

    /**
     * 检测字符串是否可能为乱码（含替换符、问号、已知乱码模式等）
     */
    function looksCorrupted(str) {
        if (typeof str !== 'string') return true;
        if (/\uFFFD/.test(str)) return true;
        if (/\?{2,}/.test(str)) return true;
        if (/[甯瀛濞鎼浠瑙嗛寮曟搸樼骞冲彴馃鈥€锟]/.test(str)) return true;
        return false;
    }

    /**
     * 对字符串进行乱码修复，返回修复后的结果
     * 优先使用已知映射，其次尝试 Latin-1 修复
     */
    function repairString(str) {
        if (typeof str !== 'string') return str;
        var s = str;
        s = s.replace(/\uFFFD/g, '');
        var trimmed = s.trim();
        if (!trimmed) return s;

        var mapped = KNOWN_MOJIBAKE_MAP[trimmed];
        if (mapped) return mapped;

        if (trimmed.includes('寮€鍙戞枃妗')) return trimmed.replace(/寮€鍙戞枃妗/g, 'Web 开发文档');

        var repaired = tryRepairLatin1Mojibake(s);
        if (repaired !== null && !looksCorrupted(repaired)) return repaired;

        return s;
    }

    /**
     * 确保字符串为有效 UTF-8 文本，若检测到乱码则尝试修复
     * 对 JSON 内的字符串递归处理
     */
    function ensureValidUtf8(value) {
        if (typeof value === 'string') {
            if (looksCorrupted(value)) {
                var fixed = repairString(value);
                return fixed !== value ? fixed : value;
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(ensureValidUtf8);
        }
        if (value && typeof value === 'object') {
            var out = {};
            for (var k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    out[k] = ensureValidUtf8(value[k]);
                }
            }
            return out;
        }
        return value;
    }

    var STRUCTURED_JSON_KEYS = /^(reviews|planner_review_entries|planner_review_archive|planner_weekly_reviews|life_categories|life_sites|planner_todos|planner_okrs|planner_acc_|planner_reward_pool)/;

    /**
     * 对存储对象中所有字符串值进行乱码修复
     * 对结构化 JSON 键（复盘、待办等）始终递归修复，不依赖 looksCorrupted
     */
    function repairStorageData(data) {
        if (!data || typeof data !== 'object') return data;
        var result = {};
        for (var key in data) {
            if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
            var val = data[key];
            if (typeof val === 'string') {
                var shouldRepair = looksCorrupted(val) || STRUCTURED_JSON_KEYS.test(key);
                if (shouldRepair) {
                    try {
                        var parsed = JSON.parse(val);
                        val = JSON.stringify(ensureValidUtf8(parsed));
                    } catch (e) {
                        val = repairString(val);
                    }
                }
                result[key] = val;
            }
        }
        return result;
    }

    return {
        tryRepairLatin1Mojibake: tryRepairLatin1Mojibake,
        looksCorrupted: looksCorrupted,
        repairString: repairString,
        ensureValidUtf8: ensureValidUtf8,
        repairStorageData: repairStorageData
    };
}));
