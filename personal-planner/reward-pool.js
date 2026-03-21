/**
 * 积分奖池 - 星星奖励系统
 * 黄星：复盘、事项、关键结果（分类统计、分别兑换）
 * 炫彩：读完一本书、完成一个目标（OKR）
 */
(function () {
    const STORAGE_KEY = 'planner_reward_pool';
    const DEFAULT_RATIO = 5;

    function getScopedKey() {
        if (window.PlannerAuth && typeof PlannerAuth.scopedStorageKey === 'function') {
            return PlannerAuth.scopedStorageKey(STORAGE_KEY);
        }
        return STORAGE_KEY;
    }

    function load() {
        try {
            const raw = localStorage.getItem(getScopedKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function save(pool) {
        const next = pool && typeof pool === 'object' ? { ...pool } : {};
        delete next.yellowStars;
        localStorage.setItem(getScopedKey(), JSON.stringify(next));
    }

    function getPool() {
        const p = load();
        const hasSplitFields =
            !!p &&
            ('yellowStarsTodo' in p || 'yellowStarsKr' in p || 'yellowStarsReview' in p);

        let todo = Number(p && p.yellowStarsTodo);
        let kr = Number(p && p.yellowStarsKr);
        let review = Number(p && p.yellowStarsReview);
        if (!Number.isFinite(todo)) todo = 0;
        if (!Number.isFinite(kr)) kr = 0;
        if (!Number.isFinite(review)) review = 0;

        if (!hasSplitFields && p && p.yellowStars != null) {
            todo = Number(p.yellowStars) || 0;
        }

        return {
            yellowStarsTodo: todo,
            yellowStarsKr: kr,
            yellowStarsReview: review,
            colorfulStars: Number(p && p.colorfulStars) || 0,
            ratioTodo: Math.max(1, Number(p && p.ratioTodo) || DEFAULT_RATIO),
            ratioKr: Math.max(1, Number(p && p.ratioKr) || DEFAULT_RATIO),
            ratioReview: Math.max(1, Number(p && p.ratioReview) || DEFAULT_RATIO),
            awardedKeys: Array.isArray(p && p.awardedKeys) ? p.awardedKeys : [],
            prizes: Array.isArray(p && p.prizes) ? p.prizes : []
        };
    }

    function setPool(updates) {
        const pool = { ...getPool(), ...updates };
        save(pool);
        return pool;
    }

    function hasAwarded(key) {
        const pool = getPool();
        return (pool.awardedKeys || []).indexOf(key) >= 0;
    }

    function getYellowSource(key) {
        if (typeof key !== 'string') return 'todo';
        if (key.startsWith('todo-')) return 'todo';
        if (key.startsWith('kr-')) return 'kr';
        if (key.startsWith('review-')) return 'review';
        return 'todo';
    }

    function dispatchStarAwarded(detail) {
        try {
            if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
                document.dispatchEvent(new CustomEvent('planner-star-awarded', {
                    detail: detail,
                    bubbles: true
                }));
            }
        } catch (e) { /* ignore */ }
        if (typeof document === 'undefined' || !document.body) return;

        const hasRewardPoolRow = !!document.querySelector('[data-reward-pool-target]');
        if (hasRewardPoolRow) {
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem('__planner_pending_star_collect_v1');
                }
            } catch (err) { /* ignore */ }
            return;
        }

        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(
                    '__planner_pending_star_collect_v1',
                    JSON.stringify({
                        kind: detail && detail.kind,
                        source: detail && detail.source,
                        key: detail && detail.key
                    })
                );
            }
        } catch (err) { /* ignore */ }

        var toast = document.createElement('div');
        toast.className = 'planner-star-collect-toast';
        toast.setAttribute('role', 'status');
        toast.textContent = detail && detail.kind === 'colorful' ? '✨ 炫彩星 +1' : '★ 黄星 +1';
        document.body.appendChild(toast);
        requestAnimationFrame(function () {
            toast.classList.add('is-visible');
        });
        setTimeout(function () {
            toast.classList.remove('is-visible');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 320);
        }, 1500);
    }

    function awardYellowStar(key) {
        if (hasAwarded(key)) return false;
        const pool = getPool();
        const src = getYellowSource(key);
        if (src === 'todo') pool.yellowStarsTodo = (pool.yellowStarsTodo || 0) + 1;
        else if (src === 'kr') pool.yellowStarsKr = (pool.yellowStarsKr || 0) + 1;
        else pool.yellowStarsReview = (pool.yellowStarsReview || 0) + 1;
        pool.awardedKeys = (pool.awardedKeys || []).concat([key]);
        save(pool);
        dispatchStarAwarded({ kind: 'yellow', source: src, key: key });
        return true;
    }

    function awardColorfulStar(key) {
        if (hasAwarded(key)) return false;
        const pool = getPool();
        pool.colorfulStars = (pool.colorfulStars || 0) + 1;
        pool.awardedKeys = (pool.awardedKeys || []).concat([key]);
        save(pool);
        dispatchStarAwarded({ kind: 'colorful', key: key });
        return true;
    }

    function revokeYellowStar(key) {
        if (!hasAwarded(key)) return false;
        const pool = getPool();
        pool.awardedKeys = (pool.awardedKeys || []).filter(k => k !== key);
        const src = getYellowSource(key);
        if (src === 'todo') pool.yellowStarsTodo = Math.max(0, (pool.yellowStarsTodo || 0) - 1);
        else if (src === 'kr') pool.yellowStarsKr = Math.max(0, (pool.yellowStarsKr || 0) - 1);
        else pool.yellowStarsReview = Math.max(0, (pool.yellowStarsReview || 0) - 1);
        save(pool);
        return true;
    }

    function revokeColorfulStar(key) {
        if (!hasAwarded(key)) return false;
        const pool = getPool();
        pool.awardedKeys = (pool.awardedKeys || []).filter(k => k !== key);
        pool.colorfulStars = Math.max(0, (pool.colorfulStars || 0) - 1);
        save(pool);
        return true;
    }

    function exchangeYellowToColorful() {
        const pool = getPool();
        const rTodo = pool.ratioTodo || DEFAULT_RATIO;
        const rKr = pool.ratioKr || DEFAULT_RATIO;
        const rReview = pool.ratioReview || DEFAULT_RATIO;
        const cTodo = Math.floor((pool.yellowStarsTodo || 0) / rTodo);
        const cKr = Math.floor((pool.yellowStarsKr || 0) / rKr);
        const cReview = Math.floor((pool.yellowStarsReview || 0) / rReview);
        const total = cTodo + cKr + cReview;
        if (total < 1) {
            var parts = [];
            if ((pool.yellowStarsTodo || 0) > 0) parts.push('事项 ' + (pool.yellowStarsTodo || 0) + '/' + rTodo);
            if ((pool.yellowStarsKr || 0) > 0) parts.push('关键结果 ' + (pool.yellowStarsKr || 0) + '/' + rKr);
            if ((pool.yellowStarsReview || 0) > 0) parts.push('复盘 ' + (pool.yellowStarsReview || 0) + '/' + rReview);
            return { ok: false, message: '黄星不足。当前：' + (parts.length ? parts.join('，') : '0') };
        }
        pool.yellowStarsTodo = Math.max(0, (pool.yellowStarsTodo || 0) - cTodo * rTodo);
        pool.yellowStarsKr = Math.max(0, (pool.yellowStarsKr || 0) - cKr * rKr);
        pool.yellowStarsReview = Math.max(0, (pool.yellowStarsReview || 0) - cReview * rReview);
        pool.colorfulStars = (pool.colorfulStars || 0) + total;
        save(pool);
        return { ok: true, exchanged: total };
    }

    function redeemPrize(prizeId) {
        const pool = getPool();
        const prize = (pool.prizes || []).find(p => String(p.id) === String(prizeId));
        if (!prize) return { ok: false, message: '奖品不存在' };
        const cost = Number(prize.cost) || 0;
        const colorful = pool.colorfulStars || 0;
        if (cost > colorful) return { ok: false, message: `炫彩星不足，需要 ${cost} 颗` };
        pool.colorfulStars = Math.max(0, colorful - cost);
        save(pool);
        return { ok: true, prize };
    }

    function addPrize(prize) {
        const pool = getPool();
        const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
        pool.prizes = (pool.prizes || []).concat([{ ...prize, id }]);
        save(pool);
        return id;
    }

    function updatePrize(prizeId, updates) {
        const pool = getPool();
        const idx = (pool.prizes || []).findIndex(p => String(p.id) === String(prizeId));
        if (idx < 0) return false;
        pool.prizes[idx] = { ...pool.prizes[idx], ...updates };
        save(pool);
        return true;
    }

    function deletePrize(prizeId) {
        const pool = getPool();
        pool.prizes = (pool.prizes || []).filter(p => String(p.id) !== String(prizeId));
        save(pool);
        return true;
    }

    function updateRatios(opts) {
        var updates = {};
        if (opts.todo != null) updates.ratioTodo = Math.max(1, Math.floor(Number(opts.todo) || DEFAULT_RATIO));
        if (opts.kr != null) updates.ratioKr = Math.max(1, Math.floor(Number(opts.kr) || DEFAULT_RATIO));
        if (opts.review != null) updates.ratioReview = Math.max(1, Math.floor(Number(opts.review) || DEFAULT_RATIO));
        if (Object.keys(updates).length) setPool(updates);
        return getPool();
    }

    /** 事项 / KR / 复盘 黄星归零，并移除对应 awardedKeys，便于再次完成时重新获得；炫彩星与其它 awardedKeys 保留 */
    function clearYellowStars() {
        const pool = getPool();
        pool.yellowStarsTodo = 0;
        pool.yellowStarsKr = 0;
        pool.yellowStarsReview = 0;
        const keys = pool.awardedKeys || [];
        pool.awardedKeys = keys.filter((k) => {
            if (typeof k !== 'string') return true;
            if (k.startsWith('todo-') || k.startsWith('kr-') || k.startsWith('review-')) return false;
            return true;
        });
        delete pool.yellowStars;
        save(pool);
        return getPool();
    }

    window.RewardPool = {
        getPool,
        setPool,
        awardYellowStar,
        awardColorfulStar,
        revokeYellowStar,
        revokeColorfulStar,
        clearYellowStars,
        exchangeYellowToColorful,
        redeemPrize,
        addPrize,
        updatePrize,
        deletePrize,
        updateRatios,
        hasAwarded,
        DEFAULT_RATIO
    };
})();
