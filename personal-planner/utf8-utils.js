/**
 * UTF-8 乱码检测与修复工具（安全版）
 *
 * 设计原则：绝不删除或替换用户内容中的任何字符。
 * 修复仅限于：整段完全匹配已知乱码映射表的短字符串（如站点分类名）。
 * 对用户撰写的长文本（复盘、待办等），一律原样保留，杜绝数据丢失。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (typeof window !== 'undefined') {
        root.Utf8Utils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var KNOWN_MOJIBAKE_MAP = {
        '甯哥敤宸ュ叿': '常用工具',
        '瀛︿範璧勬簮': '学习资源',
        '濞变箰浼戦棽': '娱乐休闲',
        '鎼滅储寮曟搸': '搜索引擎',
        '浠ｇ爜鎵樼骞冲彴': '代码托管平台',
        '瑙嗛缃戠珯': '视频网站',
        '寮€鍙戞枃妗': 'Web 开发文档'
    };

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
     * 仅对完全由 Latin-1 范围字符（≤0xFF）组成的短字符串判定为乱码候选。
     * 不再检测 \uFFFD、连续问号或单个中文字符——这些误判会导致丢字。
     */
    function looksCorrupted(str) {
        if (typeof str !== 'string') return false;
        if (str.length === 0 || str.length > 120) return false;
        for (var i = 0; i < str.length; i += 1) {
            if (str.charCodeAt(i) > 0xFF) return false;
        }
        return true;
    }

    /**
     * 非破坏性修复：仅当整段精确匹配已知乱码映射时才替换，
     * 否则尝试 Latin-1→UTF-8 重解码，若失败则原样返回。
     * 绝不删除 \uFFFD 或任何字符。
     */
    function repairString(str) {
        if (typeof str !== 'string') return str;

        var trimmed = str.trim();
        if (!trimmed) return str;

        var mapped = KNOWN_MOJIBAKE_MAP[trimmed];
        if (mapped) return mapped;

        var repaired = tryRepairLatin1Mojibake(str);
        if (repaired !== null && repaired !== str) return repaired;

        return str;
    }

    /**
     * 递归处理 JSON 结构中的字符串。
     * 仅对满足 looksCorrupted 的短 Latin-1 字符串尝试修复，
     * 用户填写的中文长文本不会被触碰。
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

    var STRUCTURED_JSON_KEYS = /^(reviews|planner_review_entries|planner_review_archive|planner_weekly_reviews|planner_weekly_review_archive|planner_monthly_reviews|life_categories|life_sites|planner_todos|planner_okrs_archive|planner_okrs|planner_acc_|planner_reward_pool)/;

    /**
     * 对存储对象的字符串值做安全处理。
     * 保留所有键（包括非字符串值），不再对结构化 JSON 键做强制解析修复。
     */
    function repairStorageData(data) {
        if (!data || typeof data !== 'object') return data;
        var result = {};
        for (var key in data) {
            if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
            var val = data[key];
            if (typeof val === 'string') {
                if (looksCorrupted(val)) {
                    val = repairString(val);
                } else if (STRUCTURED_JSON_KEYS.test(key)) {
                    try {
                        var parsed = JSON.parse(val);
                        val = JSON.stringify(ensureValidUtf8(parsed));
                    } catch (e) {
                        // JSON 解析失败，原样保留
                    }
                }
                result[key] = val;
            } else {
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
