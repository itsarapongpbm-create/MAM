/**
 * FlowAccount Advance - Quotations List JavaScript
 * Fetches real quotations from backend API, handles filter tabs, search, status updates, and Excel export.
 * Interactive Modal Dialog & Toast / Snackbar Notifications.
 * Strictly 0 emojis (SVG icons only)
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatThaiDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    if (dateStr.includes('ต.ค.') || dateStr.includes('ก.ย.') || dateStr.includes('ม.ค.')) return dateStr;
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const day = parseInt(parts[2], 10);
        const mIdx = parseInt(parts[1], 10) - 1;
        const year = parts[0];
        if (months[mIdx]) return `${String(day).padStart(2, '0')} ${months[mIdx]} ${year}`;
    }
    return dateStr;
}

// =============================================================================
// Modern Toast / Snackbar Notification Utility
// =============================================================================
function showToast(arg1, arg2, arg3) {
    if (typeof window.showDocToast === 'function' && window.showDocToast !== showToast) {
        return window.showDocToast(arg1, arg2, arg3);
    }
    const container = document.getElementById('toastNotificationContainer') || document.body;

    let title = 'แจ้งเตือน';
    let message = '';
    let type = 'success';

    if (arg1 && typeof arg1 === 'object') {
        title = arg1.title || 'แจ้งเตือน';
        message = arg1.message || '';
        type = arg1.type || 'success';
    } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        title = arg1;
        message = arg2;
        type = arg3 || 'success';
    } else if (typeof arg1 === 'string') {
        title = arg2 === 'error' ? 'เกิดข้อผิดพลาด' : (arg2 === 'warning' ? 'แจ้งเตือน' : 'สำเร็จ');
        message = arg1;
        type = arg2 || 'success';
    }

    const toast = document.createElement('div');
    toast.className = `mam-toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
        <div class="toast-icon-wrap ${type}">
            ${iconSvg}
        </div>
        <div class="toast-text-wrap">
            <div class="toast-text-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-text-desc">${escapeHtml(message)}</div>` : ''}
        </div>
        <button type="button" class="toast-close-btn" aria-label="Close notification">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 250);
        });
    }

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 250);
        }
    }, 3800);
}
if (!window.showToast) window.showToast = showToast;

// =============================================================================
// Modern Action Modal / Dialog System
// =============================================================================
function openActionDialog(options) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('actionModalOverlay');
        if (!overlay) {
            // Fallback to native confirmation if DOM elements not found
            if (options.action === 'reject' || options.action === 'cancel') {
                const r = prompt(`ระบุเหตุผลสำหรับ ${options.docNum}:`, options.defaultReason || '');
                if (r === null) return resolve({ confirmed: false });
                return resolve({ confirmed: true, reason: r.trim() || 'ไม่ได้ระบุเหตุผล' });
            }
            return resolve({ confirmed: confirm(`ยืนยันการทำรายการสำหรับ ${options.docNum}?`) });
        }

        const modalIconBadge = document.getElementById('modalIconBadge');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');
        const modalCustomerName = document.getElementById('modalCustomerName');
        const modalGrandTotal = document.getElementById('modalGrandTotal');
        const modalReasonGroup = document.getElementById('modalReasonGroup');
        const modalReasonInput = document.getElementById('modalReasonInput');
        const quickTagsList = document.getElementById('quickTagsList');
        const btnModalConfirm = document.getElementById('btnModalConfirm');
        const btnModalConfirmText = document.getElementById('btnModalConfirmText');
        const btnModalCancel = document.getElementById('btnModalCancel');
        const btnModalClose = document.getElementById('btnModalClose');

        // Setup texts & metadata
        modalSubtitle.textContent = `เลขที่เอกสาร: ${options.docNum}`;
        modalCustomerName.textContent = options.customerName || '-';
        modalGrandTotal.textContent = typeof options.grandTotal === 'number'
            ? `฿ ${options.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : (options.grandTotal || '-');

        // Reset classes
        modalIconBadge.className = 'doc-action-icon-badge';
        btnModalConfirm.className = 'btn-modal-confirm';

        // Configure per action type
        if (options.action === 'approve') {
            modalTitle.textContent = 'ยืนยันการอนุมัติใบเสนอราคา';
            modalIconBadge.classList.add('icon-approve');
            modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            modalReasonGroup.style.display = 'none';
            btnModalConfirm.classList.add('btn-confirm-approve');
            btnModalConfirmText.textContent = 'ยืนยันอนุมัติ';
        } else if (options.action === 'reject') {
            modalTitle.textContent = 'ไม่อนุมัติใบเสนอราคา';
            modalIconBadge.classList.add('icon-reject');
            modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            modalReasonGroup.style.display = 'flex';
            modalReasonInput.value = 'ราคาไม่อนุมัติ / ลูกค้าปฏิเสธ';
            btnModalConfirm.classList.add('btn-confirm-reject');
            btnModalConfirmText.textContent = 'ยืนยันไม่อนุมัติ';

            const defaultTags = ['ราคาไม่อนุมัติ / ลูกค้าปฏิเสธ', 'ลูกค้าชะลอโครงการ', 'สั่งซื้อจากผู้จำหน่ายรายอื่น', 'ต้องการปรับลดงบประมาณ'];
            renderQuickTags(defaultTags, modalReasonInput, quickTagsList);
        } else if (options.action === 'cancel') {
            modalTitle.textContent = 'ยืนยันการยกเลิกใบเสนอราคา';
            modalIconBadge.classList.add('icon-cancel');
            modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;
            modalReasonGroup.style.display = 'flex';
            modalReasonInput.value = 'ลูกค้ายกเลิกคำสั่งซื้อ';
            btnModalConfirm.classList.add('btn-confirm-cancel');
            btnModalConfirmText.textContent = 'ยืนยันยกเลิกเอกสาร';

            const cancelTags = ['ลูกค้ายกเลิกคำสั่งซื้อ', 'จัดทำเอกสารผิดพลาด', 'ออกเอกสารฉบับใหม่แทน'];
            renderQuickTags(cancelTags, modalReasonInput, quickTagsList);
        } else if (options.action === 'delete') {
            modalTitle.textContent = 'ยืนยันการลบใบเสนอราคา';
            modalIconBadge.classList.add('icon-delete');
            modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            modalReasonGroup.style.display = 'none';
            btnModalConfirm.classList.add('btn-confirm-delete');
            btnModalConfirmText.textContent = 'ยืนยันลบเอกสาร';
        } else if (options.action === 'submit') {
            modalTitle.textContent = 'ยืนยันส่งขออนุมัติใบเสนอราคา';
            modalIconBadge.classList.add('icon-approve');
            modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
            modalReasonGroup.style.display = 'none';
            btnModalConfirm.classList.add('btn-confirm-approve');
            btnModalConfirmText.textContent = 'ยืนยันส่งขออนุมัติ';
        }

        // Show Modal
        overlay.style.display = 'flex';
        if (modalReasonGroup.style.display !== 'none' && modalReasonInput) {
            modalReasonInput.focus();
            modalReasonInput.select();
        }

        function closeModal(result) {
            overlay.style.display = 'none';
            btnModalConfirm.removeEventListener('click', onConfirm);
            btnModalCancel.removeEventListener('click', onCancel);
            btnModalClose.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
            overlay.removeEventListener('click', onBackdropClick);
            resolve(result);
        }

        function onConfirm() {
            if (options.action === 'reject' || options.action === 'cancel') {
                const reasonVal = (modalReasonInput?.value || '').trim();
                if (!reasonVal) {
                    modalReasonInput.style.borderColor = '#dc2626';
                    modalReasonInput.focus();
                    showToast('แจ้งเตือน', 'กรุณาระบุเหตุผลในการดำเนินการ', 'warning');
                    return;
                }
                modalReasonInput.style.borderColor = '';
                closeModal({ confirmed: true, reason: reasonVal });
                return;
            }
            closeModal({ confirmed: true });
        }

        function onCancel() {
            closeModal({ confirmed: false });
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                onCancel();
            } else if (e.key === 'Enter' && e.ctrlKey) {
                onConfirm();
            }
        }

        function onBackdropClick(e) {
            if (e.target === overlay) onCancel();
        }

        btnModalConfirm.addEventListener('click', onConfirm);
        btnModalCancel.addEventListener('click', onCancel);
        btnModalClose.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);
        overlay.addEventListener('click', onBackdropClick);
    });
}

function renderQuickTags(tags, inputElem, containerElem) {
    if (!containerElem || !inputElem) return;
    containerElem.innerHTML = '';
    tags.forEach((tag, idx) => {
        const chip = document.createElement('span');
        chip.className = `quick-tag-chip ${idx === 0 ? 'active' : ''}`;
        chip.textContent = tag;
        chip.addEventListener('click', () => {
            inputElem.value = tag;
            containerElem.querySelectorAll('.quick-tag-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            inputElem.focus();
        });
        containerElem.appendChild(chip);
    });
}

// =============================================================================
// Quotations List Controller & Fallback Data
// =============================================================================
const fallbackQuotations = [];

let allQuotations = [];
let currentFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('.data-table tbody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.getElementById('searchInput');
    const btnExportExcel = document.getElementById('btnExportExcel');

    // KPI and Count Badge Elements
    const kpiTotalCount = document.getElementById('kpiTotalCount');
    const kpiTotalSum = document.getElementById('kpiTotalSum');
    const kpiWaitingCount = document.getElementById('kpiWaitingCount');
    const kpiWaitingSum = document.getElementById('kpiWaitingSum');
    const kpiApprovedCount = document.getElementById('kpiApprovedCount');
    const kpiApprovedSum = document.getElementById('kpiApprovedSum');
    const kpiCancelledCount = document.getElementById('kpiCancelledCount');

    const countAll = document.getElementById('countAll');
    const countWaiting = document.getElementById('countWaiting');
    const countApproved = document.getElementById('countApproved');
    const countDraft = document.getElementById('countDraft');
    const countCancelled = document.getElementById('countCancelled');

    // Fetch Quotations from API
    async function loadQuotations() {
        try {
            const res = await fetch('/api/documents?type=QUOTATION');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    allQuotations = data;
                    renderQuotations();
                    updateKpiStats();
                    return;
                }
            }
        } catch (err) {
            console.warn('Running in local/standalone mode:', err);
        }

        allQuotations = [];
        renderQuotations();
        updateKpiStats();
    }
    window.loadQuotations = loadQuotations;

    function renderQuotations() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allQuotations;
        if (currentFilter !== 'ALL') {
            if (currentFilter === 'WAITING') {
                filtered = filtered.filter(q => ['WAITING', 'WAITING_APPROVAL'].includes(q.status));
            } else if (currentFilter === 'CANCELLED') {
                filtered = filtered.filter(q => ['CANCELLED', 'REJECTED'].includes(q.status));
            } else {
                filtered = filtered.filter(q => q.status === currentFilter);
            }
        }

        if (searchTerm) {
            filtered = filtered.filter(q => 
                (q.doc_number && q.doc_number.toLowerCase().includes(searchTerm)) ||
                (q.customer_name && q.customer_name.toLowerCase().includes(searchTerm)) ||
                (q.project_name && q.project_name.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 36px; color: #94a3b8;">
                        <div style="margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="#94a3b8" stroke-width="1.8" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        ไม่พบรายการใบเสนอราคาตามเงื่อนไขที่เลือก
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((q, idx) => {
            const relatedList = q.related_documents || [];
            const hasRelated = relatedList.length > 0;
            const isCompleted = q.status === 'COMPLETED' || (q.status === 'APPROVED' && hasRelated);
            const isApproved = q.status === 'APPROVED' && !hasRelated;
            const isWaiting = ['WAITING', 'WAITING_APPROVAL'].includes(q.status);
            const isDraft = q.status === 'DRAFT';
            const isCancelled = ['CANCELLED', 'REJECTED'].includes(q.status);

            const docNum = q.doc_number || '(ฉบับร่าง)';
            const formattedIssueDate = formatThaiDate(q.issue_date);
            const formattedValidDate = formatThaiDate(q.valid_until || q.due_date);

            const isBottomRow = filtered.length >= 3 && idx >= filtered.length - 2;

            // 1. Build Related Documents Popover HTML
            let relatedDocHtml = '';
            if (hasRelated) {
                const linksHtml = relatedList.map(r => {
                    let targetUrl = '#';
                    const idParam = r.id ? `id=${r.id}` : `doc=${encodeURIComponent(r.doc_number)}`;
                    if (r.doc_type === 'TAX_INVOICE' || (r.doc_number && r.doc_number.startsWith('INV'))) {
                        targetUrl = `invoice-new.html?${idParam}`;
                    } else if (r.doc_type === 'BILLING_NOTE' || (r.doc_number && r.doc_number.startsWith('BN'))) {
                        targetUrl = `billing-note-new.html?${idParam}`;
                    } else if (r.doc_type === 'RECEIPT' || (r.doc_number && r.doc_number.startsWith('RE'))) {
                        targetUrl = `cash-invoice-new.html?${idParam}`;
                    } else if (r.doc_type === 'CASH_SALE' || (r.doc_number && r.doc_number.startsWith('CS'))) {
                        targetUrl = `cash-sale-new.html?${idParam}`;
                    } else if (r.doc_type === 'QUOTATION' || (r.doc_number && r.doc_number.startsWith('QT'))) {
                        targetUrl = `quotation-new.html?${idParam}`;
                    } else if (r.doc_type === 'PURCHASE_ORDER' || (r.doc_number && r.doc_number.startsWith('PO'))) {
                        targetUrl = `purchase-order-new.html?${idParam}`;
                    }

                    return `
                        <a href="${targetUrl}" class="popover-link-item" title="เปิดดูเอกสาร ${escapeHtml(r.doc_number)}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            <span>${escapeHtml(r.doc_number)}</span>
                        </a>
                    `;
                }).join('');

                relatedDocHtml = `
                    <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                        <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="ดูเอกสารที่เกี่ยวข้อง (${relatedList.length} รายการ)">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        </button>
                        <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <div class="popover-title">เอกสารที่เกี่ยวข้อง</div>
                            <div class="popover-subtitle">เอกสารอ้างอิง</div>
                            ${linksHtml}
                        </div>
                    </div>
                `;
            }

            // 2. Build Status Dropdown Button & Menu HTML (FlowAccount Style)
            let statusBtnClass = 'split-waiting';
            let statusBtnText = 'รออนุมัติ';
            let statusMenuItems = '';

            if (isCompleted) {
                statusBtnClass = 'split-completed';
                statusBtnText = 'ดำเนินการแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">เอกสารที่ดำเนินการแล้ว</div>
                    ${hasRelated ? relatedList.map(r => {
                        let targetUrl = '#';
                        const idParam = r.id ? `id=${r.id}` : `doc=${encodeURIComponent(r.doc_number)}`;
                        if (r.doc_type === 'TAX_INVOICE' || (r.doc_number && r.doc_number.startsWith('INV'))) targetUrl = `invoice-new.html?${idParam}`;
                        else if (r.doc_type === 'BILLING_NOTE' || (r.doc_number && r.doc_number.startsWith('BN'))) targetUrl = `billing-note-new.html?${idParam}`;
                        else if (r.doc_type === 'RECEIPT' || (r.doc_number && r.doc_number.startsWith('RE'))) targetUrl = `cash-invoice-new.html?${idParam}`;
                        else if (r.doc_type === 'CASH_SALE' || (r.doc_number && r.doc_number.startsWith('CS'))) targetUrl = `cash-sale-new.html?${idParam}`;
                        return `
                            <a href="${targetUrl}" class="status-menu-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                <span>${escapeHtml(r.doc_number)}</span>
                            </a>
                        `;
                    }).join('') : '<div style="padding: 6px 14px; font-size: 12px; color: #64748b;">ดำเนินการครบถ้วนแล้ว</div>'}
                    <div class="status-menu-divider"></div>
                    <div class="status-menu-header">สร้างเอกสารเพิ่มเติม</div>
                    <a href="billing-note-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบวางบิลเพิ่ม</a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบกำกับภาษีเพิ่ม</a>
                `;
            } else if (isApproved) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'อนุมัติแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">สร้างเอกสารต่อเนื่อง (เต็มจำนวน)</div>
                    <a href="billing-note-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบวางบิล</a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี</a>
                    <a href="cash-sale-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบกำกับภาษี/ใบเสร็จรับเงิน (เงินสด)</a>
                    <div class="status-menu-divider"></div>
                    <div class="status-menu-header">แบ่งจ่ายตามงวด</div>
                    <a href="billing-note-new.html?ref=${encodeURIComponent(docNum)}&split=true" class="status-menu-item">แบ่งจ่ายใบวางบิล</a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(docNum)}&split=true" class="status-menu-item">แบ่งจ่ายใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี</a>
                    <a href="cash-sale-new.html?ref=${encodeURIComponent(docNum)}&split=true" class="status-menu-item">แบ่งจ่ายใบกำกับภาษี/ใบเสร็จรับเงิน (เงินสด)</a>
                    <div class="status-menu-divider"></div>
                    <div class="status-menu-header">เงินมัดจำ</div>
                    <a href="billing-note-new.html?ref=${encodeURIComponent(docNum)}&deposit=true" class="status-menu-item">มัดจำใบวางบิล</a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(docNum)}&deposit=true" class="status-menu-item">มัดจำใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี</a>
                    <a href="cash-sale-new.html?ref=${encodeURIComponent(docNum)}&deposit=true" class="status-menu-item">มัดจำใบกำกับภาษี/ใบเสร็จรับเงิน (เงินสด)</a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-qt-action" data-action="cancel" data-id="${q.id}" data-num="${escapeHtml(docNum)}" data-customer="${escapeHtml(q.customer_name)}" data-total="${q.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ไม่อนุมัติ / ยกเลิก</span>
                    </button>
                `;
            } else if (isWaiting) {
                statusBtnClass = 'split-waiting';
                statusBtnText = 'รออนุมัติ';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-qt-action" data-action="approve" data-id="${q.id}" data-num="${escapeHtml(docNum)}" data-customer="${escapeHtml(q.customer_name)}" data-total="${q.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>อนุมัติ</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <div class="status-menu-header">สร้างเอกสารต่อเนื่อง</div>
                    <a href="billing-note-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบวางบิล</a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี</a>
                    <a href="cash-sale-new.html?ref=${encodeURIComponent(docNum)}" class="status-menu-item">สร้างใบกำกับภาษี/ใบเสร็จรับเงิน (เงินสด)</a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-qt-action" data-action="reject" data-id="${q.id}" data-num="${escapeHtml(docNum)}" data-customer="${escapeHtml(q.customer_name)}" data-total="${q.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ไม่อนุมัติ</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = q.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-qt-action" data-action="approve" data-id="${q.id}" data-num="${escapeHtml(docNum)}" data-customer="${escapeHtml(q.customer_name)}" data-total="${q.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>เปลี่ยนเป็นอนุมัติ</span>
                    </button>
                `;
            } else {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <button type="button" class="status-menu-item btn-qt-action" data-action="submit" data-id="${q.id}" data-num="${escapeHtml(docNum)}" data-customer="${escapeHtml(q.customer_name)}" data-total="${q.grand_total || 0}" style="color: #0284c7;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        <span>ส่งขออนุมัติ</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="width: 40px; text-align: center;"><input type="checkbox"></td>
                    <td style="width: 160px; text-align: left;">
                        <div class="doc-number-cell" style="display: flex; align-items: center; gap: 6px;">
                            <a href="quotation-new.html?id=${q.id}" class="doc-link" style="font-weight: 700; color: ${isCancelled ? '#94a3b8' : '#7D0A0A'}; ${isCancelled ? 'text-decoration: line-through;' : ''}">
                                ${escapeHtml(docNum)}
                            </a>
                            ${relatedDocHtml}
                        </div>
                        ${q.project_name ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(q.project_name)}">${escapeHtml(q.project_name)}</div>` : ''}
                    </td>
                    <td style="width: 95px; text-align: left; white-space: nowrap; font-size: 13px; color: #475569;">${formattedIssueDate}</td>
                    <td style="width: 95px; text-align: left; white-space: nowrap; font-size: 13px; color: #475569;">${formattedValidDate}</td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b; max-width: 220px;" title="${escapeHtml(q.customer_name || '-')}">
                            ${escapeHtml(q.customer_name || '-')}
                        </div>
                    </td>
                    <td class="text-right" style="width: 130px; text-align: right; padding-right: 14px; white-space: nowrap;">
                        <strong style="color: #059669; font-size: 14px; font-family: 'Inter', sans-serif;">฿ ${(q.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </td>
                    <td class="text-center" style="width: 115px; text-align: center;">
                        <div class="status-split-btn-group ${statusBtnClass}">
                            <button type="button" class="status-split-main" onclick="toggleStatusDropdown(this, event)" title="สถานะ: ${escapeHtml(statusBtnText)}">
                                <span>${statusBtnText}</span>
                            </button>
                            <button type="button" class="status-split-toggle" onclick="toggleStatusDropdown(this, event)" title="เปลี่ยนสถานะ / ตัวเลือกเพิ่มเติม">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div class="status-dropdown-menu ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                                ${statusMenuItems}
                            </div>
                        </div>
                    </td>
                    <td class="text-center" style="width: 65px; text-align: center;">
                        <div class="action-dropdown-container">
                            <button type="button" class="btn-action-more" onclick="toggleActionMenu(this, event)" title="การดำเนินการเพิ่มเติม">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"></circle><circle cx="19" cy="12" r="2.5"></circle><circle cx="5" cy="12" r="2.5"></circle></svg>
                            </button>
                            <div class="action-menu-dropdown ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                                <a href="quotation-new.html?id=${q.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${q.id}" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${q.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${q.id}&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="print.html?id=${q.id}&envelope=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>พิมพ์จ่าหน้าซอง</span>
                                </a>
                                <a href="quotation-new.html?copy=${q.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${q.id}', '${escapeHtml(docNum)}', '${q.status}', '${escapeHtml(q.customer_name)}', '${q.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    window.renderQuotations = renderQuotations;

    function updateKpiStats() {
        const totalCount = allQuotations.length;
        const totalAmount = allQuotations.reduce((sum, q) => sum + (q.status !== 'CANCELLED' && q.status !== 'REJECTED' ? (q.grand_total || 0) : 0), 0);
        
        const waitingDocs = allQuotations.filter(q => ['WAITING', 'WAITING_APPROVAL'].includes(q.status));
        const waitingAmount = waitingDocs.reduce((sum, q) => sum + (q.grand_total || 0), 0);

        const approvedDocs = allQuotations.filter(q => q.status === 'APPROVED' || q.status === 'COMPLETED');
        const approvedAmount = approvedDocs.reduce((sum, q) => sum + (q.grand_total || 0), 0);

        const draftDocs = allQuotations.filter(q => q.status === 'DRAFT');
        const cancelledDocs = allQuotations.filter(q => ['CANCELLED', 'REJECTED'].includes(q.status));

        if (kpiTotalCount) kpiTotalCount.textContent = `${totalCount} รายการ`;
        if (kpiTotalSum) kpiTotalSum.textContent = `รวมมูลค่า ฿ ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiWaitingCount) kpiWaitingCount.textContent = `${waitingDocs.length} รายการ`;
        if (kpiWaitingSum) kpiWaitingSum.textContent = `฿ ${waitingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiApprovedCount) kpiApprovedCount.textContent = `${approvedDocs.length} รายการ`;
        if (kpiApprovedSum) kpiApprovedSum.textContent = `฿ ${approvedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiCancelledCount) kpiCancelledCount.textContent = `${cancelledDocs.length} รายการ`;

        // Update tab badges
        if (countAll) countAll.textContent = totalCount;
        if (countWaiting) countWaiting.textContent = waitingDocs.length;
        if (countApproved) countApproved.textContent = approvedDocs.length;
        if (countDraft) countDraft.textContent = draftDocs.length;
        if (countCancelled) countCancelled.textContent = cancelledDocs.length;

        if (typeof window.updateSidebarPendingBadges === 'function') {
            window.updateSidebarPendingBadges();
        }
    }
    window.updateKpiStats = updateKpiStats;

    // Export Excel / CSV Functionality
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (searchInput?.value || '').trim();
            const url = `/api/documents/export/csv?type=QUOTATION&status=${currentFilter}&search=${encodeURIComponent(searchTerm)}`;
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `Quotations_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV เรียบร้อยแล้ว', 'info');
        });
    }

    // Filter Tabs
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentFilter = btn.getAttribute('data-filter') || 'ALL';
            renderQuotations();
        });
    });

    // Search Input
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderQuotations();
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    // Initial load
    loadQuotations();
});

// =============================================================================
// Global Event Delegation for Approve / Reject / Cancel / Submit
// Uses Modern Custom Modal & Toast / Snackbar Notifications
// =============================================================================
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-qt-action');
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const num = btn.getAttribute('data-num');
    const customer = btn.getAttribute('data-customer') || '-';
    const total = parseFloat(btn.getAttribute('data-total') || '0');

    // Close any open status dropdown menus
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    // 1. Open Modern Confirmation Modal Dialog
    const dialogResult = await openActionDialog({
        action,
        docNum: num,
        customerName: customer,
        grandTotal: total
    });

    if (!dialogResult.confirmed) return;

    let body = { user_role: 'ADMIN' };
    if (typeof getCurrentUser === 'function') {
        try {
            const u = getCurrentUser();
            if (u) {
                body.user_role = u.role || 'ADMIN';
                body.user_id = u.id || 1;
            }
        } catch (_) {}
    }

    if (dialogResult.reason) {
        body.reason = dialogResult.reason;
    }

    try {
        const res = await fetch(`/api/documents/${id}/actions/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
            const actionLabel = action === 'approve' ? 'อนุมัติ' : action === 'reject' ? 'ไม่อนุมัติ' : action === 'cancel' ? 'ยกเลิก' : 'ส่งขออนุมัติ';
            showToast('ดำเนินการสำเร็จ', `ปรับสถานะใบเสนอราคา ${num} เป็น "${actionLabel}" เรียบร้อยแล้ว`, action === 'reject' ? 'error' : 'success');
            
            if (typeof window.loadQuotations === 'function') {
                window.loadQuotations();
            } else {
                window.location.reload();
            }
            return;
        } else {
            showToast('ไม่สามารถทำรายการได้', resData.error || 'เกิดข้อผิดพลาดในการปรับปรุงสถานะ', 'error');
        }
    } catch (err) {
        console.warn('Network action failed, using offline fallback:', err);
        const item = allQuotations.find(q => String(q.id) === String(id) || q.doc_number === num);
        if (item) {
            if (action === 'approve') item.status = 'APPROVED';
            else if (action === 'reject') item.status = 'REJECTED';
            else if (action === 'cancel') item.status = 'CANCELLED';
            else if (action === 'submit') item.status = 'WAITING_APPROVAL';
            if (typeof window.renderQuotations === 'function') window.renderQuotations();
            if (typeof window.updateKpiStats === 'function') window.updateKpiStats();
            
            const actionLabel = action === 'approve' ? 'อนุมัติ' : action === 'reject' ? 'ไม่อนุมัติ' : action;
            showToast('ดำเนินการสำเร็จ', `ดำเนินการ "${actionLabel}" ${num} เรียบร้อยแล้ว`, action === 'reject' ? 'error' : 'success');
        }
    }
});

// Global toggle for FlowAccount-style status dropdown menu (Split Button)
window.toggleStatusDropdown = function(btn, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const container = btn.closest('.status-split-btn-group') || btn.closest('.status-dropdown-container');
    if (!container) return;
    const menu = container.querySelector('.status-dropdown-menu');
    if (!menu) return;
    
    const isCurrentlyActive = menu.classList.contains('active') || menu.style.display === 'block';

    // Close all other status and action menus
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isCurrentlyActive) {
        // Smart flip detection: Check actual distance from button to bottom of viewport!
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 340) {
            menu.classList.add('dropup');
        } else {
            menu.classList.remove('dropup');
        }

        menu.classList.add('active');
        menu.style.display = 'block';
    } else {
        menu.classList.remove('active');
        menu.style.display = 'none';
    }
};

// Global toggle for FlowAccount-style Action More [ ••• ] dropdown menu
window.toggleActionMenu = function(btn, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const container = btn.closest('.action-dropdown-container');
    if (!container) return;
    const menu = container.querySelector('.action-menu-dropdown');
    if (!menu) return;
    
    const isCurrentlyActive = menu.classList.contains('active') || menu.style.display === 'block';

    // Close all menus
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isCurrentlyActive) {
        // Smart flip detection: Check actual distance from button to bottom of viewport!
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 340) {
            menu.classList.add('dropup');
        } else {
            menu.classList.remove('dropup');
        }

        menu.classList.add('active');
        menu.style.display = 'block';
    } else {
        menu.classList.remove('active');
        menu.style.display = 'none';
    }
};

// Share document link helper with Toast notification
window.shareDocument = function(docNum, id) {
    const shareUrl = `${window.location.origin}/documents/print.html?id=${id}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์ออนไลน์สำหรับ ${docNum} เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์ใบเสนอราคา ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์ใบเสนอราคา ${docNum}:`, shareUrl);
    }
};

// Delete / Cancel document helper with Modal Dialog & Toast
window.deleteDocument = async function(id, docNum, status, customerName = '-', grandTotal = 0) {
    if (status && status !== 'DRAFT' && status !== 'CANCELLED') {
        const dialogRes = await openActionDialog({
            action: 'cancel',
            docNum: docNum,
            customerName: customerName,
            grandTotal: grandTotal
        });

        if (!dialogRes.confirmed) return;

        try {
            const res = await fetch(`/api/documents/${id}/actions/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: dialogRes.reason || 'ลูกค้ายกเลิกคำสั่งซื้อ' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                showToast('ยกเลิกเอกสารสำเร็จ', `ยกเลิกใบเสนอราคา ${docNum} เรียบร้อยแล้ว`, 'warning');
                if (typeof window.loadQuotations === 'function') {
                    window.loadQuotations();
                } else {
                    window.location.reload();
                }
            } else {
                showToast('ไม่สามารถยกเลิกเอกสารได้', data.error || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (err) {
            showToast('การเชื่อมต่อล้มเหลว', err.message, 'error');
        }
        return;
    }

    const dialogRes = await openActionDialog({
        action: 'delete',
        docNum: docNum,
        customerName: customerName,
        grandTotal: grandTotal
    });

    if (!dialogRes.confirmed) return;

    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('ลบเอกสารสำเร็จ', `ลบใบเสนอราคา ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
            if (typeof window.loadQuotations === 'function') {
                window.loadQuotations();
            } else {
                window.location.reload();
            }
        } else {
            showToast('ไม่สามารถลบเอกสารได้', data.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (err) {
        showToast('การเชื่อมต่อล้มเหลว', err.message, 'error');
    }
};

window.toggleRelatedPopover = function(btn, event) {
    if (event) event.stopPropagation();
    const wrapper = btn.closest('.related-doc-wrapper') || btn.parentElement;
    if (!wrapper) return;
    const popover = wrapper.querySelector('.related-docs-popover');
    if (!popover) return;

    const isOpen = popover.classList.contains('active') || popover.style.display === 'block';
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isOpen) {
        popover.classList.add('active');
        popover.style.display = 'block';
    }
};

// Close all menus on click outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.status-split-btn-group') && 
        !e.target.closest('.status-dropdown-container') && 
        !e.target.closest('.action-dropdown-container') &&
        !e.target.closest('.related-doc-wrapper') &&
        !e.target.closest('.btn-related-doc')) {
        document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
            m.classList.remove('active');
            m.style.display = 'none';
        });
    }
});
