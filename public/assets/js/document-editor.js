/**
 * FlowAccount Advance Document Editor JavaScript
 * Calculation engine, dynamic line items, Thai Baht text converter, and print preview.
 */

document.addEventListener('DOMContentLoaded', () => {
    const itemsTbody = document.getElementById('itemsTbody');
    const btnAddItem = document.getElementById('btnAddItem');
    const btnAddService = document.getElementById('btnAddService');

    // Calculation Fields
    const subtotalDisplay = document.getElementById('subtotalDisplay');
    const discountTypeSelect = document.getElementById('discountTypeSelect');
    const discountValueInput = document.getElementById('discountValueInput');
    const discountAmountDisplay = document.getElementById('discountAmountDisplay');
    const vatTypeSelect = document.getElementById('vatTypeSelect');
    const vatAmountDisplay = document.getElementById('vatAmountDisplay');
    const whtTypeSelect = document.getElementById('whtTypeSelect');
    const whtAmountDisplay = document.getElementById('whtAmountDisplay');
    const grandTotalDisplay = document.getElementById('grandTotalDisplay');
    const thaiBahtTextDisplay = document.getElementById('thaiBahtTextDisplay');

    // Customer Selector
    const customerSelect = document.getElementById('customerSelect');
    const customerAddress = document.getElementById('customerAddress');
    const customerTaxId = document.getElementById('customerTaxId');
    const customerBranch = document.getElementById('customerBranch');
    const customerContact = document.getElementById('customerContact');
    const customerPhone = document.getElementById('customerPhone');
    const customerCreditTerms = document.getElementById('customerCreditTerms');

    let customerDatabase = {};

    // =========================================================================
    // Modern Toast / Notification Utility (Loaded via modules/doc-toast.js)
    // =========================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function showDocToast(arg1, arg2, arg3, arg4) {
        if (typeof window.showDocToast === 'function' && window.showDocToast !== showDocToast) {
            return window.showDocToast(arg1, arg2, arg3, arg4);
        }
        if (typeof window.showToast === 'function' && window.showToast !== showDocToast) {
            return window.showToast(arg1, arg2, arg3, arg4);
        }
        const msg = (typeof arg1 === 'string' ? arg1 : (arg1 && (arg1.message || arg1.title))) || 'บันทึกสำเร็จ';
        console.log('[Toast Notification]', msg, arg1);
    }

    let currentLoadedDocId = null;

    // Setup Searchable Customer / Vendor Dropdown state
    let customerSearchInput = null;
    let customerDropdownMenu = null;
    let btnCustomerDropdown = null;

    function syncCustomerSearchInputValue() {
        if (!customerSearchInput || !customerSelect) return;
        const currentVal = customerSelect.value;
        if (currentVal && customerDatabase[currentVal]) {
            customerSearchInput.value = customerDatabase[currentVal].name || '';
        } else if (customerSelect.selectedIndex > 0) {
            const optText = customerSelect.options[customerSelect.selectedIndex].text;
            if (!optText.startsWith('--')) {
                customerSearchInput.value = optText;
            } else {
                customerSearchInput.value = '';
            }
        } else {
            customerSearchInput.value = '';
        }
    }

    // Load customers / vendors from API if available
    let customersLoadedPromise = null;
    function loadCustomersFromApi() {
        const isPo = getDocType() === 'PURCHASE_ORDER';
        const url = isPo ? '/api/vendors' : '/api/customers';
        const urlParams = new URLSearchParams(window.location.search);
        const hasIdOrRef = urlParams.has('id') || urlParams.has('doc') || urlParams.has('num') || urlParams.has('ref') || urlParams.has('copy');

        customersLoadedPromise = (async () => {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const customers = await res.json();
                    if (Array.isArray(customers)) {
                        if (customerSelect) {
                            const currentVal = customerSelect.value;
                            customerSelect.innerHTML = `<option value="">-- ${isPo ? 'เลือกผู้ขาย / ผู้ให้บริการ' : 'เลือกลูกค้า หรือ พิมพ์เพื่อค้นหา'} --</option>`;
                            customerDatabase = {};
                            customers.forEach((c, idx) => {
                                const opt = document.createElement('option');
                                const key = c.id ? String(c.id) : `vend_${idx}`;
                                opt.value = key;
                                opt.textContent = c.name;
                                customerDatabase[key] = {
                                    id: c.id,
                                    name: c.name,
                                    address: c.address || '',
                                    taxId: c.tax_id || '',
                                    branch: c.branch || 'สำนักงานใหญ่',
                                    contactPerson: c.contact_person || '',
                                    phone: c.phone || '',
                                    creditTerms: c.credit_terms || 'เครดิต 30 วัน'
                                };
                                customerSelect.appendChild(opt);
                            });

                            if (currentVal && customerDatabase[currentVal]) {
                                customerSelect.value = currentVal;
                            }
                            syncCustomerSearchInputValue();
                        }
                    }
                }
            } catch (err) {
                // Standalone mode / offline fallback
            }
        })();
        return customersLoadedPromise;
    }
    loadCustomersFromApi();

    // =========================================================================
    // Salesperson / Purchaser Dropdown Setup
    // =========================================================================
    let salespersonsLoadedPromise = null;
    let globalSalespersonList = [];

    function getSalespersonElement() {
        return document.getElementById('salespersonSelect') || document.getElementById('salespersonInput');
    }

    function setSalespersonValue(name) {
        const el = getSalespersonElement();
        if (!el) return;
        const cleanName = (name || '').trim();
        if (!cleanName) return;

        if (el.tagName.toLowerCase() === 'select') {
            let matched = false;
            for (let i = 0; i < el.options.length; i++) {
                if (el.options[i].value.trim().toLowerCase() === cleanName.toLowerCase()) {
                    el.selectedIndex = i;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                const opt = document.createElement('option');
                opt.value = cleanName;
                opt.textContent = cleanName;
                const customOpt = el.querySelector('option[value="__custom__"]');
                if (customOpt) {
                    el.insertBefore(opt, customOpt);
                } else {
                    el.appendChild(opt);
                }
                opt.selected = true;
            }
        } else {
            el.value = cleanName;
        }
    }

    function loadSalespersonsFromApi() {
        const el = getSalespersonElement();
        if (!el) return Promise.resolve();

        salespersonsLoadedPromise = (async () => {
            // Detect current logged-in user
            let currentUserName = '';
            if (typeof getCurrentUser === 'function') {
                try {
                    const u = getCurrentUser();
                    if (u && u.name) currentUserName = u.name.trim();
                } catch (e) {}
            }
            if (!currentUserName) {
                try {
                    const stored = localStorage.getItem('flowUser');
                    if (stored) {
                        const u = JSON.parse(stored);
                        if (u && u.name) currentUserName = u.name.trim();
                    }
                } catch (e) {}
            }

            try {
                const res = await fetch('/api/users');
                if (res.ok) {
                    const users = await res.json();
                    if (Array.isArray(users) && users.length > 0) {
                        globalSalespersonList = users.filter(u => u.status !== 'REJECTED' && u.status !== 'INACTIVE');
                    }
                }
            } catch (err) {
                console.warn('Could not load users for salesperson list:', err);
            }

            if (globalSalespersonList.length === 0) {
                globalSalespersonList = [
                    { name: currentUserName || 'คุณอิศรพงศ์ โพธิ์งาม' }
                ];
            }

            if (el.tagName.toLowerCase() === 'select') {
                const previousVal = el.value && el.value !== '__custom__' ? el.value : '';
                el.innerHTML = '';

                // Add active users from system
                globalSalespersonList.forEach(u => {
                    if (u && u.name) {
                        const opt = document.createElement('option');
                        opt.value = u.name.trim();
                        opt.textContent = u.name.trim();
                        el.appendChild(opt);
                    }
                });

                // Add option to type custom salesperson
                const customOpt = document.createElement('option');
                customOpt.value = '__custom__';
                customOpt.textContent = '+ ระบุชื่ออื่น...';
                el.appendChild(customOpt);

                // Handle custom selection
                let lastSelected = el.value;
                el.onchange = () => {
                    if (el.value === '__custom__') {
                        const isPo = getDocType() === 'PURCHASE_ORDER';
                        const label = isPo ? 'ผู้สั่งซื้อ / ผู้ติดต่อ' : 'พนักงานขาย';
                        const customName = prompt(`กรุณาระบุชื่อ${label}:`, '');
                        if (customName && customName.trim()) {
                            setSalespersonValue(customName.trim());
                            lastSelected = el.value;
                        } else {
                            el.value = lastSelected;
                        }
                    } else {
                        lastSelected = el.value;
                    }
                };

                // Select initial value
                if (previousVal) {
                    setSalespersonValue(previousVal);
                } else if (currentUserName) {
                    setSalespersonValue(currentUserName);
                } else if (el.options.length > 0) {
                    el.selectedIndex = 0;
                }
            } else {
                if (!el.value || el.value.trim() === 'อิศรพงศ์ โพธิ์งาม') {
                    if (currentUserName) el.value = currentUserName;
                }
            }
        })();

        return salespersonsLoadedPromise;
    }
    loadSalespersonsFromApi();

    function selectCustomerByNameOrId(name, id, fallbackAddress = '', fallbackTaxId = '', fallbackBranch = 'สำนักงานใหญ่', fallbackPhone = '', fallbackContact = '', fallbackCreditTerms = '') {
        if (!customerSelect) return;
        const targetName = (name || '').trim();
        let matchedKey = null;

        if (id && customerDatabase[String(id)]) {
            matchedKey = String(id);
        } else if (targetName) {
            for (let i = 0; i < customerSelect.options.length; i++) {
                const opt = customerSelect.options[i];
                if (opt.textContent.trim().toLowerCase() === targetName.toLowerCase()) {
                    matchedKey = opt.value;
                    break;
                }
            }
        }

        if (matchedKey) {
            customerSelect.value = matchedKey;
            const cInfo = customerDatabase[matchedKey];
            if (cInfo) {
                if (customerAddress) customerAddress.value = cInfo.address || fallbackAddress || '';
                if (customerTaxId) customerTaxId.value = cInfo.taxId || fallbackTaxId || '';
                if (customerBranch) customerBranch.value = cInfo.branch || fallbackBranch || 'สำนักงานใหญ่';
                if (customerContact) customerContact.value = cInfo.contactPerson || fallbackContact || '';
                if (customerPhone) customerPhone.value = cInfo.phone || fallbackPhone || '';
                if (customerCreditTerms) customerCreditTerms.value = cInfo.creditTerms || fallbackCreditTerms || 'เครดิต 30 วัน';
                if (customerSearchInput) customerSearchInput.value = cInfo.name || targetName;
                syncCustomerSearchInputValue();
                return;
            }
        } else if (targetName) {
            const customKey = id ? String(id) : `custom_${Date.now()}`;
            const opt = document.createElement('option');
            opt.value = customKey;
            opt.textContent = targetName;
            opt.selected = true;
            customerSelect.appendChild(opt);
            customerDatabase[customKey] = {
                id: id || null,
                name: targetName,
                address: fallbackAddress || '',
                taxId: fallbackTaxId || '',
                branch: fallbackBranch || 'สำนักงานใหญ่',
                contactPerson: fallbackContact || '',
                phone: fallbackPhone || '',
                creditTerms: fallbackCreditTerms || 'เครดิต 30 วัน'
            };
            customerSelect.value = customKey;
        }

        if (customerAddress && fallbackAddress) customerAddress.value = fallbackAddress;
        if (customerTaxId && fallbackTaxId) customerTaxId.value = fallbackTaxId;
        if (customerBranch && fallbackBranch) customerBranch.value = fallbackBranch;
        if (customerContact && fallbackContact) customerContact.value = fallbackContact;
        if (customerPhone && fallbackPhone) customerPhone.value = fallbackPhone;
        if (customerCreditTerms && fallbackCreditTerms) customerCreditTerms.value = fallbackCreditTerms;
        if (customerSearchInput && targetName) customerSearchInput.value = targetName;
        syncCustomerSearchInputValue();
    }

    if (customerSelect) {
        customerSelect.addEventListener('change', (e) => {
            const selected = customerDatabase[e.target.value];
            if (selected) {
                if (customerAddress) customerAddress.value = selected.address;
                if (customerTaxId) customerTaxId.value = selected.taxId;
                if (customerBranch) customerBranch.value = selected.branch;
                if (customerContact) customerContact.value = selected.contactPerson || '';
                if (customerPhone) customerPhone.value = selected.phone || '';
                if (customerCreditTerms && selected.creditTerms) customerCreditTerms.value = selected.creditTerms;
                if (typeof updateDueDateFromCredit === 'function') updateDueDateFromCredit();
            }
        });
    }

    // =========================================================================
    // Searchable Customer / Vendor Dropdown Setup
    // =========================================================================
    function setupCustomerDropdown() {
        if (!customerSelect) return;
        const parent = customerSelect.parentElement;
        if (!parent) return;

        let wrap = parent.querySelector('.customer-dropdown-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'customer-dropdown-wrap';

            const isPo = getDocType() === 'PURCHASE_ORDER';
            const placeholder = isPo ? 'ค้นหาหรือพิมพ์ชื่อผู้จำหน่าย / คู่ค้า...' : 'ค้นหาหรือพิมพ์ชื่อลูกค้า / องค์กร...';

            wrap.innerHTML = `
                <input type="text" id="customerSearchInput" class="customer-clean-input customer-search-input" placeholder="${placeholder}" autocomplete="off">
                <button type="button" class="btn-customer-dropdown" tabindex="-1" title="เลือกจากรายชื่อ">
                    <svg class="customer-dropdown-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="customer-dropdown-menu" style="display: none;"></div>
            `;

            customerSelect.style.display = 'none';
            parent.appendChild(wrap);
        }

        customerSearchInput = wrap.querySelector('#customerSearchInput');
        btnCustomerDropdown = wrap.querySelector('.btn-customer-dropdown');
        customerDropdownMenu = wrap.querySelector('.customer-dropdown-menu');

        syncCustomerSearchInputValue();

        function renderCustomerList(query = '') {
            const isPo = getDocType() === 'PURCHASE_ORDER';
            const contactLabel = isPo ? 'ผู้จำหน่าย' : 'ลูกค้า';
            const contactUrl = isPo ? '/contacts/vendors.html' : '/contacts/customers.html';
            const q = (query || '').trim().toLowerCase();
            const keys = Object.keys(customerDatabase);

            let filteredKeys = keys;
            if (q) {
                filteredKeys = keys.filter(k => {
                    const c = customerDatabase[k];
                    if (!c) return false;
                    return (c.name && c.name.toLowerCase().includes(q)) ||
                           (c.taxId && c.taxId.includes(q)) ||
                           (c.phone && c.phone.includes(q)) ||
                           (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
                           (c.branch && c.branch.toLowerCase().includes(q));
                });
            }

            const footerHtml = `
                <div class="customer-dropdown-footer">
                    <a href="${contactUrl}" target="_blank" class="btn-customer-dropdown-action">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>เพิ่ม / จัดการรายชื่อ${contactLabel}ใหม่</span>
                    </a>
                </div>
            `;

            if (!filteredKeys || filteredKeys.length === 0) {
                customerDropdownMenu.innerHTML = `
                    <div class="customer-dropdown-empty">
                        <div>ไม่พบรายชื่อที่ตรงกับคำค้นหา ${query ? `"${escapeHtml(query)}"` : ''}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">(สามารถใช้ชื่อที่พิมพ์นี้ เพื่อออกเอกสารได้ทันที)</div>
                    </div>
                    ${footerHtml}
                `;
                return;
            }

            const itemsHtml = filteredKeys.map(k => {
                const c = customerDatabase[k];
                const isSelected = customerSelect.value === k;
                return `
                    <div class="customer-dropdown-item ${isSelected ? 'active' : ''}" data-key="${k}">
                        <div class="customer-item-main">
                            <div class="customer-item-title">${escapeHtml(c.name)}</div>
                            <div class="customer-item-meta">
                                ${c.taxId ? `<span class="customer-item-taxid">[เลขประจำตัว: ${escapeHtml(c.taxId)}]</span>` : ''}
                                ${c.branch ? `<span class="customer-item-branch">• ${escapeHtml(c.branch)}</span>` : ''}
                                ${c.phone ? `<span class="customer-item-contact">• โทร: ${escapeHtml(c.phone)}</span>` : ''}
                                ${c.contactPerson ? `<span class="customer-item-contact">• ติดต่อ: ${escapeHtml(c.contactPerson)}</span>` : ''}
                            </div>
                        </div>
                        ${c.creditTerms ? `
                        <div class="customer-item-side">
                            <span class="customer-item-terms">${escapeHtml(c.creditTerms)}</span>
                        </div>` : ''}
                    </div>
                `;
            }).join('');

            customerDropdownMenu.innerHTML = itemsHtml + footerHtml;

            customerDropdownMenu.querySelectorAll('.customer-dropdown-item').forEach(itemEl => {
                const key = itemEl.getAttribute('data-key');
                itemEl.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectCustomerItem(key);
                });
            });
        }

        function selectCustomerItem(key) {
            const c = customerDatabase[key];
            if (!c) return;

            customerSelect.value = key;
            if (customerSearchInput) {
                customerSearchInput.value = c.name;
            }

            if (customerAddress) customerAddress.value = c.address || '';
            if (customerTaxId) customerTaxId.value = c.taxId || '';
            if (customerBranch) customerBranch.value = c.branch || 'สำนักงานใหญ่';
            if (customerContact) customerContact.value = c.contactPerson || '';
            if (customerPhone) customerPhone.value = c.phone || '';
            if (customerCreditTerms && c.creditTerms) customerCreditTerms.value = c.creditTerms;
            if (typeof updateDueDateFromCredit === 'function') updateDueDateFromCredit();

            closeCustomerMenu();
            customerSelect.dispatchEvent(new Event('change'));
        }

        function openCustomerMenu(query = '') {
            document.querySelectorAll('.product-dropdown-menu').forEach(m => m.style.display = 'none');
            document.querySelectorAll('.btn-item-dropdown').forEach(b => b.classList.remove('active'));

            renderCustomerList(query);
            customerDropdownMenu.style.display = 'flex';
            btnCustomerDropdown.classList.add('active');
        }

        function closeCustomerMenu() {
            if (customerDropdownMenu) customerDropdownMenu.style.display = 'none';
            if (btnCustomerDropdown) btnCustomerDropdown.classList.remove('active');
        }

        function toggleCustomerMenu() {
            if (customerDropdownMenu.style.display === 'flex') {
                closeCustomerMenu();
            } else {
                openCustomerMenu('');
            }
        }

        btnCustomerDropdown.onclick = (e) => {
            e.stopPropagation();
            toggleCustomerMenu();
        };

        customerSearchInput.onfocus = () => {
            openCustomerMenu(customerSearchInput.value);
        };

        customerSearchInput.oninput = () => {
            openCustomerMenu(customerSearchInput.value);
        };

        customerSearchInput.onkeydown = (e) => {
            if (e.key === 'Escape') {
                closeCustomerMenu();
            }
        };

        customerSearchInput.onblur = () => {
            const typed = customerSearchInput.value.trim();
            if (typed) {
                const cur = customerDatabase[customerSelect.value];
                if (!cur || cur.name !== typed) {
                    const keys = Object.keys(customerDatabase);
                    const foundKey = keys.find(k => customerDatabase[k]?.name?.toLowerCase() === typed.toLowerCase());
                    if (foundKey) {
                        selectCustomerItem(foundKey);
                    } else {
                        window._customCustomerName = typed;
                    }
                }
            }
        };
    }
    setupCustomerDropdown();

    // Global Products Cache for Searchable Dropdown & Autocomplete
    let globalProductsList = [];
    let productsLoadedPromise = fetch('/api/products')
        .then(r => r.ok ? r.json() : [])
        .then(products => {
            globalProductsList = products || [];
            return globalProductsList;
        })
        .catch(err => {
            console.warn('Could not load products:', err);
            return [];
        });

    function setupProductDropdown(tr) {
        const wrap = tr.querySelector('.item-name-wrap');
        if (!wrap) return;

        const input = wrap.querySelector('.item-name');
        if (!input) return;

        // Ensure button exists
        let btn = wrap.querySelector('.btn-item-dropdown');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-item-dropdown';
            btn.tabIndex = -1;
            btn.title = 'เลือกสินค้าจากรายการ';

            const existingIcon = wrap.querySelector('.item-dropdown-icon');
            if (existingIcon) {
                existingIcon.remove();
            }
            btn.innerHTML = `
                <svg class="item-dropdown-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            wrap.appendChild(btn);
        }

        // Ensure dropdown menu exists
        let menu = wrap.querySelector('.product-dropdown-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.className = 'product-dropdown-menu';
            menu.style.display = 'none';
            wrap.appendChild(menu);
        }

        function renderList(query = '') {
            const q = (query || '').trim().toLowerCase();
            let filtered = globalProductsList;
            if (q) {
                filtered = globalProductsList.filter(p => 
                    (p.name && p.name.toLowerCase().includes(q)) ||
                    (p.code && p.code.toLowerCase().includes(q)) ||
                    (p.category && p.category.toLowerCase().includes(q))
                );
            }

            if (!filtered || filtered.length === 0) {
                menu.innerHTML = `<div class="product-dropdown-empty">ไม่พบสินค้าที่ตรงกับคำค้นหา ${query ? `"${escapeHtml(query)}"` : ''}</div>`;
                return;
            }

            const displayItems = filtered.slice(0, 50);
            menu.innerHTML = displayItems.map((p, idx) => `
                <div class="product-dropdown-item" data-idx="${idx}">
                    <div class="product-item-main">
                        <div class="product-item-title">${escapeHtml(p.name)}</div>
                        <div class="product-item-meta">
                            <span class="product-item-code">${escapeHtml(p.code || '')}</span>
                            ${p.category ? `<span class="product-item-category">• ${escapeHtml(p.category)}</span>` : ''}
                        </div>
                    </div>
                    <div class="product-item-side">
                        <span class="product-item-price">฿${Number(p.unit_price || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                        <span class="product-item-unit">${escapeHtml(p.unit || 'ชิ้น')}</span>
                    </div>
                </div>
            `).join('');

            menu.querySelectorAll('.product-dropdown-item').forEach((itemEl, idx) => {
                const itemData = displayItems[idx];
                itemEl.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectItem(itemData);
                });
            });
        }

        function selectItem(p) {
            input.value = p.name;
            tr.dataset.productId = p.id || '';
            tr.dataset.productName = p.name || '';
            const unitInput = tr.querySelector('.item-unit');
            const priceInput = tr.querySelector('.item-price');
            const descInput = tr.querySelector('.item-desc');

            if (unitInput && p.unit) unitInput.value = p.unit;
            if (priceInput && (p.unit_price !== undefined)) priceInput.value = p.unit_price;
            if (descInput && p.description) descInput.value = p.description;

            closeMenu();
            calculateAll();
        }

        function openMenu(query = '') {
            if (customerDropdownMenu) customerDropdownMenu.style.display = 'none';
            if (btnCustomerDropdown) btnCustomerDropdown.classList.remove('active');

            document.querySelectorAll('.product-dropdown-menu').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });
            document.querySelectorAll('.btn-item-dropdown').forEach(b => {
                if (b !== btn) b.classList.remove('active');
            });

            if (globalProductsList.length === 0 && productsLoadedPromise) {
                menu.innerHTML = `<div class="product-dropdown-loading">กำลังโหลดรายการสินค้า...</div>`;
                menu.style.display = 'flex';
                btn.classList.add('active');
                productsLoadedPromise.then(() => {
                    renderList(query);
                });
                return;
            }

            renderList(query);
            menu.style.display = 'flex';
            btn.classList.add('active');
        }

        function closeMenu() {
            menu.style.display = 'none';
            btn.classList.remove('active');
        }

        function toggleMenu() {
            if (menu.style.display === 'flex') {
                closeMenu();
            } else {
                openMenu('');
            }
        }

        btn.onclick = (e) => {
            e.stopPropagation();
            toggleMenu();
        };

        input.onfocus = () => {
            openMenu(input.value);
        };

        input.oninput = () => {
            if (tr.dataset.productName && input.value.trim() !== tr.dataset.productName.trim()) {
                tr.dataset.productId = '';
            }
            openMenu(input.value);
            calculateAll();
        };

        input.onkeydown = (e) => {
            if (e.key === 'Escape') {
                closeMenu();
            }
        };
    }

    function setupRowListeners(tr) {
        setupProductDropdown(tr);

        // Delete button
        const delBtn = tr.querySelector('.btn-del-row');
        if (delBtn) {
            delBtn.onclick = () => {
                const allRows = itemsTbody.querySelectorAll('.item-row');
                if (allRows.length > 1) {
                    tr.remove();
                    updateRowNumbers();
                    calculateAll();
                } else {
                    showDocToast({
                        type: 'warning',
                        title: 'แจ้งเตือน',
                        message: 'ต้องมีรายการสินค้า/บริการอย่างน้อย 1 รายการ',
                        duration: 3000
                    });
                }
            };
        }

        // Calculation on all inputs
        const inputs = tr.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', calculateAll);
            input.addEventListener('change', calculateAll);
        });
    }

    // Initialize rows in table
    const urlParams = new URLSearchParams(window.location.search);
    const hasIdOrRef = urlParams.has('id') || urlParams.has('doc') || urlParams.has('num') || urlParams.has('ref') || urlParams.has('copy');
    const hasPrefill = urlParams.has('prefill_hmp');

    if (itemsTbody) {
        if (!hasIdOrRef && !hasPrefill) {
            // New blank document: start with a single clean blank row
            itemsTbody.innerHTML = '';
            createRow('', '', 1, 'ชิ้น', 0);
        } else {
            itemsTbody.querySelectorAll('.item-row').forEach(tr => {
                setupRowListeners(tr);
            });
        }
    }

    // Close any open product or customer menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.item-name-wrap')) {
            document.querySelectorAll('.product-dropdown-menu').forEach(m => m.style.display = 'none');
            document.querySelectorAll('.btn-item-dropdown').forEach(b => b.classList.remove('active'));
        }
        if (!e.target.closest('.customer-dropdown-wrap')) {
            document.querySelectorAll('.customer-dropdown-menu').forEach(m => m.style.display = 'none');
            document.querySelectorAll('.btn-customer-dropdown').forEach(b => b.classList.remove('active'));
        }
    });

    // 1. Dynamic Row Additions
    function createRow(name = '', desc = '', qty = 1, unit = 'ชิ้น', price = 0, productId = null) {
        const tr = document.createElement('tr');
        tr.className = 'item-row';
        if (productId) {
            tr.dataset.productId = productId;
            tr.dataset.productName = name;
        }
        tr.innerHTML = `
            <td class="col-no text-center"><span class="row-num">1</span></td>
            <td class="col-desc">
                <div class="item-name-wrap">
                    <input type="text" class="table-input item-name" placeholder="ค้นหาหรือพิมพ์ชื่อสินค้า..." value="${escapeHtml(name)}" autocomplete="off">
                    <button type="button" class="btn-item-dropdown" tabindex="-1" title="เลือกสินค้าจากรายการ">
                        <svg class="item-dropdown-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="product-dropdown-menu" style="display: none;"></div>
                </div>
                <textarea class="table-textarea item-desc" placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)">${escapeHtml(desc)}</textarea>
            </td>
            <td class="col-qty">
                <input type="number" class="table-input item-qty text-right" min="0" step="any" value="${qty}">
            </td>
            <td class="col-unit">
                <input type="text" class="table-input item-unit text-center" value="${escapeHtml(unit)}">
            </td>
            <td class="col-price">
                <input type="number" class="table-input item-price text-right" min="0" step="0.01" value="${price}">
            </td>
            <td class="col-total text-right">
                <strong class="item-line-total">0.00</strong>
            </td>
            <td class="col-del text-center">
                <button type="button" class="btn-del-row" title="ลบแถวนี้">&times;</button>
            </td>
        `;

        setupRowListeners(tr);
        itemsTbody.appendChild(tr);
        updateRowNumbers();
        calculateAll();
        return tr;
    }

    if (btnAddItem) {
        btnAddItem.addEventListener('click', () => {
            createRow('', '', 1, 'ชิ้น', 0);
        });
    }

    if (btnAddService) {
        btnAddService.addEventListener('click', () => {
            createRow('', '', 1, 'งาน', 0);
        });
    }

    function updateRowNumbers() {
        const rows = itemsTbody.querySelectorAll('.item-row');
        rows.forEach((row, index) => {
            const numSpan = row.querySelector('.row-num');
            if (numSpan) numSpan.textContent = index + 1;
        });
    }

    // 2. Calculations Engine
    function calculateAll() {
        const rows = itemsTbody.querySelectorAll('.item-row');
        let subtotal = 0;

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
            const price = parseFloat(row.querySelector('.item-price').value) || 0;
            const lineTotal = Math.max(0, qty * price);
            row.querySelector('.item-line-total').textContent = lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            subtotal += lineTotal;
        });

        if (subtotalDisplay) {
            subtotalDisplay.textContent = subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Global discount
        const discType = discountTypeSelect?.value || 'fixed';
        const discVal = parseFloat(discountValueInput?.value) || 0;
        let discountAmt = 0;
        if (discType === 'percent') {
            discountAmt = (subtotal * discVal) / 100;
        } else {
            discountAmt = discVal;
        }
        if (discountAmountDisplay) {
            discountAmountDisplay.textContent = discountAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const afterDiscount = Math.max(0, subtotal - discountAmt);
        const afterDiscountDisplay = document.getElementById('afterDiscountDisplay');
        if (afterDiscountDisplay) {
            afterDiscountDisplay.textContent = afterDiscount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // VAT with Checkbox
        const chkVatEnabled = document.getElementById('chkVatEnabled');
        const isVatEnabled = chkVatEnabled ? chkVatEnabled.checked : true;
        if (vatTypeSelect) {
            vatTypeSelect.disabled = !isVatEnabled;
        }

        const vatType = isVatEnabled ? (vatTypeSelect?.value || 'exclude') : 'none';
        let vatAmt = 0;
        let netTotal = afterDiscount;

        if (vatType === 'exclude') {
            // Price excludes VAT -> Add 7%
            vatAmt = afterDiscount * 0.07;
            netTotal = afterDiscount + vatAmt;
        } else if (vatType === 'include') {
            // Price includes VAT -> extract VAT
            vatAmt = afterDiscount - (afterDiscount / 1.07);
            netTotal = afterDiscount;
        } else {
            // No VAT
            vatAmt = 0;
            netTotal = afterDiscount;
        }

        if (vatAmountDisplay) {
            vatAmountDisplay.textContent = vatAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const totalWithVatDisplay = document.getElementById('totalWithVatDisplay');
        if (totalWithVatDisplay) {
            totalWithVatDisplay.textContent = netTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Withholding Tax (WHT) with Checkbox
        const chkWhtEnabled = document.getElementById('chkWhtEnabled');
        const isWhtEnabled = chkWhtEnabled ? chkWhtEnabled.checked : true;
        if (whtTypeSelect) {
            whtTypeSelect.disabled = !isWhtEnabled;
        }

        const whtRate = isWhtEnabled ? (parseFloat(whtTypeSelect?.value) || 0) : 0;
        const preVatBase = vatType === 'include' ? (afterDiscount - vatAmt) : afterDiscount;
        const whtAmt = (preVatBase * whtRate) / 100;
        if (whtAmountDisplay) {
            whtAmountDisplay.textContent = (whtAmt > 0 ? '-' : '') + whtAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Grand Total to Pay (ยอดชำระสุทธิ)
        const netPayment = Math.max(0, netTotal - whtAmt);
        if (grandTotalDisplay) {
            grandTotalDisplay.textContent = '฿ ' + netPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Convert Grand Total to Thai Baht Words
        if (thaiBahtTextDisplay) {
            thaiBahtTextDisplay.textContent = '(' + arabicToThaiBahtText(netPayment) + ')';
        }
    }

    // Event listeners for global calc controls
    const chkVat = document.getElementById('chkVatEnabled');
    const chkWht = document.getElementById('chkWhtEnabled');
    [discountTypeSelect, discountValueInput, vatTypeSelect, whtTypeSelect, chkVat, chkWht].forEach(el => {
        if (el) {
            el.addEventListener('input', calculateAll);
            el.addEventListener('change', calculateAll);
        }
    });

    // Discount Popover handlers
    const btnEditDiscount = document.getElementById('btnEditDiscount');
    const discountPopover = document.getElementById('discountPopover');
    const btnCloseDiscountPopover = document.getElementById('btnCloseDiscountPopover');

    if (btnEditDiscount && discountPopover) {
        btnEditDiscount.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = discountPopover.style.display === 'block';
            discountPopover.style.display = isOpen ? 'none' : 'block';
            if (!isOpen && discountValueInput) {
                discountValueInput.focus();
                discountValueInput.select();
            }
        });
    }

    if (btnCloseDiscountPopover && discountPopover) {
        btnCloseDiscountPopover.addEventListener('click', (e) => {
            e.stopPropagation();
            discountPopover.style.display = 'none';
            calculateAll();
        });
    }

    document.addEventListener('click', (e) => {
        if (discountPopover && discountPopover.style.display === 'block') {
            if (!discountPopover.contains(e.target) && !btnEditDiscount?.contains(e.target)) {
                discountPopover.style.display = 'none';
            }
        }
    });

    // 3. Thai Baht Text Converter (Iconic FlowAccount Feature)
    function arabicToThaiBahtText(num) {
        if (isNaN(num) || num === null) return 'ศูนย์บาทถ้วน';
        num = Math.round(num * 100) / 100;
        if (num <= 0) return 'ศูนย์บาทถ้วน';

        const thaiNumbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
        const thaiUnits = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

        function convertBlock(str) {
            let res = '';
            const len = str.length;
            for (let i = 0; i < len; i++) {
                const digit = parseInt(str.charAt(i), 10);
                const pos = len - i - 1;
                if (digit !== 0) {
                    const hasHigherNonZero = str.slice(0, i).split('').some(ch => ch !== '0');
                    if (pos === 0 && digit === 1 && hasHigherNonZero) {
                        res += 'เอ็ด';
                    } else if (pos === 1 && digit === 2) {
                        res += 'ยี่สิบ';
                    } else if (pos === 1 && digit === 1) {
                        res += 'สิบ';
                    } else {
                        res += thaiNumbers[digit] + thaiUnits[pos];
                    }
                }
            }
            return res;
        }

        const parts = num.toFixed(2).split('.');
        let integerPart = parts[0];
        let satangPart = parts[1];

        let result = '';
        if (parseInt(integerPart, 10) === 0) {
            result = 'ศูนย์บาท';
        } else {
            if (integerPart.length > 6) {
                const millions = integerPart.substring(0, integerPart.length - 6);
                integerPart = integerPart.substring(integerPart.length - 6);
                result += convertBlock(millions) + 'ล้าน';
            }
            result += convertBlock(integerPart) + 'บาท';
        }

        if (parseInt(satangPart, 10) === 0) {
            result += 'ถ้วน';
        } else {
            result += convertBlock(satangPart) + 'สตางค์';
        }

        return result;
    }

    // 4. Action Buttons (Save / Preview / Print)
    // 4. Action Buttons (Save / Preview / Print)
    const btnPreview = document.getElementById('btnPrintPreview');
    const btnSaveDraft = document.getElementById('btnSaveDraft');
    const btnSaveApprove = document.getElementById('btnSaveApprove');

    if (btnPreview) {
        btnPreview.addEventListener('click', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const id = currentLoadedDocId || urlParams.get('id') || urlParams.get('doc') || urlParams.get('num');
            if (id) {
                window.open(`print.html?id=${encodeURIComponent(id)}`, '_blank');
            } else {
                window.print();
            }
        });
    }

    // Helper: Determine doc type
    function getDocType() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('cash-sale')) return 'CASH_SALE';
        if (path.includes('purchase-order')) return 'PURCHASE_ORDER';
        if (path.includes('billing')) return 'BILLING_NOTE';
        if (path.includes('cash-invoice')) return 'RECEIPT';
        if (path.includes('receipt')) return 'RECEIPT';
        if (path.includes('invoice')) return 'TAX_INVOICE';
        return 'QUOTATION';
    }
    window.getDocType = getDocType;


    function getListPage() {
        const type = getDocType();
        if (type === 'CASH_SALE') return 'cash-sales.html';
        if (type === 'PURCHASE_ORDER') return 'purchase-orders.html';
        if (type === 'BILLING_NOTE') return 'billing-notes.html';
        if (type === 'TAX_INVOICE') return 'invoices.html';
        if (type === 'RECEIPT') return 'receipts.html';
        return 'quotations.html';
    }

    function getPaymentChannelTerm() {
        if (customerCreditTerms) {
            return customerCreditTerms.value.trim();
        }
        const receiptChannelSelect = document.getElementById('receiptChannelSelect');
        const receiptAccountInput = document.getElementById('receiptAccountInput');
        if (receiptChannelSelect) {
            const ch = receiptChannelSelect.value;
            let channelLabel = 'โอนเงินผ่านธนาคาร';
            if (ch === 'CHEQUE') channelLabel = 'เช็คธนาคาร';
            else if (ch === 'CASH') channelLabel = 'เงินสด';
            else if (ch === 'CREDIT') channelLabel = 'บัตรเครดิต';
            const acc = receiptAccountInput?.value?.trim() || '';
            return acc ? `${channelLabel} (${acc})` : channelLabel;
        }
        const paymentMethodSelect = document.getElementById('paymentMethodSelect');
        if (paymentMethodSelect) {
            const pm = paymentMethodSelect.value;
            if (pm === 'TRANSFER') return 'โอนเงินผ่านธนาคาร';
            if (pm === 'CREDIT_CARD') return 'บัตรเครดิต';
            return 'เงินสด (Cash)';
        }
        return '';
    }

    function restorePaymentChannelControls(doc) {
        if (!doc) return;
        const termStr = String(doc.payment_method || doc.credit_terms || '').trim();
        if (customerCreditTerms && doc.credit_terms) {
            customerCreditTerms.value = doc.credit_terms;
        }
        const receiptChannelSelect = document.getElementById('receiptChannelSelect');
        const receiptAccountInput = document.getElementById('receiptAccountInput');
        if (receiptChannelSelect && termStr) {
            if (termStr.includes('เช็ค') || termStr.toUpperCase().includes('CHEQUE')) {
                receiptChannelSelect.value = 'CHEQUE';
            } else if (termStr.includes('เงินสด') || termStr.toUpperCase().includes('CASH')) {
                receiptChannelSelect.value = 'CASH';
            } else if (termStr.includes('บัตรเครดิต') || termStr.toUpperCase().includes('CREDIT')) {
                receiptChannelSelect.value = 'CREDIT';
            } else {
                receiptChannelSelect.value = 'TRANSFER';
            }
            if (receiptAccountInput) {
                const match = termStr.match(/\((.+)\)$/);
                if (match && match[1]) {
                    receiptAccountInput.value = match[1].trim();
                }
            }
        }
        const paymentMethodSelect = document.getElementById('paymentMethodSelect');
        if (paymentMethodSelect && termStr) {
            if (termStr.includes('โอน') || termStr.toUpperCase().includes('TRANSFER')) {
                paymentMethodSelect.value = 'TRANSFER';
            } else if (termStr.includes('บัตรเครดิต') || termStr.toUpperCase().includes('CREDIT')) {
                paymentMethodSelect.value = 'CREDIT_CARD';
            } else {
                paymentMethodSelect.value = 'CASH';
            }
        }
    }

    async function saveDocument(targetStatus = 'WAITING') {
        const docNumberInput = document.querySelector('.meta-field-row input[placeholder*="เลขที่"], .meta-field-row input[readonly]') || document.querySelector('.meta-field-row input[type="text"]');
        const issueDate = document.getElementById('issueDateInput')?.value || document.querySelectorAll('.meta-field-row input[type="date"]')[0]?.value || new Date().toISOString().split('T')[0];
        const dueDate = document.getElementById('dueDateInput')?.value || document.querySelectorAll('.meta-field-row input[type="date"]')[1]?.value || null;

        // Check if there is a reference input
        const refDocNumber = document.getElementById('refDocNumberInput')?.value || null;

        let custName = customerSearchInput?.value?.trim() || customerSelect?.options[customerSelect.selectedIndex]?.text || '';
        if (!custName || custName.startsWith('--')) {
            const entry = customerDatabase[customerSelect?.value];
            custName = entry?.name || (window._sourceCustomerName || 'ลูกค้าทั่วไป');
        }
        const selectedKey = customerSelect?.value || '';
        const custId = (!isNaN(selectedKey) && selectedKey !== '') ? Number(selectedKey) : (window._sourceCustomerId || null);

        const custAddress = customerAddress?.value || '';
        const custTaxId = customerTaxId?.value || '';
        const custBranch = customerBranch?.value || 'สำนักงานใหญ่';
        const custPhone = customerPhone?.value || '';
        const custContact = customerContact?.value || '';

        // Collect rows
        const rows = itemsTbody.querySelectorAll('.item-row');
        const items = [];
        rows.forEach(r => {
            const name = r.querySelector('.item-name')?.value || '';
            const desc = r.querySelector('.item-desc')?.value || '';
            const qty = parseFloat(r.querySelector('.item-qty')?.value) || 1;
            const unit = r.querySelector('.item-unit')?.value || 'ชิ้น';
            const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
            const disc = 0;
            const vat = (vatTypeSelect?.value === 'none') ? 0 : 7;
            const total = Math.max(0, qty * price);

            if (name) {
                items.push({
                    product_id: r.dataset.productId ? Number(r.dataset.productId) : null,
                    item_name: name,
                    description: desc,
                    quantity: qty,
                    unit: unit,
                    unit_price: price,
                    discount: disc,
                    vat_rate: vat,
                    total_amount: total
                });
            }
        });

        const subtotal = parseFloat(subtotalDisplay?.textContent?.replace(/,/g, '')) || 0;
        const discountAmt = parseFloat(discountAmountDisplay?.textContent?.replace(/,/g, '')) || 0;
        const vatAmt = parseFloat(vatAmountDisplay?.textContent?.replace(/,/g, '')) || 0;
        const whtAmt = parseFloat(whtAmountDisplay?.textContent?.replace(/,/g, '')) || 0;
        const totalWithVatEl = document.getElementById('totalWithVatDisplay');
        const totalWithVatStr = totalWithVatEl?.textContent?.replace(/฿|,|\s/g, '') || '0';
        const totalWithVat = parseFloat(totalWithVatStr) || (subtotal - discountAmt + (document.getElementById('chkVatEnabled')?.checked && vatTypeSelect?.value === 'exclude' ? vatAmt : 0));
        const grandTotalStr = grandTotalDisplay?.textContent?.replace(/฿|,|\s/g, '') || '0';
        const netPayment = parseFloat(grandTotalStr) || Math.max(0, totalWithVat - whtAmt);

        const projectName = document.getElementById('projectNameInput')?.value?.trim() || null;
        const validUntil = document.getElementById('validUntilInput')?.value || dueDate || null;
        const spVal = (getSalespersonElement()?.value || '').trim();
        const salesperson = (spVal === '__custom__' || !spVal) ? '' : spVal;

        const creditTermsVal = getPaymentChannelTerm();
        const creditDaysVal = parseInt(creditTermsVal.match(/\d+/)?.[0]) || 30;

        const docType = getDocType();
        const payload = {
            doc_type: docType,
            doc_number: targetStatus === 'DRAFT' ? null : (docNumberInput?.value || null),
            issue_date: issueDate,
            due_date: dueDate || validUntil,
            valid_until: validUntil,
            credit_terms: creditTermsVal,
            payment_method: creditTermsVal,
            credit_days: creditDaysVal,
            project_name: projectName,
            ref_doc_number: refDocNumber,
            customer_id: custId,
            customer_name: custName.replace(/^--.*--$/, 'ลูกค้าทั่วไป'),
            customer_address: custAddress,
            customer_tax_id: custTaxId,
            customer_branch: custBranch,
            customer_phone: custPhone,
            customer_contact: custContact,
            source_doc_id: window._sourceDocId || null,
            salesperson: salesperson,
            subtotal: subtotal,
            discount_type: discountTypeSelect?.value || 'fixed',
            discount_value: parseFloat(discountValueInput?.value) || 0,
            discount_amount: discountAmt,
            vat_type: (document.getElementById('chkVatEnabled')?.checked ? (vatTypeSelect?.value || 'exclude') : 'none'),
            vat_amount: (document.getElementById('chkVatEnabled')?.checked ? vatAmt : 0),
            wht_type: (document.getElementById('chkWhtEnabled')?.checked ? (whtTypeSelect?.value || '3') : '0'),
            wht_rate: (document.getElementById('chkWhtEnabled')?.checked ? (parseFloat(whtTypeSelect?.value) || 0) : 0),
            wht_amount: (document.getElementById('chkWhtEnabled')?.checked ? Math.abs(whtAmt) : 0),
            grand_total: totalWithVat,
            status: targetStatus,
            remarks: (document.getElementById('chkShowRemarksOnDoc')?.checked === false) ? '' : (document.getElementById('docRemarks')?.value || document.querySelector('.remarks-textarea')?.value || ''),
            terms: document.getElementById('docInternalNotes')?.value || '',
            items: items
        };

        const targetList = getListPage();
        const urlParams = new URLSearchParams(window.location.search);
        const docId = currentLoadedDocId || urlParams.get('id');
        const apiMethod = docId ? 'PUT' : 'POST';
        const apiUrl = docId ? `/api/documents/${docId}` : '/api/documents';

        const statusMap = {
            'DRAFT': 'ฉบับร่าง',
            'WAITING_APPROVAL': 'รออนุมัติ',
            'APPROVED': 'อนุมัติแล้ว',
            'ISSUED': 'รอชำระ',
            'PAID': 'ชำระแล้ว',
            'COMPLETED': 'ดำเนินการแล้ว',
            'CANCELLED': 'ยกเลิก'
        };

        function setSavingState(isSaving) {
            const btnSaveDraft = document.getElementById('btnSaveDraft');
            const btnSaveApprove = document.getElementById('btnSaveApprove');
            const btnSaveSubmit = document.getElementById('btnSaveSubmit');
            [btnSaveDraft, btnSaveApprove, btnSaveSubmit].forEach(btn => {
                if (btn) {
                    btn.disabled = isSaving;
                    btn.style.opacity = isSaving ? '0.6' : '1';
                    btn.style.cursor = isSaving ? 'wait' : 'pointer';
                }
            });
        }

        setSavingState(true);

        try {
            const res = await fetch(apiUrl, {
                method: apiMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                const displayStatus = statusMap[data.status] || data.status;
                const savedId = data.id || docId;
                showDocToast({
                    type: 'success',
                    title: 'บันทึกเอกสารสำเร็จ!',
                    message: 'ระบบได้บันทึกข้อมูลเรียบร้อยแล้ว',
                    docNumber: data.doc_number || '(ฉบับร่าง)',
                    grandTotal: Number(data.grand_total !== undefined ? data.grand_total : payload.grand_total),
                    status: data.status || targetStatus,
                    statusText: displayStatus,
                    docId: savedId,
                    redirectUrl: targetList,
                    duration: 3200
                });
                return;
            } else {
                setSavingState(false);
                const errData = await res.json().catch(() => ({}));
                showDocToast({
                    type: 'error',
                    title: 'ไม่สามารถบันทึกเอกสารได้',
                    message: 'ไม่สามารถบันทึกเอกสารได้: ' + (errData.error || 'กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง'),
                    duration: 4500
                });
                return;
            }
        } catch (err) {
            setSavingState(false);
            showDocToast({
                type: 'error',
                title: 'ไม่สามารถบันทึกเอกสารได้',
                message: 'ไม่สามารถบันทึกเอกสารได้: ' + (err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ'),
                duration: 4500
            });
        }
    }

    const btnSaveSubmit = document.getElementById('btnSaveSubmit');
    if (btnSaveSubmit) {
        btnSaveSubmit.addEventListener('click', () => saveDocument('WAITING_APPROVAL'));
    }

    if (btnSaveDraft) {
        btnSaveDraft.addEventListener('click', () => saveDocument('DRAFT'));
    }

    if (btnSaveApprove) {
        btnSaveApprove.addEventListener('click', () => {
            const type = getDocType();
            let targetStatus = 'ISSUED';
            if (type === 'QUOTATION' || type === 'PURCHASE_ORDER') targetStatus = 'WAITING_APPROVAL';
            else if (type === 'RECEIPT' || type === 'CASH_SALE') targetStatus = 'PAID';
            saveDocument(targetStatus);
        });
    }

    // Due Date & Validity Helper (Auto-calculates from credit terms or presets)
    const issueDateInput = document.getElementById('issueDateInput');
    const dueDateInput = document.getElementById('dueDateInput');
    const validUntilInput = document.getElementById('validUntilInput');
    const validPresetSelect = document.getElementById('validPresetSelect');

    function updateDueDateFromCredit() {
        const targetDateInput = dueDateInput || validUntilInput;
        if (!targetDateInput) return;

        if (issueDateInput && !issueDateInput.value) {
            issueDateInput.value = new Date().toISOString().split('T')[0];
        }
        const baseDate = (issueDateInput && issueDateInput.value) ? new Date(issueDateInput.value) : new Date();

        let days = 30; // ค่าเริ่มต้น 30 วัน
        const creditVal = (customerCreditTerms?.value || '').trim();
        const match = creditVal.match(/(\d+)/);
        if (match) {
            days = parseInt(match[1], 10);
        } else if (creditVal.includes('สด') || creditVal.includes('ทันที')) {
            days = 0;
        } else if (validPresetSelect) {
            days = parseInt(validPresetSelect.value, 10) || 30;
        }

        baseDate.setDate(baseDate.getDate() + days);
        const formattedDate = baseDate.toISOString().split('T')[0];
        targetDateInput.value = formattedDate;
        if (dueDateInput && validUntilInput) validUntilInput.value = formattedDate;
    }

    if (issueDateInput && !issueDateInput.value) {
        issueDateInput.value = new Date().toISOString().split('T')[0];
    }
    updateDueDateFromCredit();

    if (issueDateInput) {
        issueDateInput.addEventListener('change', updateDueDateFromCredit);
    }
    if (customerCreditTerms) {
        customerCreditTerms.addEventListener('input', updateDueDateFromCredit);
        customerCreditTerms.addEventListener('change', updateDueDateFromCredit);
    }
    if (validPresetSelect) {
        validPresetSelect.addEventListener('change', updateDueDateFromCredit);
    }

    // =========================================================================
    // Google Calendar Style Date Picker (Loaded via modules/doc-datepicker.js)
    // =========================================================================
    if (typeof window.initGoogleCalendarDatePicker === 'function') {
        window.initGoogleCalendarDatePicker();
    }

    window.applyRefSplitOrDeposit = function(mode = 'percent', value = 50) {
        const refDoc = window._refOriginalDoc;
        if (!refDoc || !itemsTbody) return;
        const urlParams = new URLSearchParams(window.location.search);
        const isDeposit = urlParams.get('deposit') === 'true';
        const labelType = isDeposit ? 'มัดจำ' : 'แบ่งชำระงวด';
        const origItems = Array.isArray(refDoc.items) ? refDoc.items : [];

        itemsTbody.innerHTML = '';

        if (mode === 'amount') {
            const customAmt = Math.max(0, parseFloat(value) || 0);
            const descLines = origItems.map(it => `- ${it.item_name || ''} (${it.quantity || 1} ${it.unit || 'ชิ้น'})`).filter(Boolean);
            const row = createRow(
                `ค่า${labelType}ตามเอกสารอ้างอิง ${refDoc.doc_number || ''}`,
                descLines.join('\n'),
                1,
                'งวด',
                customAmt,
                null
            );
            const descArea = row.querySelector('.item-desc');
            if (descArea && descLines.length > 0) {
                descArea.style.height = 'auto';
                descArea.style.height = Math.max(36, descArea.scrollHeight) + 'px';
            }
            if (discountValueInput) discountValueInput.value = 0;
        } else {
            const pct = Math.max(1, Math.min(100, parseFloat(value) || 50));
            const pctInput = document.getElementById('splitPercentInput');
            if (pctInput) pctInput.value = pct;
            const ratio = pct / 100;

            origItems.forEach(it => {
                const origName = it.item_name || '';
                const suffix = pct < 100 ? ` (${labelType} ${pct}% อ้างอิง ${refDoc.doc_number || ''})` : '';
                const newPrice = Math.round((parseFloat(it.unit_price) || 0) * ratio * 100) / 100;
                const row = createRow(
                    origName + suffix,
                    it.description || '',
                    it.quantity || 1,
                    it.unit || 'ชิ้น',
                    newPrice,
                    it.product_id || null
                );
                const descArea = row.querySelector('.item-desc');
                if (descArea && it.description) {
                    descArea.style.height = 'auto';
                    descArea.style.height = Math.max(36, descArea.scrollHeight) + 'px';
                }
            });

            if (discountValueInput && refDoc.discount_value !== undefined) {
                if (refDoc.discount_type === 'percent') {
                    discountValueInput.value = refDoc.discount_value;
                } else {
                    discountValueInput.value = Math.round((parseFloat(refDoc.discount_value) || 0) * ratio * 100) / 100;
                }
            }
        }
        calculateAll();
    };

    function renderLinkedDocBanner(refDoc, opts = {}) {
        const toolbar = document.querySelector('.editor-toolbar');
        const oldBanner = document.getElementById('linkedDocBanner');
        if (oldBanner) oldBanner.remove();

        let badgeHtml = '';
        if (opts.isSplit) {
            badgeHtml = '<span style="background: #fef3c7; color: #b45309; padding: 3px 9px; border-radius: 999px; font-weight: 600; font-size: 11.5px; border: 1px solid #fde68a;">แบ่งจ่ายตามงวด</span>';
        } else if (opts.isDeposit) {
            badgeHtml = '<span style="background: #e0f2fe; color: #0369a1; padding: 3px 9px; border-radius: 999px; font-weight: 600; font-size: 11.5px; border: 1px solid #bae6fd;">เงินมัดจำ</span>';
        }

        let splitControlsHtml = '';
        if (opts.isSplit || opts.isDeposit) {
            const defaultPct = parseFloat(new URLSearchParams(window.location.search).get('percent')) || 50;
            const defaultAmt = Math.round((parseFloat(refDoc.subtotal || refDoc.grand_total) || 0) * (defaultPct / 100) * 100) / 100;
            splitControlsHtml = `
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: #ffffff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 5px 10px; margin-left: 6px;">
                    <span style="font-size: 12px; font-weight: 600; color: #1e3a8a;">สัดส่วน${opts.isDeposit ? 'มัดจำ' : 'แบ่งชำระ'}:</span>
                    <button type="button" onclick="window.applyRefSplitOrDeposit('percent', 30)" style="padding: 2px 8px; font-size: 11.5px; border-radius: 4px; border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; cursor: pointer; font-weight: 600;">30%</button>
                    <button type="button" onclick="window.applyRefSplitOrDeposit('percent', 50)" style="padding: 2px 8px; font-size: 11.5px; border-radius: 4px; border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; cursor: pointer; font-weight: 600;">50%</button>
                    <button type="button" onclick="window.applyRefSplitOrDeposit('percent', 100)" style="padding: 2px 8px; font-size: 11.5px; border-radius: 4px; border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; cursor: pointer; font-weight: 600;">100%</button>
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <input type="number" id="splitPercentInput" value="${defaultPct}" min="1" max="100" step="1" style="width: 56px; padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: right;">
                        <span style="font-size: 12px;">%</span>
                        <button type="button" onclick="window.applyRefSplitOrDeposit('percent', document.getElementById('splitPercentInput').value)" style="padding: 2px 8px; font-size: 11.5px; border-radius: 4px; border: none; background: #2563eb; color: #fff; cursor: pointer; font-weight: 600;">คำนวณ %</button>
                    </div>
                    <span style="color: #cbd5e1;">|</span>
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <input type="number" id="splitAmountInput" value="${defaultAmt}" min="0" step="0.01" placeholder="ระบุยอดเงิน" style="width: 95px; padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: right;">
                        <button type="button" onclick="window.applyRefSplitOrDeposit('amount', document.getElementById('splitAmountInput').value)" style="padding: 2px 8px; font-size: 11.5px; border-radius: 4px; border: 1px solid #059669; background: #ecfdf5; color: #047857; cursor: pointer; font-weight: 600;">ใช้ยอดเงินนี้</button>
                    </div>
                </div>
            `;
        }

        const banner = document.createElement('div');
        banner.id = 'linkedDocBanner';
        banner.className = 'linked-doc-banner';
        banner.style.cssText = `
            background: #eff6ff;
            border-bottom: 1px solid #bfdbfe;
            padding: 10px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13.5px;
            color: #1e40af;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            position: relative;
            z-index: 80;
            width: 100%;
            box-sizing: border-box;
            flex-wrap: wrap;
            gap: 8px;
        `;
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="flex-shrink: 0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                <span>ดึงข้อมูลต่อเนื่องจากเอกสาร: <strong style="color: #1d4ed8;">${escapeHtml(refDoc.doc_number || '')}</strong> (ลูกค้า: <strong>${escapeHtml(refDoc.customer_name || 'ทั่วไป')}</strong>) เรียบร้อยแล้ว</span>
                ${badgeHtml}
                ${splitControlsHtml}
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                <a href="print.html?id=${refDoc.id}" target="_blank" style="color: #2563eb; font-weight: 600; text-decoration: underline; display: flex; align-items: center; gap: 4px;" title="คลิกเพื่อเปิดดูเอกสารต้นทาง">
                    ดูต้นฉบับ
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <button type="button" onclick="this.closest('#linkedDocBanner').remove()" style="background: none; border: none; cursor: pointer; color: #64748b; font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px;" title="ปิดการแจ้งเตือน">✕</button>
            </div>
        `;

        if (toolbar && toolbar.nextSibling) {
            toolbar.parentNode.insertBefore(banner, toolbar.nextSibling);
        } else if (toolbar) {
            toolbar.parentNode.appendChild(banner);
        } else {
            document.body.prepend(banner);
        }

        if (typeof showDocToast === 'function') {
            showDocToast('info', 'ดึงข้อมูลจากเอกสารอ้างอิงสำเร็จ', {
                message: `คัดลอกรายการและข้อมูลจาก ${refDoc.doc_number} เรียบร้อยแล้ว`,
                docNumber: refDoc.doc_number,
                statusText: 'เอกสารต่อเนื่อง',
                docId: refDoc.id,
                duration: 3500
            });
        }
    }

    // Helper: Pull reference document data and populate editor
    async function loadReferenceDocument(refParam) {
        if (!refParam) return null;
        try {
            let detail = null;
            // 1. Try exact match by doc_number via GET /api/documents/:id (supports doc_number directly)
            let res = await fetch(`/api/documents/${encodeURIComponent(refParam)}`);
            if (res.ok) {
                detail = await res.json();
            } else {
                // Fallback to query
                let qRes = await fetch(`/api/documents?doc_number=${encodeURIComponent(refParam)}`);
                let matches = [];
                if (qRes.ok) matches = await qRes.json();
                if (!matches || matches.length === 0) {
                    qRes = await fetch(`/api/documents?search=${encodeURIComponent(refParam)}`);
                    if (qRes.ok) matches = await qRes.json();
                }
                if (matches && matches.length > 0) {
                    const target = matches.find(m => String(m.doc_number).trim() === String(refParam).trim()) || matches[0];
                    const rDetail = await fetch(`/api/documents/${target.id}`);
                    if (rDetail.ok) detail = await rDetail.json();
                }
            }

            if (!detail) {
                console.warn('Could not find reference document:', refParam);
                return null;
            }

            window._sourceDocId = detail.id;
            window._sourceCustomerId = detail.customer_id;
            window._sourceCustomerName = detail.customer_name;
            window._refOriginalDoc = JSON.parse(JSON.stringify(detail));

            // 1. Set Reference input
            const refInput = document.getElementById('refDocNumberInput') || document.querySelector('input[placeholder*="อ้างอิง"]');
            if (refInput) {
                refInput.value = detail.doc_number;
            }

            // 2. Customer Information (Name, Address, Tax ID, Branch, Phone, Contact, Credit Terms)
            selectCustomerByNameOrId(
                detail.customer_name,
                detail.customer_id,
                detail.customer_address,
                detail.customer_tax_id,
                detail.customer_branch,
                detail.customer_phone,
                detail.customer_contact,
                detail.credit_terms
            );

            restorePaymentChannelControls(detail);

            // 3. Due Date: calculate from issue date + credit terms
            if (typeof updateDueDateFromCredit === 'function') {
                updateDueDateFromCredit();
            }

            // 4. Salesperson & Project Name
            if (detail.salesperson) {
                setSalespersonValue(detail.salesperson);
            }
            if (detail.project_name && document.getElementById('projectNameInput')) {
                document.getElementById('projectNameInput').value = detail.project_name;
            }

            // 5. Line items
            if (Array.isArray(detail.items) && detail.items.length > 0) {
                itemsTbody.innerHTML = '';
                detail.items.forEach(it => {
                    const row = createRow(
                        it.item_name || '',
                        it.description || '',
                        it.quantity || 1,
                        it.unit || 'ชิ้น',
                        it.unit_price || 0,
                        it.product_id || null
                    );
                    const descArea = row.querySelector('.item-desc');
                    if (descArea && it.description) {
                        descArea.style.height = 'auto';
                        descArea.style.height = Math.max(36, descArea.scrollHeight) + 'px';
                    }
                });
            }

            // 6. Discounts
            if (discountTypeSelect && detail.discount_type) discountTypeSelect.value = detail.discount_type;
            if (discountValueInput && detail.discount_value !== undefined) discountValueInput.value = detail.discount_value;

            // 7. VAT
            const chkVat = document.getElementById('chkVatEnabled');
            if (chkVat) {
                chkVat.checked = (detail.vat_type && detail.vat_type !== 'none');
                if (vatTypeSelect) {
                    vatTypeSelect.disabled = !chkVat.checked;
                    if (detail.vat_type && detail.vat_type !== 'none') vatTypeSelect.value = detail.vat_type;
                }
            }

            // 8. WHT
            const chkWht = document.getElementById('chkWhtEnabled');
            if (chkWht) {
                const hasWht = (parseFloat(detail.wht_rate) > 0 || parseFloat(detail.wht_amount) > 0 || (detail.wht_type && detail.wht_type !== '0'));
                chkWht.checked = hasWht;
                if (whtTypeSelect) {
                    whtTypeSelect.disabled = !hasWht;
                    if (detail.wht_type && detail.wht_type !== '0') whtTypeSelect.value = detail.wht_type;
                }
            }

            // 9. Remarks & Checkbox
            if (detail.remarks) {
                const remArea = document.getElementById('docRemarks') || document.querySelector('.remarks-textarea');
                if (remArea) remArea.value = detail.remarks;
            }
            const chkShowRemarks = document.getElementById('chkShowRemarksOnDoc');
            if (chkShowRemarks) {
                chkShowRemarks.checked = true;
            }

            // 10. Terms / Internal notes
            if (detail.terms) {
                const internalArea = document.getElementById('docInternalNotes');
                if (internalArea) internalArea.value = detail.terms;
            }

            // 11. Linked Doc Banner & Split/Deposit adjustment
            const urlParams = new URLSearchParams(window.location.search);
            const isSplit = urlParams.get('split') === 'true';
            const isDeposit = urlParams.get('deposit') === 'true';
            if (isSplit || isDeposit) {
                const initialPct = parseFloat(urlParams.get('percent')) || 50;
                window.applyRefSplitOrDeposit('percent', initialPct);
            } else {
                calculateAll();
            }
            renderLinkedDocBanner(detail, { isSplit, isDeposit });

            return detail;
        } catch (err) {
            console.error('Error loading reference document:', err);
            return null;
        }
    }

    function populateDocumentForm(doc, options = {}) {
        if (!doc) return;
        const isCopy = Boolean(options.isCopy);
        const docNumberInput = document.querySelector('.meta-field-row input[type="text"]');

        if (isCopy) {
            currentLoadedDocId = null;
            const todayStr = new Date().toISOString().split('T')[0];
            const issueEl = document.getElementById('issueDateInput') || document.querySelectorAll('.meta-field-row input[type="date"]')[0];
            if (issueEl) issueEl.value = todayStr;
        } else {
            currentLoadedDocId = doc.id;
            if (docNumberInput) docNumberInput.value = doc.doc_number || '(ฉบับร่าง)';
            if (doc.issue_date) {
                const issueEl = document.getElementById('issueDateInput') || document.querySelectorAll('.meta-field-row input[type="date"]')[0];
                const dueEl = document.getElementById('dueDateInput') || document.querySelectorAll('.meta-field-row input[type="date"]')[1];
                if (issueEl) issueEl.value = doc.issue_date;
                if (dueEl && doc.due_date) dueEl.value = doc.due_date;
            }
            if (doc.valid_until && document.getElementById('validUntilInput')) {
                document.getElementById('validUntilInput').value = doc.valid_until;
            }
        }

        if (doc.customer_name) {
            selectCustomerByNameOrId(
                doc.customer_name,
                doc.customer_id,
                doc.customer_address,
                doc.customer_tax_id,
                doc.customer_branch,
                doc.customer_phone,
                doc.customer_contact,
                doc.credit_terms
            );
        }

        restorePaymentChannelControls(doc);

        if (isCopy && typeof updateDueDateFromCredit === 'function') {
            updateDueDateFromCredit();
        }

        if (doc.ref_doc_number && !isCopy) {
            const refInput = document.getElementById('refDocNumberInput') || document.querySelector('input[placeholder*="อ้างอิง"]');
            if (refInput) refInput.value = doc.ref_doc_number;
        }
        if (doc.project_name && document.getElementById('projectNameInput')) {
            document.getElementById('projectNameInput').value = doc.project_name;
        }
        if (doc.salesperson) {
            setSalespersonValue(doc.salesperson);
        }
        if (Array.isArray(doc.items) && doc.items.length > 0) {
            itemsTbody.innerHTML = '';
            doc.items.forEach(it => {
                const tr = createRow(it.item_name || '', it.description || '', it.quantity || 1, it.unit || 'ชิ้น', it.unit_price || 0, it.product_id || null);
                const descArea = tr.querySelector('.item-desc');
                if (descArea && it.description) {
                    descArea.style.height = 'auto';
                    descArea.style.height = Math.max(36, descArea.scrollHeight) + 'px';
                }
            });
        }
        if (doc.remarks) {
            const remArea = document.getElementById('docRemarks') || document.querySelector('.remarks-textarea');
            if (remArea) remArea.value = doc.remarks;
            const chkRemarks = document.getElementById('chkShowRemarksOnDoc');
            if (chkRemarks) chkRemarks.checked = true;
        }
        if (doc.terms) {
            const internalArea = document.getElementById('docInternalNotes');
            if (internalArea) internalArea.value = doc.terms;
        }
        if (discountTypeSelect && doc.discount_type) discountTypeSelect.value = doc.discount_type;
        if (discountValueInput && doc.discount_value !== undefined) discountValueInput.value = doc.discount_value;
        const chkVat = document.getElementById('chkVatEnabled');
        if (chkVat) {
            chkVat.checked = (doc.vat_type !== 'none');
            if (vatTypeSelect) {
                vatTypeSelect.disabled = !chkVat.checked;
                if (doc.vat_type && doc.vat_type !== 'none') vatTypeSelect.value = doc.vat_type;
            }
        }
        const chkWht = document.getElementById('chkWhtEnabled');
        if (chkWht) {
            chkWht.checked = (parseFloat(doc.wht_rate) > 0 || parseFloat(doc.wht_amount) > 0 || (doc.wht_type && doc.wht_type !== '0'));
            if (whtTypeSelect) {
                whtTypeSelect.disabled = !chkWht.checked;
                if (doc.wht_type && doc.wht_type !== '0') whtTypeSelect.value = doc.wht_type;
            }
        }
        calculateAll();
    }
    window.populateDocumentForm = populateDocumentForm;

    async function syncCompanyHeaderFromApi() {
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
                detailsEl.innerHTML = `${escapeHtml(companyAddress)}<br>เลขประจำตัวผู้เสียภาษี ${escapeHtml(companyTaxId)} (สำนักงานใหญ่)<br>โทร. ${escapeHtml(companyPhone)}`;
            }

            const stampLabel = document.getElementById('companyStampLabel');
            if (stampLabel) stampLabel.textContent = companyName;
        } catch (err) {
            // Ignore fetch errors
        }
    }

    // Auto-init document info, sequence numbers, and references
    async function initEditor() {
        syncCompanyHeaderFromApi();
        const urlParams = new URLSearchParams(window.location.search);
        let docId = urlParams.get('id') || urlParams.get('doc') || urlParams.get('num') || urlParams.get('doc_number');
        const copyId = urlParams.get('copy');
        const refParam = urlParams.get('ref');
        const docNumberInput = document.querySelector('.meta-field-row input[type="text"]');

        // Ensure customer and salesperson catalogs are loaded first
        if (customersLoadedPromise) {
            await customersLoadedPromise;
        }
        if (salespersonsLoadedPromise) {
            await salespersonsLoadedPromise;
        }

        if (docId) {
            try {
                const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`);
                if (res.ok) {
                    const doc = await res.json();
                    populateDocumentForm(doc, { isCopy: false });
                    return;
                }
            } catch (err) {
                console.error('Error loading document by id:', err);
            }
        } else if (copyId) {
            try {
                const res = await fetch(`/api/documents/${encodeURIComponent(copyId)}`);
                if (res.ok) {
                    const doc = await res.json();
                    populateDocumentForm(doc, { isCopy: true });
                }
            } catch (err) {
                console.error('Error copying document by id:', err);
            }
        } else if (refParam) {
            await loadReferenceDocument(refParam);
        }

        // Fetch official next number preview for new document
        if (!docId) {
            try {
                const type = getDocType();
                const res = await fetch(`/api/documents/next-number/${type}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.nextNumber && docNumberInput) {
                        docNumberInput.value = data.nextNumber;
                    }
                }
            } catch (err) {
                console.warn('Could not peek next doc number:', err);
            }
        }

        // Prefill from Gift Set (if came from gift-sets.html or builder)
        const prefillHmp = urlParams.get('prefill_hmp');
        let selectedHamperData = null;
        try {
            const rawStored = sessionStorage.getItem('MAM_SELECTED_HAMPER');
            if (rawStored) selectedHamperData = JSON.parse(rawStored);
        } catch (e) {}

        if (!docId && !copyId && !refParam && (prefillHmp || selectedHamperData)) {
            try {
                const targetCode = prefillHmp || (selectedHamperData ? selectedHamperData.code : null);
                if (targetCode) {
                    const resHmp = await fetch(`/api/gift-sets?search=${encodeURIComponent(targetCode)}`);
                    if (resHmp.ok) {
                        const hmpList = await resHmp.json();
                        const found = hmpList.find(h => h.code === targetCode) || hmpList[0];
                        if (found) {
                            const rDet = await fetch(`/api/gift-sets/${found.id}`);
                            const hmpDet = rDet.ok ? await rDet.json() : found;
                            
                            itemsTbody.innerHTML = '';
                            const descLines = [];
                            if (hmpDet.packaging_desc) descLines.push(`บรรจุภัณฑ์: ${hmpDet.packaging_desc}`);
                            if (hmpDet.ribbon_desc) descLines.push(`โบว์ตกแต่ง: ${hmpDet.ribbon_desc}`);
                            if (Array.isArray(hmpDet.items)) {
                                hmpDet.items.forEach(it => {
                                    descLines.push(`• ${it.item_name} (${it.quantity || 1} ชิ้น)`);
                                });
                            }

                            if (productsLoadedPromise) await productsLoadedPromise;
                            const matchedHmpProd = globalProductsList.find(p => p.code === hmpDet.code || p.name === hmpDet.name);
                            createRow(
                                `[${hmpDet.code}] ${hmpDet.name}`,
                                descLines.join('\n'),
                                1,
                                'ชุด',
                                Number(hmpDet.selling_price) || 0,
                                matchedHmpProd ? matchedHmpProd.id : null
                            );
                            calculateAll();
                            sessionStorage.removeItem('MAM_SELECTED_HAMPER');
                        }
                    }
                }
            } catch (errPrefill) {
                console.warn('Could not prefill hamper into quotation:', errPrefill);
            }
        }

        if (!docId && !copyId && !refParam && !prefillHmp && !selectedHamperData) {
            // New blank document: start completely clean
            if (customerSelect) customerSelect.value = '';
            if (customerAddress) customerAddress.value = '';
            if (customerTaxId) customerTaxId.value = '';
            if (customerPhone) customerPhone.value = '';
            if (customerContact) customerContact.value = '';
            if (customerSearchInput) customerSearchInput.value = '';
            syncCustomerSearchInputValue();
            calculateAll();
        }

        // Apply default remarks and show-remarks toggle from branding settings on new documents
        if (!docId && !copyId && !refParam) {
            try {
                const remArea = document.getElementById('docRemarks') || document.querySelector('.remarks-textarea');
                const chkShow = document.getElementById('chkShowRemarksOnDoc');
                const brandingRaw = localStorage.getItem('mam_doc_branding') || localStorage.getItem('mam_document_branding');

                if (brandingRaw) {
                    const branding = JSON.parse(brandingRaw);
                    if (branding.showRemarks === false && chkShow) {
                        chkShow.checked = false;
                    } else if (branding.showRemarks !== false && chkShow) {
                        chkShow.checked = true;
                    }
                    if (branding.defaultRemarks && (branding.defaultRemarks.includes('012-3-45892-1') || branding.defaultRemarks.includes('123-4-56789-0'))) {
                        branding.defaultRemarks = '';
                        try { localStorage.setItem('mam_doc_branding', JSON.stringify(branding)); } catch(e){}
                    }
                    if (remArea) {
                        remArea.value = branding.defaultRemarks || '';
                    }
                } else {
                    if (remArea) {
                        remArea.value = '';
                    }
                }
            } catch (e) {}
        }
    }

    initEditor();

    // Allow manual entry into refDocNumberInput to pull reference data
    const refDocNumberInputEl = document.getElementById('refDocNumberInput');
    if (refDocNumberInputEl) {
        refDocNumberInputEl.addEventListener('change', async () => {
            const val = refDocNumberInputEl.value.trim();
            const urlParams = new URLSearchParams(window.location.search);
            const isEditing = currentLoadedDocId || urlParams.get('id');
            if (val && !isEditing) {
                const rows = itemsTbody ? itemsTbody.querySelectorAll('.item-row') : [];
                let hasUserData = false;
                rows.forEach(r => {
                    const name = r.querySelector('.item-name')?.value?.trim();
                    const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
                    if (name || price > 0) hasUserData = true;
                });
                if (hasUserData) {
                    if (confirm(`พบการระบุเลขที่เอกสารอ้างอิง "${val}"\nต้องการดึงข้อมูลลูกค้าและรายการสินค้าจากเอกสารนี้มาใส่แทนหรือไม่?`)) {
                        await loadReferenceDocument(val);
                    }
                } else {
                    await loadReferenceDocument(val);
                }
            }
        });
    }

    // Listen to real-time branding updates on editor
    window.addEventListener('mam:branding-updated', (e) => {
        const urlParams = new URLSearchParams(window.location.search);
        const docId = currentLoadedDocId || urlParams.get('id') || urlParams.get('doc') || urlParams.get('num');
        const refParam = urlParams.get('ref');
        if (!docId && !refParam) {
            try {
                const raw = localStorage.getItem('mam_doc_branding') || localStorage.getItem('mam_document_branding');
                const branding = (e && e.detail) ? e.detail : (raw ? JSON.parse(raw) : null);
                if (branding) {
                    const remArea = document.getElementById('docRemarks') || document.querySelector('.remarks-textarea');
                    const chkShow = document.getElementById('chkShowRemarksOnDoc');
                    if (branding.showRemarks === false && chkShow) chkShow.checked = false;
                    else if (branding.showRemarks !== false && chkShow) chkShow.checked = true;
                    if (branding.defaultRemarks !== undefined && remArea) {
                        remArea.value = branding.defaultRemarks;
                    }
                }
            } catch (err) {}
        }
    });

    // =========================================================================
    // Document Branding & Custom Settings Controller (Loaded via modules/doc-branding-modal.js)
    // =========================================================================
    if (typeof window.initBrandingManager === 'function') {
        window.initBrandingManager();
    }

    // Initialize initial calculations
    calculateAll();
});
