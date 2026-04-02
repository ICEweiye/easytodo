/**
 * UTF-8 乱码检测与修复工具（安全版）
 *
 * 设计原则：绝不删除或替换用户内容中的任何字符。
 * 修复仅限于：整段完全匹配已知乱码映射表的短字符串（如站点分类名）。
 * 对用户撰写的长文本（复盘、待办等），原样保留语义内容。
 * 例外：移除不成对的 UTF-16 代理项（会导致界面显示为「�」），属于修复损坏数据而非删改正文。
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

    /**
     * 将「UTF-8 字节被误当成 Latin-1 字符」的长文本还原为 Unicode。
     * 仅当每个 code unit ≤0xFF 时才尝试（已是正常 UTF-16 中文的字符串不会误伤）。
     * 使用 fatal UTF-8 解码：非法序列则保持原串，避免破坏合法西欧字符等。
     */
    function repairMojibakeUtf8(str) {
        if (typeof str !== 'string' || str.length === 0) return str;
        if (str.length > 500000) return str;
        var i;
        for (i = 0; i < str.length; i += 1) {
            if (str.charCodeAt(i) > 0xFF) return str;
        }
        var bytes = new Uint8Array(str.length);
        for (i = 0; i < str.length; i += 1) {
            bytes[i] = str.charCodeAt(i);
        }
        if (typeof TextDecoder === 'undefined') return str;
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (e) {
            return str;
        }
    }

    /**
     * 仅对完全由 Latin-1 范围字符（≤0xFF）组成的短字符串判定为乱码候选（用于 storage 批量修复等）。
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
     * 去掉不成对的 UTF-16 代理项（例如在 emoji 处被错误按「长度」截断后会产生），避免界面出现「�」。
     */
    function stripUnpairedSurrogates(str) {
        if (typeof str !== 'string' || str.length === 0) return str;
        var i = 0;
        var needStrip = false;
        while (i < str.length) {
            var c = str.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF) {
                var n = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
                if (n >= 0xDC00 && n <= 0xDFFF) {
                    i += 2;
                    continue;
                }
                needStrip = true;
                break;
            }
            if (c >= 0xDC00 && c <= 0xDFFF) {
                needStrip = true;
                break;
            }
            i += 1;
        }
        if (!needStrip) return str;
        var out = '';
        i = 0;
        while (i < str.length) {
            var c2 = str.charCodeAt(i);
            if (c2 >= 0xD800 && c2 <= 0xDBFF && i + 1 < str.length) {
                var d = str.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) {
                    out += str.slice(i, i + 2);
                    i += 2;
                    continue;
                }
            }
            if (c2 >= 0xD800 && c2 <= 0xDFFF) {
                i += 1;
                continue;
            }
            out += str.charAt(i);
            i += 1;
        }
        return out;
    }

    /**
     * 按 Unicode 码点截断（避免 String.slice 在 emoji 等处截断代理对导致「�」）。
     * suffix 在发生截断时追加，未截断时不加。
     */
    function truncateByCodePoints(str, maxLen, suffix) {
        if (typeof str !== 'string' || maxLen <= 0) return '';
        suffix = suffix === undefined ? '...' : suffix;
        var chars = Array.from(str);
        if (chars.length <= maxLen) return str;
        return chars.slice(0, maxLen).join('') + suffix;
    }

    /**
     * 非破坏性修复：已知短映射 → Latin-1 字节按 UTF-8 解码（任意长度）→ 去掉坏代理项。
     */
    function repairString(str) {
        if (typeof str !== 'string') return str;

        var trimmed = str.trim();
        if (!trimmed) return stripUnpairedSurrogates(str);

        var mapped = KNOWN_MOJIBAKE_MAP[trimmed];
        if (mapped) return stripUnpairedSurrogates(mapped);

        var repaired = repairMojibakeUtf8(str);
        var out = repaired !== str ? repaired : str;
        return stripUnpairedSurrogates(out);
    }

    /**
     * 递归处理 JSON 结构中的字符串（含乱码修复与坏代理项清理）。
     */
    function ensureValidUtf8(value) {
        if (typeof value === 'string') {
            return repairString(value);
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
        repairMojibakeUtf8: repairMojibakeUtf8,
        looksCorrupted: looksCorrupted,
        stripUnpairedSurrogates: stripUnpairedSurrogates,
        truncateByCodePoints: truncateByCodePoints,
        repairString: repairString,
        ensureValidUtf8: ensureValidUtf8,
        repairStorageData: repairStorageData
    };
}));
