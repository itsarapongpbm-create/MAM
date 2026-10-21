/**
 * MAM Advance - Cash Sales List Controller
 * Standardized FlowAccount design pattern with Split Button & Brand Red Action dropdown
 * Strictly 0 emojis (SVG icons only)
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (document.querySelector('.doc-search-box input')?.value || '').trim();
            const url = `/api/documents/export/csv?type=CASH_SALE&status=${currentFilter || 'ALL'}&search=${encodeURIComponent(searchTerm)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `Cash_Sales_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.showToast) window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV เรียบร้อยแล้ว', 'info');
        });
    }
    const tableBody = document.getElementById('cashSalesTableBody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.getElementById('searchInput');

    // KPI Elements
    const kpiTotalCount = document.getElementById('kpiTotalCount');
    const kpiTotalSum = document.getElementById('kpiTotalSum');
    const kpiPaidCount = document.getElementById('kpiPaidCount');
    const kpiPaidSum = document.getElementById('kpiPaidSum');
    const kpiVatSum = document.getElementById('kpiVatSum');
    const kpiCancelledCount = document.getElementById('kpiCancelledCount');
    const cashSaleCountBadge = document.getElementById('cashSaleCountBadge');

    let allCashSales = [];
    let currentFilter = 'ALL';

    const fallbackCashSales = [];

    function formatCashSale(d) {
        let statusKey = d.status || 'PAID';
        let statusText = 'ชำระแล้ว (สด)';
        if (statusKey === 'CANCELLED') {
            statusText = 'ยกเลิกแล้ว';
        } else if (statusKey === 'DRAFT') {
            statusText = 'ฉบับร่าง';
        }
        return {
            id: d.id,
            doc_type: 'CASH_SALE',
            doc_number: d.doc_number || '(ฉบับร่าง)',
            issue_date: d.issue_date || '-',
            ref_doc_number: d.ref_doc_number || '',
            customer_name: d.customer_name || 'ลูกค้าทั่วไป',
            grand_total: d.grand_total || 0,
            vat_amount: d.vat_amount || 0,
            status: statusKey,
            status_text: statusText,
            related_documents: d.related_documents || []
        };
    }

    async function loadCashSales() {
        try {
            const res = await fetch('/api/documents?type=CASH_SALE');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    allCashSales = data.map(d => formatCashSale(d));
                    updateKpis();
                    renderCashSales();
                    return;
                }
            }
        } catch (e) {
            console.log('Using local fallback cash sales.');
        }
        allCashSales = [];
        updateKpis();
        renderCashSales();
    }

    function updateKpis() {
        const total = allCashSales.length;
        const totalAmount = allCashSales.reduce((acc, d) => acc + (d.status !== 'CANCELLED' ? (d.grand_total || 0) : 0), 0);
        
        const paidItems = allCashSales.filter(d => d.status === 'PAID');
        const paidCount = paidItems.length;
        const paidAmount = paidItems.reduce((acc, d) => acc + (d.grand_total || 0), 0);
        
        const vatTotal = allCashSales.reduce((acc, d) => acc + (d.status !== 'CANCELLED' ? (d.vat_amount || 0) : 0), 0);
        const cancelledCount = allCashSales.filter(d => d.status === 'CANCELLED').length;

        if (kpiTotalCount) kpiTotalCount.textContent = `${total} รายการ`;
        if (kpiTotalSum) kpiTotalSum.textContent = `รวมมูลค่า ฿ ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiPaidCount) kpiPaidCount.textContent = `${paidCount} รายการ`;
        if (kpiPaidSum) kpiPaidSum.textContent = `฿ ${paidAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiVatSum) kpiVatSum.textContent = `฿ ${vatTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiCancelledCount) kpiCancelledCount.textContent = `${cancelledCount} รายการ`;
        if (cashSaleCountBadge) cashSaleCountBadge.style.display = 'none';
    }

    function renderCashSales() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allCashSales;
        if (currentFilter !== 'ALL') {
            filtered = filtered.filter(cs => cs.status === currentFilter);
        }

        if (searchTerm) {
            filtered = filtered.filter(cs =>
                (cs.doc_number && cs.doc_number.toLowerCase().includes(searchTerm)) ||
                (cs.customer_name && cs.customer_name.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: 36px; color: #94a3b8;">
                        <div style="margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="#94a3b8" stroke-width="1.8" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        ไม่พบรายการบิลขายสดตามเงื่อนไขที่เลือก
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((cs, idx) => {
            const isBottomRow = filtered.length > 2 && idx >= filtered.length - 2;
            const isPaid = cs.status === 'PAID';
            const isCancelled = cs.status === 'CANCELLED';
            const isDraft = cs.status === 'DRAFT';
            const docNum = cs.doc_number || '(ฉบับร่าง)';

            // Related doc popover
            let relatedDocHtml = '';
            if (cs.ref_doc_number && cs.ref_doc_number !== '-') {
                const isQT = cs.ref_doc_number.startsWith('QT');
                const isPO = cs.ref_doc_number.startsWith('PO');
                const refUrl = isPO ? `purchase-order-new.html?id=${encodeURIComponent(cs.ref_doc_number)}` : `quotation-new.html?id=${encodeURIComponent(cs.ref_doc_number)}`;
                const refBadge = isPO ? 'PO' : (isQT ? 'QT' : 'REF');
                relatedDocHtml = `
                    <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                        <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="อ้างอิง: ${escapeHtml(cs.ref_doc_number)}">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </button>
                        <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <div class="popover-title">เอกสารต้นทาง / อ้างอิง</div>
                            <div class="popover-item">
                                <span class="popover-badge badge-qt">${refBadge}</span>
                                <a href="${refUrl}" class="popover-link">${escapeHtml(cs.ref_doc_number)}</a>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Status Split Button styling & actions
            let statusBtnClass = 'split-approved';
            let statusBtnText = 'ชำระแล้ว (สด)';
            let statusMenuItems = '';

            if (isPaid) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'ชำระแล้ว (สด)';
                statusMenuItems = `
                    <div class="status-menu-header">การจัดการบิลเงินสด</div>
                    <a href="print.html?id=${cs.id}" target="_blank" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>พิมพ์บิลเงินสด (A4)</span>
                    </a>
                    <button type="button" class="status-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${cs.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                        <span>แชร์ให้ลูกค้า</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-cancel-doc" data-id="${cs.id}" data-num="${docNum}" data-customer="${escapeHtml(cs.customer_name || 'ลูกค้าทั่วไป')}" data-total="${cs.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกบิลขายสด</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header" style="color: #ef4444;">เอกสารถูกยกเลิกและคืนสต็อกแล้ว</div>
                `;
            } else if (isDraft) {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <a href="cash-sale-new.html?id=${cs.id}" class="status-menu-item" style="color: #0284c7;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>บันทึกรับเงิน (จบการขาย)</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger" onclick="deleteDocument('${cs.id}', '${escapeHtml(docNum)}', 'DRAFT', '${escapeHtml(cs.customer_name || 'ลูกค้าทั่วไป')}', '${cs.grand_total || 0}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ลบฉบับร่าง</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                    <td style="text-align: left;">
                        <div class="doc-number-cell">
                            <a href="cash-sale-new.html?id=${cs.id}" class="doc-link">
                                <strong style="${isCancelled ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(docNum)}</strong>
                            </a>
                            ${relatedDocHtml}
                        </div>
                    </td>
                    <td style="text-align: left;">${cs.issue_date || '-'}</td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(cs.customer_name || 'ลูกค้าทั่วไป')}">
                            ${escapeHtml(cs.customer_name || 'ลูกค้าทั่วไป')}
                        </div>
                    </td>
                    <td class="text-right" style="text-align: right;">
                        <strong style="color: #059669;">฿ ${(cs.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
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
                                <a href="cash-sale-new.html?id=${cs.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${cs.id}" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${cs.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${cs.id}&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="print.html?id=${cs.id}&envelope=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>พิมพ์จ่าหน้าซอง</span>
                                </a>
                                <a href="cash-sale-new.html?copy=${cs.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${cs.id}', '${escapeHtml(docNum)}', '${cs.status}', '${escapeHtml(cs.customer_name || 'ลูกค้าทั่วไป')}', '${cs.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach cancel event listeners
        tableBody.querySelectorAll('.btn-cancel-doc').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const docId = btn.getAttribute('data-id');
                const docNum = btn.getAttribute('data-num');
                const customer = btn.getAttribute('data-customer') || 'ลูกค้าทั่วไป';
                const total = parseFloat(btn.getAttribute('data-total') || '0');

                // Close menus
                document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
                    m.classList.remove('active');
                    m.style.display = 'none';
                });

                const dialogRes = await openActionDialog({
                    action: 'cancel',
                    docNum: docNum,
                    customerName: customer,
                    grandTotal: total,
                    docTypeLabel: 'บิลขายสด',
                    defaultReason: 'ลูกค้ายกเลิกคำสั่งซื้อ / คืนสินค้า'
                });
                if (!dialogRes.confirmed) return;

                try {
                    const res = await fetch(`/api/documents/${docId}/actions/cancel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: dialogRes.reason || 'ลูกค้ายกเลิกคำสั่งซื้อ' })
                    });
                    const resData = await res.json().catch(() => ({}));
                    if (res.ok) {
                        showToast('ยกเลิกเอกสารสำเร็จ', `ยกเลิกบิล ${docNum} เรียบร้อยแล้ว (ระบบคืนสต็อกสินค้าให้อัตโนมัติ)`, 'warning');
                        loadCashSales();
                    } else {
                        showToast('ไม่สามารถยกเลิกได้', resData.error || 'เกิดข้อผิดพลาดในการยกเลิกบิลขายสด', 'error');
                    }
                } catch (err) {
                    showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                }
            });
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter') || 'ALL';
            renderCashSales();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderCashSales();
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    loadCashSales();
});

// Dropdown Toggles & Helpers
window.toggleStatusDropdown = function(btn, event) {
    if (window.toggleSmartDropdown) {
        return window.toggleSmartDropdown(btn, event, '.status-dropdown-menu', '.status-split-btn-group');
    }
    if (event) event.stopPropagation();
    const group = btn.closest('.status-split-btn-group');
    if (!group) return;
    const menu = group.querySelector('.status-dropdown-menu');
    if (!menu) return;

    const isOpen = menu.style.display === 'block';
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isOpen) {
        menu.classList.add('active');
        menu.style.display = 'block';
    }
};

window.toggleActionMenu = function(btn, event) {
    if (window.toggleSmartDropdown) {
        return window.toggleSmartDropdown(btn, event, '.action-menu-dropdown', '.action-dropdown-container');
    }
    if (event) event.stopPropagation();
    const container = btn.closest('.action-dropdown-container');
    if (!container) return;
    const dropdown = container.querySelector('.action-menu-dropdown');
    if (!dropdown) return;

    const isOpen = dropdown.style.display === 'block';
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isOpen) {
        dropdown.classList.add('active');
        dropdown.style.display = 'block';
    }
};

window.toggleRelatedPopover = function(btn, event) {
    if (event) event.stopPropagation();
    const wrapper = btn.closest('.related-doc-wrapper');
    if (!wrapper) return;
    const popover = wrapper.querySelector('.related-docs-popover');
    if (!popover) return;

    const isOpen = popover.style.display === 'block';
    document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
    });

    if (!isOpen) {
        popover.classList.add('active');
        popover.style.display = 'block';
    }
};

window.shareDocument = function(docNum, id) {
    const shareUrl = `${window.location.origin}/documents/print.html?id=${id}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์สำหรับแชร์บิลขายสด ${docNum} เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์บิลขายสด ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์บิลขายสด ${docNum}:`, shareUrl);
    }
};

window.deleteDocument = async function(id, docNum, status, customerName = 'ลูกค้าทั่วไป', grandTotal = 0) {
    if (status && status !== 'DRAFT') {
        const dialogRes = await openActionDialog({
            action: 'cancel',
            docNum: docNum,
            customerName: customerName,
            grandTotal: grandTotal,
            docTypeLabel: 'บิลขายสด',
            defaultReason: 'ลูกค้ายกเลิกคำสั่งซื้อ / ขอคืนสินค้า'
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
                showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกบิลขายสด ${docNum} เรียบร้อยแล้ว`, 'warning');
                setTimeout(() => window.location.reload(), 800);
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
        grandTotal: grandTotal,
        docTypeLabel: 'บิลขายสด'
    });
    if (!dialogRes.confirmed) return;

    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('ลบเอกสารสำเร็จ', `ลบบิลขายสด ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
            setTimeout(() => window.location.reload(), 800);
        } else {
            showToast('ไม่สามารถลบเอกสารได้', data.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (err) {
        showToast('การเชื่อมต่อล้มเหลว', err.message, 'error');
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.status-split-btn-group') && 
        !e.target.closest('.status-dropdown-container') && 
        !e.target.closest('.action-dropdown-container') &&
        !e.target.closest('.related-doc-wrapper')) {
        document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown, .related-docs-popover').forEach(m => {
            m.classList.remove('active');
            m.style.display = 'none';
        });
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
