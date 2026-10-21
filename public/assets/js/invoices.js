/**
 * FlowAccount Advance - Tax Invoices List Controller
 * Standardized FlowAccount design pattern with Split Button & Brand Red Action dropdown
 * Strictly 0 emojis (SVG icons only)
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (document.querySelector('.doc-search-box input')?.value || '').trim();
            const url = `/api/documents/export/csv?type=TAX_INVOICE&status=${currentFilter || 'ALL'}&search=${encodeURIComponent(searchTerm)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `Tax_Invoices_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.showToast) window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV เรียบร้อยแล้ว', 'info');
        });
    }
    const tableBody = document.querySelector('.data-table tbody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.querySelector('.doc-search-box input');

    let allInvoices = [];
    let currentFilter = 'ALL';

    const fallbackInvoices = [];

    async function loadInvoices() {
        try {
            const res = await fetch('/api/documents?type=TAX_INVOICE');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    allInvoices = data.map(d => formatInvoice(d));
                    updateKpiAndTabs();
                    renderInvoices();
                    return;
                }
            }
        } catch (e) {
            console.log('Using local fallback invoices.');
        }

        allInvoices = [];
        updateKpiAndTabs();
        renderInvoices();
    }

    function formatInvoice(d) {
        let statusKey = d.status || 'WAITING';
        if (statusKey === 'ISSUED') {
            statusKey = 'WAITING';
        }
        let statusText = 'รอชำระ';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (statusKey === 'PAID') {
            statusText = 'ชำระแล้ว';
        } else if (statusKey === 'PARTIAL_PAID') {
            statusText = 'ชำระบางส่วน';
        } else if (statusKey === 'CANCELLED') {
            statusText = 'ยกเลิกแล้ว';
        } else if (statusKey === 'DRAFT') {
            statusText = 'ฉบับร่าง';
        } else if (d.is_overdue || (d.due_date && d.due_date !== '-' && new Date(d.due_date) < today && statusKey !== 'PAID')) {
            statusKey = 'OVERDUE';
            statusText = 'เกินกำหนด';
        }

        return {
            id: d.id,
            doc_type: 'TAX_INVOICE',
            doc_number: d.doc_number || '(ฉบับร่าง)',
            issue_date: d.issue_date || '-',
            due_date: d.due_date || '-',
            ref_doc_number: d.ref_doc_number || '',
            customer_name: d.customer_name || '-',
            grand_total: d.grand_total || 0,
            paid_amount: d.paid_amount || 0,
            balance_due: d.balance_due !== undefined && d.balance_due !== null ? d.balance_due : (d.grand_total - (d.paid_amount || 0)),
            status: statusKey,
            status_text: statusText,
            related_documents: d.related_documents || []
        };
    }

    function renderInvoices() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allInvoices;
        if (currentFilter !== 'ALL') {
            if (currentFilter === 'WAITING') {
                filtered = filtered.filter(inv => inv.status === 'WAITING' || inv.status === 'PARTIAL_PAID' || inv.status === 'OVERDUE');
            } else {
                filtered = filtered.filter(inv => inv.status === currentFilter);
            }
        }

        if (searchTerm) {
            filtered = filtered.filter(inv =>
                (inv.doc_number && inv.doc_number.toLowerCase().includes(searchTerm)) ||
                (inv.customer_name && inv.customer_name.toLowerCase().includes(searchTerm)) ||
                (inv.ref_doc_number && inv.ref_doc_number.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 36px; color: #94a3b8;">
                        <div style="margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="#94a3b8" stroke-width="1.8" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        ไม่พบรายการใบกำกับภาษีที่ค้นหา
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((inv, idx) => {
            const isBottomRow = filtered.length > 2 && idx >= filtered.length - 2;
            const isPaid = inv.status === 'PAID';
            const isPartial = inv.status === 'PARTIAL_PAID';
            const isOverdue = inv.status === 'OVERDUE';
            const isCancelled = inv.status === 'CANCELLED';
            const isDraft = inv.status === 'DRAFT';
            const docNum = inv.doc_number || '-';

            // Related docs popover
            let relatedDocHtml = '';
            let popoverItems = '';
            if (inv.ref_doc_number && inv.ref_doc_number !== '-') {
                const isBN = inv.ref_doc_number.startsWith('BN');
                const badgeType = isBN ? 'badge-bn' : 'badge-qt';
                const badgeLabel = isBN ? 'BN' : 'QT';
                const targetUrl = isBN ? `billing-note-new.html?id=${encodeURIComponent(inv.ref_doc_number)}` : `quotation-new.html?id=${encodeURIComponent(inv.ref_doc_number)}`;
                popoverItems += `
                    <div class="popover-item">
                        <span class="popover-badge ${badgeType}">${badgeLabel}</span>
                        <a href="${targetUrl}" class="popover-link">${escapeHtml(inv.ref_doc_number)}</a>
                    </div>
                `;
            }
            if (inv.related_documents && inv.related_documents.length > 0) {
                inv.related_documents.forEach(rd => {
                    const isRec = rd.doc_type === 'RECEIPT' || (rd.doc_number && rd.doc_number.startsWith('RE'));
                    const badge = isRec ? 'badge-re' : 'badge-inv';
                    const targetId = encodeURIComponent(rd.id || rd.doc_number);
                    const url = isRec ? `cash-invoice-new.html?id=${targetId}` : `invoice-new.html?id=${targetId}`;
                    popoverItems += `
                        <div class="popover-item">
                            <span class="popover-badge ${badge}">${isRec ? 'RE' : 'INV'}</span>
                            <a href="${url}" class="popover-link">${escapeHtml(rd.doc_number)}</a>
                        </div>
                    `;
                });
            }

            if (popoverItems) {
                relatedDocHtml = `
                    <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                        <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="เอกสารที่เกี่ยวข้อง">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </button>
                        <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <div class="popover-title">เอกสารต้นทาง / เกี่ยวข้อง</div>
                            ${popoverItems}
                        </div>
                    </div>
                `;
            }

            // Status Split Button styling & actions
            let statusBtnClass = 'split-waiting';
            let statusBtnText = 'รอชำระ';
            let statusMenuItems = '';
            const relatedReceipt = inv.related_documents && inv.related_documents.find(r => r.doc_type === 'RECEIPT' || (r.doc_number && r.doc_number.startsWith('RE')));
            const receiptViewUrl = relatedReceipt ? `cash-invoice-new.html?id=${encodeURIComponent(relatedReceipt.id || relatedReceipt.doc_number)}` : `cash-invoice-new.html?ref=${encodeURIComponent(inv.doc_number)}`;

            if (isPaid) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'ชำระแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">การจัดการเอกสาร</div>
                    <a href="${receiptViewUrl}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        <span>ดูใบเสร็จรับเงิน</span>
                    </a>
                    <a href="print.html?id=${inv.id}" target="_blank" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>พิมพ์ใบกำกับภาษี (A4)</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-inv-action" data-action="cancel" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบกำกับภาษี</span>
                    </button>
                `;
            } else if (isPartial) {
                statusBtnClass = 'split-waiting';
                statusBtnText = 'ชำระบางส่วน';
                statusMenuItems = `
                    <div class="status-menu-header">ดำเนินการรับชำระ</div>
                    <button type="button" class="status-menu-item btn-pay-modal" data-id="${inv.id}" style="color: #059669; font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        <span>บันทึกรับชำระคงเหลือ</span>
                    </button>
                    <a href="${receiptViewUrl}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                        <span>ดูประวัติการรับชำระ</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-inv-action" data-action="cancel" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบกำกับภาษี</span>
                    </button>
                `;
            } else if (isOverdue) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'เกินกำหนด';
                statusMenuItems = `
                    <div class="status-menu-header">ดำเนินการรับชำระ</div>
                    <button type="button" class="status-menu-item btn-pay-modal" data-id="${inv.id}" style="color: #059669; font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        <span>บันทึกรับชำระเงิน</span>
                    </button>
                    <a href="cash-invoice-new.html?ref=${encodeURIComponent(inv.doc_number)}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                        <span>สร้างใบเสร็จรับเงิน</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-inv-action" data-action="cancel" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบกำกับภาษี</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-inv-action" data-action="reopen" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        <span>เปลี่ยนเป็นรอชำระ</span>
                    </button>
                `;
            } else if (isDraft) {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <button type="button" class="status-menu-item btn-inv-action" data-action="issue" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}" style="color: #0284c7;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span>ออกใบกำกับภาษีจริง</span>
                    </button>
                `;
            } else {
                // WAITING
                statusBtnClass = 'split-waiting';
                statusBtnText = 'รอชำระ';
                statusMenuItems = `
                    <div class="status-menu-header">ดำเนินการรับชำระ</div>
                    <button type="button" class="status-menu-item btn-pay-modal" data-id="${inv.id}" style="color: #059669; font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        <span>บันทึกรับชำระเงิน</span>
                    </button>
                    <a href="cash-invoice-new.html?ref=${encodeURIComponent(inv.doc_number)}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                        <span>สร้างใบเสร็จรับเงิน</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-inv-action" data-action="cancel" data-id="${inv.id}" data-num="${docNum}" data-customer="${escapeHtml(inv.customer_name)}" data-total="${inv.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบกำกับภาษี</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                    <td style="text-align: left;">
                        <div class="doc-number-cell">
                            <a href="invoice-new.html?id=${inv.id}" class="doc-link">
                                <strong style="${isCancelled ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(docNum)}</strong>
                            </a>
                            ${relatedDocHtml}
                        </div>
                    </td>
                    <td style="text-align: left;">${inv.issue_date || '-'}</td>
                    <td style="text-align: left;">${inv.due_date || '-'}</td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(inv.customer_name || '-')}">
                            ${escapeHtml(inv.customer_name || '-')}
                        </div>
                    </td>
                    <td class="text-right" style="width: 140px; text-align: right; padding-right: 18px; white-space: nowrap;">
                        <strong style="color: #059669; font-size: 14px; font-family: 'Inter', sans-serif;">฿ ${(inv.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
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
                                <a href="invoice-new.html?id=${inv.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${inv.id}" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${inv.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${inv.id}&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="print.html?id=${inv.id}&envelope=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>พิมพ์จ่าหน้าซอง</span>
                                </a>
                                <a href="invoice-new.html?copy=${inv.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${inv.id}', '${escapeHtml(docNum)}', '${inv.status}', '${escapeHtml(inv.customer_name)}', '${inv.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach pay modal click handlers
        tableBody.querySelectorAll('.btn-pay-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const docId = btn.getAttribute('data-id');
                const inv = allInvoices.find(item => String(item.id) === String(docId));
                if (!inv) return;
                // Close any open status menu
                document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => m.style.display = 'none');
                openPaymentModal(inv);
            });
        });

        // Attach action handlers
        tableBody.querySelectorAll('.btn-inv-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                const num = btn.getAttribute('data-num');
                const customer = btn.getAttribute('data-customer') || '-';
                const total = parseFloat(btn.getAttribute('data-total') || '0');

                // Close menus
                document.querySelectorAll('.status-dropdown-menu, .action-menu-dropdown').forEach(m => {
                    m.classList.remove('active');
                    m.style.display = 'none';
                });

                if (action === 'cancel') {
                    const dialogRes = await openActionDialog({
                        action: 'cancel',
                        docNum: num,
                        customerName: customer,
                        grandTotal: total,
                        docTypeLabel: 'ใบกำกับภาษี',
                        defaultReason: 'ลูกค้ายกเลิกคำสั่งซื้อ / ขอเปลี่ยนเอกสาร'
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
                            showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบกำกับภาษี ${num} เรียบร้อยแล้ว`, 'warning');
                            loadInvoices();
                        } else {
                            showToast('ไม่สามารถดำเนินการได้', data.error || 'เกิดข้อผิดพลาด', 'error');
                        }
                    } catch (err) {
                        showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                    }
                } else if (action === 'reopen') {
                    try {
                        const res = await fetch(`/api/documents/${id}/actions/reopen`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        if (res.ok) {
                            showToast('ปรับสถานะสำเร็จ', `เปลี่ยนสถานะใบกำกับภาษี ${num} เป็นรอชำระแล้ว`, 'info');
                            loadInvoices();
                        } else {
                            const errData = await res.json().catch(() => ({}));
                            showToast('ไม่สามารถดำเนินการได้', errData.error || 'เกิดข้อผิดพลาด', 'error');
                        }
                    } catch (err) {
                        showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                    }
                } else if (action === 'issue') {
                    try {
                        const res = await fetch(`/api/documents/${id}/actions/issue`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        if (res.ok) {
                            showToast('ออกเอกสารสำเร็จ', `ออกใบกำกับภาษี ${num} ตัวจริงเรียบร้อยแล้ว`, 'success');
                            loadInvoices();
                        } else {
                            const errData = await res.json().catch(() => ({}));
                            showToast('ไม่สามารถดำเนินการได้', errData.error || 'เกิดข้อผิดพลาด', 'error');
                        }
                    } catch (err) {
                        showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                    }
                }
            });
        });
    }

    // Payment Modal Logic
    const paymentModal = document.getElementById('paymentModal');
    const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
    const cancelPayBtn = document.getElementById('cancelPayBtn');
    const paymentForm = document.getElementById('paymentForm');

    function openPaymentModal(inv) {
        if (!paymentModal) return;
        document.getElementById('payDocId').value = inv.id;
        document.getElementById('payDocNumber').textContent = inv.doc_number;
        document.getElementById('payCustomerName').textContent = inv.customer_name;
        document.getElementById('payGrandTotal').textContent = `฿ ${(inv.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        
        const balance = Math.max(0, inv.balance_due || inv.grand_total);
        document.getElementById('payBalanceDue').textContent = `฿ ${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        document.getElementById('payAmount').value = balance.toFixed(2);
        document.getElementById('payDate').value = new Date().toISOString().split('T')[0];

        paymentModal.style.display = 'flex';
    }

    function closePaymentModal() {
        if (paymentModal) paymentModal.style.display = 'none';
    }

    if (closePaymentModalBtn) closePaymentModalBtn.addEventListener('click', closePaymentModal);
    if (cancelPayBtn) cancelPayBtn.addEventListener('click', closePaymentModal);

    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const docId = document.getElementById('payDocId').value;
            const amount = parseFloat(document.getElementById('payAmount').value);
            const paidDate = document.getElementById('payDate').value;
            const method = document.getElementById('payMethod').value;
            const refNo = document.getElementById('payRefNo').value.trim();
            const autoReceipt = document.getElementById('payAutoReceipt').checked;

            if (!amount || amount <= 0) {
                showToast('แจ้งเตือน', 'กรุณาระบุจำนวนเงินที่ถูกต้อง', 'warning');
                return;
            }

            try {
                const res = await fetch(`/api/documents/${docId}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paid_date: paidDate,
                        method: method,
                        ref_no: refNo,
                        amount: amount,
                        auto_create_receipt: autoReceipt
                    })
                });

                const resData = await res.json().catch(() => ({}));
                if (res.ok) {
                    showToast('บันทึกรับชำระสำเร็จ', `${resData.message || 'บันทึกการชำระเงินเรียบร้อยแล้ว'}${resData.receipt ? ` (สร้างใบเสร็จ ${resData.receipt.doc_number})` : ''}`, 'success');
                    closePaymentModal();
                    loadInvoices();
                } else {
                    showToast('บันทึกไม่สำเร็จ', resData.error || 'เกิดข้อผิดพลาดในการบันทึกรับชำระ', 'error');
                }
            } catch (err) {
                showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
            }
        });
    }

    function updateKpiAndTabs() {
        let totalCount = 0;
        let totalAmount = 0;
        let waitingCount = 0;
        let waitingAmount = 0;
        let paidCount = 0;
        let paidAmount = 0;
        let overdueCount = 0;
        let overdueAmount = 0;
        let cancelledCount = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        allInvoices.forEach(inv => {
            const grandTotal = Number(inv.grand_total) || 0;
            const balance = Math.max(0, inv.balance_due !== undefined && inv.balance_due !== null ? Number(inv.balance_due) : (grandTotal - (Number(inv.paid_amount) || 0)));

            if (inv.status === 'CANCELLED') {
                cancelledCount++;
                return;
            }

            totalCount++;
            totalAmount += grandTotal;

            if (inv.status === 'PAID') {
                paidCount++;
                paidAmount += grandTotal;
            } else if (inv.status === 'OVERDUE' || (inv.due_date && inv.due_date !== '-' && new Date(inv.due_date) < today)) {
                overdueCount++;
                overdueAmount += balance;
                waitingCount++;
                waitingAmount += balance;
            } else {
                waitingCount++;
                waitingAmount += balance;
            }
        });

        const elTotalCount = document.getElementById('kpiTotalCount');
        const elTotalAmt = document.getElementById('kpiTotalAmount');
        const elWaitingCount = document.getElementById('kpiWaitingCount');
        const elWaitingAmt = document.getElementById('kpiWaitingAmount');
        const elPaidCount = document.getElementById('kpiPaidCount');
        const elPaidAmt = document.getElementById('kpiPaidAmount');
        const elOverdueCount = document.getElementById('kpiOverdueCount');
        const elOverdueAmt = document.getElementById('kpiOverdueAmount');

        if (elTotalCount) elTotalCount.textContent = `${totalCount} รายการ`;
        if (elTotalAmt) elTotalAmt.textContent = `รวมมูลค่า ฿ ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elWaitingCount) elWaitingCount.textContent = `${waitingCount} รายการ`;
        if (elWaitingAmt) elWaitingAmt.textContent = `฿ ${waitingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elPaidCount) elPaidCount.textContent = `${paidCount} รายการ`;
        if (elPaidAmt) elPaidAmt.textContent = `฿ ${paidAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elOverdueCount) elOverdueCount.textContent = `${overdueCount} รายการ`;
        if (elOverdueAmt) elOverdueAmt.textContent = `฿ ${overdueAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

        tabButtons.forEach(btn => {
            const filter = btn.getAttribute('data-filter') || '';
            if (filter === 'ALL' || btn.textContent.includes('ทั้งหมด')) {
                btn.textContent = `ทั้งหมด (${totalCount + cancelledCount})`;
            } else if (filter === 'WAITING' || btn.textContent.includes('รอรับชำระ') || btn.textContent.includes('ยังไม่ชำระ') || btn.textContent.includes('รอชำระ')) {
                btn.textContent = `รอรับชำระ (${waitingCount})`;
            } else if (filter === 'PAID' || btn.textContent.includes('ชำระแล้ว')) {
                btn.textContent = `ชำระแล้ว (${paidCount})`;
            } else if (filter === 'CANCELLED' || btn.textContent.includes('ยกเลิก')) {
                btn.textContent = `ยกเลิก (${cancelledCount})`;
            }
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');
            if (filter) {
                currentFilter = filter;
            } else {
                const tabText = btn.textContent.trim();
                if (tabText.includes('ยังไม่ชำระ') || tabText.includes('รอรับชำระ') || tabText.includes('รอชำระ')) {
                    currentFilter = 'WAITING';
                } else if (tabText.includes('ชำระแล้ว')) {
                    currentFilter = 'PAID';
                } else if (tabText.includes('ยกเลิก')) {
                    currentFilter = 'CANCELLED';
                } else {
                    currentFilter = 'ALL';
                }
            }
            renderInvoices();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderInvoices();
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    loadInvoices();
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
            showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์สำหรับแชร์ใบกำกับภาษี ${docNum} เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์ใบกำกับภาษี ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์ใบกำกับภาษี ${docNum}:`, shareUrl);
    }
};

window.deleteDocument = async function(id, docNum, status, customerName = '-', grandTotal = 0) {
    if (status && status !== 'DRAFT') {
        const dialogRes = await openActionDialog({
            action: 'cancel',
            docNum: docNum,
            customerName: customerName,
            grandTotal: grandTotal,
            docTypeLabel: 'ใบกำกับภาษี',
            defaultReason: 'ลูกค้ายกเลิกคำสั่งซื้อ / ขอเปลี่ยนเอกสาร'
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
                showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบกำกับภาษี ${docNum} เรียบร้อยแล้ว`, 'warning');
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
        docTypeLabel: 'ใบกำกับภาษี'
    });
    if (!dialogRes.confirmed) return;

    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('ลบเอกสารสำเร็จ', `ลบใบกำกับภาษี ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
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
