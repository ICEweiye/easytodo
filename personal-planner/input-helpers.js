/**
 * 全站输入体验：在可编辑的 input / textarea 上双击时全选内容（覆盖浏览器默认的“双击选一词”）。
 * 使用捕获阶段 + preventDefault，避免与按钮等控件冲突。
 */
(function () {
    function isSelectableField(el) {
        if (!el || el.readOnly || el.disabled) return false;
        var tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag !== 'INPUT') return false;
        var type = (el.type || '').toLowerCase();
        if (type === 'hidden' || type === 'button' || type === 'submit' || type === 'reset' ||
            type === 'checkbox' || type === 'radio' || type === 'file' || type === 'range' ||
            type === 'color' || type === 'image') {
            return false;
        }
        return true;
    }

    document.addEventListener('dblclick', function (e) {
        if (!isSelectableField(e.target)) return;
        e.preventDefault();
        var el = e.target;
        el.focus();
        if (typeof el.select === 'function') {
            el.select();
        }
    }, true);
})();
