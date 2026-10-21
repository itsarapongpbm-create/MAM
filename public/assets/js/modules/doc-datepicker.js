/**
 * FlowAccount Advance - Google Calendar Style DatePicker Module
 * ปฏิทินเลือกวันที่แบบ Google Calendar สวยงาม ใช้งานง่าย พร้อมรองรับปี/เดือนภาษาไทย
 */

(function () {
    'use strict';

    const THAI_MONTHS = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    let popup = null;
    let activeTarget = null;
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();
    let selectedDateStr = '';
    let isInitialized = false;

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function toIso(y, m, d) {
        return `${y}-${pad(m + 1)}-${pad(d)}`;
    }

    function parseDate(str) {
        if (!str) return null;
        const parts = str.trim().split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                return new Date(y, m, d);
            }
        }
        return null;
    }

    function renderCalendar() {
        if (!popup) return;
        const monthTitle = popup.querySelector('#gcalMonthTitle');
        const daysGrid = popup.querySelector('#gcalDaysGrid');
        if (!monthTitle || !daysGrid) return;

        monthTitle.textContent = `${THAI_MONTHS[currentMonth]} ${currentYear}`;
        daysGrid.innerHTML = '';

        const today = new Date();
        const todayStr = toIso(today.getFullYear(), today.getMonth(), today.getDate());

        const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        // Prev month trailing days
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
            const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
            const iso = toIso(prevY, prevM, dayNum);

            const cell = document.createElement('div');
            cell.className = 'gcal-day-cell other-month';
            cell.textContent = dayNum;
            cell.dataset.date = iso;
            if (iso === selectedDateStr) cell.classList.add('selected');
            if (iso === todayStr) cell.classList.add('today');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(iso);
            });
            daysGrid.appendChild(cell);
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const iso = toIso(currentYear, currentMonth, d);
            const cell = document.createElement('div');
            cell.className = 'gcal-day-cell';
            cell.textContent = d;
            cell.dataset.date = iso;
            if (iso === selectedDateStr) cell.classList.add('selected');
            if (iso === todayStr) cell.classList.add('today');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(iso);
            });
            daysGrid.appendChild(cell);
        }

        // Next month leading days (fill total 42 cells = 6 rows)
        const totalCellsSoFar = firstDayOfWeek + daysInMonth;
        const remainingCells = 42 - totalCellsSoFar;
        for (let d = 1; d <= remainingCells; d++) {
            const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
            const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
            const iso = toIso(nextY, nextM, d);

            const cell = document.createElement('div');
            cell.className = 'gcal-day-cell other-month';
            cell.textContent = d;
            cell.dataset.date = iso;
            if (iso === selectedDateStr) cell.classList.add('selected');
            if (iso === todayStr) cell.classList.add('today');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(iso);
            });
            daysGrid.appendChild(cell);
        }
    }

    function positionPopup(input) {
        if (!popup || !input) return;
        const rect = input.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        popup.style.display = 'block';

        let top = rect.bottom + scrollTop + 6;
        let left = rect.left + scrollLeft;

        const popupWidth = 290;
        if (rect.left + popupWidth > window.innerWidth - 12) {
            left = Math.max(8, window.innerWidth - popupWidth - 16 + scrollLeft);
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    }

    function openPicker(input) {
        activeTarget = input;
        const parsed = parseDate(input.value);
        if (parsed) {
            currentYear = parsed.getFullYear();
            currentMonth = parsed.getMonth();
            selectedDateStr = toIso(currentYear, currentMonth, parsed.getDate());
        } else {
            const now = new Date();
            currentYear = now.getFullYear();
            currentMonth = now.getMonth();
            selectedDateStr = '';
        }

        renderCalendar();
        positionPopup(input);
        popup.classList.add('active');
    }

    function closePicker() {
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
        activeTarget = null;
    }

    function selectDate(iso) {
        if (activeTarget) {
            activeTarget.value = iso;
            activeTarget.dataset.date = iso;
            activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
            activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closePicker();
    }

    function bindInputs() {
        const dateInputs = document.querySelectorAll('.gcal-date-input, .date-picker-input-wrap input');
        dateInputs.forEach(input => {
            if (input.dataset.gcalBound) return;
            input.dataset.gcalBound = 'true';

            input.addEventListener('click', (e) => {
                e.stopPropagation();
                openPicker(input);
            });

            const wrap = input.closest('.date-picker-input-wrap');
            if (wrap) {
                wrap.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPicker(input);
                });
            }
        });
    }

    function initGoogleCalendarDatePicker() {
        popup = document.getElementById('gcalDatePickerPopup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'gcalDatePickerPopup';
            popup.className = 'gcal-datepicker-popup';
            popup.innerHTML = `
                <div class="gcal-datepicker-header">
                    <div class="gcal-month-title" id="gcalMonthTitle">ตุลาคม 2026</div>
                    <div class="gcal-nav-group">
                        <button type="button" class="gcal-nav-btn" id="gcalPrevMonthBtn" title="เดือนก่อนหน้า">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <button type="button" class="gcal-nav-btn" id="gcalNextMonthBtn" title="เดือนถัดไป">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                </div>
                <div class="gcal-weekdays-row">
                    <span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span>
                </div>
                <div class="gcal-days-grid" id="gcalDaysGrid"></div>
                <div class="gcal-datepicker-footer">
                    <button type="button" class="gcal-action-btn" id="gcalTodayBtn">วันนี้</button>
                    <button type="button" class="gcal-action-btn" id="gcalClearBtn" style="color: #64748b;">ล้างค่า</button>
                </div>
            `;
            document.body.appendChild(popup);
        }

        const prevBtn = popup.querySelector('#gcalPrevMonthBtn');
        const nextBtn = popup.querySelector('#gcalNextMonthBtn');
        const todayBtn = popup.querySelector('#gcalTodayBtn');
        const clearBtn = popup.querySelector('#gcalClearBtn');

        if (!isInitialized) {
            isInitialized = true;

            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentMonth--;
                    if (currentMonth < 0) {
                        currentMonth = 11;
                        currentYear--;
                    }
                    renderCalendar();
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentMonth++;
                    if (currentMonth > 11) {
                        currentMonth = 0;
                        currentYear++;
                    }
                    renderCalendar();
                });
            }

            if (todayBtn) {
                todayBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const now = new Date();
                    const iso = toIso(now.getFullYear(), now.getMonth(), now.getDate());
                    selectDate(iso);
                });
            }

            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (activeTarget) {
                        activeTarget.value = '';
                        activeTarget.dataset.date = '';
                        activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    closePicker();
                });
            }

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!popup || !popup.classList.contains('active')) return;
                if (popup.contains(e.target)) return;
                if (activeTarget && (activeTarget.contains(e.target) || activeTarget.closest('.date-picker-input-wrap')?.contains(e.target))) return;
                closePicker();
            });

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && popup && popup.classList.contains('active')) {
                    closePicker();
                }
            });

            // Auto-reposition on window resize or scroll
            window.addEventListener('resize', () => {
                if (popup && popup.classList.contains('active') && activeTarget) {
                    positionPopup(activeTarget);
                }
            });
            window.addEventListener('scroll', () => {
                if (popup && popup.classList.contains('active') && activeTarget) {
                    positionPopup(activeTarget);
                }
            }, { passive: true });
        }

        bindInputs();
    }

    window.initGoogleCalendarDatePicker = initGoogleCalendarDatePicker;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGoogleCalendarDatePicker);
    } else {
        initGoogleCalendarDatePicker();
    }
})();
