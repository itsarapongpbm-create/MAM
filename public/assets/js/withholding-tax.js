/**
 * FlowAccount Advance - Withholding Tax (50 ทวิ) Management Controller
 */

let allCertificates = [];
let currentFilter = 'ALL'; // 'ALL' | 'ภ.ง.ด.53' | 'ภ.ง.ด.3' | 'ภ.ง.ด.1' | 'CANCELLED'

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initWithholdingTax();
    setupEventListeners();
});

function initFilters() {
    // อ่านค่าเดือนจาก URL ถ้ามี (เช่น ?month=2026-10)
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get('month');
    const monthInput = document.getElementById('monthFilter');
    if (monthInput && monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        monthInput.value = monthParam;
        updateMonthClearBtn();
    }
}

async function initWithholdingTax() {
    await Promise.all([fetchStats(), fetchCertificates()]);
}

function getSelectedMonth() {
    const monthInput = document.getElementById('monthFilter');
    const val = monthInput ? monthInput.value : '';
    return /^\d{4}-\d{2}$/.test(val) ? val : '';
}

function updateMonthClearBtn() {
    const clearBtn = document.getElementById('btnClearMonth');
    if (clearBtn) {
        clearBtn.style.display = getSelectedMonth() ? 'inline-block' : 'none';
    }
}

function setupEventListeners() {
    // Tab Filters (แบบภาษี หรือ สถานะยกเลิก)
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.getAttribute('data-status') || e.currentTarget.getAttribute('data-form') || 'ALL';
            renderTable();
        });
    });

    // Month Filter (กรองตามเดือนภาษีที่จ่ายเงิน)
    const monthInput = document.getElementById('monthFilter');
    if (monthInput) {
        monthInput.addEventListener('change', () => {
            updateMonthClearBtn();
            initWithholdingTax();
        });
    }

    const btnClearMonth = document.getElementById('btnClearMonth');
    if (btnClearMonth) {
        btnClearMonth.addEventListener('click', () => {
            if (monthInput) monthInput.value = '';
            updateMonthClearBtn();
            initWithholdingTax();
        });
    }

    // Export Excel / CSV
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', exportToCsv);
    }

    // Search input
    const searchInput = document.getElementById('searchWhtInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            renderTable();
        }, 300));
    }
}

async function fetchStats() {
    try {
        const month = getSelectedMonth();
        const url = month ? `/api/withholding-taxes/stats?month=${encodeURIComponent(month)}` : '/api/withholding-taxes/stats';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load stats');
        const stats = await res.json();

        const elTotalTax = document.getElementById('kpiTotalTax');
        const elTotalCount = document.getElementById('kpiTotalCount');
        const elPnd53Tax = document.getElementById('kpiPnd53Tax');
        const elPnd53Count = document.getElementById('kpiPnd53Count');
        const elPnd3Tax = document.getElementById('kpiPnd3Tax');
        const elPnd3Count = document.getElementById('kpiPnd3Count');
        const elTotalIncome = document.getElementById('kpiTotalIncome');

        if (elTotalTax) elTotalTax.textContent = `฿ ${formatNumber(stats.total_tax_amount)}`;
        if (elTotalCount) elTotalCount.textContent = `${stats.total_count || 0} ฉบับ`;
        if (elPnd53Tax) elPnd53Tax.textContent = `฿ ${formatNumber(stats.pnd53_amount)}`;
        if (elPnd53Count) elPnd53Count.textContent = `${stats.pnd53_count || 0} ฉบับ`;
        if (elPnd3Tax) elPnd3Tax.textContent = `฿ ${formatNumber(stats.pnd3_amount)}`;
        if (elPnd3Count) elPnd3Count.textContent = `${stats.pnd3_count || 0} ฉบับ`;
        if (elTotalIncome) elTotalIncome.textContent = `฿ ${formatNumber(stats.total_income_amount)}`;
    } catch (err) {
        console.error('Error fetching WHT stats:', err);
    }
}

async function fetchCertificates() {
    const tableBody = document.getElementById('whtTableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #64748b;">
                    <div class="spinner-small" style="margin: 0 auto 10px;"></div>
                    กำลังโหลดข้อมูลหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)...
                </td>
            </tr>
        `;
    }

    try {
        const month = getSelectedMonth();
        const url = month ? `/api/withholding-taxes?month=${encodeURIComponent(month)}` : '/api/withholding-taxes';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load certificates');
        allCertificates = await res.json();
        renderTable();
    } catch (err) {
        console.error('Error fetching WHT list:', err);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: #ef4444;">
                        เกิดข้อผิดพลาดในการโหลดข้อมูล: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }
}

function getFilteredList() {
    const searchTerm = (document.getElementById('searchWhtInput')?.value || '').trim().toLowerCase();

    return allCertificates.filter(cert => {
        const isCancelled = cert.status === 'CANCELLED';
        const isDraft = cert.status === 'DRAFT';

        if (currentFilter === 'CANCELLED') {
            if (!isCancelled) return false;
        } else if (currentFilter === 'DRAFT') {
            if (!isDraft) return false;
        } else if (currentFilter === 'ALL') {
            // หน้ารวมปกติไม่แสดงรายการที่ยกเลิก เพื่อไม่ให้ยอดสับสน
            if (isCancelled) return false;
        } else {
            // กรองตามแบบภาษี (ไม่รวมยกเลิก)
            if (isCancelled || cert.form_type !== currentFilter) return false;
        }

        if (searchTerm) {
            const docNo = (cert.doc_number || '').toLowerCase();
            const payee = (cert.payee_name || '').toLowerCase();
            const taxId = (cert.payee_tax_id || '').toLowerCase();
            const incType = (cert.income_type || '').toLowerCase();
            return docNo.includes(searchTerm) || payee.includes(searchTerm) || taxId.includes(searchTerm) || incType.includes(searchTerm);
        }

        return true;
    });
}

function renderTable() {
    const tableBody = document.getElementById('whtTableBody');
    if (!tableBody) return;

    const filtered = getFilteredList();

    if (filtered.length === 0) {
        const isCancelTab = currentFilter === 'CANCELLED';
        const isDraftTab = currentFilter === 'DRAFT';
        let emptyTitle = 'ไม่พบหนังสือรับรองหัก ณ ที่จ่าย';
        let emptyDesc = 'คลิกปุ่ม "+ ออกหนังสือรับรอง 50 ทวิ" เพื่อสร้างเอกสารใหม่';
        if (isCancelTab) {
            emptyTitle = 'ไม่พบรายการที่ถูกยกเลิก';
            emptyDesc = 'เอกสารทั้งหมดอยู่ในสถานะปกติ';
        } else if (isDraftTab) {
            emptyTitle = 'ไม่พบเอกสารแบบร่าง';
            emptyDesc = 'ไม่มีหนังสือรับรองที่ค้างอยู่ในสถานะแบบร่าง';
        }

        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 48px 20px; color: #94a3b8;">
                    <svg width="48" height="48" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none" style="margin-bottom: 12px; color: #cbd5e1;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    <div style="font-size: 15px; font-weight: 600; color: #475569;">${emptyTitle}</div>
                    <div style="font-size: 13px; margin-top: 4px;">${emptyDesc}</div>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = filtered.map(cert => {
        const isCancelled = cert.status === 'CANCELLED';
        const isDraft = cert.status === 'DRAFT';

        let badge = `<span class="wht-badge-53">ภ.ง.ด.53</span>`;
        if (cert.form_type === 'ภ.ง.ด.3') badge = `<span class="wht-badge-3">ภ.ง.ด.3</span>`;
        if (cert.form_type === 'ภ.ง.ด.1') badge = `<span class="wht-badge-1">ภ.ง.ด.1</span>`;
        if (cert.form_type === 'ภ.ง.ด.2') badge = `<span class="wht-badge-1">ภ.ง.ด.2</span>`;

        const rowStyle = isCancelled ? 'style="background-color: #fafbfc; opacity: 0.75;"' : (isDraft ? 'style="background-color: #fafbfd;"' : '');
        const docStyle = isCancelled ? 'text-decoration: line-through; color: #64748b;' : 'color: #7D0A0A;';

        const cancelReasonHtml = isCancelled && cert.cancel_reason
            ? `<div style="font-size: 11px; color: #dc2626; margin-top: 2px;">(ยกเลิก: ${escapeHtml(cert.cancel_reason)})</div>`
            : '';

        const draftBadgeHtml = isDraft
            ? `<div style="margin-top: 3px;"><span style="display: inline-block; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-size: 10.5px; font-weight: 600; padding: 1px 6px; border-radius: 4px;">แบบร่าง</span></div>`
            : '';

        const cancelActionBtn = isCancelled
            ? `<span style="font-size: 11.5px; color: #94a3b8; padding: 0 4px;">ยกเลิกแล้ว</span>`
            : `<button class="btn-action-small text-danger" title="ยกเลิกหนังสือรับรอง" onclick="cancelCertificate(${cert.id}, '${escapeHtml(cert.doc_number)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <span>ยกเลิก</span>
               </button>`;

        const linkUrl = isDraft ? `withholding-tax-new.html?id=${cert.id}&edit=1` : `withholding-tax-new.html?id=${cert.id}`;

        return `
            <tr ${rowStyle}>
                <td style="font-weight: 500; color: #1e293b; white-space: nowrap;">${formatThaiDate(cert.payment_date || cert.doc_date)}</td>
                <td>
                    <a href="${linkUrl}" style="font-weight: 600; text-decoration: none; ${docStyle}" title="คลิกเพื่อดูรายละเอียด">${escapeHtml(cert.doc_number)}</a>
                    <div style="font-size: 11px; color: #64748b;">เล่มที่: ${escapeHtml(cert.book_number || '01')}</div>
                    ${draftBadgeHtml}
                    ${cancelReasonHtml}
                </td>
                <td style="text-align: center;">
                    ${isCancelled ? '<span class="wht-badge-cancelled">ยกเลิก</span>' : badge}
                </td>
                <td>
                    <div style="font-weight: 600; color: #0f172a;">${escapeHtml(cert.payee_name)}</div>
                    <div style="font-size: 11px; color: #64748b;">เลขประจำตัว: ${escapeHtml(cert.payee_tax_id || '-')}</div>
                </td>
                <td>
                    <span style="font-size: 13px; color: #334155;">${escapeHtml(cert.income_type)}</span>
                </td>
                <td style="text-align: right; font-weight: 600; color: #334155; white-space: nowrap;">
                    ฿ ${formatNumber(cert.income_amount)}
                </td>
                <td style="text-align: right; font-weight: 700; color: ${isCancelled ? '#94a3b8' : '#059669'}; white-space: nowrap;">
                    ฿ ${formatNumber(cert.tax_amount)}
                    <div style="font-size: 11px; color: #64748b; font-weight: normal;">(หัก ${cert.tax_rate}%)</div>
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <div class="row-actions" style="display: inline-flex; gap: 6px; justify-content: center; align-items: center;">
                        <a href="withholding-tax-new.html?id=${cert.id}" class="btn-action-small" title="ดูรายละเอียด / แก้ไข">
                            <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>ดู</span>
                        </a>
                        <button class="btn-action-small" title="พิมพ์แบบ 50 ทวิ" onclick="printCertificate(${cert.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                <rect x="6" y="14" width="12" height="8"></rect>
                            </svg>
                            <span>พิมพ์</span>
                        </button>
                        ${cancelActionBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.printCertificate = function(id) {
    window.location.href = `withholding-tax-new.html?id=${id}&autoPrint=true`;
};

window.cancelCertificate = async function(id, docNumber) {
    const reason = prompt(`กรุณาระบุเหตุผลการยกเลิกหนังสือรับรอง ${docNumber}:`, 'ออกเอกสารผิดพลาด / มีการยกเลิกบิล');
    if (!reason || !reason.trim()) return;

    try {
        const res = await fetch(`/api/withholding-taxes/${id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'ยกเลิกเอกสารไม่สำเร็จ');
        }

        await initWithholdingTax();
        notify('success', 'ยกเลิกเรียบร้อย', `ยกเลิกหนังสือรับรอง ${docNumber} เรียบร้อยแล้ว`);
    } catch (err) {
        notify('error', 'เกิดข้อผิดพลาดในการยกเลิก', err.message);
    }
};

function exportToCsv() {
    const filtered = getFilteredList();
    const headers = [
        'วันที่จ่ายเงิน',
        'เลขที่เอกสาร',
        'เล่มที่',
        'แบบภาษี',
        'ผู้ถูกหักภาษี',
        'เลขประจำตัวผู้เสียภาษี',
        'ประเภทเงินได้',
        'จำนวนเงินที่จ่าย (บาท)',
        'อัตราภาษี (%)',
        'ภาษีที่หัก (บาท)',
        'สถานะ',
        'เหตุผลยกเลิก'
    ];

    let csv = '\uFEFF' + headers.join(',') + '\n';
    filtered.forEach(c => {
        csv += [
            `"${c.payment_date || c.doc_date || ''}"`,
            `"${c.doc_number || ''}"`,
            `"${c.book_number || '01'}"`,
            `"${c.form_type || ''}"`,
            `"${(c.payee_name || '').replace(/"/g, '""')}"`,
            `"${c.payee_tax_id || ''}"`,
            `"${(c.income_type || '').replace(/"/g, '""')}"`,
            c.income_amount || 0,
            c.tax_rate || 0,
            c.tax_amount || 0,
            `"${c.status || 'COMPLETED'}"`,
            `"${(c.cancel_reason || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
    });

    const monthStr = getSelectedMonth() ? `_${getSelectedMonth()}` : '';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Withholding_Tax_Report${monthStr}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function notify(type, title, message) {
    if (typeof window.showToast === 'function') {
        window.showToast({ type, title, message, duration: 3500 });
    } else {
        alert(`${title}\n${message}`);
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
