/**
 * MAM Advance - Expenses Management Controller
 * Standardized to FlowAccount Advance UX / UI matching Quotations & Purchase Orders design.
 * Features:
 *  - Metric KPI cards & Tab counters
 *  - Status Split Dropdown Button (FlowAccount style)
 *  - Compact Action Menu Dropdown (3-dots)
 *  - Related Documents popover (PO reference link, Vendor Tax ID)
 *  - Slip image modal viewer
 *  - Integration with doc-action-modal and Toast notifications
 *  - Excel / CSV report export
 *  - Strictly 0 emojis (SVG icons only)
 */

let allExpenses = [];
let currentFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    initExpenses();
    setupEventListeners();
});

async function initExpenses() {
    await Promise.all([fetchStats(), fetchExpenses()]);
}
window.initExpenses = initExpenses;

function setupEventListeners() {
    // Status Tabs
    document.querySelectorAll('.doc-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.doc-tab-btn').forEach(b => b.classList.remove('active'));
            const clicked = e.currentTarget;
            clicked.classList.add('active');
            currentFilter = clicked.getAttribute('data-status') || 'ALL';
            renderTable();
        });
    });

    // Search Box
    const searchInput = document.getElementById('searchExpenseInput');
    const urlSearch = new URLSearchParams(window.location.search).get('search');
    if (urlSearch && searchInput) {
        searchInput.value = urlSearch;
    }
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            renderTable();
        }, 250));
    }

    // Category Filter
    const catSelect = document.getElementById('categoryFilter');
    if (catSelect) {
        catSelect.addEventListener('change', () => {
            renderTable();
        });
    }

    // Modal Close
    const closeBtn = document.getElementById('closeModalBtn');
    const modalOverlay = document.getElementById('imageModalOverlay');
    if (closeBtn && modalOverlay) {
        closeBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('active');
            }
        });
    }

    // Export Excel / CSV
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (document.getElementById('searchExpenseInput')?.value || '').trim();
            const selectedCat = document.getElementById('categoryFilter')?.value || 'ALL';
            const url = `/api/expenses/export/csv?status=${currentFilter}&category=${encodeURIComponent(selectedCat)}&search=${encodeURIComponent(searchTerm)}`;

            const link = document.createElement('a');
            link.href = url;
            link.download = `Expenses_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.showToast) {
                window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงานค่าใช้จ่ายเรียบร้อยแล้ว', 'info');
            }
        });
    }
}

async function fetchStats() {
    try {
        const res = await fetch('/api/expenses/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const stats = await res.json();

        const elTotal = document.getElementById('kpiTotalExpenses');
        const elTotalCount = document.getElementById('kpiTotalCount');
        const elUnpaid = document.getElementById('kpiUnpaidExpenses');
        const elUnpaidCount = document.getElementById('kpiUnpaidCount');
        const elPaid = document.getElementById('kpiPaidExpenses');
        const elPaidCount = document.getElementById('kpiPaidCount');
        const elClaimableVat = document.getElementById('kpiClaimableVat');

        if (elTotal) elTotal.textContent = `฿ ${formatNumber(stats.total_amount)}`;
        if (elTotalCount) elTotalCount.textContent = `${stats.total_count || 0} รายการ`;
        if (elUnpaid) elUnpaid.textContent = `฿ ${formatNumber(stats.unpaid_amount)}`;
        if (elUnpaidCount) elUnpaidCount.textContent = `${stats.unpaid_count || 0} รายการ`;
        if (elPaid) elPaid.textContent = `฿ ${formatNumber(stats.paid_amount)}`;
        if (elPaidCount) elPaidCount.textContent = `${stats.paid_count || 0} รายการ`;
        if (elClaimableVat) elClaimableVat.textContent = `฿ ${formatNumber(stats.claimable_vat)}`;
    } catch (err) {
        console.error('Error fetching expense stats:', err);
    }
}

async function fetchExpenses() {
    const tableBody = document.getElementById('expensesTableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">
                    กำลังโหลดข้อมูลค่าใช้จ่าย...
                </td>
            </tr>
        `;
    }

    try {
        const res = await fetch('/api/expenses');
        if (!res.ok) throw new Error('Failed to load expenses');
        allExpenses = await res.json();
        updateTabBadges();
        renderTable();
    } catch (err) {
        console.error('Error fetching expenses:', err);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 30px; color: #ef4444;">
                        เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
}

function updateTabBadges() {
    const countAll = document.getElementById('countAll');
    const countUnpaid = document.getElementById('countUnpaid');
    const countPaid = document.getElementById('countPaid');
    const countDraft = document.getElementById('countDraft');

    const total = allExpenses.length;
    const unpaid = allExpenses.filter(e => e.payment_status === 'UNPAID').length;
    const paid = allExpenses.filter(e => e.payment_status === 'PAID').length;
    const draft = allExpenses.filter(e => e.payment_status === 'DRAFT').length;

    if (countAll) countAll.textContent = total;
    if (countUnpaid) countUnpaid.textContent = unpaid;
    if (countPaid) countPaid.textContent = paid;
    if (countDraft) countDraft.textContent = draft;
}

function renderTable() {
    const tableBody = document.getElementById('expensesTableBody');
    if (!tableBody) return;

    const searchTerm = (document.getElementById('searchExpenseInput')?.value || '').trim().toLowerCase();
    const selectedCat = document.getElementById('categoryFilter')?.value || 'ALL';

    const filtered = allExpenses.filter(exp => {
        // Status filter
        if (currentFilter !== 'ALL' && exp.payment_status !== currentFilter) {
            return false;
        }

        // Category filter
        if (selectedCat !== 'ALL') {
            if (selectedCat === 'ต้นทุนสินค้าและบริการ' || selectedCat === 'ต้นทุนสินค้า / วัตถุดิบ') {
                if (exp.category !== 'ต้นทุนสินค้าและบริการ' && exp.category !== 'ต้นทุนสินค้า / วัตถุดิบ') {
                    return false;
                }
            } else if (exp.category !== selectedCat) {
                return false;
            }
        }

        // Search text
        if (searchTerm) {
            const docNo = (exp.doc_number || '').toLowerCase();
            const vendor = (exp.vendor_name || '').toLowerCase();
            const refNo = (exp.ref_doc_number || '').toLowerCase();
            const note = (exp.remarks || '').toLowerCase();
            return docNo.includes(searchTerm) || vendor.includes(searchTerm) || refNo.includes(searchTerm) || note.includes(searchTerm);
        }

        return true;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 42px 20px; color: #94a3b8;">
                    <div style="margin-bottom: 10px;">
                        <svg width="40" height="40" viewBox="0 0 24 24" stroke="#94a3b8" stroke-width="1.8" fill="none">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                    </div>
                    <div style="font-weight: 500; font-size: 13.5px; color: #64748b;">ไม่พบรายการค่าใช้จ่ายตามเงื่อนไขที่เลือก</div>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = filtered.map((exp, idx) => {
        const isPaid = exp.payment_status === 'PAID';
        const isUnpaid = exp.payment_status === 'UNPAID';
        const isDraft = exp.payment_status === 'DRAFT';

        const docNum = exp.doc_number || '-';
        const formattedDate = formatThaiDate(exp.transaction_date);
        const vendorName = exp.vendor_name || 'ไม่ระบุผู้จำหน่าย';
        const isBottomRow = filtered.length >= 3 && idx >= filtered.length - 2;

        // 1. Build Related Documents Popover HTML (PO ref & Vendor Tax)
        const hasPO = Boolean(exp.ref_doc_number && exp.ref_doc_number.trim() !== '');
        const hasTaxId = Boolean(exp.vendor_tax_id && exp.vendor_tax_id.trim() !== '');

        let relatedDocHtml = '';
        if (hasPO || hasTaxId) {
            let linksHtml = '';
            if (hasPO) {
                linksHtml += `
                    <a href="../documents/purchase-orders.html?search=${encodeURIComponent(exp.ref_doc_number)}" class="popover-link-item" title="เปิดดูใบสั่งซื้อ ${escapeHtml(exp.ref_doc_number)}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        <span>ใบสั่งซื้อ: ${escapeHtml(exp.ref_doc_number)}</span>
                    </a>
                `;
            }
            if (hasTaxId) {
                linksHtml += `
                    <div class="popover-link-item" style="color: #64748b; cursor: default;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line></svg>
                        <span>เลขภาษี: ${escapeHtml(exp.vendor_tax_id)}</span>
                    </div>
                `;
            }

            relatedDocHtml = `
                <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                    <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="ดูข้อมูลอ้างอิงและประวัติ">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    </button>
                    <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                        <div class="popover-title">เอกสารและประวัติอ้างอิง</div>
                        <div class="popover-subtitle">ระบบจัดซื้อและค่าใช้จ่าย</div>
                        ${linksHtml}
                    </div>
                </div>
            `;
        }

        // 2. Build Status Split Dropdown Button
        let statusBtnClass = 'split-waiting';
        let statusBtnText = 'รอชำระเงิน';
        let statusMenuItems = '';

        if (isPaid) {
            statusBtnClass = 'split-approved';
            statusBtnText = 'ชำระแล้ว';
            statusMenuItems = `
                <div class="status-menu-header">ข้อมูลการชำระ</div>
                <div style="padding: 6px 14px; font-size: 12px; color: #64748b;">
                    วิธีชำระ: ${escapeHtml(exp.payment_method || 'โอนเงิน')}
                </div>
                ${exp.slip_url ? `
                    <button type="button" class="status-menu-item" onclick="openSlipModal('${encodeURIComponent(exp.slip_url)}', '${escapeHtml(docNum)}', '${encodeURIComponent(vendorName)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <span>ดูหลักฐานสลิป</span>
                    </button>
                ` : ''}
                <div class="status-menu-divider"></div>
                <button type="button" class="status-menu-item text-warning" onclick="updateExpenseStatus(${exp.id}, 'UNPAID', '${escapeHtml(docNum)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span>เปลี่ยนเป็นรอชำระเงิน</span>
                </button>
            `;
        } else if (isUnpaid) {
            statusBtnClass = 'split-waiting';
            statusBtnText = 'รอชำระเงิน';
            statusMenuItems = `
                <button type="button" class="status-menu-item text-success" onclick="markAsPaid(${exp.id}, '${escapeHtml(docNum)}', '${escapeHtml(vendorName)}', ${exp.net_total || 0})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>บันทึกการชำระเงิน</span>
                </button>
                <div class="status-menu-divider"></div>
                <button type="button" class="status-menu-item text-danger" onclick="deleteExpense(${exp.id}, '${escapeHtml(docNum)}', '${escapeHtml(vendorName)}', ${exp.net_total || 0})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span>ยกเลิก / ลบรายการ</span>
                </button>
            `;
        } else {
            statusBtnClass = 'split-draft';
            statusBtnText = 'แบบร่าง';
            statusMenuItems = `
                <button type="button" class="status-menu-item text-success" onclick="updateExpenseStatus(${exp.id}, 'UNPAID', '${escapeHtml(docNum)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>ยืนยันเป็นรอชำระ</span>
                </button>
            `;
        }

        // 3. Slip Thumbnail Element
        let slipElement = `<span style="color: #cbd5e1; font-size: 13px;">-</span>`;
        if (exp.slip_url) {
            slipElement = `
                <button type="button" class="slip-thumbnail-btn" onclick="openSlipModal('${encodeURIComponent(exp.slip_url)}', '${escapeHtml(docNum)}', '${encodeURIComponent(vendorName)}')" title="คลิกเพื่อดูหลักฐานสลิป">
                    <img src="${exp.slip_url}" alt="Slip" onerror="this.src='https://placehold.co/40x40?text=Slip'">
                    <span>สลิป</span>
                </button>
            `;
        }

        return `
            <tr>
                <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                <td style="text-align: left; white-space: nowrap;">${formattedDate}</td>
                <td style="text-align: left;">
                    <div class="doc-number-cell">
                        <strong style="color: #7D0A0A;">${escapeHtml(docNum)}</strong>
                        ${relatedDocHtml}
                    </div>
                </td>
                <td style="text-align: left; max-width: 220px;">
                    <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(vendorName)}">
                        ${escapeHtml(vendorName)}
                    </div>
                </td>
                <td style="text-align: left;">
                    <span class="category-tag">${escapeHtml(exp.category || 'ทั่วไป')}</span>
                </td>
                <td class="text-right" style="text-align: right; white-space: nowrap;">
                    <strong style="color: #059669;">฿ ${formatNumber(exp.net_total)}</strong>
                    ${exp.vat_amount > 0 ? `<div style="font-size: 11px; font-weight: normal; color: #64748b;">(VAT ฿${formatNumber(exp.vat_amount)})</div>` : ''}
                </td>
                <td class="text-center" style="text-align: center;">
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
                <td class="text-center" style="text-align: center;">${slipElement}</td>
                <td class="text-center" style="text-align: center;">
                    <div class="action-dropdown-container">
                        <button type="button" class="btn-action-more" onclick="toggleActionMenu(this, event)" title="การดำเนินการเพิ่มเติม">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"></circle><circle cx="19" cy="12" r="2.5"></circle><circle cx="5" cy="12" r="2.5"></circle></svg>
                        </button>
                        <div class="action-menu-dropdown ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <a href="expense-new.html?id=${exp.id}" class="action-menu-item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                <span>แก้ไข</span>
                            </a>
                            <a href="../documents/print.html?id=${exp.id}&type=expense" target="_blank" class="action-menu-item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                <span>พิมพ์ใบสำคัญจ่าย</span>
                            </a>
                            ${exp.slip_url ? `
                                <button type="button" class="action-menu-item" onclick="openSlipModal('${encodeURIComponent(exp.slip_url)}', '${escapeHtml(docNum)}', '${encodeURIComponent(vendorName)}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    <span>ดูสลิปโอนเงิน</span>
                                </button>
                            ` : ''}
                            <a href="expense-new.html?copy=${exp.id}" class="action-menu-item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                <span>สร้างซ้ำ</span>
                            </a>
                            <div class="action-menu-divider"></div>
                            <button type="button" class="action-menu-item text-danger" onclick="deleteExpense(${exp.id}, '${escapeHtml(docNum)}', '${escapeHtml(vendorName)}', ${exp.net_total || 0})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                <span>ลบรายการ</span>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
window.renderTable = renderTable;

// =============================================================================
// Dropdown Toggle Handlers (Smart Viewport Detection)
// =============================================================================

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

    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isCurrentlyActive) {
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 320) {
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

    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isCurrentlyActive) {
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 320) {
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

window.openSlipModal = function(slipUrl, docNumber, vendorName) {
    const modal = document.getElementById('imageModalOverlay');
    const modalImg = document.getElementById('modalImagePreview');
    const modalTitle = document.getElementById('modalSlipTitle');
    const downloadBtn = document.getElementById('modalDownloadBtn');

    if (!modal || !modalImg) return;

    const decodedUrl = decodeURIComponent(slipUrl);
    const decodedVendor = decodeURIComponent(vendorName);

    modalImg.src = decodedUrl;
    if (modalTitle) modalTitle.textContent = `หลักฐานสลิป / ใบเสร็จ [${docNumber}] - ${decodedVendor}`;
    if (downloadBtn) {
        downloadBtn.href = decodedUrl;
        downloadBtn.download = `Slip-${docNumber}.png`;
    }

    modal.classList.add('active');
};

window.markAsPaid = async function(id, docNumber, vendorName = '-', grandTotal = 0) {
    if (window.openActionDialog) {
        const dialogRes = await window.openActionDialog({
            action: 'pay',
            docNum: docNumber,
            customerName: vendorName,
            grandTotal: grandTotal,
            docTypeLabel: 'บิลค่าใช้จ่าย',
            title: 'ยืนยันการบันทึกชำระเงินค่าใช้จ่าย',
            confirmText: 'ยืนยันชำระเงิน'
        });
        if (!dialogRes || !dialogRes.confirmed) return;
    } else {
        if (!confirm(`ยืนยันการบันทึกการชำระเงินสำหรับเอกสาร ${docNumber}?`)) return;
    }

    try {
        const res = await fetch(`/api/expenses/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'PAID' })
        });
        if (!res.ok) throw new Error('Update failed');
        if (window.showToast) {
            window.showToast('บันทึกสำเร็จ', `ปรับสถานะค่าใช้จ่าย ${docNumber} เป็น "ชำระแล้ว" เรียบร้อยแล้ว`, 'success');
        }
        await initExpenses();
    } catch (err) {
        if (window.showToast) {
            window.showToast('ไม่สามารถทำรายการได้', err.message, 'error');
        } else {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    }
};

window.updateExpenseStatus = async function(id, status, docNumber) {
    try {
        const res = await fetch(`/api/expenses/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        });
        if (!res.ok) throw new Error('Update failed');
        const statusLabel = status === 'PAID' ? 'ชำระแล้ว' : status === 'UNPAID' ? 'รอชำระเงิน' : 'แบบร่าง';
        if (window.showToast) {
            window.showToast('ปรับปรุงสถานะสำเร็จ', `เปลี่ยนสถานะ ${docNumber} เป็น "${statusLabel}" เรียบร้อยแล้ว`, 'success');
        }
        await initExpenses();
    } catch (err) {
        if (window.showToast) {
            window.showToast('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
};

window.deleteExpense = async function(id, docNumber, vendorName = '-', grandTotal = 0) {
    if (window.openActionDialog) {
        const dialogRes = await window.openActionDialog({
            action: 'delete',
            docNum: docNumber,
            customerName: vendorName,
            grandTotal: grandTotal,
            docTypeLabel: 'ค่าใช้จ่าย',
            title: 'ยืนยันการลบรายการค่าใช้จ่าย',
            confirmText: 'ยืนยันลบรายการ'
        });
        if (!dialogRes || !dialogRes.confirmed) return;
    } else {
        if (!confirm(`ยืนยันการลบรายการค่าใช้จ่าย ${docNumber} หรือไม่? รายการที่ถูกลบจะไม่สามารถกู้คืนได้`)) return;
    }

    try {
        const res = await fetch(`/api/expenses/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed');
        if (window.showToast) {
            window.showToast('ลบรายการสำเร็จ', `ลบรายการค่าใช้จ่าย ${docNumber} เรียบร้อยแล้ว`, 'success');
        }
        await initExpenses();
    } catch (err) {
        if (window.showToast) {
            window.showToast('ไม่สามารถลบรายการได้', err.message, 'error');
        } else {
            alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
        }
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

function formatNumber(num) {
    return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    } catch (e) {
        return dateStr;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
