(() => {
    function normalizeSingleLine(value) {
        return String(value || '').replace(/[\r\n]+/g, ' ');
    }

    function isTextarea(target) {
        return target instanceof HTMLTextAreaElement;
    }

    function allowsMultiline(target) {
        if (!isTextarea(target)) return false;
        if (target.id === 'reviewSummary') return true;
        /* OKR 弹窗：动机 / 可行性 / 备注允许多行 */
        if (
            target.id === 'okrMotivation' ||
            target.id === 'okrFeasibility' ||
            target.id === 'okrMemo' ||
            target.id === 'okrReviewModalOutlook' ||
            target.id === 'okrReviewModalReflection' ||
            target.id === 'okrReviewModalMore'
        ) {
            return true;
        }
        return false;
    }

    function isComposing(event) {
        return event.isComposing || event.keyCode === 229;
    }

    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!isTextarea(target)) return;
        if (allowsMultiline(target)) return;
        if (isComposing(event)) return;
        if (event.key !== 'Enter') return;

        event.preventDefault();

        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const nextValue = `${target.value.slice(0, start)} ${target.value.slice(end)}`;
        target.value = nextValue;
        const nextPos = Math.min(start + 1, nextValue.length);
        target.setSelectionRange(nextPos, nextPos);
        target.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!isTextarea(target)) return;
        if (allowsMultiline(target)) return;
        if (event.isComposing) return;

        const normalized = normalizeSingleLine(target.value);
        if (normalized === target.value) return;

        const cursor = target.selectionStart ?? normalized.length;
        target.value = normalized;
        const safePos = Math.max(0, Math.min(cursor, normalized.length));
        target.setSelectionRange(safePos, safePos);
    });
})();
