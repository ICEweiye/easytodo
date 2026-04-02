/**
 * 国务院办公厅公布的放假调休安排：
 * - 休息日（显示「休」）
 * - 调休补班日（显示「班」）
 * 数据需按年度国务院通知更新；未收录年份将不出现对应标记。
 */
(function (global) {
    'use strict';

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function add(set, y, m, d) {
        set.add(`${y}-${pad2(m)}-${pad2(d)}`);
    }

    function range(set, y, m, dStart, dEnd) {
        for (let d = dStart; d <= dEnd; d += 1) {
            add(set, y, m, d);
        }
    }

    function buildRestSet() {
        const S = new Set();

        // 2024 — 国办发明电〔2023〕7 号
        add(S, 2024, 1, 1);
        range(S, 2024, 2, 10, 17);
        range(S, 2024, 4, 4, 6);
        range(S, 2024, 5, 1, 5);
        add(S, 2024, 6, 10);
        range(S, 2024, 9, 15, 17);
        range(S, 2024, 10, 1, 7);

        // 2025 — 国办发明电〔2024〕12 号（全体公民假日自 2025-01-01 起 +2 天）
        add(S, 2025, 1, 1);
        range(S, 2025, 1, 28, 31);
        range(S, 2025, 2, 1, 4);
        range(S, 2025, 4, 4, 6);
        range(S, 2025, 5, 1, 5);
        range(S, 2025, 5, 31, 31);
        range(S, 2025, 6, 1, 2);
        range(S, 2025, 10, 1, 8);

        // 2026 — 国办发明电〔2025〕7 号
        range(S, 2026, 1, 1, 3);
        range(S, 2026, 2, 15, 23);
        range(S, 2026, 4, 4, 6);
        range(S, 2026, 5, 1, 5);
        range(S, 2026, 6, 19, 21);
        range(S, 2026, 9, 25, 27);
        range(S, 2026, 10, 1, 7);

        return S;
    }

    /** 调休需上班的周末（「班」）— 与放假通知中「上班」日期一致 */
    function buildWorkSet() {
        const S = new Set();

        // 2024
        add(S, 2024, 2, 4);
        add(S, 2024, 2, 18);
        add(S, 2024, 4, 28);
        add(S, 2024, 5, 11);
        add(S, 2024, 9, 29);
        add(S, 2024, 10, 12);

        // 2025
        add(S, 2025, 1, 26);
        add(S, 2025, 2, 8);
        add(S, 2025, 4, 27);
        add(S, 2025, 9, 28);
        add(S, 2025, 10, 11);

        // 2026
        add(S, 2026, 2, 14);
        add(S, 2026, 2, 28);
        add(S, 2026, 5, 9);
        add(S, 2026, 9, 20);
        add(S, 2026, 10, 10);

        return S;
    }

    const REST_SET = buildRestSet();
    const WORK_SET = buildWorkSet();

    global.PlannerChinaLegalRest = {
        isRestDateKey: function (dateKey) {
            return typeof dateKey === 'string' && REST_SET.has(dateKey);
        }
    };

    global.PlannerChinaLegalWork = {
        isWorkDateKey: function (dateKey) {
            return typeof dateKey === 'string' && WORK_SET.has(dateKey);
        }
    };
})(typeof window !== 'undefined' ? window : global);
