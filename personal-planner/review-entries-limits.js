/**
 * 复盘「活跃区」条数：每日与事件分开计数；先从活跃区溢出写入归档，再将归档中的每日按日期倒序回填至每日上限。
 * 用于消除旧版「全局 8 条混排」升级后，活跃区里事件占槽导致每日不足 8 条、但归档里仍有每日记录的情况。
 */
(function (global) {
    var DAILY_LIMIT = 8;
    var EVENT_LIMIT = 2;

    function sortEntries(entries) {
        return entries.slice().sort(function (a, b) {
            var dc = String(b && b.date || '').localeCompare(String(a && a.date || ''));
            if (dc !== 0) return dc;
            return String(b && b.createdAt || '').localeCompare(String(a && a.createdAt || ''));
        });
    }

    function dedupe(entries) {
        var byId = new Map();
        (Array.isArray(entries) ? entries : []).forEach(function (entry) {
            if (!entry || entry.id === undefined || entry.id === null) return;
            var id = String(entry.id);
            var prev = byId.get(id);
            if (!prev) {
                byId.set(id, entry);
                return;
            }
            var nd = String(entry.date || '');
            var pd = String(prev.date || '');
            var nc = String(entry.createdAt || '');
            var pc = String(prev.createdAt || '');
            if (nd > pd || (nd === pd && nc > pc)) byId.set(id, entry);
        });
        return sortEntries(Array.from(byId.values()));
    }

    function isEvent(entry) {
        return entry && entry.reviewKind === 'event';
    }

    /**
     * @param {Array} reviewEntriesIn  planner_review_entries
     * @param {Array} reviewArchiveIn  planner_review_archive_entries
     * @returns {{ reviewEntries: Array, reviewArchiveEntries: Array }}
     */
    function plannerApplyReviewEntryLimitsWithDailyBackfillFromArrays(reviewEntriesIn, reviewArchiveIn) {
        var reviewEntries = dedupe(Array.isArray(reviewEntriesIn) ? reviewEntriesIn : []);
        var reviewArchiveEntries = dedupe(Array.isArray(reviewArchiveIn) ? reviewArchiveIn : []);

        function onePass() {
            var daily = [];
            var ev = [];
            reviewEntries.forEach(function (entry) {
                if (isEvent(entry)) ev.push(entry);
                else daily.push(entry);
            });
            sortEntries(daily);
            sortEntries(ev);
            var dailyOverflow = daily.slice(DAILY_LIMIT);
            var dailyKept = daily.slice(0, DAILY_LIMIT);
            var eventOverflow = ev.slice(EVENT_LIMIT);
            var eventKept = ev.slice(0, EVENT_LIMIT);
            reviewEntries = dedupe(dailyKept.concat(eventKept));
            sortEntries(reviewEntries);
            var overflow = dailyOverflow.concat(eventOverflow);
            if (overflow.length) {
                reviewArchiveEntries = dedupe(reviewArchiveEntries.concat(overflow));
            }
            var activeIds = new Set(reviewEntries.map(function (e) { return String(e.id); }));
            reviewArchiveEntries = reviewArchiveEntries.filter(function (e) {
                return !activeIds.has(String(e.id));
            });
            sortEntries(reviewArchiveEntries);
        }

        onePass();

        var daily2 = [];
        reviewEntries.forEach(function (entry) {
            if (!isEvent(entry)) daily2.push(entry);
        });
        sortEntries(daily2);
        if (daily2.length < DAILY_LIMIT) {
            var needed = DAILY_LIMIT - daily2.length;
            var activeIds2 = new Set(reviewEntries.map(function (e) { return String(e.id); }));
            var archiveDaily = reviewArchiveEntries.filter(function (e) {
                return e && !isEvent(e) && !activeIds2.has(String(e.id));
            });
            sortEntries(archiveDaily);
            var toPromote = archiveDaily.slice(0, needed);
            if (toPromote.length) {
                var promotedIds = new Set(toPromote.map(function (e) { return String(e.id); }));
                reviewEntries = dedupe(reviewEntries.concat(toPromote));
                sortEntries(reviewEntries);
                reviewArchiveEntries = reviewArchiveEntries.filter(function (e) {
                    return !promotedIds.has(String(e.id));
                });
                onePass();
            }
        }

        return { reviewEntries: reviewEntries, reviewArchiveEntries: reviewArchiveEntries };
    }

    global.plannerApplyReviewEntryLimitsWithDailyBackfillFromArrays = plannerApplyReviewEntryLimitsWithDailyBackfillFromArrays;
})(typeof window !== 'undefined' ? window : this);
