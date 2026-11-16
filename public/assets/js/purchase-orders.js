/**
 * MAM Advance - Purchase Orders List Controller
 * Standardized to FlowAccount Advance UX / UI matching Quotations design.
 * Features:
 *  - Metric KPI cards & Tab counters
 *  - Status Split Dropdown Button (FlowAccount style)
 *  - Compact Action Menu Dropdown (3-dots)
 *  - Related Documents popover (Vendor quote ref, Expense link, Stock status)
 *  - Integration with doc-action-modal and Toast notifications
 *  - Excel / CSV report export
 *  - Strictly 0 emojis (SVG icons only)
 */

let allPOs = [];
let currentFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('poTableBody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.getElementById('searchInput');
    const btnExportExcel = document.getElementById('btnExportExcel');

    // KPI Elements
    const kpiTotalCount = document.getElementById('kpiTotalCount');
    const kpiTotalSum = document.getElementById('kpiTotalSum');
    const kpiWaitingCount = document.getElementById('kpiWaitingCount');
    const kpiApprovedCount = document.getElementById('kpiApprovedCount');
    const kpiCompletedCount = document.getElementById('kpiCompletedCount');
    const poCountBadge = document.getElementById('poCountBadge');

    // Tab Counter Spans
    const countAll = document.getElementById('countAll');
    const countWaiting = document.getElementById('countWaiting');
    const countApproved = document.getElementById('countApproved');
    const countCompleted = document.getElementById('countCompleted');
    const countDraft = document.getElementById('countDraft');
    const countCancelled = document.getElementById('countCancelled');

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function formatThaiDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear() + 543; // Thai BE era
            return `${day}/${month}/${year}`;
        } catch (_) {
            return dateStr;
        }
    }

    async function loadPOs() {
        try {
            const res = await fetch('/api/documents?type=PURCHASE_ORDER');
            if (res.ok) {
                const data = await res.json();
                allPOs = Array.isArray(data) ? data : [];
                updateKpis();
                renderPOs();
                return;
            }
        } catch (e) {
            console.error('Failed to load purchase orders from API:', e);
        }
        allPOs = [];
        updateKpis();
        renderPOs();
    }
    window.loadPOs = loadPOs;

    function updateKpis() {
        const total = allPOs.length;
        const totalAmount = allPOs.reduce((acc, d) => acc + (d.status !== 'CANCELLED' && d.status !== 'REJECTED' ? (d.grand_total || 0) : 0), 0);

        const waitingDocs = allPOs.filter(d => d.status === 'WAITING_APPROVAL' || d.status === 'WAITING');
        const approvedDocs = allPOs.filter(d => d.status === 'APPROVED');
        const completedDocs = allPOs.filter(d => d.status === 'COMPLETED');
        const draftDocs = allPOs.filter(d => d.status === 'DRAFT');
        const cancelledDocs = allPOs.filter(d => d.status === 'CANCELLED' || d.status === 'REJECTED');

        // KPI Cards
        if (kpiTotalCount) kpiTotalCount.textContent = `${total} รายการ`;
        if (kpiTotalSum) kpiTotalSum.textContent = `รวมมูลค่า ฿ ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (kpiWaitingCount) kpiWaitingCount.textContent = `${waitingDocs.length} รายการ`;
        if (kpiApprovedCount) kpiApprovedCount.textContent = `${approvedDocs.length} รายการ`;
        if (kpiCompletedCount) kpiCompletedCount.textContent = `${completedDocs.length} รายการ`;

        // Tab Counts
        if (countAll) countAll.textContent = total;
        if (countWaiting) countWaiting.textContent = waitingDocs.length;
        if (countApproved) countApproved.textContent = approvedDocs.length;
        if (countCompleted) countCompleted.textContent = completedDocs.length;
        if (countDraft) countDraft.textContent = draftDocs.length;
        if (countCancelled) countCancelled.textContent = cancelledDocs.length;

        // Sidebar Badge
        if (poCountBadge) {
            if (waitingDocs.length > 0) {
                poCountBadge.textContent = waitingDocs.length;
                poCountBadge.style.display = 'inline-block';
            } else {
                poCountBadge.style.display = 'none';
            }
        }
    }

    function renderPOs() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allPOs;
        if (currentFilter !== 'ALL') {
            if (currentFilter === 'WAITING_APPROVAL') {
                filtered = filtered.filter(po => po.status === 'WAITING_APPROVAL' || po.status === 'WAITING');
            } else if (currentFilter === 'CANCELLED') {
                filtered = filtered.filter(po => po.status === 'CANCELLED' || po.status === 'REJECTED');
            } else {
                filtered = filtered.filter(po => po.status === currentFilter);
            }
        }

        if (searchTerm) {
            filtered = filtered.filter(po =>
                (po.doc_number && po.doc_number.toLowerCase().includes(searchTerm)) ||
                (po.customer_name && po.customer_name.toLowerCase().includes(searchTerm)) ||
                (po.ref_doc_number && po.ref_doc_number.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 42px 20px; color: #94a3b8;">
                        <div style="margin-bottom: 10px;">
                            <svg viewBox="0 0 24 24" width="36" height="36" stroke="#94a3b8" stroke-width="1.8" fill="none">
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            </svg>
                        </div>
                        <div style="font-weight: 500; font-size: 13.5px; color: #64748b;">ไม่พบรายการใบสั่งซื้อตามเงื่อนไขที่เลือก</div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((po, idx) => {
            const isCompleted = po.status === 'COMPLETED';
            const isApproved = po.status === 'APPROVED';
            const isWaiting = ['WAITING', 'WAITING_APPROVAL'].includes(po.status);
            const isDraft = po.status === 'DRAFT';
            const isCancelled = ['CANCELLED', 'REJECTED'].includes(po.status);

            const docNum = po.doc_number || '(ฉบับร่าง)';
            const formattedIssueDate = formatThaiDate(po.issue_date);
            const formattedDueDate = formatThaiDate(po.due_date);
            const vendorName = po.customer_name || 'ไม่ระบุผู้ขาย';

            const isBottomRow = filtered.length >= 3 && idx >= filtered.length - 2;

            // 1. Build Related Documents Popover HTML
            const hasRef = Boolean(po.ref_doc_number && po.ref_doc_number.trim() !== '');
            let relatedDocHtml = '';
            if (hasRef || isCompleted) {
                let linksHtml = '';
                if (hasRef) {
                    linksHtml += `
                        <div class="popover-link-item" style="color: #0369a1; cursor: default;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            <span>เลขที่อ้างอิงคู่ค้า: <strong>${escapeHtml(po.ref_doc_number)}</strong></span>
                        </div>
                    `;
                }
                if (isCompleted) {
                    linksHtml += `
                        <a href="../expenses/expenses.html?search=${encodeURIComponent(docNum)}" class="popover-link-item" title="ดูรายการบันทึกค่าใช้จ่าย">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            <span>บันทึกค่าใช้จ่าย (Expenses)</span>
                        </a>
                        <a href="../inventory/inventory.html" class="popover-link-item" title="ดูความเคลื่อนไหวสต็อกสินค้า">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="21 8 21 21 3 21 3 8"></polyline><line x1="1" y1="3" x2="23" y2="3"></line><path d="M10 12h4"></path></svg>
                            <span>คลังสินค้า (Inventory In)</span>
                        </a>
                    `;
                }

                relatedDocHtml = `
                    <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                        <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="ดูเอกสารที่เกี่ยวข้อง">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        </button>
                        <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <div class="popover-title">เอกสารและประวัติที่เกี่ยวข้อง</div>
                            <div class="popover-subtitle">ระบบจัดซื้อและคลังสินค้า</div>
                            ${linksHtml}
                        </div>
                    </div>
                `;
            }

            // 2. Build Status Split Dropdown Button & Menu HTML (FlowAccount Style)
            let statusBtnClass = 'split-waiting';
            let statusBtnText = 'รออนุมัติ';
            let statusMenuItems = '';

            if (isCompleted) {
                statusBtnClass = 'split-completed';
                statusBtnText = 'รับของครบแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">เอกสารและประวัติที่เกี่ยวข้อง</div>
                    <a href="../expenses/expenses.html?search=${encodeURIComponent(docNum)}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 1-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        <span>ดูบันทึกค่าใช้จ่าย (Expenses)</span>
                    </a>
                    <a href="../inventory/inventory.html" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><line x1="1" y1="3" x2="23" y2="3"></line><path d="M10 12h4"></path></svg>
                        <span>ดูสต็อกสินค้า (Inventory)</span>
                    </a>
                `;
            } else if (isApproved) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'อนุมัติแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">ขั้นตอนถัดไป</div>
                    <button type="button" class="status-menu-item text-success btn-po-action" data-action="receive" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>ตรวจรับของเข้าสต็อก (Goods Receipt)</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-po-action" data-action="cancel" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกคำสั่งซื้อ</span>
                    </button>
                `;
            } else if (isWaiting) {
                statusBtnClass = 'split-waiting';
                statusBtnText = 'รออนุมัติ';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-po-action" data-action="approve" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>อนุมัติสั่งซื้อ</span>
                    </button>
                    <button type="button" class="status-menu-item text-danger btn-po-action" data-action="reject" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ไม่อนุมัติ</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = po.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-po-action" data-action="approve" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>เปลี่ยนเป็นอนุมัติ</span>
                    </button>
                `;
            } else {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <button type="button" class="status-menu-item btn-po-action" data-action="submit" data-id="${po.id}" data-num="${escapeHtml(docNum)}" data-vendor="${escapeHtml(vendorName)}" data-total="${po.grand_total || 0}" style="color: #0284c7;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        <span>ส่งขออนุมัติ</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                    <td style="text-align: left;">
                        <div class="doc-number-cell">
                            <a href="purchase-order-new.html?id=${po.id}" class="doc-link">
                                <strong style="${isCancelled ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(docNum)}</strong>
                            </a>
                            ${relatedDocHtml}
                        </div>
                        ${po.project_name ? `<br><small style="color: #64748b;">${escapeHtml(po.project_name)}</small>` : ''}
                    </td>
                    <td style="text-align: left;">${formattedIssueDate}</td>
                    <td style="text-align: left;">${formattedDueDate}</td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(vendorName)}">
                            ${escapeHtml(vendorName)}
                        </div>
                        ${po.customer_tax_id ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 1px;">Tax: ${escapeHtml(po.customer_tax_id)}</div>` : ''}
                    </td>
                    <td class="text-right" style="text-align: right;">
                        <strong style="color: #059669;">฿ ${(po.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
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
                    <td class="text-center" style="text-align: center;">
                        <div class="action-dropdown-container">
                            <button type="button" class="btn-action-more" onclick="toggleActionMenu(this, event)" title="การดำเนินการเพิ่มเติม">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"></circle><circle cx="19" cy="12" r="2.5"></circle><circle cx="5" cy="12" r="2.5"></circle></svg>
                            </button>
                            <div class="action-menu-dropdown ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                                <a href="purchase-order-new.html?id=${po.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${po.id}" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์ใบสั่งซื้อ</span>
                                </a>
                                <a href="print.html?id=${po.id}&type=goods_receipt" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>พิมพ์ใบตรวจรับสินค้า</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${po.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${po.id}&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="purchase-order-new.html?copy=${po.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${po.id}', '${escapeHtml(docNum)}', '${po.status}', '${escapeHtml(vendorName)}', '${po.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ / ยกเลิก</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    window.renderPOs = renderPOs;

    // Filter Tabs
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter') || 'ALL';
            renderPOs();
        });
    });

    // Search Input
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderPOs();
        });
    }

    // Export Excel / CSV Report
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (searchInput?.value || '').trim();
            const url = `/api/documents/export/csv?type=PURCHASE_ORDER&status=${currentFilter}&search=${encodeURIComponent(searchTerm)}`;

            const link = document.createElement('a');
            link.href = url;
            link.download = `PurchaseOrders_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.showToast) {
                window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV ใบสั่งซื้อเรียบร้อยแล้ว', 'info');
            }
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    // Initial load
    loadPOs();
});

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

    // Close all other menus
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

    // Close all menus
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

// Share document link helper
window.shareDocument = function(docNum, id) {
    const shareUrl = `${window.location.origin}/documents/print.html?id=${id}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            if (window.showToast) {
                window.showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์สำหรับใบสั่งซื้อ ${docNum} เรียบร้อยแล้ว`, 'success');
            } else {
                alert(`คัดลอกลิงก์: ${shareUrl}`);
            }
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์ใบสั่งซื้อ ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์ใบสั่งซื้อ ${docNum}:`, shareUrl);
    }
};

// Delete / Cancel document helper with Action Modal Dialog & Toast
window.deleteDocument = async function(id, docNum, status, vendorName = '-', grandTotal = 0) {
    // If already confirmed/approved/waiting, offer cancellation with reason
    if (status && status !== 'DRAFT' && status !== 'CANCELLED') {
        if (window.openActionDialog) {
            const dialogRes = await window.openActionDialog({
                action: 'cancel',
                docNum: docNum,
                customerName: vendorName,
                grandTotal: grandTotal,
                docTypeLabel: 'ใบสั่งซื้อ',
                title: 'ยืนยันการยกเลิกใบสั่งซื้อ',
                confirmText: 'ยืนยันยกเลิกเอกสาร',
                defaultReason: 'ยกเลิกคำสั่งซื้อ / จัดทำเอกสารใหม่'
            });

            if (!dialogRes || !dialogRes.confirmed) return;

            try {
                const res = await fetch(`/api/documents/${id}/actions/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: dialogRes.reason || 'ยกเลิกคำสั่งซื้อ' })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    if (window.showToast) {
                        window.showToast('ยกเลิกเอกสารสำเร็จ', `ยกเลิกใบสั่งซื้อ ${docNum} เรียบร้อยแล้ว`, 'warning');
                    }
                    if (typeof window.loadPOs === 'function') window.loadPOs();
                } else {
                    if (window.showToast) {
                        window.showToast('ไม่สามารถยกเลิกเอกสารได้', data.error || 'เกิดข้อผิดพลาด', 'error');
                    }
                }
            } catch (err) {
                if (window.showToast) window.showToast('การเชื่อมต่อล้มเหลว', err.message, 'error');
            }
        }
        return;
    }

    // If DRAFT: permanent deletion
    if (window.openActionDialog) {
        const dialogRes = await window.openActionDialog({
            action: 'delete',
            docNum: docNum,
            customerName: vendorName,
            grandTotal: grandTotal,
            docTypeLabel: 'ใบสั่งซื้อ',
            title: 'ยืนยันการลบใบสั่งซื้อ (ฉบับร่าง)',
            confirmText: 'ยืนยันลบเอกสาร'
        });

        if (!dialogRes || !dialogRes.confirmed) return;

        try {
            const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                if (window.showToast) {
                    window.showToast('ลบเอกสารสำเร็จ', `ลบใบสั่งซื้อ ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
                }
                if (typeof window.loadPOs === 'function') window.loadPOs();
            } else {
                if (window.showToast) {
                    window.showToast('ไม่สามารถลบเอกสารได้', data.error || 'เกิดข้อผิดพลาด', 'error');
                }
            }
        } catch (err) {
            if (window.showToast) window.showToast('การเชื่อมต่อล้มเหลว', err.message, 'error');
        }
    }
};

// =============================================================================
// Global Event Delegation for Submit / Approve / Reject / Receive / Cancel Actions
// =============================================================================
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-po-action');
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    const action = btn.getAttribute('data-action');
    const docId = btn.getAttribute('data-id');
    const docNum = btn.getAttribute('data-num');
    const vendorName = btn.getAttribute('data-vendor') || '-';
    const totalVal = parseFloat(btn.getAttribute('data-total')) || 0;

    // Close any open dropdown menus
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    let body = {};
    if (typeof getCurrentUser === 'function') {
        try {
            const u = getCurrentUser();
            if (u) {
                body.user_role = u.role || 'ADMIN';
                body.user_id = u.id || 1;
            }
        } catch (_) {}
    }

    if (window.openActionDialog) {
        let title = '';
        let confirmText = '';
        let defaultReason = '';

        if (action === 'submit') {
            title = 'ยืนยันส่งขออนุมัติใบสั่งซื้อ';
            confirmText = 'ยืนยันส่งขออนุมัติ';
        } else if (action === 'approve') {
            title = 'ยืนยันการอนุมัติใบสั่งซื้อ';
            confirmText = 'ยืนยันอนุมัติ';
        } else if (action === 'reject') {
            title = 'ไม่อนุมัติใบสั่งซื้อ';
            confirmText = 'ยืนยันไม่อนุมัติ';
            defaultReason = 'ราคาสูงเกินงบประมาณ / ปรับเปลี่ยนแผนงาน';
        } else if (action === 'receive') {
            title = 'ยืนยันการตรวจรับสินค้าเข้าสต็อก';
            confirmText = 'ยืนยันตรวจรับเข้าสต็อก';
        } else if (action === 'cancel') {
            title = 'ยืนยันการยกเลิกใบสั่งซื้อ';
            confirmText = 'ยืนยันยกเลิกเอกสาร';
            defaultReason = 'ยกเลิกคำสั่งซื้อ / จัดทำเอกสารใหม่';
        }

        const dialogResult = await window.openActionDialog({
            action: action,
            docNum: docNum,
            customerName: vendorName,
            grandTotal: totalVal,
            docTypeLabel: 'ใบสั่งซื้อ',
            title: title,
            confirmText: confirmText,
            defaultReason: defaultReason
        });

        if (!dialogResult || !dialogResult.confirmed) return;
        if (dialogResult.reason) body.reason = dialogResult.reason;
    }

    try {
        btn.disabled = true;
        const res = await fetch(`/api/documents/${docId}/actions/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const resData = await res.json();
        if (res.ok) {
            const actionLabels = {
                submit: 'ส่งขออนุมัติ',
                approve: 'อนุมัติสั่งซื้อ',
                reject: 'ไม่อนุมัติ',
                receive: 'ตรวจรับสินค้าเข้าสต็อกและบันทึกค่าใช้จ่าย',
                cancel: 'ยกเลิกเอกสาร'
            };
            const label = actionLabels[action] || action;
            if (window.showToast) {
                window.showToast('ทำรายการสำเร็จ', `ดำเนินการ "${label}" สำหรับ ${docNum} เรียบร้อยแล้ว`, action === 'reject' ? 'warning' : 'success');
            }
            if (typeof window.loadPOs === 'function') window.loadPOs();
        } else {
            if (window.showToast) {
                window.showToast('ทำรายการไม่สำเร็จ', resData.error || 'เกิดข้อผิดพลาดในการทำรายการ', 'error');
            }
            btn.disabled = false;
        }
    } catch (err) {
        if (window.showToast) {
            window.showToast('เชื่อมต่อล้มเหลว', err.message, 'error');
        }
        btn.disabled = false;
    }
});

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

// Close all open dropdowns on click outside
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
