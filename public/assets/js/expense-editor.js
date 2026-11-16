/**
 * FlowAccount Advance - Expense Editor & Slip Attachment Controller
 * Supports: New Expense, Edit Mode (?id=...), and Copy/Duplicate Mode (?copy=...)
 * Standardized with FlowAccount Document Editor layout.
 */

let editingExpenseId = null;
let isCopyMode = false;
let uploadedSlipBase64 = '';
let uploadedSlipName = '';

document.addEventListener('DOMContentLoaded', async () => {
    setupDropzone();
    setupEventListeners();
    await initExpenseEditor();
});

async function syncExpenseCompanyHeader() {
    try {
        const res = await fetch('/api/company');
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        const companyName = data.name || data.name_th || 'บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด';
        const companyAddress = data.address || '46/14 ถนนริมคลองบางค้อ แขวงบางค้อ เขตจอมทอง กรุงเทพมหานคร 10150';
        const companyTaxId = data.tax_id || '0105565160161';
        const companyPhone = data.phone || '02-415-1946';

        const titleEl = document.querySelector('.company-title-text');
        if (titleEl) titleEl.textContent = companyName;

        const detailsEl = document.querySelector('.company-details-block');
        if (detailsEl) {
            detailsEl.innerHTML = `${escapeHtml(companyAddress)}<br>เลขประจำตัวผู้เสียภาษี: <strong>${escapeHtml(companyTaxId)}</strong> (สำนักงานใหญ่)<br>โทรศัพท์: ${escapeHtml(companyPhone)}`;
        }
    } catch (e) {}
}

async function initExpenseEditor() {
    syncExpenseCompanyHeader();
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    const copyParam = urlParams.get('copy');

    if (idParam) {
        editingExpenseId = idParam;
        await loadExistingExpense(idParam, false);
    } else if (copyParam) {
        isCopyMode = true;
        await loadExistingExpense(copyParam, true);
    } else {
        setupNewExpenseDefaults();
    }
}

function setupNewExpenseDefaults() {
    const today = new Date().toISOString().split('T')[0];
    const transDateInput = document.getElementById('transactionDate');
    const dueDateInput = document.getElementById('dueDate');
    if (transDateInput) transDateInput.value = today;
    if (dueDateInput) dueDateInput.value = today;

    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const docInput = document.getElementById('docNumber');
    if (docInput) {
        docInput.placeholder = `EXP-${ym}-XXX (อัตโนมัติ)`;
    }

    // Add 1 default empty item row
    const tbody = document.getElementById('expenseItemsBody');
    if (tbody && tbody.children.length === 0) {
        addExpenseRow('', 'ค่าใช้จ่ายทั่วไป', 0);
    }
    calculateTotals();
}

async function loadExistingExpense(id, isCopy) {
    try {
        const res = await fetch(`/api/expenses/${id}`);
        if (!res.ok) throw new Error('ไม่พบข้อมูลค่าใช้จ่าย');
        const exp = await res.json();

        const badgeEl = document.getElementById('editorDocBadge');
        const submitBtnText = document.getElementById('btnSubmitText');

        if (!isCopy) {
            if (badgeEl) badgeEl.textContent = `แก้ไขค่าใช้จ่าย: ${exp.doc_number || ''}`;
            if (submitBtnText) submitBtnText.textContent = 'บันทึกการแก้ไข';
            const docInput = document.getElementById('docNumber');
            if (docInput) docInput.value = exp.doc_number || '';
        } else {
            if (badgeEl) badgeEl.textContent = `สร้างซ้ำจาก: ${exp.doc_number || ''}`;
            setupNewExpenseDefaults();
        }

        // Fill form fields
        const transDateInput = document.getElementById('transactionDate');
        const dueDateInput = document.getElementById('dueDate');
        if (transDateInput && !isCopy) transDateInput.value = exp.transaction_date ? exp.transaction_date.slice(0, 10) : '';
        if (dueDateInput && !isCopy) dueDateInput.value = exp.due_date ? exp.due_date.slice(0, 10) : '';

        const refDocInput = document.getElementById('refDocNumber');
        if (refDocInput) refDocInput.value = exp.ref_doc_number || '';

        const vendorNameInput = document.getElementById('vendorName');
        if (vendorNameInput) vendorNameInput.value = exp.vendor_name || '';

        const vendorTaxInput = document.getElementById('vendorTaxId');
        if (vendorTaxInput) vendorTaxInput.value = exp.vendor_tax_id || '';

        const vendorBranchInput = document.getElementById('vendorBranch');
        if (vendorBranchInput) vendorBranchInput.value = exp.vendor_branch || 'สำนักงานใหญ่';

        const vendorAddressInput = document.getElementById('vendorAddress');
        if (vendorAddressInput) vendorAddressInput.value = exp.vendor_address || '';

        const mainCatSelect = document.getElementById('mainCategorySelect');
        if (mainCatSelect && exp.category) {
            const normalizedCat = exp.category === 'ต้นทุนสินค้า / วัตถุดิบ' ? 'ต้นทุนสินค้าและบริการ' : exp.category;
            mainCatSelect.value = normalizedCat;
        }

        const paymentStatusSelect = document.getElementById('paymentStatus');
        if (paymentStatusSelect && exp.payment_status) paymentStatusSelect.value = exp.payment_status;

        const paymentMethodSelect = document.getElementById('paymentMethod');
        if (paymentMethodSelect && exp.payment_method) paymentMethodSelect.value = exp.payment_method;

        const remarksInput = document.getElementById('remarks');
        if (remarksInput) remarksInput.value = exp.remarks || '';

        const vatTypeSelect = document.getElementById('vatTypeSelect');
        if (vatTypeSelect && exp.vat_type) vatTypeSelect.value = exp.vat_type;

        const whtRateSelect = document.getElementById('whtRateSelect');
        if (whtRateSelect && exp.wht_rate !== undefined) whtRateSelect.value = String(exp.wht_rate);

        // Fill items
        const tbody = document.getElementById('expenseItemsBody');
        if (tbody) {
            tbody.innerHTML = '';
            if (exp.items && exp.items.length > 0) {
                exp.items.forEach(it => {
                    addExpenseRow(it.description, it.category, it.amount);
                });
            } else {
                addExpenseRow(exp.category || 'ค่าใช้จ่าย', exp.category || 'ทั่วไป', exp.subtotal || exp.net_total || 0);
            }
        }

        // Fill slip if present
        if (exp.slip_url) {
            uploadedSlipBase64 = exp.slip_url;
            uploadedSlipName = 'slip-attachment';
            const dropzone = document.getElementById('slipDropzone');
            const previewContainer = document.getElementById('slipPreviewContainer');
            const previewImg = document.getElementById('slipPreviewImg');
            const filenameEl = document.getElementById('slipFilename');
            if (previewImg) previewImg.src = exp.slip_url;
            if (filenameEl) filenameEl.textContent = 'หลักฐานสลิป / ใบเสร็จเดิม';
            if (dropzone) dropzone.style.display = 'none';
            if (previewContainer) previewContainer.style.display = 'flex';
        }

        calculateTotals();
    } catch (err) {
        console.error('Error loading expense:', err);
        if (window.showToast) {
            window.showToast('ไม่สามารถโหลดข้อมูลได้', err.message, 'error');
        } else {
            alert('ไม่สามารถโหลดข้อมูลค่าใช้จ่าย: ' + err.message);
        }
        setupNewExpenseDefaults();
    }
}

function setupDropzone() {
    const dropzone = document.getElementById('slipDropzone');
    const fileInput = document.getElementById('slipFileInput');
    const previewContainer = document.getElementById('slipPreviewContainer');
    const previewImg = document.getElementById('slipPreviewImg');
    const filenameEl = document.getElementById('slipFilename');
    const filesizeEl = document.getElementById('slipFilesize');
    const removeBtn = document.getElementById('removeSlipBtn');

    if (!dropzone || !fileInput) return;

    // Click to select
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    // File selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '#7D0A0A';
            dropzone.style.background = '#fef2f2';
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '#fca5a5';
            dropzone.style.background = '#ffffff';
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file) handleFile(file);
    });

    // Remove slip
    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadedSlipBase64 = '';
            uploadedSlipName = '';
            fileInput.value = '';
            if (previewContainer) previewContainer.style.display = 'none';
            if (dropzone) dropzone.style.display = 'block';
        });
    }

    function handleFile(file) {
        if (!file.type.match('image.*') && file.type !== 'application/pdf') {
            alert('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, GIF, WebP) หรือ PDF');
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            alert('ขนาดไฟล์เกิน 15 MB กรุณาเลือกไฟล์ที่มีขนาดเล็กลง');
            return;
        }

        uploadedSlipName = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedSlipBase64 = e.target.result;
            if (previewImg) {
                previewImg.src = uploadedSlipBase64.startsWith('data:image') 
                    ? uploadedSlipBase64 
                    : 'https://placehold.co/120x120?text=PDF+Slip';
            }
            if (filenameEl) filenameEl.textContent = file.name;
            if (filesizeEl) filesizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

            if (dropzone) dropzone.style.display = 'none';
            if (previewContainer) previewContainer.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
}

function setupEventListeners() {
    // Add Row Button
    const addRowBtn = document.getElementById('btnAddRow');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            addExpenseRow();
        });
    }

    // Calculation listeners
    document.getElementById('vatTypeSelect')?.addEventListener('change', calculateTotals);
    document.getElementById('whtRateSelect')?.addEventListener('change', calculateTotals);

    // Save Draft
    const btnSaveDraft = document.getElementById('btnSaveDraft');
    if (btnSaveDraft) {
        btnSaveDraft.addEventListener('click', () => {
            const statusSelect = document.getElementById('paymentStatus');
            if (statusSelect) statusSelect.value = 'DRAFT';
            document.getElementById('expenseForm')?.requestSubmit();
        });
    }

    // Submit Expense
    const form = document.getElementById('expenseForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

function addExpenseRow(desc = '', category = '', amount = '') {
    const tbody = document.getElementById('expenseItemsBody');
    if (!tbody) return;

    const rowIdx = tbody.children.length + 1;
    const defaultCat = document.getElementById('mainCategorySelect')?.value || 'ค่าใช้จ่ายทั่วไป';

    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.innerHTML = `
        <td class="col-no text-center" style="width: 44px; vertical-align: middle;">
            <span class="row-num" style="font-weight: 600; color: #64748b;">${rowIdx}</span>
        </td>
        <td class="col-desc" style="vertical-align: middle;">
            <input type="text" class="table-input item-desc" placeholder="ระบุรายละเอียดค่าใช้จ่าย เช่น ค่าอุปกรณ์, ค่าบริการ..." value="${escapeHtml(desc)}" required style="width: 100%; height: 36px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13px;">
        </td>
        <td class="col-unit" style="width: 170px; vertical-align: middle;">
            <input type="text" class="table-input item-category" placeholder="หมวดหมู่ย่อย" value="${escapeHtml(category || defaultCat)}" style="width: 100%; height: 36px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 12.5px;">
        </td>
        <td class="col-total text-right" style="width: 150px; vertical-align: middle;">
            <input type="number" class="table-input item-amount text-right" placeholder="0.00" value="${amount !== '' ? amount : ''}" min="0" step="any" required style="width: 100%; height: 36px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 13.5px; font-weight: 600; text-align: right; color: #0f172a;">
        </td>
        <td class="col-del text-center" style="width: 40px; vertical-align: middle;">
            <button type="button" class="btn-del-row" title="ลบแถวนี้" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; transition: color 0.15s;">&times;</button>
        </td>
    `;

    // Row deletion
    tr.querySelector('.btn-del-row')?.addEventListener('click', () => {
        if (tbody.children.length > 1) {
            tr.remove();
            reindexRows();
            calculateTotals();
        } else {
            tr.querySelector('.item-desc').value = '';
            tr.querySelector('.item-amount').value = '';
            calculateTotals();
        }
    });

    // Recalculate on amount input
    tr.querySelector('.item-amount')?.addEventListener('input', calculateTotals);

    tbody.appendChild(tr);
    reindexRows();
    calculateTotals();
}

function reindexRows() {
    const rows = document.querySelectorAll('#expenseItemsBody tr');
    rows.forEach((tr, idx) => {
        const numEl = tr.querySelector('.row-num');
        if (numEl) numEl.textContent = idx + 1;
    });
}

function calculateTotals() {
    let subtotal = 0;
    const amountInputs = document.querySelectorAll('.item-amount');
    amountInputs.forEach(input => {
        const val = parseFloat(input.value) || 0;
        subtotal += val;
    });

    const vatType = document.getElementById('vatTypeSelect')?.value || 'exclude';
    const whtRate = parseFloat(document.getElementById('whtRateSelect')?.value) || 0;

    let vatAmount = 0;
    let baseForWht = subtotal;

    if (vatType === 'exclude') {
        vatAmount = subtotal * 0.07;
        baseForWht = subtotal;
    } else if (vatType === 'include') {
        vatAmount = subtotal - (subtotal / 1.07);
        baseForWht = subtotal - vatAmount;
    } else {
        vatAmount = 0;
        baseForWht = subtotal;
    }

    const whtAmount = baseForWht * (whtRate / 100);

    let grandTotal = 0;
    if (vatType === 'exclude') {
        grandTotal = subtotal + vatAmount - whtAmount;
    } else if (vatType === 'include') {
        grandTotal = subtotal - whtAmount;
    } else {
        grandTotal = subtotal - whtAmount;
    }

    // Update UI Displays
    const elSubtotal = document.getElementById('subtotalDisplay');
    const elVatAmount = document.getElementById('vatAmountDisplay');
    const elWhtAmount = document.getElementById('whtAmountDisplay');
    const elGrandTotal = document.getElementById('grandTotalDisplay');
    const elThaiText = document.getElementById('thaiBahtTextDisplay');

    if (elSubtotal) elSubtotal.textContent = formatNumber(subtotal);
    if (elVatAmount) elVatAmount.textContent = formatNumber(vatAmount);
    if (elWhtAmount) elWhtAmount.textContent = formatNumber(whtAmount);
    if (elGrandTotal) elGrandTotal.textContent = formatNumber(grandTotal);
    if (elThaiText) elThaiText.textContent = thaiBahtText(grandTotal);

    return { subtotal, vatType, vatAmount, whtRate, whtAmount, grandTotal };
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const totals = calculateTotals();
    const rows = document.querySelectorAll('#expenseItemsBody tr');

    const items = [];
    rows.forEach((tr, idx) => {
        const desc = tr.querySelector('.item-desc')?.value.trim() || '';
        const cat = tr.querySelector('.item-category')?.value.trim() || 'ทั่วไป';
        const amt = parseFloat(tr.querySelector('.item-amount')?.value) || 0;
        if (desc || amt > 0) {
            items.push({
                row_order: idx + 1,
                description: desc,
                category: cat,
                amount: amt,
                vat_rate: totals.vatType !== 'none' ? 7 : 0,
                wht_rate: totals.whtRate,
                total_amount: amt
            });
        }
    });

    if (items.length === 0) {
        alert('กรุณาระบุรายการค่าใช้จ่ายอย่างน้อย 1 รายการ');
        return;
    }

    const vendorName = document.getElementById('vendorName')?.value.trim();
    if (!vendorName) {
        alert('กรุณาระบุชื่อผู้จำหน่าย / ผู้ให้บริการ');
        document.getElementById('vendorName')?.focus();
        return;
    }

    const payload = {
        doc_number: document.getElementById('docNumber')?.value.trim() || 'AUTO',
        transaction_date: document.getElementById('transactionDate')?.value,
        due_date: document.getElementById('dueDate')?.value,
        ref_doc_number: document.getElementById('refDocNumber')?.value.trim(),
        vendor_name: vendorName,
        vendor_tax_id: document.getElementById('vendorTaxId')?.value.trim(),
        vendor_branch: document.getElementById('vendorBranch')?.value.trim() || 'สำนักงานใหญ่',
        vendor_address: document.getElementById('vendorAddress')?.value.trim(),
        category: document.getElementById('mainCategorySelect')?.value || 'ค่าใช้จ่ายทั่วไป',
        payment_status: document.getElementById('paymentStatus')?.value || 'PAID',
        payment_method: document.getElementById('paymentMethod')?.value || 'โอนเงิน',
        subtotal: totals.subtotal,
        vat_type: totals.vatType,
        vat_rate: totals.vatType !== 'none' ? 7 : 0,
        vat_amount: totals.vatAmount,
        wht_type: String(totals.whtRate),
        wht_rate: totals.whtRate,
        wht_amount: totals.whtAmount,
        net_total: totals.grandTotal,
        slip_url: uploadedSlipBase64 || '',
        remarks: document.getElementById('remarks')?.value.trim(),
        items: items
    };

    const submitBtn = document.getElementById('btnSubmitExpense');
    if (submitBtn) {
        submitBtn.disabled = true;
    }

    try {
        let res;
        if (editingExpenseId && !isCopyMode) {
            // Update existing
            res = await fetch(`/api/expenses/${editingExpenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create new
            res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'บันทึกข้อมูลไม่สำเร็จ');
        }

        const saved = await res.json();
        const actionWord = (editingExpenseId && !isCopyMode) ? 'แก้ไข' : 'บันทึก';

        if (window.showToast) {
            window.showToast('สำเร็จ', `${actionWord}รายการค่าใช้จ่าย ${saved.doc_number || ''} เรียบร้อยแล้ว`, 'success');
        } else {
            alert(`${actionWord}รายการค่าใช้จ่าย ${saved.doc_number || ''} เรียบร้อยแล้ว!`);
        }

        setTimeout(() => {
            window.location.href = 'expenses.html';
        }, 300);
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    }
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Convert Thai Baht numeric value into Thai Baht text representation
 */
function thaiBahtText(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) return 'ศูนย์บาทถ้วน';
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) return 'ศูนย์บาทถ้วน';

    const numbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

    function convertGroup(valStr) {
        let res = '';
        const len = valStr.length;
        for (let i = 0; i < len; i++) {
            const digit = parseInt(valStr.charAt(i), 10);
            const pos = len - i - 1;
            if (digit !== 0) {
                const hasHigherNonZero = valStr.slice(0, i).split('').some(ch => ch !== '0');
                if (pos === 0 && digit === 1 && hasHigherNonZero) {
                    res += 'เอ็ด';
                } else if (pos === 1 && digit === 2) {
                    res += 'ยี่สิบ';
                } else if (pos === 1 && digit === 1) {
                    res += 'สิบ';
                } else {
                    res += numbers[digit] + (pos > 0 ? units[pos] : '');
                }
            }
        }
        return res;
    }

    const parts = amount.toFixed(2).split('.');
    const integerPart = parts[0];
    const fractionPart = parts[1];

    let bahtText = '';
    if (parseInt(integerPart, 10) === 0) {
        bahtText = 'ศูนย์บาท';
    } else if (integerPart.length > 6) {
        const millionGroup = integerPart.substring(0, integerPart.length - 6);
        const remainGroup = integerPart.substring(integerPart.length - 6);
        bahtText = convertGroup(millionGroup) + 'ล้าน' + convertGroup(remainGroup) + 'บาท';
    } else {
        bahtText = convertGroup(integerPart) + 'บาท';
    }

    let satangText = '';
    if (parseInt(fractionPart, 10) === 0) {
        satangText = 'ถ้วน';
    } else {
        satangText = convertGroup(fractionPart) + 'สตางค์';
    }

    return bahtText + satangText;
}
