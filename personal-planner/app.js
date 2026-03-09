// ===== 数据存储 =====
const Storage = {
    get(key) {
        const data = localStorage.getItem(key);
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch (err) {
            return null;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

function clonePlannerValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function getPlannerStoredValue(key, fallback) {
    const stored = Storage.get(key);
    return stored !== null ? stored : clonePlannerValue(fallback);
}

// ===== 鍒濆鍖栨暟鎹?=====
const defaultData = {
    projects: [
        { id: 1, name: 'Personal Website Refactor', start: '2026-01-15', end: '2026-03-30', progress: 65, color: 'brown' },
        { id: 2, name: 'React Advanced Learning', start: '2026-02-01', end: '2026-04-15', progress: 40, color: 'apricot' },
        { id: 3, name: 'Fitness Plan', start: '2026-01-01', end: '2026-04-30', progress: 30, color: 'sage' }
    ],
    okrs: [
        {
            id: 1,
            title: 'Improve Technical Skills',
            period: '2026 H1',
            color: 'brown',
            krs: [
                { id: 1, text: 'Complete 3 open-source contributions', target: 3, current: 3, completed: true },
                { id: 2, text: 'Read 5 technical books', target: 5, current: 0, completed: false }
            ]
        },
        {
            id: 2,
            title: 'Health Management',
            period: '2026 Full Year',
            color: 'sage',
            krs: [
                { id: 3, text: 'Exercise at least 3 times a week', target: 3, current: 0, completed: false },
                { id: 4, text: 'Reduce weight to 70kg', target: 1, current: 0, completed: false }
            ]
        }
    ],
    books: [
        { id: 1, title: 'Node.js in Practice', author: 'Author A', current: 180, total: 320, status: 'reading' },
        { id: 2, title: 'Design Psychology', author: 'Author B', current: 0, total: 280, status: 'unread' },
        { id: 3, title: 'Atomic Habits', author: 'Author C', current: 250, total: 250, status: 'finished' }
    ]
};

let data = {
    projects: getPlannerStoredValue('planner_projects', defaultData.projects),
    okrs: getPlannerStoredValue('planner_okrs', defaultData.okrs),
    books: getPlannerStoredValue('planner_books', defaultData.books)
};

// ===== 颜色主题 =====
const colors = ['brown', 'apricot', 'sage', 'pink'];
const OKR_COLOR_KEYS = ['brown', 'apricot', 'sage', 'pink', 'indigo', 'teal', 'coral', 'amber'];

function normalizeOkrColor(color) {
    const key = String(color || '').trim().toLowerCase();
    return OKR_COLOR_KEYS.includes(key) ? key : 'brown';
}

function escapePlannerHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapePlannerAttribute(value) {
    return escapePlannerHtml(value);
}

function escapePlannerJsString(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E');
}

function reloadPlannerDataFromStorage() {
    data = {
        projects: getPlannerStoredValue('planner_projects', defaultData.projects),
        okrs: getPlannerStoredValue('planner_okrs', defaultData.okrs),
        books: getPlannerStoredValue('planner_books', defaultData.books)
    };
}

// ===== 工具函数 =====
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function getMonthLabel(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月`;
}

function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

function normalizeYmdDate(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return '';

    const normalized = value
        .replace(/[./]/g, '-')
        .replace(/\s+/g, '')
        .replace(/年/g, '-')
        .replace(/月/g, '-')
        .replace(/日/g, '');

    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';

    const candidate = new Date(year, month - 1, day);
    if (
        candidate.getFullYear() !== year ||
        candidate.getMonth() !== month - 1 ||
        candidate.getDate() !== day
    ) {
        return '';
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const lightDatePickerState = {
    popover: null,
    inputId: '',
    trigger: null,
    year: 0,
    month: 0
};

function parseYmdToDate(ymd) {
    const normalized = normalizeYmdDate(ymd);
    if (!normalized) return null;
    return new Date(`${normalized}T00:00:00`);
}

function buildLightDatePickerPopover() {
    if (lightDatePickerState.popover) return lightDatePickerState.popover;

    const popover = document.createElement('div');
    popover.className = 'light-date-picker-popover';
    popover.id = 'lightDatePickerPopover';
    popover.innerHTML = `
        <div class="light-date-picker-header">
            <button type="button" class="light-date-picker-nav" data-nav="-1" aria-label="上个月">‹</button>
            <div class="light-date-picker-title" id="lightDatePickerTitle"></div>
            <button type="button" class="light-date-picker-nav" data-nav="1" aria-label="下个月">›</button>
        </div>
        <div class="light-date-picker-week">
            <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
        </div>
        <div class="light-date-picker-grid" id="lightDatePickerGrid"></div>
    `;
    document.body.appendChild(popover);

    popover.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const navBtn = target.closest('.light-date-picker-nav');
        if (navBtn) {
            const step = Number(navBtn.getAttribute('data-nav')) || 0;
            const next = new Date(lightDatePickerState.year, lightDatePickerState.month + step, 1);
            lightDatePickerState.year = next.getFullYear();
            lightDatePickerState.month = next.getMonth();
            renderLightDatePickerGrid();
            return;
        }

        const dayBtn = target.closest('.light-date-picker-day');
        if (dayBtn && lightDatePickerState.inputId) {
            const dateValue = dayBtn.getAttribute('data-date') || '';
            const input = document.getElementById(lightDatePickerState.inputId);
            if (input && dateValue) {
                input.value = dateValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            closeLightDatePicker();
        }
    });

    lightDatePickerState.popover = popover;
    return popover;
}

function renderLightDatePickerGrid() {
    const popover = buildLightDatePickerPopover();
    const title = popover.querySelector('#lightDatePickerTitle');
    const grid = popover.querySelector('#lightDatePickerGrid');
    if (!title || !grid) return;

    const year = lightDatePickerState.year;
    const month = lightDatePickerState.month;
    const selectedInput = document.getElementById(lightDatePickerState.inputId);
    const selectedDate = parseYmdToDate(selectedInput ? selectedInput.value : '');
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    title.textContent = `${year}年${month + 1}月`;

    const monthStart = new Date(year, month, 1);
    const weekOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - weekOffset);

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const isOutside = date.getMonth() !== month;
        const isToday = ymd === todayYmd;
        const isSelected = selectedDate
            && date.getFullYear() === selectedDate.getFullYear()
            && date.getMonth() === selectedDate.getMonth()
            && date.getDate() === selectedDate.getDate();

        cells.push(`
            <button type="button" class="light-date-picker-day ${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${ymd}">
                ${date.getDate()}
            </button>
        `);
    }
    grid.innerHTML = cells.join('');
}

function positionLightDatePicker() {
    const popover = lightDatePickerState.popover;
    const trigger = lightDatePickerState.trigger;
    if (!popover || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const anchor = trigger.closest('.date-picker-field') || trigger;
    const anchorRect = anchor.getBoundingClientRect();
    const modal = trigger.closest('.modal');
    const modalRect = modal ? modal.getBoundingClientRect() : null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const boundaryLeft = (modalRect ? modalRect.left : 0) + scrollX + 8;
    const boundaryRight = (modalRect ? modalRect.right : window.innerWidth) + scrollX - 8;
    const boundaryTop = (modalRect ? modalRect.top : 0) + scrollY + 8;
    const boundaryBottom = (modalRect ? modalRect.bottom : window.innerHeight) + scrollY - 8;

    // Center align the picker to the related date field while keeping it inside modal bounds.
    const maxAllowedWidth = Math.max(208, boundaryRight - boundaryLeft);
    const popoverWidth = Math.min(252, maxAllowedWidth);
    popover.style.width = `${popoverWidth}px`;
    const popoverHeight = popover.offsetHeight || 294;

    const preferredLeft = anchorRect.left + scrollX + (anchorRect.width - popoverWidth) / 2;
    let left = preferredLeft;
    if (left < boundaryLeft) left = boundaryLeft;
    if (left + popoverWidth > boundaryRight) {
        left = Math.max(boundaryLeft, boundaryRight - popoverWidth);
    }

    let top = rect.bottom + scrollY + 8;
    if (top + popoverHeight > boundaryBottom) {
        top = rect.top + scrollY - popoverHeight - 8;
    }
    const minTop = boundaryTop;
    const maxTop = Math.max(boundaryTop, boundaryBottom - popoverHeight);
    top = Math.min(Math.max(top, minTop), maxTop);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

function openLightDatePicker(inputId, trigger) {
    const input = document.getElementById(inputId);
    if (!input || !trigger) return;

    const baseDate = parseYmdToDate(input.value) || new Date();
    lightDatePickerState.inputId = inputId;
    lightDatePickerState.trigger = trigger;
    lightDatePickerState.year = baseDate.getFullYear();
    lightDatePickerState.month = baseDate.getMonth();

    const popover = buildLightDatePickerPopover();
    renderLightDatePickerGrid();
    popover.classList.add('active');
    positionLightDatePicker();
}

function closeLightDatePicker() {
    const popover = lightDatePickerState.popover;
    if (popover) popover.classList.remove('active');
    lightDatePickerState.inputId = '';
    lightDatePickerState.trigger = null;
}

function openNativeOrLightDatePicker(inputId, nativeId, trigger) {
    const textInput = document.getElementById(inputId);
    const nativeInput = document.getElementById(nativeId);
    if (!textInput) return;

    // In modal dialogs we force the lightweight picker for stable alignment and bounds control.
    if (trigger && trigger.closest('.modal')) {
        openLightDatePicker(inputId, trigger);
        return;
    }

    const normalized = normalizeYmdDate(textInput.value);
    if (nativeInput) nativeInput.value = normalized || '';

    if (nativeInput && typeof nativeInput.showPicker === 'function') {
        try {
            nativeInput.showPicker();
            return;
        } catch (err) {
            // ignore and fallback to lightweight picker
        }
    }

    openLightDatePicker(inputId, trigger);
}

function initDatePickerTriggers() {
    document.querySelectorAll('.date-picker-trigger').forEach((trigger) => {
        if (trigger.dataset.bound === '1') return;
        const inputId = trigger.getAttribute('data-input-id');
        const nativeId = trigger.getAttribute('data-native-id');
        if (!inputId || !nativeId) return;

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openNativeOrLightDatePicker(inputId, nativeId, trigger);
        });
        trigger.dataset.bound = '1';
    });

    document.querySelectorAll('.date-picker-native-proxy').forEach((nativeInput) => {
        if (nativeInput.dataset.bound === '1') return;
        const sourceId = nativeInput.id === 'okrStartDateNative' ? 'okrStartDate' : nativeInput.id === 'okrEndDateNative' ? 'okrEndDate' : '';
        if (!sourceId) return;

        nativeInput.addEventListener('change', () => {
            const sourceInput = document.getElementById(sourceId);
            const normalized = normalizeYmdDate(nativeInput.value);
            if (!sourceInput || !normalized) return;
            sourceInput.value = normalized;
            sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
            sourceInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeLightDatePicker();
        });
        nativeInput.dataset.bound = '1';
    });
}

// ===== KR 量化工具 =====
function getKrTarget(kr) {
    const target = parseInt(kr.target, 10);
    return Number.isFinite(target) && target > 0 ? target : 1;
}

function getKrCurrent(kr) {
    const current = parseInt(kr.current, 10);
    if (Number.isFinite(current)) return current;
    return kr.completed ? getKrTarget(kr) : 0;
}

function normalizeKr(kr) {
    const target = getKrTarget(kr);
    const current = Math.min(Math.max(0, getKrCurrent(kr)), target);
    kr.target = target;
    kr.current = current;
    kr.completed = current >= target;
    return kr;
}

function getKrProgress(kr) {
    const target = getKrTarget(kr);
    const current = Math.min(getKrCurrent(kr), target);
    return target > 0 ? current / target : 0;
}

// ===== 顶部日期 =====
function updateDate() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    const dateEl = document.getElementById('currentDate');
    if (!dateEl) return;
    dateEl.textContent = now.toLocaleDateString('zh-CN', options);
}

// ===== 椤圭洰鏃堕棿杞?=====
function renderTimeline() {
    const header = document.getElementById('timelineHeader');
    const body = document.getElementById('timelineBody');

    // 璁＄畻鏃堕棿鑼冨洿锛氳繃鍘讳竴涓湀 + 鏈潵涓や釜鏈?
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // 璁＄畻杩囧幓涓€涓湀鐨勮捣濮嬫棩鏈燂紙涓婁釜鏈?鍙凤級
    const oneMonthAgo = new Date(currentYear, currentMonth - 1, 1);
    // 璁＄畻鏈潵涓や釜鏈堢殑缁撴潫鏃ユ湡锛堜笅涓嬩釜鏈堟湯锛?
    const twoMonthsLater = new Date(currentYear, currentMonth + 3, 0);
    
    // 收集时间轴条目（与 OKR 仪表盘保持一致，仅显示 OKR）
    const timelineItems = [];

    // 娣诲姞OKR锛堝鏋滄湁鏃ユ湡锛?
    data.okrs.forEach(okr => {
        if (okr.startDate && okr.endDate) {
            const okrStart = new Date(okr.startDate);
            const okrEnd = new Date(okr.endDate);
            if (okrEnd >= oneMonthAgo && okrStart <= twoMonthsLater) {
                // 计算OKR进度
                let totalWeight = 0;
                let completedWeight = 0;
                okr.krs.forEach(kr => {
                    normalizeKr(kr);
                    const weight = kr.weight || (100 / okr.krs.length);
                    totalWeight += weight;
                    completedWeight += weight * getKrProgress(kr);
                });
                const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
                
                timelineItems.push({
                    type: 'okr',
                    id: okr.id,
                    name: okr.title,
                    start: okr.startDate,
                    end: okr.endDate,
                    color: normalizeOkrColor(okr.color),
                    progress: progress,
                    isOkr: true
                });
            }
        }
    });
    
    // 按开始时间排序
    timelineItems.sort((a, b) => new Date(a.start) - new Date(b.start));

    // 固定显示范围：当前月前一个月 到 当前月后两个月
    const minDate = new Date(oneMonthAgo.getFullYear(), oneMonthAgo.getMonth(), 1);
    const maxDate = new Date(twoMonthsLater.getFullYear(), twoMonthsLater.getMonth(), twoMonthsLater.getDate());

    // 娓叉煋鏈堜唤澶撮儴 - 纭繚姣忎釜鏈堜唤瀵瑰簲涓€涓綉鏍?
    const months = [];
    const current = new Date(minDate);
    while (current <= maxDate) {
        months.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
    }

    header.innerHTML = months.map(m => '<div class="timeline-month">' + (m.getMonth() + 1) + '月</div>').join('');

    if (timelineItems.length === 0) {
        body.innerHTML = '<div class="empty-state">暂无 OKR 时间轴，点击右上角 + 添加 OKR</div>';
        return;
    }

    // 璁＄畻鎬诲ぉ鏁帮紙浠?minDate 鍒?maxDate锛?
    const minDateTime = minDate.getTime();
    const maxDateTime = maxDate.getTime();
    const totalMilliseconds = maxDateTime - minDateTime;

    body.innerHTML = timelineItems.map(item => {
        const start = new Date(item.start);
        const end = new Date(item.end);
        const safeId = escapePlannerJsString(item.id);
        const safeName = escapePlannerHtml(item.name);
        const safeDateText = escapePlannerHtml(`${formatDate(item.start)} - ${formatDate(item.end)}`);
        
        // 鍒ゆ柇椤圭洰鐘舵€侊細鏄惁宸插紑濮?
        const isStarted = start <= now;
        
        // 计算项目在时间轴上的位置
        const startTime = start.getTime();
        const endTime = end.getTime();
        
        // 璁＄畻浣嶇疆鐧惧垎姣?
        let startOffset = ((startTime - minDateTime) / totalMilliseconds) * 100;
        let endOffset = ((endTime - minDateTime) / totalMilliseconds) * 100;
        
        // 寮哄埗绾︽潫鍦?0-100 鑼冨洿鍐?
        startOffset = Math.max(0, Math.min(100, parseFloat(startOffset.toFixed(2))));
        endOffset = Math.max(0, Math.min(100, parseFloat(endOffset.toFixed(2))));
        
        // 纭繚瀹藉害鑷冲皯涓?2%锛屼笖涓嶈秴杩囧鍣ㄨ竟鐣?
        let duration = endOffset - startOffset;
        duration = Math.max(2, Math.min(duration, 100 - startOffset));
        duration = parseFloat(duration.toFixed(2));
        
        const safeProgress = Math.max(0, Math.min(100, parseInt(item.progress, 10) || 0));
        const labelProgress = Math.max(8, safeProgress);
        const progressTextHtml = safeProgress > 0
            ? `<span class="progress-text" style="left: ${labelProgress}%;">${safeProgress}%</span>`
            : '';
        const clickAction = isStarted
            ? (item.isOkr ? `editOkr('${safeId}')` : `editProjectProgress('${safeId}')`)
            : (item.isOkr ? `editOkr('${safeId}')` : `editProject('${safeId}')`);
        const barHtml = `
            <div class="project-bar timeline-base-${item.color} ${item.isOkr ? 'okr-bar' : ''}"
                 style="left: ${startOffset}%; width: ${duration}%;"
                 onclick="${clickAction}">
                <div class="progress-fill progress-${item.color}" style="width: ${safeProgress}%"></div>
                ${progressTextHtml}
            </div>
        `;

        return `
            <div class="timeline-row">
                <div class="project-info">
                    <div class="project-name" onclick="${item.isOkr ? `editOkr('${safeId}')` : `editProject('${safeId}')`}">
                        ${safeName}
                    </div>
                    <div class="project-date">${safeDateText}</div>
                </div>
                <div class="timeline-bar-area">
${barHtml}
                </div>
            </div>
        `;
    }).join('');
}

// ===== OKR 浠〃鐩?=====
function renderOKRs() {
    const grid = document.getElementById('okrGrid');

    if (data.okrs.length === 0) {
        grid.innerHTML = '<div class="empty-state">暂无 OKR，点击右上角 + 添加</div>';
        return;
    }

    grid.innerHTML = data.okrs.map(okr => {
        const okrColor = normalizeOkrColor(okr.color);
        const safeOkrId = escapePlannerJsString(okr.id);
        const totalKrs = okr.krs.length || 1;
        const getKrWeightValue = (kr) => {
            const weight = parseInt(kr.weight, 10);
            return Number.isFinite(weight) ? weight : Math.round(100 / totalKrs);
        };
        // 计算加权进度
        let totalWeight = 0;
        let completedWeight = 0;
        okr.krs.forEach(kr => {
            normalizeKr(kr);
            const weight = getKrWeightValue(kr);
            totalWeight += weight;
            completedWeight += weight * getKrProgress(kr);
        });
        const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
        const circumference = 2 * Math.PI * 35;
        const offset = circumference - (progress / 100) * circumference;

        // 鏍煎紡鍖栨棩鏈熸樉绀?
        const dateRange = okr.startDate && okr.endDate 
            ? `${formatDate(okr.startDate)} - ${formatDate(okr.endDate)}`
            : (okr.period || '');
        const safeTitle = escapePlannerHtml(okr.title);
        const safeDateRange = escapePlannerHtml(dateRange);
        const safeMemo = escapePlannerHtml(okr.memo || '');

        return `
            <div class="okr-card" style="border-left: 4px solid var(--okr-color-${okrColor})">
                <button class="okr-delete" onclick="deleteOkr('${safeOkrId}')">×</button>
                <div class="okr-header">
                    <div class="okr-header-main">
                        <div class="okr-title" onclick="editOkr('${safeOkrId}')">${safeTitle}</div>
                        <div class="okr-period">${safeDateRange}</div>
                    </div>
                    <div class="ring-container">
                        <svg class="ring-svg" width="80" height="80" viewBox="0 0 80 80">
                            <circle class="ring-bg" cx="40" cy="40" r="35"></circle>
                            <circle class="ring-progress" cx="40" cy="40" r="35" style="stroke: var(--okr-color-${okrColor});"
                                    stroke-dasharray="${circumference}"
                                    stroke-dashoffset="${offset}"></circle>
                        </svg>
                        <div class="ring-text">${progress}%</div>
                    </div>
                </div>
                <div class="kr-list">
                    ${okr.krs.sort((a, b) => getKrWeightValue(b) - getKrWeightValue(a)).map(kr => {
                        const krProgress = getKrProgress(kr);
                        const isCompleted = krProgress >= 1;
                        const safeKrId = escapePlannerJsString(kr.id);
                        const safeKrText = escapePlannerHtml(kr.text);
                        return `
                        <div class="kr-item ${isCompleted ? 'kr-completed' : ''}">
                            <div class="kr-main">
                                <span class="kr-text ${isCompleted ? 'completed' : ''}"
                                      onclick="editKr('${safeOkrId}', '${safeKrId}')" title="点击编辑">${safeKrText}</span>
                                <div class="kr-meta">
                                    <span class="kr-weight-badge">权重 ${getKrWeightValue(kr)}%</span>
                                </div>
                            </div>
                            <div class="kr-quantified">
                                <div class="kr-progress-bar">
                                    <div class="kr-progress-fill" style="width: ${krProgress * 100}%"></div>
                                </div>
                                <div class="kr-counter">
                                    <button class="kr-count-btn kr-count-btn-minus" onclick="adjustKrCount('${safeOkrId}', '${safeKrId}', -1)" title="减1">-1</button>
                                    <span class="kr-count-display" title="当前进度">${kr.current}</span>
                                    <span class="kr-count-separator">/</span>
                                    <span class="kr-count-target" title="目标值">${kr.target}</span>
                                    <button class="kr-count-btn kr-count-btn-plus" onclick="adjustKrCount('${safeOkrId}', '${safeKrId}', 1)" title="打卡 +1">+1</button>
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                    <button class="add-kr-btn" onclick="addKr('${safeOkrId}')">+ 添加关键结果</button>
                </div>
                ${okr.memo ? `<div class="okr-memo">备注：${safeMemo}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ===== 阅读清单 =====
function getBookStatus(current, total) {
    if (current >= total) return 'finished';
    if (current > 0) return 'reading';
    return 'unread';
}

function getStatusText(status) {
    const map = { unread: '未读', reading: '在读', finished: '已读' };
    return map[status];
}

function renderBooks() {
    const list = document.getElementById('readingList');

    if (data.books.length === 0) {
        list.innerHTML = '<div class="empty-state">暂无书籍，点击右上角 + 添加</div>';
        return;
    }

    list.innerHTML = data.books.map(book => {
        const status = getBookStatus(book.current, book.total);
        const progress = Math.round((book.current / book.total) * 100);
        const safeBookId = escapePlannerJsString(book.id);
        const safeTitle = escapePlannerHtml(book.title);
        const safeAuthor = escapePlannerHtml(book.author || '未知作者');
        const safeStatusText = escapePlannerHtml(getStatusText(status));

        return `
            <div class="reading-item">
                <div class="book-info">
                    <div class="book-title-row">
                        <div class="book-title" onclick="editBook('${safeBookId}')">${safeTitle}</div>
                        <span class="book-status-pill status-pill-${status}">${safeStatusText}</span>
                    </div>
                    <div class="book-meta">${safeAuthor}</div>
                </div>
                <div class="book-progress">
                    <div class="progress-bar-bg" onclick="editBookProgress('${safeBookId}')">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                <button class="book-delete" onclick="deleteBook('${safeBookId}')">×</button>
            </div>
        `;
    }).join('');
}

// ===== 弹窗控制 =====
let editingId = null;
let editingType = null;
let okrDateListenersBound = false;

function openModal(id, preserveEditing = false) {
    document.getElementById(id).classList.add('active');
    if (!preserveEditing) {
        editingId = null;
        editingType = null;
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    editingId = null;
    editingType = null;
    // 隐藏删除按钮
    const deleteBtn = document.getElementById('projectDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    // 清空表单
    document.querySelectorAll('.form-input').forEach(input => input.value = '');
}

// ===== 项目管理 =====
function openProjectModal() {
    openModal('projectModal');
    document.getElementById('projectStart').valueAsDate = new Date();
    document.getElementById('projectEnd').valueAsDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function saveProject() {
    const name = document.getElementById('projectName').value.trim();
    const start = document.getElementById('projectStart').value;
    const end = document.getElementById('projectEnd').value;
    const progress = parseInt(document.getElementById('projectProgress').value) || 0;

    if (!name || !start || !end) {
        alert('请填写完整信息');
        return;
    }

    if (editingId) {
        // 编辑模式：查找并更新现有项目
        // 浣跨敤瀛楃涓叉瘮杈冪‘淇?ID 鍖归厤
        const editingIdStr = editingId.toString();
        const projectIndex = data.projects.findIndex(p => p.id.toString() === editingIdStr);
        
        if (projectIndex !== -1) {
            // 鐩存帴鏇存柊鍘熼」鐩紝淇濈暀鍘熸湁鐨?id 鍜?color 灞炴€?
            const existingProject = data.projects[projectIndex];
            data.projects[projectIndex] = {
                id: existingProject.id,  // 保持原有 ID
                name,
                start,
                end,
                progress,
                color: existingProject.color  // 保持原有颜色
            };
        } else {
            console.error('未找到要编辑的项目，ID:', editingId);
        }
    } else {
        // 鏂板妯″紡锛氬垱寤烘柊椤圭洰骞跺垎閰嶉鑹?
        const color = colors[data.projects.length % colors.length];
        data.projects.push({
            id: generateId(),
            name,
            start,
            end,
            progress,
            color
        });
    }

    Storage.set('planner_projects', data.projects);
    renderTimeline();
    closeModal('projectModal');
}

function editProject(id) {
    const project = data.projects.find(p => p.id == id || p.id === id.toString() || p.id === parseInt(id));
    if (!project) {
        console.error('未找到项目，ID:', id);
        return;
    }

    // 重置表单
    document.querySelectorAll('#projectModal .form-input').forEach(input => input.value = '');
    
    // 璁剧疆缂栬緫鐘舵€侊紙鍦ㄦ墦寮€寮圭獥涔嬪墠璁剧疆锛?
    editingId = project.id;  // 使用项目中存储的原始 ID
    editingType = 'project';
    
    // 填充表单数据
    document.getElementById('projectName').value = project.name;
    document.getElementById('projectStart').value = project.start;
    document.getElementById('projectEnd').value = project.end;
    document.getElementById('projectProgress').value = project.progress;
    
    // 显示删除按钮
    document.getElementById('projectDeleteBtn').style.display = 'block';
    
    // 打开弹窗
    document.getElementById('projectModal').classList.add('active');
}

function editProjectProgress(id) {
    const project = data.projects.find(p => p.id == id);
    if (!project) return;

    const newProgress = prompt('输入新的进度 (0-100):', project.progress);
    if (newProgress !== null) {
        project.progress = Math.min(100, Math.max(0, parseInt(newProgress) || 0));
        Storage.set('planner_projects', data.projects);
        renderTimeline();
    }
}

function deleteProject(id) {
    if (confirm('确定删除这个项目吗？')) {
        data.projects = data.projects.filter(p => p.id != id && p.id !== id.toString() && p.id !== parseInt(id));
        Storage.set('planner_projects', data.projects);
        closeModal('projectModal');
        renderTimeline();
    }
}

// ===== OKR 管理 =====
let currentOkrColor = 'brown';
let krEditors = [];

function openOkrModal() {
    editingId = null;
    currentOkrColor = 'brown';
    krEditors = [];
    
    // 重置表单
    document.getElementById('okrTitle').value = '';
    document.getElementById('okrStartDate').value = '';
    document.getElementById('okrEndDate').value = '';
    document.getElementById('okrDuration').textContent = '-- 天';
    document.getElementById('okrMemo').value = '';
    document.getElementById('okrModalTitle').textContent = '添加目标 (O)';
    document.getElementById('okrDeleteBtn').style.display = 'none';
    
    // 娓呯┖KR缂栬緫鍣?
    document.getElementById('krEditorContainer').innerHTML = '';
    
    // 榛樿閫変腑绗竴涓鑹?
    selectOkrColor('brown');
    
    // 添加日期变化监听
    setupOkrDateListeners();
    
    openModal('okrModal');
}

function closeOkrModal() {
    closeModal('okrModal');
    krEditors = [];
}

function setupOkrDateListeners() {
    const startDate = document.getElementById('okrStartDate');
    const endDate = document.getElementById('okrEndDate');
    if (!startDate || !endDate) return;

    const calculateDuration = () => {
        const normalizedStart = normalizeYmdDate(startDate.value);
        const normalizedEnd = normalizeYmdDate(endDate.value);

        if (normalizedStart && normalizedEnd) {
            const start = new Date(normalizedStart);
            const end = new Date(normalizedEnd);
            const diffTime = end - start;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            document.getElementById('okrDuration').textContent = diffDays > 0 ? `${diffDays} 天` : '无效日期范围';
        } else if (startDate.value || endDate.value) {
            document.getElementById('okrDuration').textContent = '日期格式：yyyy-mm-dd';
        } else {
            document.getElementById('okrDuration').textContent = '-- 天';
        }
    };

    if (!okrDateListenersBound) {
        const normalizeInputValue = (event) => {
            const input = event.target;
            const normalized = normalizeYmdDate(input.value);
            if (normalized) {
                input.value = normalized;
            }
            calculateDuration();
        };

        startDate.addEventListener('input', calculateDuration);
        endDate.addEventListener('input', calculateDuration);
        startDate.addEventListener('change', calculateDuration);
        endDate.addEventListener('change', calculateDuration);
        startDate.addEventListener('blur', normalizeInputValue);
        endDate.addEventListener('blur', normalizeInputValue);
        okrDateListenersBound = true;
    }

    calculateDuration();
}

function selectOkrColor(color) {
    const normalizedColor = normalizeOkrColor(color);
    currentOkrColor = normalizedColor;
    document.querySelectorAll('#okrColorSelector .color-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.color === normalizedColor) {
            btn.classList.add('selected');
        }
    });
}

function addKrEditor(krData = null) {
    const container = document.getElementById('krEditorContainer');
    const krId = krData && krData.id != null ? String(krData.id) : generateId();
    const editorDiv = document.createElement('div');
    editorDiv.className = 'kr-editor-item';
    editorDiv.dataset.krId = krId;
    const safeKrText = escapePlannerAttribute(krData ? krData.text : '');
    const targetValue = krData ? (krData.target || 1) : 1;
    const weightValue = krData ? krData.weight : 50;
    
    editorDiv.innerHTML = `
        <div class="kr-editor-row">
            <input type="text" class="form-input kr-text-input" placeholder="输入关键结果内容" value="${safeKrText}">
            <div class="kr-target-control">
                <label class="kr-weight-label">目标</label>
                <input type="number" class="form-input kr-target-input" min="1" value="${escapePlannerAttribute(targetValue)}">
            </div>
            <div class="kr-weight-control">
                <label class="kr-weight-label">权重</label>
                <input type="number" class="form-input kr-weight-input" min="1" max="100" step="1" value="${escapePlannerAttribute(weightValue)}">
                <span class="kr-weight-suffix">%</span>
            </div>
            <button type="button" class="kr-remove-btn" onclick="removeKrEditor('${escapePlannerJsString(krId)}')">×</button>
        </div>
    `;
    
    container.appendChild(editorDiv);
    const weightInput = editorDiv.querySelector('.kr-weight-input');
    if (weightInput) {
        // Avoid DOM re-order while typing. Commit on blur/change.
        weightInput.addEventListener('change', () => {
            normalizeKrWeightInput(weightInput);
            sortKrEditors();
        });
        weightInput.addEventListener('blur', () => {
            normalizeKrWeightInput(weightInput);
            sortKrEditors();
        });
    }
    krEditors.push({ id: krId, element: editorDiv });
    sortKrEditors();
}

function removeKrEditor(krId) {
    const editor = krEditors.find(k => k.id === krId);
    if (editor) {
        editor.element.remove();
        krEditors = krEditors.filter(k => k.id !== krId);
        sortKrEditors();
    }
}

function sortKrEditors() {
    const container = document.getElementById('krEditorContainer');
    const editors = Array.from(container.querySelectorAll('.kr-editor-item'));
    
    editors.sort((a, b) => {
        const weightA = getKrWeightInputValue(a.querySelector('.kr-weight-input'));
        const weightB = getKrWeightInputValue(b.querySelector('.kr-weight-input'));
        return weightB - weightA; // 闄嶅簭鎺掑垪锛屾潈閲嶉珮鐨勫湪鍓?
    });
    
    editors.forEach(editor => container.appendChild(editor));
}

function getKrWeightInputValue(inputEl) {
    if (!inputEl) return 0;
    const value = Number(inputEl.value);
    if (!Number.isFinite(value)) return 0;
    return Math.max(1, Math.min(100, Math.round(value)));
}

function normalizeKrWeightInput(inputEl) {
    if (!inputEl) return 1;
    const normalized = getKrWeightInputValue(inputEl) || 1;
    inputEl.value = normalized;
    return normalized;
}

function getKrEditorsData() {
    const container = document.getElementById('krEditorContainer');
    const editors = container.querySelectorAll('.kr-editor-item');
    const krs = [];
    
    editors.forEach(editor => {
        const text = editor.querySelector('.kr-text-input').value.trim();
        const weight = normalizeKrWeightInput(editor.querySelector('.kr-weight-input'));
        const target = Math.max(1, parseInt(editor.querySelector('.kr-target-input').value, 10) || 1);
        if (text) {
            krs.push({
                id: editor.dataset.krId,
                text: text,
                weight: weight,
                target: target,
                current: 0,
                completed: false
            });
        }
    });
    
    return krs.sort((a, b) => b.weight - a.weight);
}

function saveOkr() {
    const title = document.getElementById('okrTitle').value.trim();
    const startDateInput = document.getElementById('okrStartDate');
    const endDateInput = document.getElementById('okrEndDate');
    const startDate = normalizeYmdDate(startDateInput.value);
    const endDate = normalizeYmdDate(endDateInput.value);
    const memo = document.getElementById('okrMemo').value.trim();
    const krs = getKrEditorsData();

    if (!title) {
        alert('请输入目标名称');
        return;
    }

    if (!startDate || !endDate) {
        alert('请选择起止日期（格式：yyyy-mm-dd）');
        return;
    }

    startDateInput.value = startDate;
    endDateInput.value = endDate;

    if (krs.length === 0) {
        alert('请至少添加一个关键结果');
        return;
    }

    // 验证权重总和
    const totalWeight = krs.reduce((sum, kr) => sum + kr.weight, 0);
    if (totalWeight !== 100) {
        if (!confirm(`当前权重总和为 ${totalWeight}%，建议总和为 100%。是否继续保存？`)) {
            return;
        }
    }

    const okrData = {
        id: editingId || generateId(),
        title,
        startDate,
        endDate,
        memo,
        color: normalizeOkrColor(currentOkrColor),
        krs
    };

    if (editingId) {
        const index = data.okrs.findIndex(o => o.id == editingId);
        if (index !== -1) {
            // 淇濈暀鍘熸湁KR鐨勫畬鎴愮姸鎬?
            const existingKrs = data.okrs[index].krs;
            okrData.krs = krs.map(kr => {
                const existing = existingKrs.find(ek => ek.id === kr.id);
                if (existing) {
                    const merged = { ...kr, current: existing.current, completed: existing.completed };
                    return normalizeKr(merged);
                }
                return normalizeKr(kr);
            });
            data.okrs[index] = okrData;
        }
    } else {
        okrData.krs = okrData.krs.map(kr => normalizeKr(kr));
        data.okrs.push(okrData);
    }

    Storage.set('planner_okrs', data.okrs);
    renderOKRs();
    renderTimeline(); // 鏇存柊椤圭洰鏃堕棿杞?
    closeOkrModal();
}

function editOkr(id) {
    const okr = data.okrs.find(o => o.id == id);
    if (!okr) return;

    editingId = id;
    currentOkrColor = normalizeOkrColor(okr.color);
    krEditors = [];

    // 填充表单
    document.getElementById('okrTitle').value = okr.title;
    document.getElementById('okrStartDate').value = normalizeYmdDate(okr.startDate) || okr.startDate || '';
    document.getElementById('okrEndDate').value = normalizeYmdDate(okr.endDate) || okr.endDate || '';
    document.getElementById('okrMemo').value = okr.memo || '';
    document.getElementById('okrModalTitle').textContent = '编辑目标 (O)';
    document.getElementById('okrDeleteBtn').style.display = 'block';
    
    // 设置颜色选择
    selectOkrColor(currentOkrColor);
    
    // 娓呯┖骞堕噸鏂板～鍏匥R缂栬緫鍣?
    document.getElementById('krEditorContainer').innerHTML = '';
    if (okr.krs && okr.krs.length > 0) {
        okr.krs.forEach(kr => addKrEditor(kr));
    }
    
    // 璁剧疆鏃ユ湡鐩戝惉骞惰绠楁寔缁ぉ鏁?
    setupOkrDateListeners();

    openModal('okrModal', true);
}

function deleteOkr(id) {
    if (confirm('确定删除这个目标吗？')) {
        data.okrs = data.okrs.filter(o => o.id != id);
        Storage.set('planner_okrs', data.okrs);
        renderOKRs();
        renderTimeline();
        closeOkrModal();
    }
}

function toggleKr(okrId, krId) {
    const okr = data.okrs.find(o => o.id == okrId);
    if (!okr) return;

    const kr = okr.krs.find(k => k.id == krId);
    if (kr) {
        normalizeKr(kr);
        kr.current = kr.completed ? 0 : kr.target;
        kr.completed = kr.current >= kr.target;
        Storage.set('planner_okrs', data.okrs);
        renderOKRs();
    }
}

function editKr(okrId, krId) {
    const okr = data.okrs.find(o => o.id == okrId);
    if (!okr) return;

    const kr = okr.krs.find(k => k.id == krId);
    if (!kr) return;

    const newText = prompt('编辑关键结果:', kr.text);
    if (newText !== null && newText.trim()) {
        kr.text = newText.trim();
        normalizeKr(kr);
        Storage.set('planner_okrs', data.okrs);
        renderOKRs();
    }
}

function deleteKr(okrId, krId) {
    const okr = data.okrs.find(o => o.id == okrId);
    if (!okr) return;

    okr.krs = okr.krs.filter(k => k.id != krId);
    Storage.set('planner_okrs', data.okrs);
    renderOKRs();
}

function addKr(okrId) {
    const text = prompt('输入新的关键结果:');
    if (text && text.trim()) {
        const okr = data.okrs.find(o => o.id == okrId);
        if (okr) {
            okr.krs.push({ id: generateId(), text: text.trim(), target: 1, current: 0, completed: false });
            Storage.set('planner_okrs', data.okrs);
            renderOKRs();
        }
    }
}

function adjustKrCount(okrId, krId, delta) {
    const okr = data.okrs.find(o => o.id == okrId);
    if (!okr) return;
    const kr = okr.krs.find(k => k.id == krId);
    if (!kr) return;

    normalizeKr(kr);
    kr.current = Math.min(kr.target, Math.max(0, kr.current + delta));
    kr.completed = kr.current >= kr.target;
    Storage.set('planner_okrs', data.okrs);
    renderOKRs();
    renderTimeline();
}

// ===== 书籍管理 =====
function openBookModal() {
    openModal('bookModal');
}

function saveBook() {
    const title = document.getElementById('bookTitle').value.trim();
    const author = document.getElementById('bookAuthor').value.trim();
    const current = parseInt(document.getElementById('bookCurrent').value) || 0;
    const total = parseInt(document.getElementById('bookTotal').value) || 100;

    if (!title) {
        alert('请输入书名');
        return;
    }

    if (editingId) {
        const book = data.books.find(b => b.id == editingId);
        if (book) {
            book.title = title;
            book.author = author;
            book.current = Math.min(current, total);
            book.total = total;
        }
    } else {
        data.books.push({
            id: generateId(),
            title,
            author,
            current: Math.min(current, total),
            total
        });
    }

    Storage.set('planner_books', data.books);
    renderBooks();
    closeModal('bookModal');
}

function editBook(id) {
    const book = data.books.find(b => b.id == id);
    if (!book) return;

    editingId = id;
    document.getElementById('bookTitle').value = book.title;
    document.getElementById('bookAuthor').value = book.author || '';
    document.getElementById('bookCurrent').value = book.current;
    document.getElementById('bookTotal').value = book.total;
    openModal('bookModal', true);
}

function editBookProgress(id) {
    const book = data.books.find(b => b.id == id);
    if (!book) return;

    const newProgress = prompt(`输入当前页数 (0-${book.total}):`, book.current);
    if (newProgress !== null) {
        book.current = Math.min(book.total, Math.max(0, parseInt(newProgress) || 0));
        Storage.set('planner_books', data.books);
        renderBooks();
    }
}

function deleteBook(id) {
    if (confirm('确定删除这本书吗？')) {
        data.books = data.books.filter(b => b.id != id);
        Storage.set('planner_books', data.books);
        renderBooks();
    }
}

// ===== 鍒濆鍖?=====
document.addEventListener('DOMContentLoaded', () => {
    updateDate();
    renderTimeline();
    renderOKRs();
    renderBooks();
    initDatePickerTriggers();

    window.addEventListener('planner-storage-synced', () => {
        reloadPlannerDataFromStorage();
        renderTimeline();
        renderOKRs();
        renderBooks();
    });

    window.addEventListener('storage', (event) => {
        if (event.key && !event.key.startsWith('planner_')) return;
        reloadPlannerDataFromStorage();
        renderTimeline();
        renderOKRs();
        renderBooks();
    });

    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const popover = lightDatePickerState.popover;
        if (!popover || !popover.classList.contains('active') || !target) return;
        if (target.closest('.light-date-picker-popover') || target.closest('.date-picker-trigger')) return;
        closeLightDatePicker();
    });

    window.addEventListener('resize', () => {
        const popover = lightDatePickerState.popover;
        if (popover && popover.classList.contains('active')) {
            positionLightDatePicker();
        }
    });

    window.addEventListener('scroll', () => {
        const popover = lightDatePickerState.popover;
        if (popover && popover.classList.contains('active')) {
            positionLightDatePicker();
        }
    }, true);

    // 点击遮罩关闭弹窗
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'okrModal') {
                    return;
                }
                const shouldClose = confirm('\u68c0\u6d4b\u5230\u70b9\u51fb\u7a7a\u767d\u533a\u57df\u3002\u786e\u8ba4\u9000\u51fa\u7f16\u8f91\u5417\uff1f\u672a\u4fdd\u5b58\u5185\u5bb9\u5c06\u4e22\u5931\u3002');
                if (shouldClose) {
                    closeModal(overlay.id);
                }
            }
        });
    });
});
