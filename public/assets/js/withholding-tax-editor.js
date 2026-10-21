/**
 * FlowAccount Advance - Withholding Tax (50 ทวิ) Certificate Editor & Generator
 * Enhanced with FlowAccount Advance UI/UX standards:
 * - Dynamic Multi-row Income items
 * - Quick Add Vendor Modal
 * - Company Stamp & Signature Toggles
 * - Multi-copy Print support (ฉบับที่ 1 & ฉบับที่ 2)
 */

const whtState = {
    mode: 'new',           // 'new' | 'view' | 'edit'
    cert: null,            // ข้อมูลเอกสารเดิม (กรณี view/edit)
    vendors: [],           // รายชื่อคู่ค้า
    formTypeTouched: false,// ผู้ใช้เลือกแบบภาษีเองแล้ว
    items: [],             // รายการเงินได้ (Multi-row)
    nextItemId: 1
};

const INCOME_OPTIONS = [
    { value: 'ค่าบริการและจ้างทำของ', rate: 3, label: 'ค่าบริการ / ค่าจ้างทำของ (3%)' },
    { value: 'ค่าวิชาชีพอิสระ', rate: 3, label: 'ค่าวิชาชีพอิสระ (3%)' },
    { value: 'ค่าเช่าทรัพย์สิน อาคารและสำนักงาน', rate: 5, label: 'ค่าเช่าทรัพย์สิน / อาคาร (5%)' },
    { value: 'ค่าโฆษณา', rate: 2, label: 'ค่าโฆษณา (2%)' },
    { value: 'ค่าขนส่ง', rate: 1, label: 'ค่าขนส่ง (1%)' },
    { value: 'รางวัล ส่วนลดหรือประโยชน์ใดๆ จากการส่งเสริมการขาย', rate: 3, label: 'ส่งเสริมการขาย (3%)' },
    { value: 'ค่าเบี้ยประกันวินาศภัย', rate: 1, label: 'ค่าเบี้ยประกันวินาศภัย (1%)' },
    { value: 'เงินปันผล ส่วนแบ่งกำไร', rate: 10, label: 'เงินปันผล / กำไร (10%)' }
];

document.addEventListener('DOMContentLoaded', () => {
    initWhtEditor();
    setupEventListeners();
    setupQuickVendorModal();
    loadInitialData();
    loadVendors();
});

function initWhtEditor() {
    const today = toLocalIsoDate(new Date());
    const docDate = document.getElementById('docDate');
    if (docDate && !docDate.value) docDate.value = today;

    // เริ่มต้นแถวเงินได้ 1 รายการ
    if (whtState.items.length === 0) {
        addIncomeItem({
            income_type: 'ค่าบริการและจ้างทำของ',
            payment_date: today,
            income_amount: '',
            tax_rate: 3
        });
    }
}

function setupEventListeners() {
    // Payee Tax ID digit sync
    const payeeTaxInput = document.getElementById('payeeTaxId');
    if (payeeTaxInput) {
        payeeTaxInput.addEventListener('input', () => {
            const digits = payeeTaxInput.value.replace(/[^0-9]/g, '').slice(0, 13);
            if (payeeTaxInput.value !== digits) payeeTaxInput.value = digits;
            renderTaxBoxes(digits, 'payeeTaxBoxes');
            updateTaxIdHint(digits);
            if (digits.length === 13) suggestFormType(digits.charAt(0) === '0' ? 'JURISTIC' : 'INDIVIDUAL');
        });
    }

    // Setup Searchable Payee Dropdown (Quotation Style)
    setupPayeeDropdown();

    // Radio form_type touched
    document.querySelectorAll('input[name="form_type"]').forEach(radio => {
        radio.addEventListener('change', () => { whtState.formTypeTouched = true; });
    });

    // เปลี่ยนวันที่ออกเอกสาร → ซิงค์วันจ่ายของรายการ และตัวอย่างเลขที่เอกสาร
    document.getElementById('docDate')?.addEventListener('change', () => {
        const val = document.getElementById('docDate').value;
        if (whtState.mode === 'new') {
            previewDocNumber();
            whtState.items.forEach(it => { if (!it.payment_date) it.payment_date = val; });
            renderIncomeItems();
        }
    });

    // ปุ่มเพิ่มรายการเงินได้
    document.getElementById('btnAddIncomeRow')?.addEventListener('click', () => {
        const docDate = document.getElementById('docDate')?.value || toLocalIsoDate(new Date());
        addIncomeItem({
            income_type: 'ค่าบริการและจ้างทำของ',
            payment_date: docDate,
            income_amount: '',
            tax_rate: 3
        });
    });

    // สวิตช์แสดงตราประทับและลายมือชื่อ
    document.getElementById('toggleCompanyStamp')?.addEventListener('change', (e) => {
        const seal = document.getElementById('companySealContainer');
        if (seal) seal.style.display = e.target.checked ? 'inline-flex' : 'none';
    });

    document.getElementById('toggleSignature')?.addEventListener('change', (e) => {
        const sig = document.getElementById('signatureImgPreview');
        if (sig) sig.style.display = e.target.checked ? 'block' : 'none';
    });

    // ตัวเลือกฉบับพิมพ์ (ฉบับที่ 1, ฉบับที่ 2)
    document.getElementById('printCopySelect')?.addEventListener('change', updatePrintCopyHeader);

    // Save buttons (Quotation Style: Save Draft vs Save Approve)
    document.getElementById('btnSaveDraft')?.addEventListener('click', () => handleWhtSubmit('DRAFT'));
    document.getElementById('btnSaveWht')?.addEventListener('click', () => handleWhtSubmit('COMPLETED'));

    // Form submission
    document.getElementById('whtForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleWhtSubmit('COMPLETED');
    });

    // Print button
    document.getElementById('btnPrintWht')?.addEventListener('click', handlePrint);

    // Edit button
    document.getElementById('btnEditWht')?.addEventListener('click', () => {
        if (!whtState.cert || whtState.cert.status === 'CANCELLED') return;
        whtState.mode = 'edit';
        history.replaceState(null, '', `?id=${whtState.cert.id}&edit=1`);
        applyMode();
    });
}

// ------------------------------------------------------------------
// Multi-row Income Items Manager
// ------------------------------------------------------------------

function addIncomeItem(data = {}) {
    const item = {
        id: whtState.nextItemId++,
        row_no: data.row_no || 5,
        income_type: data.income_type || 'ค่าบริการและจ้างทำของ',
        payment_date: data.payment_date || document.getElementById('docDate')?.value || toLocalIsoDate(new Date()),
        income_amount: data.income_amount !== undefined ? data.income_amount : '',
        tax_rate: data.tax_rate !== undefined ? Number(data.tax_rate) : 3,
        tax_amount: 0
    };
    whtState.items.push(item);
    renderIncomeItems();
    calculateWht();
}

function removeIncomeItem(id) {
    if (whtState.items.length <= 1) {
        // ให้เหลืออย่างน้อย 1 แถวเสมอ ล้างแค่ค่า
        whtState.items[0].income_amount = '';
        renderIncomeItems();
        calculateWht();
        return;
    }
    whtState.items = whtState.items.filter(it => it.id !== id);
    renderIncomeItems();
    calculateWht();
}

function renderIncomeItems() {
    const tbody = document.getElementById('whtTableBody');
    if (!tbody) return;

    // ลบแถวเก่าที่เป็น dynamic items ออก (保留แถวหัวข้อ 1-5 ไว้)
    tbody.querySelectorAll('.wht-dynamic-item-row').forEach(el => el.remove());

    const isViewMode = whtState.mode === 'view';

    whtState.items.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'wht-dynamic-item-row';
        tr.style.backgroundColor = '#fffef5';

        // สร้าง options สำหรับ select ประเภทเงินได้
        let optionsHtml = '';
        let found = false;
        INCOME_OPTIONS.forEach(opt => {
            const sel = opt.value === item.income_type ? 'selected' : '';
            if (sel) found = true;
            optionsHtml += `<option value="${escapeHtml(opt.value)}" data-rate="${opt.rate}" ${sel}>${escapeHtml(opt.label)}</option>`;
        });
        if (!found && item.income_type) {
            optionsHtml += `<option value="${escapeHtml(item.income_type)}" selected>${escapeHtml(item.income_type)}</option>`;
        }

        const deleteBtnHtml = (!isViewMode && whtState.items.length > 1) ? `
            <button type="button" class="wht-item-row-action no-print" onclick="removeIncomeItem(${item.id})" title="ลบรายการนี้">
                <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        ` : '';

        tr.innerHTML = `
            <td style="padding-left: 20px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11.5px; color: #64748b; font-weight: 600;">5.${index + 1}</span>
                    <select class="wht-input-inline item-type-select" data-id="${item.id}" style="border: 1px solid #cbd5e1; background: #fff; padding: 3px 8px; border-radius: 4px; font-size: 12px; flex: 1;">
                        ${optionsHtml}
                    </select>
                    ${deleteBtnHtml}
                </div>
            </td>
            <td class="text-center">
                <input type="date" class="wht-input-inline item-date-input" data-id="${item.id}" value="${item.payment_date || ''}" style="text-align: center; width: 125px; font-size: 12px;">
            </td>
            <td class="text-right">
                <input type="number" step="0.01" min="0" class="wht-input-inline item-amount-input" data-id="${item.id}" value="${item.income_amount !== '' ? item.income_amount : ''}" placeholder="0.00" required style="text-align: right; width: 110px; font-weight: 700; font-size: 13px;">
            </td>
            <td class="text-right">
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                    <select class="wht-input-inline item-rate-select" data-id="${item.id}" style="width: 58px; font-size: 11px; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px;">
                        <option value="1" ${item.tax_rate === 1 ? 'selected' : ''}>1%</option>
                        <option value="2" ${item.tax_rate === 2 ? 'selected' : ''}>2%</option>
                        <option value="3" ${item.tax_rate === 3 ? 'selected' : ''}>3%</option>
                        <option value="5" ${item.tax_rate === 5 ? 'selected' : ''}>5%</option>
                        <option value="10" ${item.tax_rate === 10 ? 'selected' : ''}>10%</option>
                        <option value="15" ${item.tax_rate === 15 ? 'selected' : ''}>15%</option>
                    </select>
                    <span class="item-tax-display" data-id="${item.id}" style="display: inline-block; width: 85px; text-align: right; font-weight: 700; color: #059669; font-size: 13px;">
                        ${formatNumber(item.tax_amount || 0)}
                    </span>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // ผูก event listeners ให้ input ของทุกแถว
    tbody.querySelectorAll('.item-type-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id, 10);
            const item = whtState.items.find(it => it.id === id);
            Array.from(e.target.options).forEach(opt => {
                if (opt.value === e.target.value) {
                    opt.setAttribute('selected', 'selected');
                } else {
                    opt.removeAttribute('selected');
                }
            });
            if (item) {
                item.income_type = e.target.value;
                const autoRate = e.target.selectedOptions[0]?.dataset.rate;
                if (autoRate) {
                    item.tax_rate = Number(autoRate);
                    const rateSel = tbody.querySelector(`.item-rate-select[data-id="${id}"]`);
                    if (rateSel) {
                        rateSel.value = autoRate;
                        Array.from(rateSel.options).forEach(opt => {
                            if (opt.value === autoRate) {
                                opt.setAttribute('selected', 'selected');
                            } else {
                                opt.removeAttribute('selected');
                            }
                        });
                    }
                }
                calculateWht();
            }
        });
    });

    tbody.querySelectorAll('.item-date-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id, 10);
            const item = whtState.items.find(it => it.id === id);
            if (item) item.payment_date = e.target.value;
        });
    });

    tbody.querySelectorAll('.item-amount-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id, 10);
            const item = whtState.items.find(it => it.id === id);
            if (item) {
                item.income_amount = e.target.value;
                calculateWht();
            }
        });
    });

    tbody.querySelectorAll('.item-rate-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id, 10);
            Array.from(e.target.options).forEach(opt => {
                if (opt.value === e.target.value) {
                    opt.setAttribute('selected', 'selected');
                } else {
                    opt.removeAttribute('selected');
                }
            });
            const item = whtState.items.find(it => it.id === id);
            if (item) {
                item.tax_rate = Number(e.target.value);
                calculateWht();
            }
        });
    });
}

function calculateWht() {
    let grandIncome = 0;
    let grandTax = 0;

    whtState.items.forEach(item => {
        const amt = parseFloat(item.income_amount) || 0;
        const rate = parseFloat(item.tax_rate) || 0;
        const taxAmt = Math.round(amt * rate) / 100;
        item.tax_amount = taxAmt;

        grandIncome += amt;
        grandTax += taxAmt;

        // อัปเดตข้อความในแถว
        const display = document.querySelector(`.item-tax-display[data-id="${item.id}"]`);
        if (display) display.textContent = formatNumber(taxAmt);
    });

    const elTotalIncome = document.getElementById('totalIncomeDisplay');
    const elTotalTax = document.getElementById('totalTaxDisplay');
    const elThaiText = document.getElementById('thaiBahtTextDisplay');

    if (elTotalIncome) elTotalIncome.textContent = formatNumber(grandIncome);
    if (elTotalTax) elTotalTax.textContent = formatNumber(grandTax);
    if (elThaiText) elThaiText.textContent = thaiBahtText(grandTax);

    return { totalIncome: grandIncome, totalTax: grandTax };
}

window.removeIncomeItem = removeIncomeItem;

// ------------------------------------------------------------------
// Data loading & initialization
// ------------------------------------------------------------------

async function loadInitialData() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const wantEdit = params.get('edit') === '1';
    const autoPrint = params.get('autoPrint') === 'true';

    if (!id) {
        whtState.mode = 'new';
        applyMode();
        await Promise.all([loadPayerFromCompany(), previewDocNumber()]);
        return;
    }

    try {
        const res = await fetch(`/api/withholding-taxes/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error((await safeJson(res)).error || 'ไม่พบหนังสือรับรองนี้');
        const cert = await res.json();
        whtState.cert = cert;
        whtState.formTypeTouched = true;
        fillFormFromData(cert);

        if (cert.status === 'CANCELLED') {
            whtState.mode = 'view';
        } else if (cert.status === 'DRAFT') {
            // แบบร่างเปิดมาพร้อมแก้ไขต่อได้ทันที
            whtState.mode = 'edit';
        } else {
            whtState.mode = (wantEdit ? 'edit' : 'view');
        }
        applyMode();

        if (autoPrint) setTimeout(handlePrint, 500);
    } catch (err) {
        notify('error', 'โหลดข้อมูลไม่สำเร็จ', err.message);
        setTimeout(() => { window.location.href = 'withholding-tax.html'; }, 2000);
    }
}

async function loadPayerFromCompany() {
    try {
        const res = await fetch('/api/company');
        if (!res.ok) throw new Error('โหลดข้อมูลบริษัทไม่สำเร็จ');
        const c = await res.json();
        setPayer(c.branch ? `${c.name} (${c.branch})` : c.name, c.address, c.tax_id);
    } catch (err) {
        notify('error', 'โหลดข้อมูลบริษัทไม่สำเร็จ', err.message);
    }
}

async function previewDocNumber() {
    const docNoInput = document.getElementById('docNumber');
    if (!docNoInput) return;
    try {
        const date = document.getElementById('docDate')?.value || '';
        const res = await fetch(`/api/withholding-taxes/next-number?date=${encodeURIComponent(date)}`);
        if (!res.ok) return;
        const { doc_number } = await res.json();
        docNoInput.placeholder = `${doc_number} (อัตโนมัติ)`;
    } catch (e) {
        /* placeholder default */
    }
}

async function loadVendors() {
    try {
        const res = await fetch('/api/vendors');
        if (!res.ok) return;
        whtState.vendors = await res.json();
    } catch (e) {
        console.warn('Unable to load vendors:', e);
    }
}

// ------------------------------------------------------------------
// Quotation-style Searchable Payee Dropdown
// ------------------------------------------------------------------

function setupPayeeDropdown() {
    const searchInput = document.getElementById('payeeName');
    const btnDropdown = document.getElementById('btnPayeeDropdown');
    const menu = document.getElementById('payeeDropdownMenu');
    if (!searchInput || !btnDropdown || !menu) return;

    function renderVendorList(query = '') {
        const q = String(query || '').trim().toLowerCase();
        let filtered = whtState.vendors || [];

        if (q) {
            filtered = filtered.filter(v => {
                if (!v) return false;
                return (v.name && v.name.toLowerCase().includes(q)) ||
                       (v.tax_id && String(v.tax_id).includes(q)) ||
                       (v.branch && v.branch.toLowerCase().includes(q)) ||
                       (v.phone && v.phone.includes(q)) ||
                       (v.contact_person && v.contact_person.toLowerCase().includes(q));
            });
        }

        const footerHtml = `
            <div class="customer-dropdown-footer">
                <button type="button" class="btn-customer-dropdown-action" id="btnDropdownAddVendor">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>+ เพิ่มรายชื่อคู่ค้า / ผู้ถูกหักภาษีใหม่</span>
                </button>
            </div>
        `;

        if (filtered.length === 0) {
            menu.innerHTML = `
                <div class="customer-dropdown-empty">
                    <div>ไม่พบรายชื่อคู่ค้าที่ตรงกับ ${query ? `"${escapeHtml(query)}"` : 'คำค้นหา'}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">(สามารถใช้ชื่อที่พิมพ์นี้ เพื่อออกเอกสารได้ทันที)</div>
                </div>
                ${footerHtml}
            `;
        } else {
            const itemsHtml = filtered.map(v => {
                const isSelected = searchInput.value.trim().toLowerCase() === String(v.name || '').toLowerCase();
                const isJuristic = String(v.entity_type || 'JURISTIC').toUpperCase() === 'JURISTIC';
                return `
                    <div class="customer-dropdown-item ${isSelected ? 'active' : ''}" data-id="${v.id}">
                        <div class="customer-item-main">
                            <div class="customer-item-title">${escapeHtml(v.name)}</div>
                            <div class="customer-item-meta">
                                ${v.tax_id ? `<span class="customer-item-taxid">[เลขประจำตัว: ${escapeHtml(v.tax_id)}]</span>` : ''}
                                ${v.branch ? `<span class="customer-item-branch">• ${escapeHtml(v.branch)}</span>` : ''}
                                ${v.phone ? `<span class="customer-item-contact">• โทร: ${escapeHtml(v.phone)}</span>` : ''}
                                ${v.contact_person ? `<span class="customer-item-contact">• ติดต่อ: ${escapeHtml(v.contact_person)}</span>` : ''}
                            </div>
                        </div>
                        <div class="customer-item-side">
                            <span class="customer-item-terms" style="background: ${isJuristic ? '#e0f2fe' : '#fce7f3'}; color: ${isJuristic ? '#0369a1' : '#be185d'}; border-color: ${isJuristic ? '#bae6fd' : '#fbcfe8'};">
                                ${isJuristic ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

            menu.innerHTML = itemsHtml + footerHtml;
        }

        // Bind clicks on items
        menu.querySelectorAll('.customer-dropdown-item').forEach(itemEl => {
            const id = parseInt(itemEl.getAttribute('data-id'), 10);
            itemEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const vendor = whtState.vendors.find(v => v.id === id);
                if (vendor) selectVendor(vendor);
            });
        });

        // Bind click on footer action
        const addBtn = menu.querySelector('#btnDropdownAddVendor');
        if (addBtn) {
            addBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                closeMenu();
                openQuickVendorModal(searchInput.value.trim());
            });
        }
    }

    function openMenu(query = '') {
        if (whtState.mode === 'view') return;
        renderVendorList(query);
        menu.style.display = 'flex';
        btnDropdown.classList.add('active');
    }

    function closeMenu() {
        menu.style.display = 'none';
        btnDropdown.classList.remove('active');
    }

    function toggleMenu() {
        if (menu.style.display === 'flex') {
            closeMenu();
        } else {
            openMenu(searchInput.value);
        }
    }

    btnDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    searchInput.addEventListener('focus', () => {
        openMenu(searchInput.value);
    });

    searchInput.addEventListener('input', () => {
        openMenu(searchInput.value);
        applyVendorByName(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.customer-dropdown-wrap')) {
            closeMenu();
        }
    });
}

function selectVendor(vendor) {
    if (!vendor) return;
    const payeeNameInput = document.getElementById('payeeName');
    const payeeTaxInput = document.getElementById('payeeTaxId');
    const payeeAddrInput = document.getElementById('payeeAddress');

    if (payeeNameInput) payeeNameInput.value = vendor.name;
    if (payeeTaxInput && vendor.tax_id) {
        const digits = String(vendor.tax_id).replace(/[^0-9]/g, '').slice(0, 13);
        payeeTaxInput.value = digits;
        renderTaxBoxes(digits, 'payeeTaxBoxes');
        updateTaxIdHint(digits);
    }
    if (payeeAddrInput && vendor.address) {
        const postal = vendor.postal_code && !String(vendor.address).includes(vendor.postal_code) ? ` ${vendor.postal_code}` : '';
        payeeAddrInput.value = `${vendor.address}${postal}`;
    }
    suggestFormType(vendor.entity_type);

    const menu = document.getElementById('payeeDropdownMenu');
    const btnDropdown = document.getElementById('btnPayeeDropdown');
    if (menu) menu.style.display = 'none';
    if (btnDropdown) btnDropdown.classList.remove('active');
}

function applyVendorByName(name) {
    if (whtState.mode === 'view') return;
    const target = String(name || '').trim().toLowerCase();
    if (!target) return;
    const vendor = (whtState.vendors || []).find(v => String(v.name || '').trim().toLowerCase() === target);
    if (!vendor) return;
    selectVendor(vendor);
}

// ------------------------------------------------------------------
// Quick Add Vendor Modal
// ------------------------------------------------------------------

function openQuickVendorModal(prefillName = '') {
    const modal = document.getElementById('quickVendorModal');
    if (!modal) return;
    document.getElementById('quickVendorName').value = prefillName || document.getElementById('payeeName')?.value || '';
    document.getElementById('quickVendorTaxId').value = document.getElementById('payeeTaxId')?.value || '';
    document.getElementById('quickVendorAddress').value = document.getElementById('payeeAddress')?.value || '';
    modal.style.display = 'flex';
    document.getElementById('quickVendorName')?.focus();
}

function setupQuickVendorModal() {
    const modal = document.getElementById('quickVendorModal');
    const btnOpen = document.getElementById('btnQuickAddVendor');
    const btnClose = document.getElementById('btnCloseQuickVendor');
    const btnCancel = document.getElementById('btnCancelQuickVendor');
    const btnSave = document.getElementById('btnSaveQuickVendor');

    if (!modal) return;

    const closeModal = () => {
        modal.style.display = 'none';
    };

    btnOpen?.addEventListener('click', () => openQuickVendorModal());
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    btnSave?.addEventListener('click', async () => {
        const name = document.getElementById('quickVendorName')?.value.trim();
        const taxId = (document.getElementById('quickVendorTaxId')?.value || '').replace(/[^0-9]/g, '');
        const address = document.getElementById('quickVendorAddress')?.value.trim();
        const entity = document.querySelector('input[name="quickVendorEntity"]:checked')?.value || 'JURISTIC';

        if (!name) {
            alert('กรุณากรอกชื่อคู่ค้า / ผู้ถูกหักภาษี');
            return;
        }
        if (taxId.length !== 13) {
            alert('กรุณากรอกเลขประจำตัวผู้เสียภาษีให้ครบ 13 หลัก');
            return;
        }

        btnSave.disabled = true;
        btnSave.textContent = 'กำลังบันทึก...';

        try {
            const res = await fetch('/api/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    tax_id: taxId,
                    entity_type: entity,
                    address
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'บันทึกคู่ค้าไม่สำเร็จ');
            }

            const newVendor = await res.json();
            await loadVendors();

            selectVendor(newVendor);
            closeModal();
            notify('success', 'บันทึกสำเร็จ', `เพิ่มคู่ค้า "${newVendor.name}" เรียบร้อยแล้ว`);
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = 'บันทึกและเลือกใช้งาน';
        }
    });
}

// ------------------------------------------------------------------
// Mode & UI helpers (Quotation Style)
// ------------------------------------------------------------------

function applyMode() {
    const { mode, cert } = whtState;
    const isCancelled = cert && cert.status === 'CANCELLED';
    const isDraft = cert && cert.status === 'DRAFT';

    const fieldset = document.getElementById('whtFieldset');
    const btnSaveDraft = document.getElementById('btnSaveDraft');
    const btnSave = document.getElementById('btnSaveWht');
    const btnEdit = document.getElementById('btnEditWht');
    const btnAddRow = document.getElementById('btnAddIncomeRow');
    const btnPayeeDropdown = document.getElementById('btnPayeeDropdown');
    const badge = document.getElementById('editorModeBadge');
    const docNoInput = document.getElementById('docNumber');
    const banner = document.getElementById('whtCancelBanner');
    const paper = document.getElementById('whtPaper');

    const isViewOnly = (mode === 'view');

    if (fieldset) fieldset.disabled = isViewOnly;
    if (btnAddRow) btnAddRow.style.display = isViewOnly ? 'none' : 'inline-flex';
    if (btnPayeeDropdown) btnPayeeDropdown.style.pointerEvents = isViewOnly ? 'none' : 'auto';

    if (btnSaveDraft) btnSaveDraft.style.display = isViewOnly ? 'none' : 'inline-flex';
    if (btnSave) {
        btnSave.style.display = isViewOnly ? 'none' : 'inline-flex';
        btnSave.textContent = (mode === 'edit' && !isDraft) ? 'บันทึกการแก้ไข' : 'บันทึกเอกสาร';
    }
    if (btnEdit) {
        btnEdit.style.display = (isViewOnly && cert && !isCancelled) ? 'inline-flex' : 'none';
    }

    if (docNoInput) docNoInput.readOnly = (mode !== 'new' && !isDraft);

    if (badge) {
        let label = 'สร้างใหม่';
        badge.className = 'badge-status-editing';
        badge.removeAttribute('style');
        if (isCancelled) {
            label = 'ยกเลิกแล้ว';
            badge.classList.add('badge-status-cancelled');
        } else if (isDraft) {
            label = 'แบบร่าง';
            badge.style.background = '#f1f5f9';
            badge.style.color = '#475569';
            badge.style.borderColor = '#cbd5e1';
        } else if (mode === 'edit') {
            label = 'กำลังแก้ไข';
            badge.style.background = '#fef3c7';
            badge.style.color = '#92400e';
            badge.style.borderColor = '#fcd34d';
        } else if (mode === 'view') {
            label = 'สมบูรณ์';
            badge.style.background = '#ecfdf5';
            badge.style.color = '#065f46';
            badge.style.borderColor = '#a7f3d0';
        }
        badge.textContent = label;
    }

    if (banner) {
        banner.style.display = isCancelled ? '' : 'none';
        const reasonEl = document.getElementById('whtCancelReason');
        if (reasonEl && isCancelled) reasonEl.textContent = cert.cancel_reason ? `เหตุผล: ${cert.cancel_reason}` : '';
    }
    if (paper) paper.classList.toggle('is-cancelled', !!isCancelled);

    const titles = {
        new: 'สร้างหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)',
        edit: `แก้ไข ${cert ? cert.doc_number : ''}`,
        view: `${cert ? cert.doc_number : ''} - หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)`
    };
    document.title = `${titles[mode] || titles.new} | MAM DESIGN AND SERVICE`;

    renderIncomeItems();
}

function setPayer(name, address, taxId) {
    const nameEl = document.getElementById('payerName');
    const addrEl = document.getElementById('payerAddress');
    if (nameEl) nameEl.value = name || '';
    if (addrEl) addrEl.value = address || '';
    renderTaxBoxes(taxId || '', 'payerTaxBoxes');
}

function suggestFormType(entityType) {
    const isJuristic = String(entityType || '').toUpperCase() === 'JURISTIC';
    const badge = document.getElementById('payeeEntityBadge');
    if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = isJuristic ? 'นิติบุคคล' : 'บุคคลธรรมดา';
        badge.style.backgroundColor = isJuristic ? '#e0f2fe' : '#fce7f3';
        badge.style.color = isJuristic ? '#0369a1' : '#be185d';
    }

    if (whtState.formTypeTouched || whtState.mode !== 'new') return;
    const value = isJuristic ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3';
    const radio = document.querySelector(`input[name="form_type"][value="${value}"]`);
    if (radio) radio.checked = true;
}

function updateTaxIdHint(digits) {
    const hint = document.getElementById('payeeTaxIdHint');
    if (!hint) return;
    hint.classList.remove('is-valid', 'is-invalid');
    if (!digits) {
        hint.textContent = '(พิมพ์ตัวเลข ระบบจะกระจายลงกล่อง 13 ช่องอัตโนมัติ)';
    } else if (digits.length < 13) {
        hint.textContent = `กรอกแล้ว ${digits.length}/13 หลัก`;
    } else if (isValidThaiTaxId(digits)) {
        hint.textContent = '✓ เลขประจำตัวถูกต้อง';
        hint.classList.add('is-valid');
    } else {
        hint.textContent = '⚠ เลขหลักสุดท้ายไม่ตรง โปรดตรวจสอบอีกครั้ง';
        hint.classList.add('is-invalid');
    }
}

function renderTaxBoxes(val, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cleaned = (val || '').replace(/[^0-9]/g, '');
    const boxes = container.querySelectorAll('.tax-digit-box');
    boxes.forEach((box, idx) => {
        box.textContent = cleaned[idx] || '';
    });
}

function isValidThaiTaxId(id) {
    if (!/^\d{13}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(id.charAt(i), 10) * (13 - i);
    return (11 - (sum % 11)) % 10 === parseInt(id.charAt(12), 10);
}

// ------------------------------------------------------------------
// Save Submission (Draft / Approve)
// ------------------------------------------------------------------

async function handleWhtSubmit(targetStatus = 'COMPLETED') {
    if (whtState.mode === 'view') return;

    const isDraft = (targetStatus === 'DRAFT');
    const { totalIncome, totalTax } = calculateWht();
    const payeeName = document.getElementById('payeeName')?.value.trim();
    const payeeTaxId = (document.getElementById('payeeTaxId')?.value || '').replace(/[^0-9]/g, '');

    if (isDraft) {
        if (!payeeName && !payeeTaxId) {
            notify('warning', 'กรุณาระบุข้อมูลเบื้องต้น', 'กรุณาระบุชื่อผู้ถูกหักภาษี หรือเลขประจำตัว เพื่อบันทึกแบบร่าง');
            document.getElementById('payeeName')?.focus();
            return;
        }
    } else {
        if (!payeeName) {
            notify('warning', 'กรุณาระบุชื่อ', 'กรุณาระบุชื่อผู้ถูกหักภาษี ณ ที่จ่าย');
            document.getElementById('payeeName')?.focus();
            return;
        }
        if (payeeTaxId.length !== 13) {
            notify('warning', 'เลขประจำตัวผู้เสียภาษีไม่ครบ', 'กรุณากรอกเลขประจำตัวผู้เสียภาษีของผู้ถูกหักให้ครบ 13 หลัก');
            document.getElementById('payeeTaxId')?.focus();
            return;
        }
        if (!isValidThaiTaxId(payeeTaxId) &&
            !confirm(`เลขประจำตัวผู้เสียภาษี ${payeeTaxId} ไม่ผ่านการตรวจสอบเลขหลักสุดท้าย\nต้องการบันทึกต่อหรือไม่?`)) {
            document.getElementById('payeeTaxId')?.focus();
            return;
        }
        if (!(totalIncome > 0)) {
            notify('warning', 'กรุณาระบุจำนวนเงิน', 'กรุณาระบุจำนวนเงินที่จ่ายอย่างน้อย 1 รายการ');
            return;
        }
    }

    const formType = document.querySelector('input[name="form_type"]:checked')?.value || 'ภ.ง.ด.53';
    const taxCondition = document.querySelector('input[name="tax_condition"]:checked')?.value || 'withheld';

    const payload = {
        doc_number: (whtState.mode === 'new' || (whtState.cert && whtState.cert.status === 'DRAFT')) ? (document.getElementById('docNumber')?.value.trim() || 'AUTO') : undefined,
        book_number: document.getElementById('bookNumber')?.value.trim() || '01',
        doc_date: document.getElementById('docDate')?.value,
        form_type: formType,
        sequence_no: document.getElementById('sequenceNo')?.value.trim() || '1',
        payee_tax_id: payeeTaxId,
        payee_name: payeeName,
        payee_address: document.getElementById('payeeAddress')?.value.trim(),
        income_type: whtState.items.map(it => it.income_type).join(', '),
        payment_date: whtState.items[0]?.payment_date || document.getElementById('docDate')?.value,
        income_amount: totalIncome,
        tax_rate: whtState.items[0]?.tax_rate || 3,
        tax_condition: taxCondition,
        ref_expense_number: document.getElementById('refExpenseNumber')?.value.trim() || '',
        status: targetStatus,
        items: whtState.items.map(it => ({
            row_no: 5,
            income_type: it.income_type,
            payment_date: it.payment_date,
            income_amount: parseFloat(it.income_amount) || 0,
            tax_rate: parseFloat(it.tax_rate) || 0
        }))
    };

    const isEdit = whtState.mode === 'edit' && whtState.cert;
    const url = isEdit ? `/api/withholding-taxes/${whtState.cert.id}` : '/api/withholding-taxes';

    const activeBtn = isDraft ? document.getElementById('btnSaveDraft') : document.getElementById('btnSaveWht');
    const originalText = activeBtn ? activeBtn.textContent : '';
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.textContent = isDraft ? 'กำลังบันทึกแบบร่าง...' : 'กำลังบันทึกเอกสาร...';
    }

    try {
        const res = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await safeJson(res)).error || 'บันทึกข้อมูลไม่สำเร็จ');

        const saved = await res.json();
        const successTitle = isDraft ? 'บันทึกแบบร่างสำเร็จ!' : (isEdit ? 'บันทึกการแก้ไขสำเร็จ!' : 'บันทึกหนังสือรับรองสำเร็จ!');
        const successMsg = isDraft
            ? `บันทึกแบบร่าง ${saved.doc_number} เรียบร้อยแล้ว`
            : `หนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ เลขที่ ${saved.doc_number} เรียบร้อยแล้ว`;

        notify('success', successTitle, successMsg, {
            docNumber: saved.doc_number,
            grandTotal: Number(saved.tax_amount || 0),
            statusText: isDraft ? 'แบบร่าง' : 'สมบูรณ์',
            redirectUrl: `withholding-tax-new.html?id=${saved.id}`,
            duration: 2500
        });

        if (typeof window.showDocToast !== 'function') {
            setTimeout(() => {
                window.location.href = `withholding-tax-new.html?id=${saved.id}`;
            }, 1000);
        }
    } catch (err) {
        notify('error', 'บันทึกไม่สำเร็จ', err.message, { duration: 4500 });
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.textContent = originalText;
        }
    }
}

function fillFormFromData(cert) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    setVal('docNumber', cert.doc_number);
    setVal('bookNumber', cert.book_number || '01');
    setVal('docDate', cert.doc_date);
    setVal('sequenceNo', cert.sequence_no || '1');
    setVal('payeeTaxId', cert.payee_tax_id);
    renderTaxBoxes(cert.payee_tax_id, 'payeeTaxBoxes');
    updateTaxIdHint(String(cert.payee_tax_id || '').replace(/[^0-9]/g, ''));
    setVal('payeeName', cert.payee_name);
    setVal('payeeAddress', cert.payee_address);
    setVal('refExpenseNumber', cert.ref_expense_number);

    setPayer(cert.payer_name, cert.payer_address, cert.payer_tax_id);

    const radioType = document.querySelector(`input[name="form_type"][value="${cert.form_type}"]`);
    if (radioType) radioType.checked = true;

    const radioCond = document.querySelector(`input[name="tax_condition"][value="${cert.tax_condition}"]`);
    if (radioCond) radioCond.checked = true;

    // เติมรายการเงินได้ (Multi-row items_json หรือข้อมูลเดิมเดี่ยว)
    whtState.items = [];
    if (cert.items_json) {
        try {
            const parsed = JSON.parse(cert.items_json);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(it => {
                    addIncomeItem({
                        income_type: it.income_type,
                        payment_date: it.payment_date,
                        income_amount: it.income_amount,
                        tax_rate: it.tax_rate
                    });
                });
            }
        } catch (e) {
            console.warn('Failed to parse items_json, fallback to single row:', e);
        }
    }

    if (whtState.items.length === 0) {
        addIncomeItem({
            income_type: cert.income_type || 'ค่าบริการและจ้างทำของ',
            payment_date: cert.payment_date || cert.doc_date,
            income_amount: cert.income_amount,
            tax_rate: cert.tax_rate
        });
    }

    suggestFormType(cert.payee_type === 'juristic' ? 'JURISTIC' : 'INDIVIDUAL');
    calculateWht();
}

// ------------------------------------------------------------------
// Multi-Copy Printing
// ------------------------------------------------------------------

function updatePrintCopyHeader() {
    const val = document.getElementById('printCopySelect')?.value || 'both';
    const textEl = document.getElementById('copyIndicatorText');
    if (!textEl) return;
    if (val === 'copy2') {
        textEl.textContent = 'ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)';
    } else {
        textEl.textContent = 'ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)';
    }
}

function handlePrint() {
    const val = document.getElementById('printCopySelect')?.value || 'both';
    const container = document.getElementById('whtPaperContainer');
    const paper1 = document.getElementById('whtPaper');

    updatePrintCopyHeader();

    if (val === 'both' && container && paper1) {
        // สร้างกระดาษแผ่นที่ 2 (ฉบับที่ 2) สำหรับสั่งพิมพ์พร้อมกัน
        const paper2 = paper1.cloneNode(true);
        paper2.id = 'whtPaperCopy2';

        // วนลูปคัดลอกค่า .value ปัจจุบันของ <select>, <input>, และ <textarea> ทุกตัวจาก paper1 ไปยัง paper2 ตามลำดับ index
        const origSelects = paper1.querySelectorAll('select');
        const cloneSelects = paper2.querySelectorAll('select');
        origSelects.forEach((sel, i) => {
            if (cloneSelects[i]) {
                cloneSelects[i].value = sel.value;
                Array.from(cloneSelects[i].options).forEach(opt => {
                    if (opt.value === sel.value) {
                        opt.setAttribute('selected', 'selected');
                    } else {
                        opt.removeAttribute('selected');
                    }
                });
            }
        });

        const origInputs = paper1.querySelectorAll('input');
        const cloneInputs = paper2.querySelectorAll('input');
        origInputs.forEach((inp, i) => {
            if (cloneInputs[i]) {
                if (inp.type === 'checkbox' || inp.type === 'radio') {
                    cloneInputs[i].checked = inp.checked;
                } else {
                    cloneInputs[i].value = inp.value;
                }
            }
        });

        const origTextareas = paper1.querySelectorAll('textarea');
        const cloneTextareas = paper2.querySelectorAll('textarea');
        origTextareas.forEach((txt, i) => {
            if (cloneTextareas[i]) {
                cloneTextareas[i].value = txt.value;
            }
        });

        const copyNotice = paper2.querySelector('#copyIndicatorText');
        if (copyNotice) {
            copyNotice.textContent = 'ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)';
        }
        container.appendChild(paper2);

        window.print();

        // หลังจากพิมพ์เสร็จ นำแผ่นจำลองออก
        setTimeout(() => {
            const extra = document.getElementById('whtPaperCopy2');
            if (extra) extra.remove();
        }, 1000);
    } else {
        window.print();
    }
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

function notify(type, title, message, extra = {}) {
    if (typeof window.showToast === 'function') {
        window.showToast({ type, title, message, duration: 3500, ...extra });
    } else {
        alert(`${title}\n${message}`);
    }
}

async function safeJson(res) {
    try { return await res.json(); } catch (e) { return {}; }
}

function toLocalIsoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function thaiBahtText(amount) {
    amount = Number(amount);
    if (!isFinite(amount)) return 'ศูนย์บาทถ้วน';
    amount = Math.round(amount * 100) / 100;
    if (amount === 0) return 'ศูนย์บาทถ้วน';

    const numbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

    function convertGroup(valStr, hasHigher = false) {
        const value = parseInt(valStr, 10) || 0;
        let res = '';
        const len = valStr.length;
        for (let i = 0; i < len; i++) {
            const digit = parseInt(valStr.charAt(i), 10);
            const pos = len - i - 1;
            if (digit === 0) continue;
            if (pos === 0 && digit === 1 && (value > 1 || hasHigher)) {
                res += 'เอ็ด';
            } else if (pos === 1 && digit === 2) {
                res += 'ยี่สิบ';
            } else if (pos === 1 && digit === 1) {
                res += 'สิบ';
            } else {
                res += numbers[digit] + units[pos];
            }
        }
        return res;
    }

    function convertInteger(intStr) {
        intStr = intStr.replace(/^0+/, '');
        if (!intStr) return '';
        if (intStr.length <= 6) return convertGroup(intStr);
        const high = intStr.slice(0, -6);
        const low = intStr.slice(-6);
        return convertInteger(high) + 'ล้าน' + convertGroup(low, true);
    }

    const [integerPart, fractionPart] = amount.toFixed(2).split('.');
    const bahtWords = convertInteger(integerPart);
    const bahtText = bahtWords ? `${bahtWords}บาท` : '';
    const satangText = fractionPart === '00' ? 'ถ้วน' : `${convertGroup(fractionPart)}สตางค์`;

    return bahtText + satangText;
}
