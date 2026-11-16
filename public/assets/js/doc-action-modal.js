/**
 * FlowAccount Advance - Shared Document Action Modal & Toast / Snackbar System
 * Standardized across all MAM trade documents (Quotations, Billing Notes, Invoices, Receipts, Cash Sales)
 * Strictly 0 emojis (SVG icons only)
 */

(function() {
    // 1. Auto-inject Modal Overlay and Toast Container if not present
    function ensureModalAndToastDOM() {
        if (!document.getElementById('actionModalOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'actionModalOverlay';
            overlay.className = 'doc-action-modal-overlay';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="doc-action-modal-card">
                    <div class="doc-action-modal-header">
                        <div class="doc-action-icon-badge" id="modalIconBadge"></div>
                        <div style="flex: 1;">
                            <h3 class="doc-action-title" id="modalTitle">ยืนยันการทำรายการ</h3>
                            <p class="doc-action-subtitle" id="modalSubtitle">เลขที่เอกสาร</p>
                        </div>
                        <button type="button" class="doc-action-modal-close" id="btnModalClose" aria-label="Close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    <div class="doc-action-modal-body" id="modalBody">
                        <div class="doc-action-info-box" id="modalInfoBox">
                            <div class="info-row">
                                <span class="info-label">ลูกค้า / องค์กร:</span>
                                <strong class="info-val" id="modalCustomerName">-</strong>
                            </div>
                            <div class="info-row">
                                <span class="info-label">มูลค่ารวม:</span>
                                <strong class="info-val text-success" id="modalGrandTotal">฿ 0.00</strong>
                            </div>
                        </div>

                        <div class="doc-action-reason-group" id="modalReasonGroup" style="display: none;">
                            <label class="doc-action-input-label" for="modalReasonInput">
                                เหตุผลในการดำเนินการ <span class="text-danger">*</span>
                            </label>
                            <textarea id="modalReasonInput" class="doc-action-textarea" rows="2" placeholder="ระบุเหตุผลในการดำเนินการ..."></textarea>
                            
                            <div class="quick-tags-container">
                                <span class="quick-tags-label">ตัวเลือกด่วน (คลิกเพื่อเลือก):</span>
                                <div class="quick-tags-list" id="quickTagsList"></div>
                            </div>
                        </div>
                    </div>

                    <div class="doc-action-modal-footer">
                        <button type="button" class="btn-modal-cancel" id="btnModalCancel">ยกเลิก</button>
                        <button type="button" class="btn-modal-confirm" id="btnModalConfirm">
                            <span id="btnModalConfirmText">ยืนยัน</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        if (!document.getElementById('toastNotificationContainer')) {
            const toastContainer = document.createElement('div');
            toastContainer.id = 'toastNotificationContainer';
            toastContainer.className = 'mam-toast-container';
            document.body.appendChild(toastContainer);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureModalAndToastDOM);
    } else {
        ensureModalAndToastDOM();
    }

    // 2. Global Toast Notification
    window.showToast = function(arg1, arg2, arg3) {
        if (typeof window.showDocToast === 'function') {
            return window.showDocToast(arg1, arg2, arg3);
        }
        ensureModalAndToastDOM();
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

        const safeTitle = String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeMessage = String(message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        toast.innerHTML = `
            <div class="toast-icon-wrap ${type}">
                ${iconSvg}
            </div>
            <div class="toast-text-wrap">
                <div class="toast-text-title">${safeTitle}</div>
                ${safeMessage ? `<div class="toast-text-desc">${safeMessage}</div>` : ''}
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
    };

    // 3. Global Action Confirmation Modal Dialog
    window.openActionDialog = function(options) {
        ensureModalAndToastDOM();
        return new Promise((resolve) => {
            const overlay = document.getElementById('actionModalOverlay');
            if (!overlay) return resolve({ confirmed: false });

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

            const docTypeLabel = options.docTypeLabel || 'เอกสาร';
            modalSubtitle.textContent = `เลขที่${docTypeLabel}: ${options.docNum || '-'}`;
            modalCustomerName.textContent = options.customerName || '-';
            modalGrandTotal.textContent = typeof options.grandTotal === 'number'
                ? `฿ ${options.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : (options.grandTotal || '-');

            modalIconBadge.className = 'doc-action-icon-badge';
            btnModalConfirm.className = 'btn-modal-confirm';

            if (options.action === 'approve') {
                modalTitle.textContent = options.title || `ยืนยันการอนุมัติ${docTypeLabel}`;
                modalIconBadge.classList.add('icon-approve');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                modalReasonGroup.style.display = 'none';
                btnModalConfirm.classList.add('btn-confirm-approve');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันอนุมัติ';
            } else if (options.action === 'pay' || options.action === 'mark_paid') {
                modalTitle.textContent = options.title || `ยืนยันการรับชำระเงิน${docTypeLabel}`;
                modalIconBadge.classList.add('icon-approve');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                modalReasonGroup.style.display = 'none';
                btnModalConfirm.classList.add('btn-confirm-approve');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันรับชำระ';
            } else if (options.action === 'reject') {
                modalTitle.textContent = options.title || `ไม่อนุมัติ${docTypeLabel}`;
                modalIconBadge.classList.add('icon-reject');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                modalReasonGroup.style.display = 'flex';
                modalReasonInput.value = options.defaultReason || 'ราคาไม่อนุมัติ / ลูกค้าปฏิเสธ';
                btnModalConfirm.classList.add('btn-confirm-reject');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันไม่อนุมัติ';

                const defaultTags = ['ราคาไม่อนุมัติ / ลูกค้าปฏิเสธ', 'ลูกค้าชะลอโครงการ', 'สั่งซื้อจากผู้จำหน่ายรายอื่น', 'ต้องการปรับลดงบประมาณ'];
                renderQuickTags(defaultTags, modalReasonInput, quickTagsList);
            } else if (options.action === 'cancel') {
                modalTitle.textContent = options.title || `ยืนยันการยกเลิก${docTypeLabel}`;
                modalIconBadge.classList.add('icon-cancel');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;
                modalReasonGroup.style.display = 'flex';
                modalReasonInput.value = options.defaultReason || 'ลูกค้ายกเลิกคำสั่งซื้อ';
                btnModalConfirm.classList.add('btn-confirm-cancel');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันยกเลิกเอกสาร';

                const cancelTags = ['ลูกค้ายกเลิกคำสั่งซื้อ', 'จัดทำเอกสารผิดพลาด', 'ออกเอกสารฉบับใหม่แทน', 'ยอดเงินไม่ถูกต้อง'];
                renderQuickTags(cancelTags, modalReasonInput, quickTagsList);
            } else if (options.action === 'delete') {
                modalTitle.textContent = options.title || `ยืนยันการลบ${docTypeLabel}`;
                modalIconBadge.classList.add('icon-delete');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                modalReasonGroup.style.display = 'none';
                btnModalConfirm.classList.add('btn-confirm-delete');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันลบเอกสาร';
            } else if (options.action === 'submit') {
                modalTitle.textContent = options.title || `ยืนยันส่งขออนุมัติ${docTypeLabel}`;
                modalIconBadge.classList.add('icon-approve');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
                modalReasonGroup.style.display = 'none';
                btnModalConfirm.classList.add('btn-confirm-approve');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันส่งขออนุมัติ';
            } else if (options.action === 'receive') {
                modalTitle.textContent = options.title || `ยืนยันการตรวจรับสินค้าเข้าสต็อก`;
                modalIconBadge.classList.add('icon-approve');
                modalIconBadge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
                modalReasonGroup.style.display = 'none';
                btnModalConfirm.classList.add('btn-confirm-approve');
                btnModalConfirmText.textContent = options.confirmText || 'ยืนยันตรวจรับเข้าสต็อก';
            }

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
                        window.showToast('แจ้งเตือน', 'กรุณาระบุเหตุผลในการดำเนินการ', 'warning');
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
                if (e.key === 'Escape') onCancel();
                else if (e.key === 'Enter' && e.ctrlKey) onConfirm();
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
    };
    window.showDocActionModal = window.openActionDialog;

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

    // 4. Global Smart Toggle for Dropdown Menus (Prevents any dropdown clipping)
    window.toggleSmartDropdown = function(btn, event, menuSelector, containerSelector) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const container = btn.closest(containerSelector || '.status-split-btn-group') || btn.closest('.status-dropdown-container') || btn.closest('.action-dropdown-container');
        if (!container) return;
        const menu = container.querySelector(menuSelector || '.status-dropdown-menu') || container.querySelector('.action-menu-dropdown');
        if (!menu) return;

        const isCurrentlyActive = menu.classList.contains('active') || menu.style.display === 'block';

        // Close all other dropdowns
        document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
            m.classList.remove('active');
            m.style.display = 'none';
        });

        if (!isCurrentlyActive) {
            // Smart flip: Check actual distance from button to bottom of screen
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
})();
