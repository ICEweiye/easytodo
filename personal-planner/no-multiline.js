(() => {
    function normalizeSingleLine(value) {
        return String(value || '').replace(/[\r\n]+/g, ' ');
    }

    function isTextarea(target) {
        return target instanceof HTMLTextAreaElement;
    }

    function allowsMultiline(target) {
        return isTextarea(target) && target.id === 'reviewSummary';
    }

    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!isTextarea(target)) return;
        if (allowsMultiline(target)) return;
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

        const normalized = normalizeSingleLine(target.value);
        if (normalized === target.value) return;

        const cursor = target.selectionStart ?? normalized.length;
        target.value = normalized;
        const nextPos = Math.max(0, Math.min(cursor - 1, normalized.length));
        target.setSelectionRange(nextPos, nextPos);
    });
})();
