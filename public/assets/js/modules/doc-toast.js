/**
 * FlowAccount Advance - Toast / Snackbar Notification Module
 * จัดการแสดงผล Popup แจ้งเตือนมุมขอบจอ พร้อมหลอดเวลา Progress Bar และปุ่ม Action (พิมพ์/ไปหน้ารายการ)
 */

(function () {
    'use strict';

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // Auto-inject CSS styles if not already present
    function ensureToastStyles() {
        if (document.getElementById('docToastStyles')) return;
        const style = document.createElement('style');
        style.id = 'docToastStyles';
        style.textContent = `
            .doc-toast-container {
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 100000;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-width: 420px;
                width: calc(100% - 48px);
                pointer-events: none;
            }
            .doc-toast {
                pointer-events: auto;
                position: relative;
                background: #ffffff;
                border-radius: 14px;
                box-shadow: 0 16px 36px -6px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.08);
                padding: 16px 18px 14px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                overflow: hidden;
                animation: docToastSlideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1);
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
                font-family: 'Prompt', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .doc-toast.doc-toast-hiding {
                opacity: 0;
                transform: translateX(40px) scale(0.96);
            }
            @keyframes docToastSlideIn {
                from { opacity: 0; transform: translateX(50px) scale(0.95); }
                to { opacity: 1; transform: translateX(0) scale(1); }
            }
            .doc-toast.doc-toast-success { border-left: 4.5px solid #10b981; }
            .doc-toast.doc-toast-error { border-left: 4.5px solid #ef4444; }
            .doc-toast.doc-toast-warning { border-left: 4.5px solid #f59e0b; }
            .doc-toast.doc-toast-info { border-left: 4.5px solid #3b82f6; }
            .doc-toast-header { display: flex; align-items: flex-start; gap: 12px; }
            .doc-toast-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .doc-toast-icon-success { background: #ecfdf5; color: #059669; }
            .doc-toast-icon-error { background: #fef2f2; color: #dc2626; }
            .doc-toast-icon-warning { background: #fffbeb; color: #d97706; }
            .doc-toast-icon-info { background: #f0f9ff; color: #0284c7; }
            .doc-toast-title-group { flex: 1; min-width: 0; }
            .doc-toast-title { font-size: 14.5px; font-weight: 700; color: #0f172a; line-height: 1.3; }
            .doc-toast-subtitle { font-size: 12.5px; color: #64748b; margin-top: 2px; line-height: 1.4; word-break: break-word; }
            .doc-toast-close { background: transparent; border: none; cursor: pointer; color: #94a3b8; padding: 4px; margin: -3px -3px 0 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.15s ease; }
            .doc-toast-close:hover { color: #0f172a; background: #f1f5f9; }
            .doc-toast-detail-grid { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
            .doc-toast-field { display: flex; flex-direction: column; gap: 2px; }
            .doc-toast-field-full { grid-column: 1 / -1; padding-top: 7px; margin-top: 2px; border-top: 1px dashed #e2e8f0; flex-direction: row; align-items: center; justify-content: space-between; }
            .doc-toast-field-label { font-size: 11px; color: #64748b; font-weight: 500; }
            .doc-toast-field-val { font-size: 13px; font-weight: 600; color: #1e293b; }
            .doc-toast-docnum { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #0f172a; letter-spacing: -0.2px; }
            .doc-toast-total { font-size: 14.5px; font-weight: 700; color: #059669; }
            .doc-toast-status-badge { display: inline-flex; align-items: center; width: fit-content; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; line-height: 1.4; }
            .doc-toast-status-badge.status-waiting { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
            .doc-toast-status-badge.status-draft { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
            .doc-toast-status-badge.status-approved { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
            .doc-toast-status-badge.status-issued { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; }
            .doc-toast-status-badge.status-paid { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
            .doc-toast-status-badge.status-completed { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
            .doc-toast-status-badge.status-cancelled { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
            .doc-toast-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 2px; }
            .doc-toast-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all 0.15s ease; border: none; outline: none; font-family: inherit; }
            .doc-toast-btn-outline { background: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
            .doc-toast-btn-outline:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
            .doc-toast-btn-primary { background: #0f172a; color: #ffffff; }
            .doc-toast-btn-primary:hover { background: #1e293b; color: #ffffff; }
            .doc-toast-progress-track { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #f1f5f9; }
            .doc-toast-progress-bar { height: 100%; width: 100%; transform-origin: left; animation: docToastProgress linear forwards; }
            .doc-toast:hover .doc-toast-progress-bar { animation-play-state: paused; }
            .doc-toast-success .doc-toast-progress-bar { background: #10b981; }
            .doc-toast-error .doc-toast-progress-bar { background: #ef4444; }
            .doc-toast-warning .doc-toast-progress-bar { background: #f59e0b; }
            .doc-toast-info .doc-toast-progress-bar { background: #3b82f6; }
            @keyframes docToastProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
            @media (max-width: 640px) {
                .doc-toast-container { top: 16px; right: 16px; left: 16px; width: auto; max-width: 100%; }
                .doc-toast-detail-grid { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function parseToastOptions(arg1, arg2, arg3, arg4) {
        let options = {};
        const validTypes = ['success', 'error', 'warning', 'info'];

        if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
            // Called with object: showDocToast({ type: 'success', title: '...', message: '...' })
            options = Object.assign({}, arg1);
        } else if (typeof arg1 === 'string') {
            const lower1 = arg1.toLowerCase();
            // Case A: showDocToast(type, title, message) e.g. showDocToast('warning', 'หัวข้อ', 'ข้อความ')
            if (validTypes.includes(lower1) && typeof arg2 === 'string') {
                options = {
                    type: lower1,
                    title: arg2 || 'แจ้งเตือน',
                    message: typeof arg3 === 'string' ? arg3 : (arg3 && arg3.message ? arg3.message : ''),
                    ...(typeof arg3 === 'object' && arg3 !== null ? arg3 : {}),
                    ...(typeof arg4 === 'object' && arg4 !== null ? arg4 : {})
                };
            }
            // Case B: showToast(message, type) e.g. showToast('บันทึกสำเร็จ', 'success')
            else if (typeof arg2 === 'string' && validTypes.includes(arg2.toLowerCase()) && !arg3) {
                options = {
                    title: arg2 === 'error' ? 'เกิดข้อผิดพลาด' : (arg2 === 'warning' ? 'แจ้งเตือน' : 'สำเร็จ'),
                    message: arg1 || '',
                    type: arg2.toLowerCase()
                };
            }
            // Case C: showToast(title, message, type, options) e.g. showToast('หัวข้อ', 'ข้อความ', 'warning')
            else if (typeof arg2 === 'string') {
                let toastType = 'success';
                let extraOpts = {};
                if (typeof arg3 === 'string' && validTypes.includes(arg3.toLowerCase())) {
                    toastType = arg3.toLowerCase();
                } else if (typeof arg3 === 'object' && arg3 !== null) {
                    extraOpts = arg3;
                    if (extraOpts.type && validTypes.includes(String(extraOpts.type).toLowerCase())) {
                        toastType = extraOpts.type.toLowerCase();
                    }
                }
                if (typeof arg4 === 'object' && arg4 !== null) {
                    extraOpts = Object.assign(extraOpts, arg4);
                }
                options = {
                    title: arg1 || 'แจ้งเตือน',
                    message: arg2 || '',
                    type: toastType,
                    ...extraOpts
                };
            }
            // Case D: showToast(message) single string
            else {
                options = {
                    title: 'แจ้งเตือน',
                    message: arg1 || '',
                    type: (typeof arg2 === 'string' && validTypes.includes(arg2.toLowerCase())) ? arg2.toLowerCase() : 'success',
                    ...(typeof arg2 === 'object' && arg2 !== null ? arg2 : {})
                };
            }
        } else {
            options = { title: 'แจ้งเตือน', message: 'ดำเนินการเรียบร้อย', type: 'info' };
        }

        // Ensure defaults are always defined strings
        if (!options.title) options.title = 'แจ้งเตือน';
        if (options.message === undefined || options.message === null) options.message = '';
        if (!options.type || !validTypes.includes(options.type.toLowerCase())) options.type = 'info';
        options.type = options.type.toLowerCase();

        return options;
    }

    function showDocToast(arg1, arg2, arg3, arg4) {
        ensureToastStyles();
        const options = parseToastOptions(arg1, arg2, arg3, arg4);

        const {
            type = 'success',
            title = 'บันทึกเอกสารสำเร็จ!',
            message = '',
            docNumber = '',
            grandTotal = null,
            status = '',
            statusText = '',
            docId = null,
            printUrl = '',
            redirectUrl = '',
            duration = 3200
        } = options;

        let container = document.getElementById('docToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'docToastContainer';
            container.className = 'doc-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `doc-toast doc-toast-${type}`;
        toast.setAttribute('role', 'alert');

        let statusBadgeClass = 'status-draft';
        if (status === 'WAITING_APPROVAL') statusBadgeClass = 'status-waiting';
        else if (status === 'APPROVED') statusBadgeClass = 'status-approved';
        else if (status === 'ISSUED') statusBadgeClass = 'status-issued';
        else if (status === 'PAID') statusBadgeClass = 'status-paid';
        else if (status === 'COMPLETED') statusBadgeClass = 'status-completed';
        else if (status === 'CANCELLED') statusBadgeClass = 'status-cancelled';

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        } else if (type === 'warning') {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        } else {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }

        let detailsHtml = '';
        if (docNumber || statusText || (grandTotal !== null && grandTotal !== undefined && grandTotal !== '')) {
            const formattedTotal = (grandTotal !== null && grandTotal !== undefined && !isNaN(Number(grandTotal)))
                ? `฿ ${Number(grandTotal).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '';

            detailsHtml = `
                <div class="doc-toast-detail-grid">
                    ${docNumber ? `
                    <div class="doc-toast-field">
                        <span class="doc-toast-field-label">เลขที่เอกสาร</span>
                        <span class="doc-toast-field-val doc-toast-docnum">${escapeHtml(docNumber)}</span>
                    </div>` : ''}
                    ${statusText ? `
                    <div class="doc-toast-field">
                        <span class="doc-toast-field-label">สถานะ</span>
                        <span class="doc-toast-status-badge ${statusBadgeClass}">${escapeHtml(statusText)}</span>
                    </div>` : ''}
                    ${formattedTotal ? `
                    <div class="doc-toast-field doc-toast-field-full">
                        <span class="doc-toast-field-label">ยอดรวมทั้งสิ้น</span>
                        <span class="doc-toast-field-val doc-toast-total">${formattedTotal}</span>
                    </div>` : ''}
                </div>
            `;
        }

        let actionsHtml = '';
        const effectivePrintUrl = printUrl || (docId ? `print.html?id=${docId}` : '');
        if (effectivePrintUrl || redirectUrl) {
            actionsHtml = `
                <div class="doc-toast-actions">
                    ${effectivePrintUrl ? `
                    <a href="${effectivePrintUrl}" target="_blank" class="doc-toast-btn doc-toast-btn-outline" title="ดูตัวอย่าง / พิมพ์เอกสาร">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        ดู/พิมพ์เอกสาร
                    </a>` : ''}
                    ${redirectUrl ? `
                    <button type="button" class="doc-toast-btn doc-toast-btn-primary" data-action="redirect">
                        ไปหน้ารายการ
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                        </svg>
                    </button>` : ''}
                </div>
            `;
        }

        toast.innerHTML = `
            <div class="doc-toast-header">
                <div class="doc-toast-icon doc-toast-icon-${type}">
                    ${iconSvg}
                </div>
                <div class="doc-toast-title-group">
                    <div class="doc-toast-title">${escapeHtml(title)}</div>
                    ${message ? `<div class="doc-toast-subtitle">${escapeHtml(message)}</div>` : ''}
                </div>
                <button type="button" class="doc-toast-close" aria-label="ปิดการแจ้งเตือน" title="ปิด">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            ${detailsHtml}
            ${actionsHtml}
            <div class="doc-toast-progress-track">
                <div class="doc-toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
            </div>
        `;

        container.appendChild(toast);

        let remaining = duration;
        let startTime = Date.now();
        let timerId = null;
        let isDismissed = false;
        const progressBar = toast.querySelector('.doc-toast-progress-bar');

        function dismiss(immediate = false, doRedirect = true) {
            if (isDismissed) return;
            isDismissed = true;
            if (timerId) clearTimeout(timerId);
            toast.classList.add('doc-toast-hiding');
            setTimeout(() => {
                toast.remove();
                if (doRedirect && redirectUrl) {
                    window.location.href = redirectUrl;
                }
            }, immediate ? 40 : 250);
        }

        function startTimer() {
            startTime = Date.now();
            timerId = setTimeout(() => {
                dismiss(false, true);
            }, remaining);
        }

        function pauseTimer() {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
                remaining -= (Date.now() - startTime);
                if (progressBar) progressBar.style.animationPlayState = 'paused';
            }
        }

        function resumeTimer() {
            if (!timerId && remaining > 0 && !isDismissed) {
                if (progressBar) progressBar.style.animationPlayState = 'running';
                startTimer();
            }
        }

        toast.addEventListener('mouseenter', pauseTimer);
        toast.addEventListener('mouseleave', resumeTimer);

        const closeBtn = toast.querySelector('.doc-toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Clicking close cancels the automatic redirect
                dismiss(true, false);
            });
        }

        const redirectBtn = toast.querySelector('[data-action="redirect"]');
        if (redirectBtn) {
            redirectBtn.addEventListener('click', () => {
                dismiss(true, true);
            });
        }

        startTimer();
    }

    window.showDocToast = showDocToast;
    window.showToast = showDocToast;
})();
