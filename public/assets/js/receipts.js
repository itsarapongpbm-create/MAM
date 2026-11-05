/**
 * FlowAccount Advance - Receipts List Controller
 * Standardized FlowAccount design pattern with Split Button & Brand Red Action dropdown
 * Strictly 0 emojis (SVG icons only)
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const searchTerm = (document.querySelector('.doc-search-box input')?.value || '').trim();
            const url = `/api/documents/export/csv?type=RECEIPT&status=${currentFilter || 'ALL'}&search=${encodeURIComponent(searchTerm)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `Receipts_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.showToast) window.showToast('ดาวน์โหลดรายงาน', 'ระบบกำลังส่งออกไฟล์รายงาน Excel/CSV เรียบร้อยแล้ว', 'info');
        });
    }
    const tableBody = document.querySelector('.data-table tbody');
    const tabButtons = document.querySelectorAll('.doc-tab-btn');
    const searchInput = document.querySelector('.doc-search-box input');

    let allReceipts = [];
    let currentFilter = 'ALL';

    const fallbackReceipts = [];

    async function loadReceipts() {
        try {
            const res = await fetch('/api/documents?type=RECEIPT');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    allReceipts = data.map(d => formatReceipt(d));
                    updateKpiAndTabs();
                    renderReceipts();
                    return;
                }
            }
        } catch (e) {
            console.log('Using local fallback receipts.');
        }

        allReceipts = [];
        updateKpiAndTabs();
        renderReceipts();
    }

    function formatReceipt(d) {
        let statusText = 'รับชำระแล้ว';
        let statusKey = d.status || 'COMPLETED';

        if (statusKey === 'CANCELLED') {
            statusText = 'ยกเลิกแล้ว';
        } else if (statusKey === 'DRAFT') {
            statusText = 'ฉบับร่าง';
        }

        return {
            id: d.id,
            doc_type: 'RECEIPT',
            doc_number: d.doc_number || '(ฉบับร่าง)',
            issue_date: d.issue_date || '-',
            ref_doc_number: d.ref_doc_number || '',
            customer_name: d.customer_name || '-',
            payment_method: d.payment_method || d.credit_terms || (d.remarks && (d.remarks.includes('โอน') || d.remarks.includes('เช็ค') || d.remarks.includes('เงินสด')) ? d.remarks : 'โอนเงินผ่านธนาคาร'),
            grand_total: d.grand_total || 0,
            status: statusKey,
            status_text: statusText,
            related_documents: d.related_documents || []
        };
    }

    function renderReceipts() {
        if (!tableBody) return;
        const searchTerm = (searchInput?.value || '').trim().toLowerCase();

        let filtered = allReceipts;
        if (currentFilter === 'TRANSFER') {
            filtered = filtered.filter(r => (r.payment_method || '').includes('โอน'));
        } else if (currentFilter === 'CHEQUE') {
            filtered = filtered.filter(r => (r.payment_method || '').includes('เช็ค') || (r.payment_method || '').includes('สด'));
        } else if (currentFilter === 'CANCELLED') {
            filtered = filtered.filter(r => r.status === 'CANCELLED');
        }

        if (searchTerm) {
            filtered = filtered.filter(r =>
                (r.doc_number && r.doc_number.toLowerCase().includes(searchTerm)) ||
                (r.customer_name && r.customer_name.toLowerCase().includes(searchTerm)) ||
                (r.ref_doc_number && r.ref_doc_number.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center" style="padding: 36px; color: #94a3b8;">
                        <div style="margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="32" height="32" stroke="#94a3b8" stroke-width="1.8" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        ไม่พบรายการใบเสร็จรับเงินที่ค้นหา
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((r, idx) => {
            const isBottomRow = filtered.length > 2 && idx >= filtered.length - 2;
            const isCompleted = r.status === 'COMPLETED' || r.status === 'PAID';
            const isCancelled = r.status === 'CANCELLED';
            const isDraft = r.status === 'DRAFT';
            const docNum = r.doc_number || '-';

            // Related docs popover
            let relatedDocHtml = '';
            let popoverItems = '';
            if (r.ref_doc_number && r.ref_doc_number !== '-') {
                const isBN = r.ref_doc_number.startsWith('BN');
                const isINV = r.ref_doc_number.startsWith('INV');
                const badgeClass = isBN ? 'badge-bn' : (isINV ? 'badge-inv' : 'badge-qt');
                const badgeLabel = isBN ? 'BN' : (isINV ? 'INV' : 'QT');
                const targetUrl = isBN ? `billing-note-new.html?id=${encodeURIComponent(r.ref_doc_number)}` : (isINV ? `invoice-new.html?id=${encodeURIComponent(r.ref_doc_number)}` : `quotation-new.html?id=${encodeURIComponent(r.ref_doc_number)}`);
                popoverItems += `
                    <div class="popover-item">
                        <span class="popover-badge ${badgeClass}">${badgeLabel}</span>
                        <a href="${targetUrl}" class="popover-link">${escapeHtml(r.ref_doc_number)}</a>
                    </div>
                `;
            }
            if (r.related_documents && r.related_documents.length > 0) {
                r.related_documents.forEach(rd => {
                    const isBN = rd.doc_number && rd.doc_number.startsWith('BN');
                    const isINV = rd.doc_number && rd.doc_number.startsWith('INV');
                    const badge = isBN ? 'badge-bn' : (isINV ? 'badge-inv' : 'badge-qt');
                    const badgeLabel = isBN ? 'BN' : (isINV ? 'INV' : 'QT');
                    const targetId = encodeURIComponent(rd.id || rd.doc_number);
                    const url = isBN ? `billing-note-new.html?id=${targetId}` : (isINV ? `invoice-new.html?id=${targetId}` : `quotation-new.html?id=${targetId}`);
                    popoverItems += `
                        <div class="popover-item">
                            <span class="popover-badge ${badge}">${badgeLabel}</span>
                            <a href="${url}" class="popover-link">${escapeHtml(rd.doc_number)}</a>
                        </div>
                    `;
                });
            }

            if (popoverItems) {
                relatedDocHtml = `
                    <div class="related-doc-wrapper" style="position: relative; display: inline-flex;">
                        <button type="button" class="btn-related-doc" onclick="toggleRelatedPopover(this, event)" title="เอกสารต้นทาง / เกี่ยวข้อง">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </button>
                        <div class="related-docs-popover ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                            <div class="popover-title">เอกสารต้นทาง / เรียกเก็บ</div>
                            ${popoverItems}
                        </div>
                    </div>
                `;
            }

            // Status Split Button styling & actions
            let statusBtnClass = 'split-approved';
            let statusBtnText = 'รับชำระแล้ว';
            let statusMenuItems = '';

            if (isCompleted) {
                statusBtnClass = 'split-approved';
                statusBtnText = 'รับชำระแล้ว';
                statusMenuItems = `
                    <div class="status-menu-header">การจัดการใบเสร็จ</div>
                    <a href="print.html?id=${r.id}" target="_blank" class="status-menu-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>พิมพ์ใบเสร็จ (A4)</span>
                    </a>
                    <button type="button" class="status-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${r.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                        <span>แชร์ให้ลูกค้า</span>
                    </button>
                    <div class="status-menu-divider"></div>
                    <button type="button" class="status-menu-item text-danger btn-re-action" data-action="cancel" data-id="${r.id}" data-num="${docNum}" data-customer="${escapeHtml(r.customer_name)}" data-total="${r.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>ยกเลิกใบเสร็จรับเงิน</span>
                    </button>
                `;
            } else if (isCancelled) {
                statusBtnClass = 'split-rejected';
                statusBtnText = 'ยกเลิกแล้ว';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-re-action" data-action="reopen" data-id="${r.id}" data-num="${docNum}" data-customer="${escapeHtml(r.customer_name)}" data-total="${r.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        <span>เปลี่ยนเป็นรับชำระแล้ว</span>
                    </button>
                `;
            } else if (isDraft) {
                statusBtnClass = 'split-draft';
                statusBtnText = 'ฉบับร่าง';
                statusMenuItems = `
                    <button type="button" class="status-menu-item text-success btn-re-action" data-action="confirm" data-id="${r.id}" data-num="${docNum}" data-customer="${escapeHtml(r.customer_name)}" data-total="${r.grand_total || 0}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>ยืนยันการรับชำระ</span>
                    </button>
                `;
            }

            return `
                <tr>
                    <td class="text-center" style="text-align: center;"><input type="checkbox"></td>
                    <td style="text-align: left;">
                        <div class="doc-number-cell">
                            <a href="cash-invoice-new.html?id=${r.id}" class="doc-link">
                                <strong style="${isCancelled ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(docNum)}</strong>
                            </a>
                            ${relatedDocHtml}
                        </div>
                    </td>
                    <td style="text-align: left;">${r.issue_date || '-'}</td>
                    <td style="text-align: left;">
                        ${r.ref_doc_number ? `
                            <a href="${r.ref_doc_number.startsWith('BN') ? 'billing-note-new.html' : (r.ref_doc_number.startsWith('INV') ? 'invoice-new.html' : 'quotation-new.html')}?id=${encodeURIComponent(r.ref_doc_number)}" style="font-size: 12px; color: #1e40af; background: #eff6ff; padding: 2px 7px; border-radius: 4px; text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                                <span>${escapeHtml(r.ref_doc_number)}</span>
                            </a>
                        ` : `<span style="color: #94a3b8;">-</span>`}
                    </td>
                    <td style="text-align: left; max-width: 220px;">
                        <div class="customer-name-ellipsis" style="font-weight: 600; color: #1e293b;" title="${escapeHtml(r.customer_name || '-')}">
                            ${escapeHtml(r.customer_name || '-')}
                        </div>
                    </td>
                    <td style="text-align: left;">
                        <span style="font-size: 12.5px; color: #047857; background: #ecfdf5; padding: 3px 8px; border-radius: 6px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                            ${escapeHtml(r.payment_method)}
                        </span>
                    </td>
                    <td class="text-right" style="text-align: right;">
                        <strong style="color: #059669;">฿ ${(r.grand_total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
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
                                <a href="cash-invoice-new.html?id=${r.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไข</span>
                                </a>
                                <a href="print.html?id=${r.id}" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    <span>พิมพ์</span>
                                </a>
                                <button type="button" class="action-menu-item" onclick="shareDocument('${escapeHtml(docNum)}', '${r.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    <span>แชร์</span>
                                </button>
                                <a href="print.html?id=${r.id}&download=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>ดาวน์โหลด</span>
                                </a>
                                <a href="print.html?id=${r.id}&envelope=true" target="_blank" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <span>พิมพ์จ่าหน้าซอง</span>
                                </a>
                                <a href="cash-invoice-new.html?copy=${r.id}" class="action-menu-item">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>สร้างซ้ำ</span>
                                </a>
                                <div class="action-menu-divider"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteDocument('${r.id}', '${escapeHtml(docNum)}', '${r.status}', '${escapeHtml(r.customer_name)}', '${r.grand_total || 0}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบ</span>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach status action handlers
        tableBody.querySelectorAll('.btn-re-action').forEach(btn => {
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
                        docTypeLabel: 'ใบเสร็จรับเงิน',
                        defaultReason: 'ยกเลิกรายการรับชำระ / ออกเอกสารผิดพลาด'
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
                            showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบเสร็จรับเงิน ${num} เรียบร้อยแล้ว`, 'warning');
                            loadReceipts();
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
                            showToast('ปรับสถานะสำเร็จ', `เปลี่ยนสถานะใบเสร็จ ${num} เป็นรับชำระแล้ว`, 'success');
                            loadReceipts();
                        } else {
                            const errData = await res.json().catch(() => ({}));
                            showToast('ไม่สามารถดำเนินการได้', errData.error || 'เกิดข้อผิดพลาด', 'error');
                        }
                    } catch (err) {
                        showToast('การเชื่อมต่อผิดพลาด', err.message, 'error');
                    }
                } else if (action === 'confirm' || action === 'issue') {
                    try {
                        const res = await fetch(`/api/documents/${id}/actions/issue`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        if (res.ok) {
                            showToast('ยืนยันสำเร็จ', `ยืนยันการรับชำระเงิน ${num} เรียบร้อยแล้ว`, 'success');
                            loadReceipts();
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
        let transferCount = 0;
        let transferAmount = 0;
        let cashCount = 0;
        let cashAmount = 0;
        let cancelledCount = 0;
        let cancelledAmount = 0;

        allReceipts.forEach(r => {
            const grandTotal = Number(r.grand_total) || 0;
            const method = r.payment_method || '';

            if (r.status === 'CANCELLED') {
                cancelledCount++;
                cancelledAmount += grandTotal;
                return;
            }

            totalCount++;
            totalAmount += grandTotal;

            if (method.includes('โอน')) {
                transferCount++;
                transferAmount += grandTotal;
            } else if (method.includes('เช็ค') || method.includes('สด')) {
                cashCount++;
                cashAmount += grandTotal;
            } else {
                transferCount++;
                transferAmount += grandTotal;
            }
        });

        const elTotalCount = document.getElementById('kpiReceiptTotalCount');
        const elTotalAmt = document.getElementById('kpiReceiptTotalAmount');
        const elTransferCount = document.getElementById('kpiReceiptTransferCount');
        const elTransferAmt = document.getElementById('kpiReceiptTransferAmount');
        const elCashCount = document.getElementById('kpiReceiptCashCount');
        const elCashAmt = document.getElementById('kpiReceiptCashAmount');
        const elCancelledCount = document.getElementById('kpiReceiptCancelledCount');
        const elCancelledAmt = document.getElementById('kpiReceiptCancelledAmount');

        if (elTotalCount) elTotalCount.textContent = `${totalCount} รายการ`;
        if (elTotalAmt) elTotalAmt.textContent = `รวมมูลค่า ฿ ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elTransferCount) elTransferCount.textContent = `${transferCount} รายการ`;
        if (elTransferAmt) elTransferAmt.textContent = `฿ ${transferAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elCashCount) elCashCount.textContent = `${cashCount} รายการ`;
        if (elCashAmt) elCashAmt.textContent = `฿ ${cashAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (elCancelledCount) elCancelledCount.textContent = `${cancelledCount} รายการ`;
        if (elCancelledAmt) elCancelledAmt.textContent = `฿ ${cancelledAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

        tabButtons.forEach(btn => {
            const filter = btn.getAttribute('data-filter') || '';
            if (filter === 'ALL' || btn.textContent.includes('ทั้งหมด')) {
                btn.textContent = `ทั้งหมด (${totalCount + cancelledCount})`;
            } else if (filter === 'TRANSFER' || btn.textContent.includes('โอนเงิน')) {
                btn.textContent = `โอนเงิน (${transferCount})`;
            } else if (filter === 'CHEQUE' || btn.textContent.includes('เช็ค') || btn.textContent.includes('สด')) {
                btn.textContent = `เงินสด / เช็ค (${cashCount})`;
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
                if (tabText.includes('โอนเงิน')) {
                    currentFilter = 'TRANSFER';
                } else if (tabText.includes('เช็ค') || tabText.includes('สด')) {
                    currentFilter = 'CHEQUE';
                } else if (tabText.includes('ยกเลิก')) {
                    currentFilter = 'CANCELLED';
                } else {
                    currentFilter = 'ALL';
                }
            }
            renderReceipts();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderReceipts();
        });
    }

    // Support ?search= query param across pages
    const urlSearchParam = new URLSearchParams(window.location.search).get('search');
    if (urlSearchParam && searchInput) {
        searchInput.value = urlSearchParam;
    }

    loadReceipts();
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
            showToast('คัดลอกลิงก์สำเร็จ', `คัดลอกลิงก์สำหรับแชร์ใบเสร็จรับเงิน ${docNum} เรียบร้อยแล้ว`, 'success');
        }).catch(() => {
            prompt(`ลิงก์สำหรับแชร์ใบเสร็จรับเงิน ${docNum}:`, shareUrl);
        });
    } else {
        prompt(`ลิงก์สำหรับแชร์ใบเสร็จรับเงิน ${docNum}:`, shareUrl);
    }
};

window.deleteDocument = async function(id, docNum, status, customerName = '-', grandTotal = 0) {
    if (status && status !== 'DRAFT' && status !== 'CANCELLED') {
        const dialogRes = await openActionDialog({
            action: 'cancel',
            docNum: docNum,
            customerName: customerName,
            grandTotal: grandTotal,
            docTypeLabel: 'ใบเสร็จรับเงิน',
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
                showToast('ยกเลิกเอกสารสำเร็จ', data.message || `ยกเลิกใบเสร็จรับเงิน ${docNum} เรียบร้อยแล้ว`, 'warning');
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
        docTypeLabel: 'ใบเสร็จรับเงิน'
    });
    if (!dialogRes.confirmed) return;

    try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('ลบเอกสารสำเร็จ', `ลบใบเสร็จรับเงิน ${docNum} ออกจากระบบเรียบร้อยแล้ว`, 'success');
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
