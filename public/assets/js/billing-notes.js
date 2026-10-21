/**
 * FlowAccount Advance - Billing Notes List Controller
 * Standardized FlowAccount design pattern with Split Button & Brand Red Action dropdown
 * Strictly 0 emojis (SVG icons only)
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (document.querySelector('.doc-search-box input')?.value || '').trim();
            const url = `/api/documents/export/csv?type=BILLING_NOTE&status=${currentFilter || 'ALL'}&search=${encodeURIComponent(searchTerm)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `Billing_Notes_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.showToast) window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV เรียบร้อยแล้ว', 'info');
        });
    }
    const tableBody = document.querySelector('.data-table tbody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.querySelector('.doc-search-box input');

    let allBillingNotes = [];
    let currentFilter = 'ALL';

    const fallbackBillingNotes = [];

    async function loadBillingNotes() {
        try {
            const res = await fetch('/api/documents?type=BILLING_NOTE');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    allBillingNotes = data.map(d => formatBillingNote(d));
                    updateKpiAndTabs();
                    renderBillingNotes();
                    return;
                }
            }
        } catch (e) {
            console.log('Using local fallback billing notes.');
        }

        allBillingNotes = [];
        updateKpiAndTabs();
        renderBillingNotes();
    }

    function formatBillingNote(d) {
        let statusKey = d.status || 'WAITING';
        if (statusKey === 'ISSUED') {
            statusKey = 'WAITING';
        }
        let statusText = 'รอชำระ';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (statusKey === 'PAID') {
            statusText = 'ชำระแล้ว';
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
            doc_type: 'BILLING_NOTE',
            doc_number: d.doc_number || '(ฉบับร่าง)',
            issue_date: d.issue_date || '-',
            due_date: d.due_date || '-',
            ref_doc_number: d.ref_doc_number || '',
            customer_name: d.customer_name || '-',
            grand_total: d.grand_total || 0,
            status: statusKey,
            status_text: statusText,
            related_documents: d.related_documents || []
        };
    }

    function renderBillingNotes() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allBillingNotes;
        if (currentFilter !== 'ALL') {
            filtered = filtered.filter(b => b.status === currentFilter);
        }

        if (searchTerm) {
            filtered = filtered.filter(b =>
                (b.doc_number && b.doc_number.toLowerCase().includes(searchTerm)) ||
                (b.customer_name && b.customer_name.toLowerCase().includes(searchTerm)) ||
                (b.ref_doc_number && b.ref_doc_number.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center" style="padding: 36px; color: #94a3b8;">
                        <div style="margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="#94a3b8" stroke-width="1.8" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        ไม่พบรายการใบวางบิลที่ค้นหา
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((b, idx) => {
            const isBottomRow = filtered.length > 2 && idx >= filtered.length - 2;
            const isPaid = b.status === 'PAID';
            const isOverdue = b.status === 'OVERDUE';
            const isCancelled = b.status === 'CANCELLED';
            const isDraft = b.status === 'DRAFT';
            const docNum = b.doc_number || '-';

            // Related docs popover
            let relatedDocHtml = '';
            let popoverItems = '';
            if (b.ref_doc_number && b.ref_doc_number !== '-') {
                const isPO = b.ref_doc_number.startsWith('PO');
                const badgeClass = isPO ? 'badge-bn' : 'badge-qt';
                const badgeLabel = isPO ? 'PO' : 'QT';
                const targetUrl = isPO ? `purchase-order-new.html?id=${encodeURIComponent(b.ref_doc_number)}` : `quotation-new.html?id=${encodeURIComponent(b.ref_doc_number)}`;
                popoverItems += `
                    <div class="popover-item">
                        <span class="popover-badge ${badgeClass}">${badgeLabel}</span>
                        <a href="${targetUrl}" class="popover-link">${escapeHtml(b.ref_doc_number)}</a>
                    </div>
                `;
            }
            if (b.related_documents && b.related_documents.length > 0) {
                b.related_documents.forEach(rd => {
                    const isRec = rd.doc_type === 'RECEIPT' || (rd.doc_number && rd.doc_number.startsWith('RE'));
                    const isInv = rd.doc_type === 'TAX_INVOICE' || (rd.doc_number && rd.doc_number.startsWith('INV'));
                    const badge = isRec ? 'badge-re' : (isInv ? 'badge-inv' : 'badge-qt');
                    const badgeText = isRec ? 'RE' : (isInv ? 'INV' : 'DOC');
                    const targetId = encodeURIComponent(rd.id || rd.doc_number);
                    const url = isRec ? `cash-invoice-new.html?id=${targetId}` : (isInv ? `invoice-new.html?id=${targetId}` : `quotation-new.html?id=${targetId}`);
                    popoverItems += `
                        <div class="popover-item">
                            <span class="popover-badge ${badge}">${badgeText}</span>
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
            const relReceipt = b.related_documents && b.related_documents.find(r => r.doc_type === 'RECEIPT' || (r.doc_number && r.doc_number.startsWith('RE')));
            const receiptUrl = relReceipt ? `cash-invoice-new.html?id=${encodeURIComponent(relReceipt.id || relReceipt.doc_number)}` : `cash-invoice-new.html?ref=${encodeURIComponent(b.doc_number)}`;

            if (isPaid) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'ชำระแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">การจัดการใบวางบิล</div>
                    <a href="${receiptUrl}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        <span>ดูใบเสร็จรับเงิน</span>
                    </a>
                    <a href="print.html?id=${b.id}&type=BILLING_NOTE" target="_blank" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>พิมพ์ใบวางบิล (A4)</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-bn-action" data-action="cancel" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกเอกสาร</span>
                    </button>
                `;
            } else if (isOverdue) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'เกินกำหนด';
                statusMenuItems = `
                    <div class="status-menu-header">ดำเนินการเรียกเก็บ</div>
                    <a href="cash-invoice-new.html?ref=${encodeURIComponent(b.doc_number)}" class="status-menu-item" style="color: #059669; font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        <span>ออกใบเสร็จรับเงิน (รับชำระ)</span>
                    </a>
                    <button type="button" class="status-menu-item text-success btn-bn-action" data-action="mark_paid" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>เปลี่ยนเป็นชำระแล้ว</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-bn-action" data-action="cancel" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบวางบิล</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-bn-action" data-action="reopen" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        <span>เปลี่ยนเป็นรอชำระ</span>
                    </button>
                `;
            } else if (isDraft) {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <button type="button" class="status-menu-item btn-bn-action" data-action="issue" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}" style="color: #0284c7;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span>ออกใบวางบิลจริง</span>
                    </button>
                `;
            } else {
                // WAITING
                statusBtnClass = 'split-waiting';
                statusBtnText = 'รอชำระ';
                statusMenuItems = `
                    <div class="status-menu-header">ดำเนินการรับชำระ</div>
                    <a href="cash-invoice-new.html?ref=${encodeURIComponent(b.doc_number)}" class="status-menu-item" style="color: #059669; font-weight: 600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        <span>สร้างใบเสร็จรับเงิน</span>
                    </a>
                    <a href="invoice-new.html?ref=${encodeURIComponent(b.doc_number)}" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        <span>สร้างใบกำกับภาษี</span>
                    </a>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-success btn-bn-action" data-action="mark_paid" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>เปลี่ยนเป็นชำระแล้ว</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-bn-action" data-action="cancel" data-id="${b.id}" data-num="${docNum}" data-customer="${escapeHtml(b.customer_name)}" data-total="${b.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบวางบิล</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                    <td style="text-align: left;">
                        <div class="doc-number-cell">
                            <a href="billing-note-new.html?id=${b.id}" class="doc-link">
                                <strong style="${isCancelled ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(docNum)}</strong>
                            </a>
                            ${relatedDocHtml}
                        </div>
                    </td>
                    <td style="text-align: left;">${b.issue_date || '-'}</td>
                    <td style="text-align: left;">${b.due_date || '-'}</td>
                    <td style="text-align: left;">
                        ${b.ref_doc_number ? `
                            <a href="${b.ref_doc_number.startsWith('PO') ? 'purchase-order-new.html' : 'quotation-new.html'}?id=${encodeURIComponent(b.ref_doc_number)}" style="font-size: 12px; color: #1e40af; background: #eff6ff; padding: 2px 7px; border-radius: 4px; text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                                <span>${escapeHtml(b.ref_doc_number)}</span>
                            </a>
                        ` : `<span style="color: #94a3b8;">-</span>`}
                    </td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(b.customer_name || '-')}">
                            ${escapeHtml(b.customer_name || '-')}
                        </div>
                    </td>
                    <td class="text-right" style="text-align: right;">
                        <strong style="color: #059669;">฿ ${(b.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
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
                                <a href="billing-note-new.html?id=${b.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${b.id}&type=BILLING_NOTE" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${b.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${b.id}&type=BILLING_NOTE&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="print.html?id=${b.id}&type=BILLING_NOTE&envelope=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>พิมพ์จ่าหน้าซอง</span>
                                </a>
                                <a href="billing-note-new.html?copy=${b.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${b.id}', '${escapeHtml(docNum)}', '${b.status}', '${escapeHtml(b.customer_name)}', '${b.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach action handlers
        tableBody.querySelectorAll('.btn-bn-action').forEach(btn => {
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
                        docTypeLabel: 'ใบวางบิล',
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
                            showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบวางบิล ${num} เรียบร้อยแล้ว`, 'warning');
                            loadBillingNotes();
                        } else {
                            showToast('ไม่สามารถดำเนินการได้', data.error || 'เกิดข้อผิดพลาด', 'error');
                        }
                    } catch (err) {
                        showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                    }
                } else if (action === 'mark_paid') {
                    const dialogRes = await openActionDialog({
                        action: 'pay',
                        title: 'ยืนยันรับชำระเงินใบวางบิล',
                        docNum: num,
                        customerName: customer,
                        grandTotal: total,
                        docTypeLabel: 'ใบวางบิล',
                        confirmText: 'ยืนยันเป็นชำระแล้ว'
                    });
                    if (!dialogRes.confirmed) return;

                    try {
                        const res = await fetch(`/api/documents/${id}/actions/pay`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paid_amount: parseFloat(total) || 0, payment_method: 'TRANSFER' })
                        });
                        if (res.ok) {
                            showToast('บันทึกสำเร็จ', `อัปเดตสถานะใบวางบิล ${num} เป็นชำระแล้วเรียบร้อย`, 'success');
                            loadBillingNotes();
                        } else {
                            const data = await res.json().catch(() => ({}));
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
                            showToast('ปรับสถานะสำเร็จ', `เปลี่ยนสถานะใบวางบิล ${num} เป็นรอชำระแล้ว`, 'info');
                            loadBillingNotes();
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
                            showToast('ออกเอกสารสำเร็จ', `ออกใบวางบิล ${num} ตัวจริงเรียบร้อยแล้ว`, 'success');
                            loadBillingNotes();
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

    function updateKpiAndTabs() {
        let totalCount = 0;
        let totalAmount = 0;
        let waitingCount = 0;
        let waitingAmount = 0;
        let paidCount = 0;
        let paidAmount = 0;
        let overdueCount = 0;
        let overdueAmount = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        allBillingNotes.forEach(bn => {
            const grandTotal = Number(bn.grand_total) || 0;
            if (bn.status === 'CANCELLED') return;

            totalCount++;
            totalAmount += grandTotal;

            if (bn.status === 'PAID') {
                paidCount++;
                paidAmount += grandTotal;
            } else if (bn.status === 'OVERDUE' || (bn.due_date && bn.due_date !== '-' && new Date(bn.due_date) < today)) {
                overdueCount++;
                overdueAmount += grandTotal;
                waitingCount++;
                waitingAmount += grandTotal;
            } else {
                waitingCount++;
                waitingAmount += grandTotal;
            }
        });

        const elTotalCount = document.getElementById('kpiBnTotalCount');
        const elTotalAmt = document.getElementById('kpiBnTotalAmount');
        const elWaitingCount = document.getElementById('kpiBnWaitingCount');
        const elWaitingAmt = document.getElementById('kpiBnWaitingAmount');
        const elPaidCount = document.getElementById('kpiBnPaidCount');
        const elPaidAmt = document.getElementById('kpiBnPaidAmount');
        const elOverdueCount = document.getElementById('kpiBnOverdueCount');
        const elOverdueAmt = document.getElementById('kpiBnOverdueAmount');

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
                btn.textContent = `ทั้งหมด (${totalCount})`;
            } else if (filter === 'WAITING' || btn.textContent.includes('รอชำระ')) {
                btn.textContent = `รอชำระ (${waitingCount})`;
            } else if (filter === 'PAID' || btn.textContent.includes('ชำระแล้ว')) {
                btn.textContent = `ชำระแล้ว (${paidCount})`;
            } else if (filter === 'OVERDUE' || btn.textContent.includes('เกินกำหนด')) {
                btn.textContent = `เกินกำหนด (${overdueCount})`;
            }
        });
    }

    // Tab buttons event
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');
            if (filter) {
                currentFilter = filter;
            } else {
                const tabText = btn.textContent.trim();
                if (tabText.includes('รอชำระ')) {
                    currentFilter = 'WAITING';
                } else if (tabText.includes('ชำระแล้ว')) {
                    currentFilter = 'PAID';
                } else if (tabText.includes('เกินกำหนด')) {
                    currentFilter = 'OVERDUE';
                } else {
                    currentFilter = 'ALL';
                }
            }
            renderBillingNotes();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderBillingNotes();
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    loadBillingNotes();
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
    const shareUrl = `${window.location.origin}/documents/print.html?id=${id}&type=BILLING_NOTE`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์สำหรับแชร์ใบวางบิล ${docNum} เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์ใบวางบิล ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์ใบวางบิล ${docNum}:`, shareUrl);
    }
};

window.deleteDocument = async function(id, docNum, status, customerName = '-', grandTotal = 0) {
    if (status && status !== 'DRAFT') {
        const dialogRes = await openActionDialog({
            action: 'cancel',
            docNum: docNum,
            customerName: customerName,
            grandTotal: grandTotal,
            docTypeLabel: 'ใบวางบิล',
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
                showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบวางบิล ${docNum} เรียบร้อยแล้ว`, 'warning');
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
        docTypeLabel: 'ใบวางบิล'
    });
    if (!dialogRes.confirmed) return;

    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('ลบเอกสารสำเร็จ', `ลบใบวางบิล ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
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
