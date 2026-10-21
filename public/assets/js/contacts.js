/**
 * MAM DESIGN AND SERVICE - Contacts Management Module (ERP Standards)
 * FlowAccount Style - Handles Customers (ลูกค้า) and Vendors/Suppliers (ผู้ขาย/คู่ค้า)
 */

let allContacts = [];
let currentFilter = 'ALL';
let searchQuery = '';

const PAGE_TYPE = window.CONTACT_PAGE_TYPE || (window.location.pathname.includes('vendors') ? 'VENDOR' : 'CUSTOMER');
const API_URL = PAGE_TYPE === 'VENDOR' ? '/api/vendors' : '/api/customers';
const ENTITY_LABEL = PAGE_TYPE === 'VENDOR' ? 'ผู้จำหน่าย / คู่ค้า' : 'ลูกค้า';

document.addEventListener('DOMContentLoaded', () => {
    initContactsPage();
});

async function initContactsPage() {
    setupEventListeners();
    await loadContacts();
}

function setupEventListeners() {
    // 1. Filter Tabs
    document.querySelectorAll('.doc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.doc-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter || 'ALL';
            renderTable();
        });
    });

    // 2. Search Input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderTable();
        });
    }

    // 3. Export Excel/CSV
    const btnExport = document.getElementById('btnExportExcel');
    if (btnExport) {
        btnExport.addEventListener('click', exportToCSV);
    }

    // 4. Form Submit
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitContactForm();
        });
    }

    // 5. Select All Checkbox
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
    }
}

async function loadContacts() {
    const tableBody = document.getElementById('contactsTableBody');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 30px; color: #64748b;">กำลังโหลดข้อมูล...</td></tr>`;
    }

    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลได้');
        allContacts = await res.json();
        updateKpisAndCounters();
        renderTable();
    } catch (err) {
        console.error('Error loading contacts:', err);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding: 30px;">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</td></tr>`;
        }
    }
}

function isJuristic(c) {
    if (c.entity_type) return c.entity_type === 'JURISTIC';
    if (!c.name) return false;
    const n = c.name;
    return n.includes('บริษัท') || n.includes('บจก') || n.includes('ห้างหุ้นส่วน') || n.includes('หจก') || n.includes('จำกัด') || (c.tax_id && c.tax_id.length === 13);
}

function hasCredit(c) {
    if (c.credit_days !== undefined && c.credit_days > 0) return true;
    if (!c.credit_terms) return false;
    const t = c.credit_terms.toLowerCase();
    return !t.includes('เงินสด') && (t.includes('วัน') || t.includes('เครดิต'));
}

function updateKpisAndCounters() {
    const total = allContacts.length;
    const juristicCount = allContacts.filter(isJuristic).length;
    const individualCount = total - juristicCount;
    const creditCount = allContacts.filter(hasCredit).length;

    // Update KPI Mini Cards
    const elTotal = document.getElementById('kpiTotalCount');
    if (elTotal) elTotal.textContent = `${total} ราย`;

    const elJuristic = document.getElementById('kpiJuristicCount');
    if (elJuristic) elJuristic.textContent = `${juristicCount} ราย`;

    const elIndividual = document.getElementById('kpiIndividualCount');
    if (elIndividual) elIndividual.textContent = `${individualCount} ราย`;

    const elCredit = document.getElementById('kpiCreditCount');
    if (elCredit) elCredit.textContent = `${creditCount} ราย`;

    // Update Tab Badges
    const bAll = document.getElementById('countAll');
    if (bAll) bAll.textContent = total;

    const bJuristic = document.getElementById('countJuristic');
    if (bJuristic) bJuristic.textContent = juristicCount;

    const bIndividual = document.getElementById('countIndividual');
    if (bIndividual) bIndividual.textContent = individualCount;

    const bCredit = document.getElementById('countCredit');
    if (bCredit) bCredit.textContent = creditCount;
}

function getFilteredContacts() {
    return allContacts.filter(c => {
        // Tab Filter
        if (currentFilter === 'JURISTIC' && !isJuristic(c)) return false;
        if (currentFilter === 'INDIVIDUAL' && isJuristic(c)) return false;
        if (currentFilter === 'CREDIT' && !hasCredit(c)) return false;

        // Search Query
        if (searchQuery) {
            const matchCode = (c.code || '').toLowerCase().includes(searchQuery);
            const matchName = (c.name || '').toLowerCase().includes(searchQuery);
            const matchTax = (c.tax_id || '').toLowerCase().includes(searchQuery);
            const matchPerson = (c.contact_person || '').toLowerCase().includes(searchQuery);
            const matchPhone = (c.phone || c.mobile_phone || c.office_phone || '').toLowerCase().includes(searchQuery);
            const matchEmail = (c.email || '').toLowerCase().includes(searchQuery);
            if (!matchCode && !matchName && !matchTax && !matchPerson && !matchPhone && !matchEmail) {
                return false;
            }
        }
        return true;
    });
}

function renderTable() {
    const tbody = document.getElementById('contactsTableBody');
    if (!tbody) return;

    const list = getFilteredContacts();

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 40px; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
                    <div style="font-size: 15px; font-weight: 500; color: #475569;">ไม่พบข้อมูล${ENTITY_LABEL}</div>
                    <div style="font-size: 13px; margin-top: 4px;">ลองเปลี่ยนเงื่อนไขค้นหา หรือกดปุ่ม <strong>"+ เพิ่ม${ENTITY_LABEL}ใหม่"</strong> ด้านบน</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const juristic = isJuristic(c);
        const typeBadge = juristic 
            ? `<span class="badge-status-neutral" style="font-size: 11px; padding: 2px 8px; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px;">นิติบุคคล</span>`
            : `<span class="badge-status-neutral" style="font-size: 11px; padding: 2px 8px; background: #fef3c7; color: #d97706; border: 1px solid #fde68a; border-radius: 4px;">บุคคลธรรมดา</span>`;

        let creditLabel = c.credit_terms;
        if (!creditLabel && c.credit_days !== undefined) {
            creditLabel = c.credit_days > 0 ? `เครดิต ${c.credit_days} วัน` : 'เงินสด';
        }
        if (!creditLabel) creditLabel = 'เครดิต 30 วัน';

        const creditBadge = hasCredit(c)
            ? `<span style="font-size: 12px; font-weight: 600; color: #059669; background: #ecfdf5; padding: 3px 8px; border-radius: 6px; border: 1px solid #a7f3d0;">${escapeHtml(creditLabel)}</span>`
            : `<span style="font-size: 12px; color: #64748b;">${escapeHtml(creditLabel)}</span>`;

        const displayPhone = c.mobile_phone || c.phone || c.office_phone || '';

        return `
            <tr>
                <td style="text-align: center; width: 44px;">
                    <input type="checkbox" class="row-checkbox" value="${c.id || ''}">
                </td>
                <td style="white-space: nowrap;">
                    <span style="font-family: monospace; font-size: 12.5px; font-weight: 700; color: #7D0A0A; background: #fef2f2; padding: 3px 8px; border-radius: 6px; border: 1px solid #fecaca;">
                        ${escapeHtml(c.code || '-')}
                    </span>
                </td>
                <td>
                    <div style="font-weight: 600; color: #0f172a; font-size: 13.5px; display: flex; align-items: center; gap: 8px;">
                        <span>${escapeHtml(c.name || '-')}</span>
                        ${typeBadge}
                    </div>
                    ${c.address ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(c.address)}">${escapeHtml(c.address)} ${escapeHtml(c.postal_code || '')}</div>` : ''}
                </td>
                <td style="white-space: nowrap;">
                    <div style="font-size: 12.5px; font-family: monospace; color: #334155;">
                        ${escapeHtml(c.tax_id || '-')}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(c.branch || 'สำนักงานใหญ่')}</div>
                </td>
                <td>
                    <div style="font-size: 13px; color: #1e293b; font-weight: 500;">
                        ${c.contact_person ? escapeHtml(c.contact_person) : '<span style="color:#cbd5e1;">-</span>'}
                    </div>
                    ${displayPhone ? `<div style="font-size: 11.5px; color: #475569; margin-top: 2px;">📞 ${escapeHtml(displayPhone)}</div>` : ''}
                </td>
                <td>
                    ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="font-size: 12.5px; color: #2563eb; text-decoration: none;">${escapeHtml(c.email)}</a>` : '<span style="color:#cbd5e1;">-</span>'}
                </td>
                <td style="white-space: nowrap;">
                    ${creditBadge}
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn-action-icon" title="แก้ไขข้อมูล" onclick="openEditModal(${c.id})" style="border: 1px solid #cbd5e1; background: #ffffff; padding: 5px 8px; border-radius: 6px; cursor: pointer; color: #0284c7; transition: all 0.15s;">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button type="button" class="btn-action-icon" title="ลบข้อมูล" onclick="deleteContactItem(${c.id}, '${escapeJs(c.name)}')" style="border: 1px solid #fecaca; background: #fff5f5; padding: 5px 8px; border-radius: 6px; cursor: pointer; color: #dc2626; transition: all 0.15s;">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// Interactive Form Handlers (FlowAccount Style)
// =========================================================================

function onEntityTypeChange() {
    const isJuristic = document.getElementById('entityJuristic')?.checked;
    const nameInput = document.getElementById('contactName');
    if (nameInput) {
        nameInput.placeholder = isJuristic 
            ? 'ตัวอย่างการกรอก: บริษัท โฟลว์แอคเคาท์ จำกัด'
            : 'ตัวอย่างการกรอก: นายสมชาย ใจดี หรือ ร้านสมชายการช่าง';
    }
}

function onBranchTypeChange() {
    const isSub = document.getElementById('branchSub')?.checked;
    const wrap = document.getElementById('branchDetailWrap');
    if (wrap) {
        wrap.style.display = isSub ? 'inline-flex' : 'none';
        if (isSub) {
            const detailInput = document.getElementById('branchDetail');
            if (detailInput) detailInput.focus();
        }
    }
}

function copyAddressToShipping() {
    const addr = document.getElementById('address')?.value || '';
    const zip = document.getElementById('postalCode')?.value || '';
    const full = addr + (zip ? ` ${zip}` : '');
    const shippingEl = document.getElementById('shippingAddress');
    if (shippingEl) {
        shippingEl.value = full.trim();
    }
}

// Modal Handlers
function openCreateModal() {
    const modal = document.getElementById('contactModal');
    const form = document.getElementById('contactForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('modalContactId').value = '';
    document.getElementById('modalTitle').textContent = `+ เพิ่มข้อมูล${ENTITY_LABEL}ใหม่`;

    // Defaults matching FlowAccount
    const elJuristic = document.getElementById('entityJuristic');
    if (elJuristic) elJuristic.checked = true;

    const elCust = document.getElementById('typeCustomer');
    const elVend = document.getElementById('typeVendor');
    if (PAGE_TYPE === 'VENDOR') {
        if (elCust) elCust.checked = false;
        if (elVend) elVend.checked = true;
    } else {
        if (elCust) elCust.checked = true;
        if (elVend) elVend.checked = false;
    }

    const elDays = document.getElementById('creditDays');
    if (elDays) elDays.value = '30';

    const elTH = document.getElementById('locationTH');
    if (elTH) elTH.checked = true;

    const elHead = document.getElementById('branchHead');
    if (elHead) elHead.checked = true;
    onBranchTypeChange();
    onEntityTypeChange();

    modal.style.display = 'flex';
}

function openEditModal(id) {
    const contact = allContacts.find(c => c.id == id);
    if (!contact) {
        alert('ไม่พบข้อมูลที่ต้องการแก้ไข');
        return;
    }

    const modal = document.getElementById('contactModal');
    if (!modal) return;

    document.getElementById('modalTitle').textContent = `แก้ไขข้อมูล: ${contact.name || contact.code || ''}`;
    document.getElementById('modalContactId').value = contact.id;
    document.getElementById('contactCode').value = contact.code || '';

    // Entity Type
    const ent = contact.entity_type || (isJuristic(contact) ? 'JURISTIC' : 'INDIVIDUAL');
    if (ent === 'INDIVIDUAL') {
        const rad = document.getElementById('entityIndividual');
        if (rad) rad.checked = true;
    } else {
        const rad = document.getElementById('entityJuristic');
        if (rad) rad.checked = true;
    }

    // Contact Type
    const ct = contact.contact_type || 'CUSTOMER';
    const elCust = document.getElementById('typeCustomer');
    const elVend = document.getElementById('typeVendor');
    if (elCust) elCust.checked = (ct === 'CUSTOMER' || ct === 'BOTH');
    if (elVend) elVend.checked = (ct === 'VENDOR' || ct === 'BOTH');

    // Credit Days
    const elDays = document.getElementById('creditDays');
    if (elDays) {
        elDays.value = contact.credit_days !== undefined && contact.credit_days !== null 
            ? contact.credit_days 
            : 30;
    }

    // Business Location
    const loc = contact.business_location || 'TH';
    if (loc === 'OVERSEAS') {
        const rad = document.getElementById('locationOverseas');
        if (rad) rad.checked = true;
    } else {
        const rad = document.getElementById('locationTH');
        if (rad) rad.checked = true;
    }

    // Name & Tax
    document.getElementById('contactName').value = contact.name || '';
    document.getElementById('taxId').value = contact.tax_id || '';

    // Branch
    const b = contact.branch || 'สำนักงานใหญ่';
    if (b && b !== 'สำนักงานใหญ่') {
        const rad = document.getElementById('branchSub');
        if (rad) rad.checked = true;
        const detail = document.getElementById('branchDetail');
        if (detail) detail.value = b;
    } else {
        const rad = document.getElementById('branchHead');
        if (rad) rad.checked = true;
        const detail = document.getElementById('branchDetail');
        if (detail) detail.value = '';
    }
    onBranchTypeChange();
    onEntityTypeChange();

    // Address & Logistics
    document.getElementById('address').value = contact.address || '';
    document.getElementById('postalCode').value = contact.postal_code || '';
    document.getElementById('shippingAddress').value = contact.shipping_address || '';

    // Office Phone, Fax, Website
    document.getElementById('officePhone').value = contact.office_phone || '';
    document.getElementById('fax').value = contact.fax || '';
    document.getElementById('website').value = contact.website || '';

    // Contact Person (Image 2)
    document.getElementById('contactPerson').value = contact.contact_person || '';
    document.getElementById('email').value = contact.email || '';
    document.getElementById('mobilePhone').value = contact.mobile_phone || contact.phone || '';

    modal.style.display = 'flex';
}

function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) modal.style.display = 'none';
}

async function submitContactForm() {
    const name = document.getElementById('contactName')?.value.trim();
    if (!name) {
        if (typeof window.showToast === 'function') {
            window.showToast({ type: 'warning', title: 'กรุณาระบุชื่อ', message: 'กรุณากรอกชื่อธุรกิจ / ชื่อลูกค้า' });
        } else {
            alert('กรุณากรอกชื่อธุรกิจ / ชื่อลูกค้า');
        }
        document.getElementById('contactName')?.focus();
        return;
    }

    const isCustomer = document.getElementById('typeCustomer')?.checked;
    const isVendor = document.getElementById('typeVendor')?.checked;
    if (!isCustomer && !isVendor) {
        if (typeof window.showToast === 'function') {
            window.showToast({ type: 'warning', title: 'กรุณาเลือกประเภท', message: 'กรุณาเลือกประเภท อย่างน้อย 1 อย่าง (ลูกค้า หรือ ผู้จำหน่าย)' });
        } else {
            alert('กรุณาเลือกประเภท อย่างน้อย 1 อย่าง (ลูกค้า หรือ ผู้จำหน่าย)');
        }
        return;
    }

    let contactType = 'CUSTOMER';
    if (isCustomer && isVendor) contactType = 'BOTH';
    else if (isVendor) contactType = 'VENDOR';

    const entityType = document.getElementById('entityIndividual')?.checked ? 'INDIVIDUAL' : 'JURISTIC';
    const businessLocation = document.getElementById('locationOverseas')?.checked ? 'OVERSEAS' : 'TH';

    let branch = 'สำนักงานใหญ่';
    if (document.getElementById('branchSub')?.checked) {
        const subVal = document.getElementById('branchDetail')?.value.trim();
        branch = subVal ? (subVal.startsWith('สาขา') ? subVal : `สาขา ${subVal}`) : 'สาขา';
    }

    const creditDays = parseInt(document.getElementById('creditDays')?.value) || 0;
    const creditTerms = creditDays > 0 ? `เครดิต ${creditDays} วัน` : 'เงินสด';

    const payload = {
        code: document.getElementById('contactCode')?.value.trim(),
        name: name,
        contact_type: contactType,
        entity_type: entityType,
        credit_days: creditDays,
        credit_terms: creditTerms,
        business_location: businessLocation,
        tax_id: document.getElementById('taxId')?.value.trim() || '',
        branch: branch,
        address: document.getElementById('address')?.value.trim() || '',
        postal_code: document.getElementById('postalCode')?.value.trim() || '',
        shipping_address: document.getElementById('shippingAddress')?.value.trim() || '',
        office_phone: document.getElementById('officePhone')?.value.trim() || '',
        fax: document.getElementById('fax')?.value.trim() || '',
        website: document.getElementById('website')?.value.trim() || '',
        contact_person: document.getElementById('contactPerson')?.value.trim() || '',
        email: document.getElementById('email')?.value.trim() || '',
        mobile_phone: document.getElementById('mobilePhone')?.value.trim() || '',
        phone: document.getElementById('mobilePhone')?.value.trim() || document.getElementById('officePhone')?.value.trim() || ''
    };

    const id = document.getElementById('modalContactId')?.value;
    const saveBtn = document.querySelector('#contactModal .btn-primary');
    const origText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'กำลังบันทึก...';
    }

    try {
        const url = id ? `${API_URL}/${id}` : API_URL;
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'บันทึกข้อมูลไม่สำเร็จ');
        }

        closeContactModal();
        await loadContacts();

        if (typeof window.showToast === 'function') {
            const contactLabel = contactType === 'VENDOR' ? 'ผู้จำหน่าย' : (contactType === 'CUSTOMER' ? 'ลูกค้า' : 'ผู้ติดต่อ');
            window.showToast({
                type: 'success',
                title: id ? 'แก้ไขข้อมูลสำเร็จ!' : 'บันทึกข้อมูลสำเร็จ!',
                message: `บันทึกข้อมูล${contactLabel} "${name}" เรียบร้อยแล้ว`,
                duration: 3200
            });
        }
    } catch (err) {
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'error',
                title: 'บันทึกไม่สำเร็จ',
                message: err.message,
                duration: 4000
            });
        } else {
            alert(`เกิดข้อผิดพลาด: ${err.message}`);
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = origText;
        }
    }
}

async function deleteContactItem(id, name) {
    if (!confirm(`ยืนยันการลบ ${ENTITY_LABEL} "${name}" หรือไม่?\n\nข้อมูลนี้จะถูกลบออกจากระบบอย่างถาวร`)) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'ลบข้อมูลไม่สำเร็จ');
        }
        await loadContacts();
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'success',
                title: 'ลบข้อมูลสำเร็จ',
                message: `ลบข้อมูล "${name}" ออกจากระบบเรียบร้อยแล้ว`,
                duration: 3000
            });
        }
    } catch (err) {
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'error',
                title: 'ไม่สามารถลบข้อมูลได้',
                message: err.message,
                duration: 4000
            });
        } else {
            alert(`เกิดข้อผิดพลาดในการลบ: ${err.message}`);
        }
    }
}

function exportToCSV() {
    const list = getFilteredContacts();
    if (list.length === 0) {
        alert('ไม่มีข้อมูลสำหรับส่งออก Excel');
        return;
    }

    const headers = ['รหัส', 'ชื่อธุรกิจ/บริษัท', 'ประเภทผู้ติดต่อ', 'ประเภท', 'เลขประจำตัวผู้เสียภาษี', 'สำนักงาน/สาขา', 'ที่อยู่', 'รหัสไปรษณีย์', 'ข้อมูลจัดส่ง', 'เบอร์สำนักงาน', 'เบอร์โทรสาร', 'เว็บไซต์', 'ชื่อผู้ติดต่อ', 'อีเมล', 'เบอร์มือถือ', 'เครดิต (วัน)'];
    const rows = list.map(c => [
        `"${(c.code || '').replace(/"/g, '""')}"`,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${isJuristic(c) ? 'นิติบุคคล' : 'บุคคลธรรมดา'}"`,
        `"${c.contact_type || ''}"`,
        `"${(c.tax_id || '').replace(/"/g, '""')}"`,
        `"${(c.branch || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.postal_code || '').replace(/"/g, '""')}"`,
        `"${(c.shipping_address || '').replace(/"/g, '""')}"`,
        `"${(c.office_phone || '').replace(/"/g, '""')}"`,
        `"${(c.fax || '').replace(/"/g, '""')}"`,
        `"${(c.website || '').replace(/"/g, '""')}"`,
        `"${(c.contact_person || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.mobile_phone || c.phone || '').replace(/"/g, '""')}"`,
        `"${c.credit_days !== undefined ? c.credit_days : ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MAM_${PAGE_TYPE}_Contacts_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Utility
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
