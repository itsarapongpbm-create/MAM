/**
 * MAM DESIGN AND SERVICE - Inventory & Stock Management Module (ERP Standards)
 * Controller for public/inventory/inventory.html
 */

let allInventory = [];
let allMovements = [];
let currentTab = 'ALL';
let currentProductToAdjust = null;
let currentAdjustMode = 'COUNT'; // 'COUNT', 'IN', 'OUT'
let currentStockCardProduct = null;
let currentStockCardList = [];
let currentPage = 1;
let rowsPerPage = 50;

document.addEventListener('DOMContentLoaded', () => {
    initInventory();
    setupEventListeners();
});

async function initInventory() {
    const urlSearch = new URLSearchParams(window.location.search).get('search');
    const searchInput = document.getElementById('searchInventoryInput');
    if (urlSearch && searchInput) {
        searchInput.value = urlSearch;
    }
    await fetchStats();
    await loadCategories();
    await fetchInventory();
}

function setupEventListeners() {
    // 1. Status Tabs
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentTab = e.currentTarget.getAttribute('data-tab') || 'ALL';
            currentPage = 1;

            const invFilters = document.getElementById('inventoryFiltersBar');
            const movFilters = document.getElementById('movementsFiltersBar');
            const invTable = document.getElementById('inventoryTableWrapper');
            const movTable = document.getElementById('movementsTableWrapper');

            if (currentTab === 'MOVEMENTS') {
                if (invFilters) invFilters.style.display = 'none';
                if (movFilters) movFilters.style.display = 'flex';
                if (invTable) invTable.style.display = 'none';
                if (movTable) movTable.style.display = 'block';
                loadGlobalMovements();
            } else {
                if (invFilters) invFilters.style.display = 'flex';
                if (movFilters) movFilters.style.display = 'none';
                if (invTable) invTable.style.display = 'block';
                if (movTable) movTable.style.display = 'none';
                renderInventoryTable();
            }
        });
    });

    // Rows Per Page
    const rowsSelect = document.getElementById('rowsPerPageSelect');
    if (rowsSelect) {
        rowsSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            rowsPerPage = val === 'ALL' ? 'ALL' : parseInt(val, 10);
            currentPage = 1;
            renderInventoryTable();
        });
    }

    // 2. Search & Category Filters (Inventory)
    const searchInput = document.getElementById('searchInventoryInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            currentPage = 1;
            if (currentTab !== 'MOVEMENTS') renderInventoryTable();
        }, 250));
    }

    const catFilter = document.getElementById('inventoryCategoryFilter');
    if (catFilter) {
        catFilter.addEventListener('change', () => {
            currentPage = 1;
            syncPillsWithCategory(catFilter.value);
            if (currentTab !== 'MOVEMENTS') renderInventoryTable();
        });
    }

    // Category Quick Pills (One-Click Category Filter)
    document.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            const cat = e.currentTarget.getAttribute('data-cat') || 'ALL';
            if (catFilter) catFilter.value = cat;
            syncPillsWithCategory(cat);
            currentPage = 1;
            if (currentTab !== 'MOVEMENTS') renderInventoryTable();
        });
    });

    // 3. Search & Type Filters (Movements)
    const searchMov = document.getElementById('searchMovementsInput');
    if (searchMov) {
        searchMov.addEventListener('input', debounce(() => {
            if (currentTab === 'MOVEMENTS') renderMovementsTable();
        }, 250));
    }

    const movTypeFilter = document.getElementById('movementTypeFilter');
    if (movTypeFilter) {
        movTypeFilter.addEventListener('change', () => {
            if (currentTab === 'MOVEMENTS') renderMovementsTable();
        });
    }

    // 4. Export Buttons
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', exportInventoryToCSV);
    }

    const btnExportMov = document.getElementById('btnExportMovements');
    if (btnExportMov) {
        btnExportMov.addEventListener('click', exportGlobalMovementsToCSV);
    }

    const btnExportCard = document.getElementById('btnExportStockCard');
    if (btnExportCard) {
        btnExportCard.addEventListener('click', exportStockCardToCSV);
    }

    // 5. Product Create / Edit Form
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', handleProductSubmit);
    }

    const priceInput = document.getElementById('productUnitPriceInput');
    const costInput = document.getElementById('productCostPriceInput');
    if (priceInput) priceInput.addEventListener('input', updateMarginPreview);
    if (costInput) costInput.addEventListener('input', updateMarginPreview);

    const imgUrlInput = document.getElementById('productImageUrlInput');
    if (imgUrlInput) {
        imgUrlInput.addEventListener('input', () => {
            const thumb = document.getElementById('productImagePreviewThumb');
            if (thumb) thumb.src = imgUrlInput.value || 'https://placehold.co/44x44?text=Img';
        });
    }

    // 6. Stock Adjust Modal Form
    const adjustForm = document.getElementById('stockAdjustForm');
    if (adjustForm) {
        adjustForm.addEventListener('submit', handleStockAdjustSubmit);
    }

    const adjustNewQty = document.getElementById('adjustNewQtyInput');
    if (adjustNewQty) adjustNewQty.addEventListener('input', updateAdjustDifference);

    const adjustAddQty = document.getElementById('adjustAddQtyInput');
    if (adjustAddQty) adjustAddQty.addEventListener('input', updateAdjustDifference);

    const adjustDeductQty = document.getElementById('adjustDeductQtyInput');
    if (adjustDeductQty) adjustDeductQty.addEventListener('input', updateAdjustDifference);

    const btnStockCardFromAdjust = document.getElementById('btnOpenStockCardFromAdjust');
    if (btnStockCardFromAdjust) {
        btnStockCardFromAdjust.addEventListener('click', () => {
            if (currentProductToAdjust) {
                const pid = currentProductToAdjust.id;
                closeAdjustModal();
                viewStockCard(pid);
            }
        });
    }

    // Close action dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-dropdown-container')) {
            document.querySelectorAll('.action-menu-dropdown').forEach(m => m.style.display = 'none');
        }
    });
}

window.toggleInventoryActionMenu = function(button, event) {
    if (event) event.stopPropagation();
    const dropdown = button.nextElementSibling;
    const isShowing = dropdown && dropdown.style.display === 'block';

    document.querySelectorAll('.action-menu-dropdown').forEach(el => {
        el.style.display = 'none';
    });

    if (dropdown && !isShowing) {
        dropdown.style.display = 'block';
    }
};

// =========================================================================
// API Fetchers
// =========================================================================

async function fetchStats() {
    try {
        const res = await fetch('/api/inventory/stats?scope=RAW');
        if (!res.ok) throw new Error('Failed to load stats');
        const stats = await res.json();

        // Update 4 Main KPI Cards
        const elValue = document.getElementById('kpiTotalStockValue');
        const elSkus = document.getElementById('kpiTotalSkus');
        const elLow = document.getElementById('kpiLowStock');
        const elOut = document.getElementById('kpiOutOfStock');

        if (elValue) elValue.textContent = `฿ ${formatNumber(stats.total_stock_value)}`;
        if (elSkus) elSkus.textContent = `${stats.total_skus || 0} รายการ`;
        if (elLow) elLow.textContent = `${stats.low_stock_count || 0} รายการ`;
        if (elOut) elOut.textContent = `${stats.out_of_stock_count || 0} รายการ`;

        // Update Tab Badges
        const bAll = document.getElementById('badgeAll');
        const bNormal = document.getElementById('badgeNormal');
        const bLow = document.getElementById('badgeLow');
        const bOut = document.getElementById('badgeOut');

        if (bAll) bAll.textContent = stats.total_skus || 0;
        if (bNormal) bNormal.textContent = stats.normal_stock_count !== undefined ? stats.normal_stock_count : (stats.in_stock_count - stats.low_stock_count);
        if (bLow) bLow.textContent = stats.low_stock_count || 0;
        if (bOut) bOut.textContent = stats.out_of_stock_count || 0;
    } catch (err) {
        console.error('Error fetching inventory stats:', err);
    }
}

async function loadCategories() {
    try {
        const res = await fetch('/api/inventory/categories?scope=RAW');
        if (!res.ok) return;
        const categories = await res.json();

        // Populate Category Filter Select
        const catFilter = document.getElementById('inventoryCategoryFilter');
        if (catFilter) {
            const currentSelected = catFilter.value;
            catFilter.innerHTML = '<option value="ALL">ทุกหมวดหมู่วัตถุดิบ</option>' +
                categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            if (categories.includes(currentSelected)) {
                catFilter.value = currentSelected;
            }
        }

        // Populate Datalist in Product Form
        const datalist = document.getElementById('categoryDataList');
        if (datalist) {
            datalist.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">`).join('');
        }
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

async function fetchInventory() {
    const tbody = document.getElementById('inventoryTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #64748b;">
                    <div class="spinner-small" style="margin: 0 auto 10px;"></div>
                    กำลังโหลดข้อมูลสต็อกวัตถุดิบ...
                </td>
            </tr>
        `;
    }

    try {
        const res = await fetch('/api/inventory?scope=RAW');
        if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลสินค้าได้');
        allInventory = await res.json();

        // Update Category Pill Numbers
        updatePillCounts();

        renderInventoryTable();
    } catch (err) {
        console.error('Error loading inventory:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #ef4444;">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

function updatePillCounts() {
    const countAll = allInventory.length;
    const countSnk = allInventory.filter(p => p.category === 'ขนมและของทานเล่น').length;
    const countBag = allInventory.filter(p => p.category === 'แบบกระเป๋าและกระเช้า').length;
    const countPrm = allInventory.filter(p => p.category === 'สินค้าพรีเมียมและแก้วน้ำ').length;

    const elAll = document.getElementById('catPillAll');
    const elSnk = document.getElementById('catPillSnk');
    const elBag = document.getElementById('catPillBag');
    const elPrm = document.getElementById('catPillPrm');

    if (elAll) elAll.textContent = countAll;
    if (elSnk) elSnk.textContent = countSnk;
    if (elBag) elBag.textContent = countBag;
    if (elPrm) elPrm.textContent = countPrm;
}

function syncPillsWithCategory(cat) {
    document.querySelectorAll('.cat-pill').forEach(p => {
        const pCat = p.getAttribute('data-cat');
        if (pCat === cat) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

// =========================================================================
// Rendering
// =========================================================================

function getFilteredInventory() {
    const searchTerm = (document.getElementById('searchInventoryInput')?.value || '').trim().toLowerCase();
    const selectedCat = document.getElementById('inventoryCategoryFilter')?.value || 'ALL';

    return allInventory.filter(p => {
        if (currentTab !== 'ALL' && p.stock_status !== currentTab) return false;
        if (selectedCat !== 'ALL' && p.category !== selectedCat) return false;

        if (searchTerm) {
            const name = (p.name || '').toLowerCase();
            const code = (p.code || '').toLowerCase();
            const desc = (p.description || '').toLowerCase();
            const cat = (p.category || '').toLowerCase();
            return name.includes(searchTerm) || code.includes(searchTerm) || desc.includes(searchTerm) || cat.includes(searchTerm);
        }
        return true;
    });
}

function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const paginationFooter = document.getElementById('inventoryPaginationFooter');
    if (!tbody) return;

    const filtered = getFilteredInventory();
    const totalItems = filtered.length;

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 48px; color: #94a3b8;">
                    <div style="margin-bottom: 8px; color: #94a3b8;">
                        <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.75" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    </div>
                    <div style="font-size: 15px; font-weight: 600; color: #475569;">ไม่พบรายการสินค้า</div>
                    <div style="font-size: 13px; margin-top: 4px;">ลองปรับเปลี่ยนคำค้นหา หรือกดปุ่ม <strong>"+ เพิ่มสินค้าใหม่"</strong> ด้านบน</div>
                </td>
            </tr>
        `;
        if (paginationFooter) paginationFooter.style.display = 'none';
        return;
    }

    if (paginationFooter) paginationFooter.style.display = 'flex';

    // Calculate pagination slice
    const perPage = rowsPerPage === 'ALL' ? totalItems : rowsPerPage;
    const totalPages = Math.ceil(totalItems / perPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const startIndex = (currentPage - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalItems);
    const displayList = rowsPerPage === 'ALL' ? filtered : filtered.slice(startIndex, endIndex);

    // Update pagination info text
    const infoText = document.getElementById('paginationInfoText');
    if (infoText) {
        infoText.textContent = `แสดง ${startIndex + 1} - ${endIndex} จากทั้งหมด ${totalItems} รายการ`;
    }

    // Render pagination buttons
    renderPaginationControls(totalPages);

    tbody.innerHTML = displayList.map((p, idx) => {
        let statusBadge = `<span class="stock-status-badge stock-status-normal">พร้อมขาย (${p.quantity_on_hand} ${p.unit})</span>`;
        if (p.stock_status === 'LOW_STOCK') {
            statusBadge = `<span class="stock-status-badge stock-status-low">ใกล้หมด (${p.quantity_on_hand} ${p.unit})</span>`;
        } else if (p.stock_status === 'OUT_OF_STOCK') {
            statusBadge = `<span class="stock-status-badge stock-status-out">สินค้าหมด (0 ${p.unit})</span>`;
        }

        const fallbackImg = 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=400&q=80';
        const displayImg = p.image_url || fallbackImg;
        const isBottomRow = displayList.length >= 3 && idx >= displayList.length - 2;

        return `
            <tr>
                <td style="width: 54px; text-align: center;">
                    <img src="${escapeHtml(displayImg)}" class="product-img-thumb" alt="${escapeHtml(p.name)}" onclick="openLightbox(${p.id})" onerror="this.onerror=null; this.src='/assets/images/products/product_placeholder.png';" title="คลิกเพื่อดูรูปขยาย">
                </td>
                <td style="font-weight: 700; color: #7D0A0A; white-space: nowrap; font-family: monospace; font-size: 13.5px;">
                    ${escapeHtml(p.code)}
                </td>
                <td>
                    <div style="font-weight: 600; color: #0f172a; font-size: 13.5px; line-height: 1.4;">${escapeHtml(p.name)}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 2px; line-height: 1.3;">${escapeHtml(p.description || '-')}</div>
                </td>
                <td>
                    <span class="category-tag">${escapeHtml(p.category || 'ทั่วไป')}</span>
                </td>
                <td style="text-align: right; font-weight: 700; color: #1e293b; white-space: nowrap;">
                    ฿ ${formatNumber(p.unit_price)}
                    <div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">ทุน: ฿${formatNumber(p.cost_price)}</div>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <div class="qty-badge">${p.quantity_on_hand} <small style="font-weight: normal; color: #64748b;">${escapeHtml(p.unit)}</small></div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">มูลค่าทุน: ฿${formatNumber(p.stock_value)}</div>
                </td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: center;">
                        <button class="btn-action-small" style="color: #7D0A0A; border: 1px solid #fca5a5; display: inline-flex; align-items: center; height: 28px; padding: 0 9px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; background: #ffffff; transition: all 0.15s;" onclick="openAdjustModal(${p.id})" title="ตรวจนับ / ปรับยอดสต็อก">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" style="margin-right: 4px;"><path d="M12 20v-6M6 20V10M18 20V4"></path></svg>ตรวจนับ
                        </button>
                        <div class="action-dropdown-container" style="position: relative; display: inline-block;">
                            <button type="button" class="btn-action-more" onclick="toggleInventoryActionMenu(this, event)" title="การดำเนินการเพิ่มเติม">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"></circle><circle cx="19" cy="12" r="2.5"></circle><circle cx="5" cy="12" r="2.5"></circle></svg>
                            </button>
                            <div class="action-menu-dropdown ${isBottomRow ? 'dropup' : ''}" style="display: none;">
                                <button type="button" class="action-menu-item" onclick="viewStockCard(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                    <span>ดู Stock Card</span>
                                </button>
                                <button type="button" class="action-menu-item" onclick="openEditProductModal(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>แก้ไขข้อมูล</span>
                                </button>
                                <div class="action-menu-divider" style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
                                <button type="button" class="action-menu-item text-danger" onclick="deleteProductItem(${p.id}, '${escapeJs(p.name)}')" style="color: #dc2626;">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>ลบสินค้า</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginationControls(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;

    if (totalPages <= 1 || rowsPerPage === 'ALL') {
        container.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)" title="หน้าแรก">&laquo;</button>`;
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})" title="ก่อนหน้า">&lsaquo;</button>`;

    // Page window
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    if (currentPage <= 3) endPage = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) startPage = Math.max(1, totalPages - 4);

    for (let p = startPage; p <= endPage; p++) {
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    }

    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})" title="ถัดไป">&rsaquo;</button>`;
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})" title="หน้าสุดท้าย">&raquo;</button>`;

    container.innerHTML = html;
}

window.goToPage = function(p) {
    currentPage = p;
    renderInventoryTable();
    const tableWrapper = document.getElementById('inventoryTableWrapper');
    if (tableWrapper) {
        tableWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

// =========================================================================
// Global Movements Tab (Stock Ledger)
// =========================================================================

async function loadGlobalMovements() {
    const tbody = document.getElementById('movementsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #64748b;"><div class="spinner-small" style="margin: 0 auto 10px;"></div>กำลังโหลดประวัติความเคลื่อนไหว...</td></tr>`;

    try {
        const res = await fetch('/api/inventory/movements?limit=100');
        if (!res.ok) throw new Error('Failed to load movements');
        allMovements = await res.json();
        renderMovementsTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #ef4444;">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function getFilteredMovements() {
    const search = (document.getElementById('searchMovementsInput')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('movementTypeFilter')?.value || 'ALL';

    return allMovements.filter(m => {
        if (typeFilter !== 'ALL' && m.movement_type !== typeFilter) return false;

        if (search) {
            const pName = (m.product_name || '').toLowerCase();
            const pCode = (m.product_code || '').toLowerCase();
            const refDoc = (m.ref_doc_number || '').toLowerCase();
            const remarks = (m.remarks || '').toLowerCase();
            const user = (m.created_by || '').toLowerCase();
            return pName.includes(search) || pCode.includes(search) || refDoc.includes(search) || remarks.includes(search) || user.includes(search);
        }
        return true;
    });
}

function renderMovementsTable() {
    const tbody = document.getElementById('movementsTableBody');
    if (!tbody) return;

    const list = getFilteredMovements();

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">ไม่พบประวัติความเคลื่อนไหวตามเงื่อนไขที่เลือก</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(m => {
        let badge = `<span class="movement-badge-in"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -1px; margin-right: 3px;"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>รับเข้า</span>`;
        if (m.movement_type === 'OUT_SALE') badge = `<span class="movement-badge-out"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -1px; margin-right: 3px;"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>ขายออก</span>`;
        else if (m.movement_type === 'ADJUST_COUNT') badge = `<span class="movement-badge-adjust"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -1px; margin-right: 3px;"><path d="M12 20v-6M6 20V10M18 20V4"></path></svg>ตรวจนับ/ปรับยอด</span>`;
        else if (m.movement_type === 'DAMAGE') badge = `<span class="movement-badge-out"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>ชำรุด/ตัดจ่าย</span>`;

        const changeText = m.change_qty > 0 ? `+${m.change_qty}` : `${m.change_qty}`;
        const changeColor = m.change_qty > 0 ? '#059669' : (m.change_qty < 0 ? '#dc2626' : '#64748b');

        return `
            <tr>
                <td style="white-space: nowrap; font-size: 12.5px; color: #475569;">${new Date(m.created_at).toLocaleString('th-TH')}</td>
                <td style="font-weight: 700; color: #7D0A0A; font-family: monospace;">${escapeHtml(m.product_code)}</td>
                <td style="font-weight: 600; color: #0f172a;">${escapeHtml(m.product_name)}</td>
                <td style="text-align: center;">${badge}</td>
                <td style="text-align: right; font-weight: 700; color: ${changeColor};">
                    ${changeText} <small style="font-weight: normal; color: #64748b;">${escapeHtml(m.unit || '')}</small>
                </td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">
                    ${m.balance_after} <small style="font-weight: normal; color: #64748b;">${escapeHtml(m.unit || '')}</small>
                </td>
                <td>
                    <div style="font-weight: 500; font-size: 12.5px; color: #334155;">${escapeHtml(m.remarks || '-')}</div>
                    ${m.ref_doc_number ? `<small style="color: #64748b;">เอกสารอ้างอิง: <strong style="color: #7D0A0A;">${escapeHtml(m.ref_doc_number)}</strong></small>` : ''}
                </td>
                <td style="font-size: 12px; color: #64748b;">${escapeHtml(m.created_by || 'Admin')}</td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// Product Create / Edit Modal Handlers (Hamper Domain)
// =========================================================================

let currentModalPrefix = 'SNK';

window.openCreateProductModal = async function() {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('modalProductId').value = '';
    document.getElementById('productModalTitle').textContent = '+ เพิ่มวัตถุดิบใหม่เข้าคลัง (ขนม / โบว์ / ตะกร้า)';
    document.getElementById('btnSubmitProduct').textContent = 'บันทึกวัตถุดิบใหม่';

    // Reset image upload dropzone
    switchImageMode('upload');
    removeUploadedImage();

    // Show category selector on create
    const catWrap = document.getElementById('modalCategorySelectorWrap');
    if (catWrap) catWrap.style.display = 'block';

    // Show opening stock field on create
    const openingGroup = document.getElementById('openingStockGroup');
    if (openingGroup) openingGroup.style.display = 'block';

    if (document.getElementById('productBrandInput')) {
        document.getElementById('productBrandInput').value = '';
    }

    // Default to Snacks category
    await selectModalCategory('ขนมและของทานเล่น', 'SNK');
    updateMarginPreview();

    modal.style.display = 'flex';
};

window.openEditProductModal = function(productId) {
    const product = allInventory.find(p => p.id === productId);
    if (!product) return;

    const modal = document.getElementById('productModal');
    if (!modal) return;

    document.getElementById('modalProductId').value = product.id;
    document.getElementById('productModalTitle').textContent = `แก้ไขข้อมูลวัตถุดิบ: [${product.code}]`;
    document.getElementById('btnSubmitProduct').textContent = 'บันทึกการแก้ไข';

    document.getElementById('productCodeInput').value = product.code || '';
    document.getElementById('productNameInput').value = product.name || '';
    document.getElementById('productCategoryInput').value = product.category || 'ขนมและของทานเล่น';
    document.getElementById('productUnitSelect').value = product.unit || 'ชิ้น';
    document.getElementById('productUnitPriceInput').value = product.unit_price || 0;
    document.getElementById('productCostPriceInput').value = product.cost_price || 0;
    document.getElementById('productMinStockInput').value = product.min_stock_level !== undefined ? product.min_stock_level : 5;
    document.getElementById('productImageUrlInput').value = product.image_url || '';

    // Setup image dropzone with existing product image
    if (product.image_url) {
        switchImageMode('upload');
        const dropEmpty = document.getElementById('dropzoneEmpty');
        const dropPreview = document.getElementById('dropzonePreview');
        const dropLoading = document.getElementById('dropzoneLoading');
        const uploadPreviewImg = document.getElementById('uploadPreviewImg');
        const previewFileName = document.getElementById('previewFileName');
        const previewFileSize = document.getElementById('previewFileSize');

        if (dropEmpty) dropEmpty.style.display = 'none';
        if (dropLoading) dropLoading.style.display = 'none';
        if (dropPreview) dropPreview.style.display = 'flex';
        if (uploadPreviewImg) uploadPreviewImg.src = product.image_url;
        if (previewFileName) previewFileName.textContent = product.code ? `ภาพวัตถุดิบ [${product.code}]` : 'รูปภาพสินค้าปัจจุบัน';
        if (previewFileSize) previewFileSize.textContent = 'มีรูปภาพในระบบแล้ว';
    } else {
        removeUploadedImage();
    }

    // Parse brand if formatted as [แบรนด์: XXX]
    let desc = product.description || '';
    let brand = '';
    const brandMatch = desc.match(/^\[แบรนด์:\s*([^\]]+)\]\s*(.*)$/);
    if (brandMatch) {
        brand = brandMatch[1];
        desc = brandMatch[2];
    }
    if (document.getElementById('productBrandInput')) {
        document.getElementById('productBrandInput').value = brand;
    }
    document.getElementById('productDescInput').value = desc;

    // Sync Category Button
    let pfx = 'SNK';
    if ((product.code || '').startsWith('BAG-') || (product.category || '').includes('กระเป๋า') || (product.category || '').includes('กระเช้า')) {
        pfx = 'BAG';
    } else if ((product.code || '').startsWith('PRM-') || (product.category || '').includes('พรีเมียม') || (product.category || '').includes('แก้ว') || (product.category || '').includes('โบว์')) {
        pfx = 'PRM';
    }
    currentModalPrefix = pfx;

    const btnSnk = document.getElementById('btnCatSnk');
    const btnBag = document.getElementById('btnCatBag');
    const btnPrm = document.getElementById('btnCatPrm');
    if (btnSnk) btnSnk.classList.toggle('active', pfx === 'SNK');
    if (btnBag) btnBag.classList.toggle('active', pfx === 'BAG');
    if (btnPrm) btnPrm.classList.toggle('active', pfx === 'PRM');

    // Hide opening stock on edit (quantities should be adjusted via stock adjustment)
    const openingGroup = document.getElementById('openingStockGroup');
    if (openingGroup) openingGroup.style.display = 'none';

    const thumb = document.getElementById('productImagePreviewThumb');
    if (thumb) thumb.src = product.image_url || 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80';

    updateMarginPreview();
    modal.style.display = 'flex';
};

window.closeProductModal = function() {
    const modal = document.getElementById('productModal');
    if (modal) modal.style.display = 'none';
};

window.selectModalCategory = async function(catName, prefix) {
    currentModalPrefix = prefix;
    const catInput = document.getElementById('productCategoryInput');
    if (catInput) catInput.value = catName;

    // Toggle button styles
    const btnSnk = document.getElementById('btnCatSnk');
    const btnBag = document.getElementById('btnCatBag');
    const btnPrm = document.getElementById('btnCatPrm');

    if (btnSnk) btnSnk.classList.toggle('active', prefix === 'SNK');
    if (btnBag) btnBag.classList.toggle('active', prefix === 'BAG');
    if (btnPrm) btnPrm.classList.toggle('active', prefix === 'PRM');

    // Auto set typical unit
    const unitSelect = document.getElementById('productUnitSelect');
    if (unitSelect) {
        if (prefix === 'BAG') unitSelect.value = 'ใบ';
        else if (prefix === 'PRM') unitSelect.value = 'อัน';
        else if (prefix === 'SNK') unitSelect.value = 'ซอง';
    }

    // Auto set typical image preset
    if (prefix === 'BAG') applyImagePreset('basket');
    else if (prefix === 'PRM') applyImagePreset('ribbon');
    else applyImagePreset('cookies');

    // Auto suggest SKU with prefix
    await autoSuggestSku(prefix);
};

window.triggerAutoSuggestSku = async function() {
    await autoSuggestSku(currentModalPrefix);
};

window.autoSuggestSku = async function(prefix) {
    const pfx = prefix || currentModalPrefix || 'SNK';
    try {
        const res = await fetch(`/api/inventory/next-sku?prefix=${encodeURIComponent(pfx)}`);
        if (res.ok) {
            const data = await res.json();
            const input = document.getElementById('productCodeInput');
            if (input) input.value = data.next_sku;
        }
    } catch (e) {
        console.error('Failed to get next SKU:', e);
    }
};

window.applyMarkup = function(percent) {
    const costInput = document.getElementById('productCostPriceInput');
    const priceInput = document.getElementById('productUnitPriceInput');
    if (!costInput || !priceInput) return;

    const cost = parseFloat(costInput.value) || 0;
    if (cost <= 0) {
        alert('กรุณาระบุราคาทุนเฉลี่ยก่อนคำนวณราคาขาย');
        costInput.focus();
        return;
    }

    const price = Math.round(cost * (1 + (percent / 100)));
    priceInput.value = price.toFixed(2);
    updateMarginPreview();
};

window.applyImagePreset = function(type) {
    const presets = {
        cookies: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80',
        chocolate: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=400&q=80',
        coffee: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80',
        basket: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80',
        bag: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80',
        ribbon: 'https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=400&q=80',
        mug: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80'
    };

    const url = presets[type] || presets.cookies;
    const input = document.getElementById('productImageUrlInput');
    const thumb = document.getElementById('productImagePreviewThumb');

    if (input) input.value = url;
    if (thumb) thumb.src = url;

    // Also update dropzone preview
    const uploadPreviewImg = document.getElementById('uploadPreviewImg');
    const previewFileName = document.getElementById('previewFileName');
    const previewFileSize = document.getElementById('previewFileSize');
    const dropEmpty = document.getElementById('dropzoneEmpty');
    const dropPreview = document.getElementById('dropzonePreview');
    if (uploadPreviewImg) uploadPreviewImg.src = url;
    if (previewFileName) previewFileName.textContent = `ภาพตัวอย่าง (${type})`;
    if (previewFileSize) previewFileSize.textContent = 'เลือกจากภาพตัวอย่างสำเร็จรูป';
    if (dropEmpty) dropEmpty.style.display = 'none';
    if (dropPreview) dropPreview.style.display = 'flex';
};

// =========================================================================
// Image Upload & Dropzone Management
// =========================================================================

window.switchImageMode = function(mode) {
    const tabUpload = document.getElementById('tabUploadFile');
    const tabUrl = document.getElementById('tabImageUrl');
    const panelUpload = document.getElementById('panelUploadFile');
    const panelUrl = document.getElementById('panelImageUrl');

    if (mode === 'upload') {
        if (tabUpload) tabUpload.classList.add('active');
        if (tabUrl) tabUrl.classList.remove('active');
        if (panelUpload) panelUpload.style.display = 'block';
        if (panelUrl) panelUrl.style.display = 'none';
    } else {
        if (tabUpload) tabUpload.classList.remove('active');
        if (tabUrl) tabUrl.classList.add('active');
        if (panelUpload) panelUpload.style.display = 'none';
        if (panelUrl) panelUrl.style.display = 'block';
    }
};

window.handleImageFileSelect = function(input) {
    if (input && input.files && input.files[0]) {
        window.uploadImageFile(input.files[0]);
    }
};

window.handleDragOver = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('imageDropzone');
    if (zone) zone.classList.add('dragover');
};

window.handleDragLeave = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('imageDropzone');
    if (zone) zone.classList.remove('dragover');
};

window.handleFileDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('imageDropzone');
    if (zone) zone.classList.remove('dragover');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        window.uploadImageFile(e.dataTransfer.files[0]);
    }
};

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function compressImage(file, maxDimension = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const dataUrl = canvas.toDataURL(mime, quality);
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
        reader.readAsDataURL(file);
    });
}

window.uploadImageFile = async function(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
        alert('กรุณาเลือกไฟล์ที่เป็นรูปภาพเท่านั้น (JPG, PNG, WEBP, GIF)');
        return;
    }

    const dropEmpty = document.getElementById('dropzoneEmpty');
    const dropPreview = document.getElementById('dropzonePreview');
    const dropLoading = document.getElementById('dropzoneLoading');
    const uploadPreviewImg = document.getElementById('uploadPreviewImg');
    const previewFileName = document.getElementById('previewFileName');
    const previewFileSize = document.getElementById('previewFileSize');
    const urlInput = document.getElementById('productImageUrlInput');
    const thumb = document.getElementById('productImagePreviewThumb');

    try {
        if (dropEmpty) dropEmpty.style.display = 'none';
        if (dropPreview) dropPreview.style.display = 'none';
        if (dropLoading) dropLoading.style.display = 'block';

        // Compress image before upload
        const base64Data = await compressImage(file, 1200, 0.85);

        const res = await fetch('/api/inventory/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Data,
                filename: file.name
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'อัปโหลดรูปภาพไม่สำเร็จ');
        }

        const data = await res.json();
        const uploadedUrl = data.url;

        // Set inputs
        if (urlInput) urlInput.value = uploadedUrl;
        if (thumb) thumb.src = uploadedUrl;

        // Show dropzone preview
        if (dropLoading) dropLoading.style.display = 'none';
        if (dropPreview) dropPreview.style.display = 'flex';
        if (uploadPreviewImg) uploadPreviewImg.src = uploadedUrl;
        if (previewFileName) previewFileName.textContent = file.name;
        if (previewFileSize) previewFileSize.textContent = `${formatFileSize(data.size || file.size)} • อัปโหลดเรียบร้อย`;

        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'success',
                title: 'แนบไฟล์ภาพสำเร็จ!',
                message: `อัปโหลด "${file.name}" เรียบร้อยแล้ว`,
                duration: 2500
            });
        }
    } catch (err) {
        console.error('Upload failed:', err);
        if (dropLoading) dropLoading.style.display = 'none';
        if (dropEmpty) dropEmpty.style.display = 'block';
        alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + err.message);
    }
};

window.removeUploadedImage = function() {
    const fileInput = document.getElementById('productFileInput');
    const urlInput = document.getElementById('productImageUrlInput');
    const thumb = document.getElementById('productImagePreviewThumb');
    const dropEmpty = document.getElementById('dropzoneEmpty');
    const dropPreview = document.getElementById('dropzonePreview');
    const dropLoading = document.getElementById('dropzoneLoading');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (thumb) thumb.src = 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80';

    if (dropPreview) dropPreview.style.display = 'none';
    if (dropLoading) dropLoading.style.display = 'none';
    if (dropEmpty) dropEmpty.style.display = 'block';
};

window.handleUrlInput = function(val) {
    const thumb = document.getElementById('productImagePreviewThumb');
    if (thumb) thumb.src = val || 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80';
};

// Clipboard Paste (Ctrl+V) listener when Product Modal is open
document.addEventListener('paste', (e) => {
    const modal = document.getElementById('productModal');
    if (!modal || modal.style.display !== 'flex') return;

    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
                window.switchImageMode('upload');
                window.uploadImageFile(file);
                break;
            }
        }
    }
});

function updateMarginPreview() {
    const price = parseFloat(document.getElementById('productUnitPriceInput')?.value) || 0;
    const cost = parseFloat(document.getElementById('productCostPriceInput')?.value) || 0;
    const profit = price - cost;
    const marginPct = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;

    const el = document.getElementById('marginProfitText');
    if (el) {
        const color = profit >= 0 ? '#059669' : '#dc2626';
        el.style.color = color;
        el.textContent = `฿ ${formatNumber(profit)} (${marginPct}%)`;
    }
}

async function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('modalProductId').value;
    const submitBtn = document.getElementById('btnSubmitProduct');
    const origText = submitBtn.textContent;

    const brand = document.getElementById('productBrandInput')?.value.trim() || '';
    const desc = document.getElementById('productDescInput')?.value.trim() || '';
    let finalDesc = desc;
    if (brand) {
        finalDesc = `[แบรนด์: ${brand}] ${desc}`.trim();
    }

    const payload = {
        code: document.getElementById('productCodeInput').value.trim(),
        name: document.getElementById('productNameInput').value.trim(),
        category: document.getElementById('productCategoryInput').value.trim() || 'ขนมและของทานเล่น',
        unit: document.getElementById('productUnitSelect').value,
        unit_price: parseFloat(document.getElementById('productUnitPriceInput').value) || 0,
        cost_price: parseFloat(document.getElementById('productCostPriceInput').value) || 0,
        quantity_on_hand: parseFloat(document.getElementById('productOpeningQtyInput')?.value) || 0,
        min_stock_level: parseFloat(document.getElementById('productMinStockInput').value) || 5,
        image_url: document.getElementById('productImageUrlInput').value.trim(),
        description: finalDesc,
        user_name: getUserDisplayName()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    try {
        const url = id ? `/api/inventory/${id}` : '/api/inventory';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'บันทึกข้อมูลไม่สำเร็จ');
        }

        closeProductModal();
        await initInventory();

        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'success',
                title: id ? 'แก้ไขข้อมูลสำเร็จ!' : 'บันทึกวัตถุดิบสำเร็จ!',
                message: `บันทึกวัตถุดิบ "${payload.name}" เรียบร้อยแล้ว`,
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
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
    }
}

window.deleteProductItem = async function(id, name) {
    if (!confirm(`ยืนยันการลบสินค้า "${name}" หรือไม่?\n\nหากลบแล้ว ประวัติการตรวจนับทั้งหมดของสินค้านี้จะถูกลบออกจากระบบด้วย`)) {
        return;
    }

    try {
        const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'ลบสินค้าไม่สำเร็จ');
        }
        await initInventory();
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'success',
                title: 'ลบสินค้าสำเร็จ',
                message: `ลบสินค้า "${name}" ออกจากระบบเรียบร้อยแล้ว`,
                duration: 3000
            });
        }
    } catch (err) {
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'error',
                title: 'ไม่สามารถลบสินค้าได้',
                message: err.message,
                duration: 4000
            });
        } else {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    }
};

// =========================================================================
// Stock Adjustment Modal Handlers
// =========================================================================

window.openAdjustModal = function(productId) {
    const product = allInventory.find(x => x.id === productId);
    if (!product) return;

    currentProductToAdjust = product;
    document.getElementById('adjustProductId').value = product.id;
    document.getElementById('adjustProductName').textContent = product.name;
    document.getElementById('adjustProductCode').textContent = product.code || '-';
    document.getElementById('adjustProductCategory').textContent = product.category || 'ทั่วไป';

    const cost = Number(product.cost_price) || 0;
    const price = Number(product.unit_price) || 0;
    const elCost = document.getElementById('adjustCostPerUnit');
    const elPrice = document.getElementById('adjustPricePerUnit');
    if (elCost) elCost.textContent = `฿ ${formatNumber(cost)}`;
    if (elPrice) elPrice.textContent = `฿ ${formatNumber(price)}`;

    const imgEl = document.getElementById('adjustProductImg');
    if (imgEl) {
        imgEl.src = product.image_url || '/assets/images/products/product_placeholder.png';
    }

    const currentQty = Number(product.quantity_on_hand) || 0;
    const u = product.unit || 'ชิ้น';
    document.getElementById('adjustCurrentQty').textContent = `${currentQty} ${u}`;

    const statusEl = document.getElementById('adjustCurrentStatusBadge');
    if (statusEl) {
        const min = Number(product.min_stock_level) || 5;
        if (currentQty <= 0) {
            statusEl.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#dc2626;margin-right:4px;"></span> สินค้าหมดสต็อก';
            statusEl.style.color = '#dc2626';
        } else if (currentQty <= min) {
            statusEl.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#d97706;margin-right:4px;"></span> สินค้าใกล้หมด';
            statusEl.style.color = '#d97706';
        } else {
            statusEl.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#059669;margin-right:4px;"></span> มีของพร้อมขาย';
            statusEl.style.color = '#059669';
        }
    }

    // Reset Inputs
    document.getElementById('adjustNewQtyInput').value = currentQty;
    const origChip = document.getElementById('chipOrigQty');
    if (origChip) origChip.textContent = currentQty;

    document.getElementById('adjustAddQtyInput').value = '';
    document.getElementById('adjustDeductQtyInput').value = '';
    document.getElementById('adjustRefDocInput').value = '';
    const expInput = document.getElementById('adjustExpiryDateInput');
    if (expInput) expInput.value = '';
    document.getElementById('adjustNotesInput').value = '';

    // Unit Labels
    document.getElementById('adjustUnitLabel').textContent = u;
    document.getElementById('adjustUnitLabelIn').textContent = u;
    document.getElementById('adjustUnitLabelOut').textContent = u;

    setAdjustMode('COUNT');
    document.getElementById('stockAdjustModal').style.display = 'flex';
};

window.closeAdjustModal = function() {
    document.getElementById('stockAdjustModal').style.display = 'none';
    currentProductToAdjust = null;
};

window.setAdjustMode = function(mode) {
    currentAdjustMode = mode;
    document.getElementById('btnModeCount').classList.toggle('active', mode === 'COUNT');
    document.getElementById('btnModeIn').classList.toggle('active', mode === 'IN');
    document.getElementById('btnModeOut').classList.toggle('active', mode === 'OUT');

    document.getElementById('inputGroupCount').style.display = mode === 'COUNT' ? 'block' : 'none';
    document.getElementById('inputGroupIn').style.display = mode === 'IN' ? 'block' : 'none';
    document.getElementById('inputGroupOut').style.display = mode === 'OUT' ? 'block' : 'none';

    // Auto set typical reason
    const reasonSelect = document.getElementById('adjustReasonSelect');
    if (reasonSelect) {
        if (mode === 'COUNT') reasonSelect.value = 'ตรวจนับสินค้าจริงประจำรอบ (Physical Inventory Count)';
        else if (mode === 'IN') reasonSelect.value = 'รับสินค้าเข้าจากผู้ผลิต / ซัพพลายเออร์ส่งของ';
        else if (mode === 'OUT') reasonSelect.value = 'สินค้าชำรุด เสียหาย กล่องบุบ แตกหัก ระหว่างจัดเก็บ';
    }

    updateAdjustDifference();
};

window.stepAdjustQty = function(delta) {
    const inp = document.getElementById('adjustNewQtyInput');
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    inp.value = Math.max(0, cur + delta);
    updateAdjustDifference();
};

window.setCountPreset = function(val) {
    const inp = document.getElementById('adjustNewQtyInput');
    if (!inp || !currentProductToAdjust) return;
    if (val === 'ORIGINAL') {
        inp.value = Number(currentProductToAdjust.quantity_on_hand) || 0;
    } else {
        inp.value = val;
    }
    updateAdjustDifference();
};

window.stepInQty = function(delta) {
    const inp = document.getElementById('adjustAddQtyInput');
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    inp.value = Math.max(1, cur + delta);
    updateAdjustDifference();
};

window.addInQty = function(qty) {
    const inp = document.getElementById('adjustAddQtyInput');
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    inp.value = cur + qty;
    updateAdjustDifference();
};

window.clearInQty = function() {
    const inp = document.getElementById('adjustAddQtyInput');
    if (inp) inp.value = '';
    updateAdjustDifference();
};

window.stepOutQty = function(delta) {
    const inp = document.getElementById('adjustDeductQtyInput');
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    inp.value = Math.max(1, cur + delta);
    updateAdjustDifference();
};

window.addOutQty = function(qty) {
    const inp = document.getElementById('adjustDeductQtyInput');
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    inp.value = cur + qty;
    updateAdjustDifference();
};

window.setOutAll = function() {
    if (!currentProductToAdjust) return;
    const inp = document.getElementById('adjustDeductQtyInput');
    if (inp) {
        inp.value = Math.max(0, Number(currentProductToAdjust.quantity_on_hand) || 0);
    }
    updateAdjustDifference();
};

function updateAdjustDifference() {
    if (!currentProductToAdjust) return;
    const current = Number(currentProductToAdjust.quantity_on_hand) || 0;
    const unit = currentProductToAdjust.unit || 'ชิ้น';
    const costPerUnit = Number(currentProductToAdjust.cost_price) || 0;
    const minStock = Number(currentProductToAdjust.min_stock_level) || 5;

    let target = current;
    let diff = 0;

    if (currentAdjustMode === 'IN') {
        const add = parseFloat(document.getElementById('adjustAddQtyInput')?.value) || 0;
        diff = add;
        target = current + add;
    } else if (currentAdjustMode === 'OUT') {
        const deduct = parseFloat(document.getElementById('adjustDeductQtyInput')?.value) || 0;
        diff = -deduct;
        target = Math.max(0, current - deduct);
    } else {
        const val = parseFloat(document.getElementById('adjustNewQtyInput')?.value);
        target = isNaN(val) ? current : Math.max(0, val);
        diff = target - current;
    }

    const diffEl = document.getElementById('adjustDiffPreview');
    const costImpactEl = document.getElementById('adjustCostImpact');
    const warningAlertEl = document.getElementById('adjustWarningAlert');

    const totalCostChange = diff * costPerUnit;

    if (diffEl) {
        if (diff > 0) {
            diffEl.className = 'adjust-diff-pill adjust-diff-plus';
            diffEl.textContent = `เดิม: ${current} ➔ ใหม่: ${target} (+${diff} ${unit})`;
        } else if (diff < 0) {
            diffEl.className = 'adjust-diff-pill adjust-diff-minus';
            diffEl.textContent = `เดิม: ${current} ➔ ใหม่: ${target} (${diff} ${unit})`;
        } else {
            diffEl.className = 'adjust-diff-pill';
            diffEl.textContent = `คงที่ ${current} ${unit} (ไม่เปลี่ยนแปลง)`;
        }
    }

    if (costImpactEl) {
        if (diff > 0) {
            costImpactEl.style.color = '#059669';
            costImpactEl.textContent = `+ ฿ ${formatNumber(totalCostChange)} (มูลค่าคลังเพิ่มขึ้น)`;
        } else if (diff < 0) {
            costImpactEl.style.color = '#dc2626';
            costImpactEl.textContent = `- ฿ ${formatNumber(Math.abs(totalCostChange))} (มูลค่าคลังลดลง)`;
        } else {
            costImpactEl.style.color = '#64748b';
            costImpactEl.textContent = `฿ 0.00 (ไม่มีการเปลี่ยนแปลงมูลค่า)`;
        }
    }

    if (warningAlertEl) {
        if (target === 0) {
            warningAlertEl.style.display = 'block';
            warningAlertEl.style.background = '#fef2f2';
            warningAlertEl.style.color = '#b91c1c';
            warningAlertEl.style.border = '1px solid #fecaca';
            warningAlertEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> หลังปรับยอด สินค้านี้จะหมดสต็อก (Out of Stock)';
        } else if (target <= minStock) {
            warningAlertEl.style.display = 'block';
            warningAlertEl.style.background = '#fffbeb';
            warningAlertEl.style.color = '#b45309';
            warningAlertEl.style.border = '1px solid #fde68a';
            warningAlertEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> หลังปรับยอด สินค้าจะต่ำกว่าจุดสั่งซื้อขั้นต่ำ (${minStock} ${unit})`;
        } else {
            warningAlertEl.style.display = 'none';
        }
    }
}

async function handleStockAdjustSubmit(e) {
    e.preventDefault();
    if (!currentProductToAdjust) return;

    const productName = currentProductToAdjust.name || 'สินค้า';
    const reason = document.getElementById('adjustReasonSelect').value;
    const refDoc = document.getElementById('adjustRefDocInput').value.trim();
    const expiry = document.getElementById('adjustExpiryDateInput')?.value.trim();
    const note = document.getElementById('adjustNotesInput').value.trim();
    const submitBtn = document.getElementById('btnSubmitAdjust');
    const origText = submitBtn.textContent;

    let combinedRemarks = reason;
    const details = [];
    if (note) details.push(note);
    if (expiry) details.push(`วันหมดอายุ: ${expiry}`);
    if (details.length > 0) {
        combinedRemarks += ` (${details.join(' | ')})`;
    }

    const payload = {
        product_id: currentProductToAdjust.id,
        mode: currentAdjustMode,
        new_quantity: parseFloat(document.getElementById('adjustNewQtyInput')?.value),
        add_quantity: parseFloat(document.getElementById('adjustAddQtyInput')?.value),
        deduct_quantity: parseFloat(document.getElementById('adjustDeductQtyInput')?.value),
        reason: combinedRemarks,
        ref_doc_number: refDoc,
        user_name: getUserDisplayName()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';

    try {
        const res = await fetch('/api/inventory/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'ปรับยอดสต็อกไม่สำเร็จ');
        }

        const resData = await res.json().catch(() => ({}));

        closeAdjustModal();
        await initInventory();

        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'success',
                title: 'ปรับสต็อกสำเร็จ!',
                message: `ปรับยอดสต็อกสินค้า "${productName}" เรียบร้อยแล้ว`,
                duration: 3200
            });
        }
    } catch (err) {
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'error',
                title: 'ปรับสต็อกไม่สำเร็จ',
                message: err.message,
                duration: 4000
            });
        } else {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
    }
}

// =========================================================================
// Stock Card Modal Handlers
// =========================================================================

window.viewStockCard = async function(productId) {
    const product = allInventory.find(x => x.id === productId);
    if (!product) return;

    currentStockCardProduct = product;
    const modal = document.getElementById('stockCardModal');
    document.getElementById('stockCardTitle').textContent = `Stock Card: [${product.code}] ${product.name}`;
    document.getElementById('stockCardCategory').textContent = `หมวดหมู่: ${product.category || 'ทั่วไป'} | หน่วยนับ: ${product.unit}`;

    document.getElementById('stockCardCurrentQty').textContent = `${product.quantity_on_hand} ${product.unit}`;
    document.getElementById('stockCardUnitCost').textContent = `฿ ${formatNumber(product.cost_price)}`;
    document.getElementById('stockCardTotalValue').textContent = `฿ ${formatNumber(product.stock_value)}`;

    const tbody = document.getElementById('stockCardBody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px;"><div class="spinner-small" style="margin: 0 auto 8px;"></div>กำลังโหลดข้อมูล...</td></tr>`;
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/inventory/movements?product_id=${productId}&limit=50`);
        currentStockCardList = await res.json();

        if (currentStockCardList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">ไม่มีประวัติความเคลื่อนไหวสำหรับสินค้านี้</td></tr>`;
            return;
        }

        tbody.innerHTML = currentStockCardList.map(m => {
            const changeText = m.change_qty > 0 ? `+${m.change_qty}` : `${m.change_qty}`;
            const changeColor = m.change_qty > 0 ? '#059669' : (m.change_qty < 0 ? '#dc2626' : '#64748b');

            let badge = `<span class="movement-badge-in">รับเข้า</span>`;
            if (m.movement_type === 'OUT_SALE') badge = `<span class="movement-badge-out">ขายออก</span>`;
            else if (m.movement_type === 'ADJUST_COUNT') badge = `<span class="movement-badge-adjust">ตรวจนับ</span>`;
            else if (m.movement_type === 'DAMAGE') badge = `<span class="movement-badge-out">ชำรุด</span>`;

            return `
                <tr>
                    <td style="white-space: nowrap; font-size: 12px; color: #475569;">${new Date(m.created_at).toLocaleString('th-TH')}</td>
                    <td style="font-size: 12px; font-weight: 700; color: #7D0A0A; font-family: monospace;">${escapeHtml(m.ref_doc_number || '-')}</td>
                    <td style="text-align: center;">${badge}</td>
                    <td style="font-size: 12.5px; color: #1e293b;">${escapeHtml(m.remarks || '-')}</td>
                    <td style="text-align: right; font-weight: 700; color: ${changeColor};">${changeText}</td>
                    <td style="text-align: right; font-weight: 700; color: #0f172a;">${m.balance_after}</td>
                    <td style="font-size: 12px; color: #64748b;">${escapeHtml(m.created_by || '-')}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">โหลดข้อมูลไม่สำเร็จ</td></tr>`;
    }
};

window.closeStockCardModal = function() {
    document.getElementById('stockCardModal').style.display = 'none';
    currentStockCardProduct = null;
    currentStockCardList = [];
};

// =========================================================================
// Lightbox Modal
// =========================================================================

window.openLightbox = function(productId) {
    const product = allInventory.find(x => x.id === productId);
    if (!product) return;

    const modal = document.getElementById('imageLightboxModal');
    const img = document.getElementById('lightboxImg');
    const title = document.getElementById('lightboxTitle');
    const sku = document.getElementById('lightboxSku');
    const desc = document.getElementById('lightboxDesc');

    if (img) img.src = product.image_url || 'https://placehold.co/400x300?text=No+Image';
    if (title) title.textContent = product.name;
    if (sku) sku.textContent = `รหัส SKU: ${product.code} | หมวดหมู่: ${product.category || 'ทั่วไป'}`;
    if (desc) desc.textContent = product.description || 'ไม่มีรายละเอียดเพิ่มเติม';

    if (modal) modal.style.display = 'flex';
};

window.closeLightbox = function(e) {
    if (e.target.id === 'imageLightboxModal' || e.target.classList.contains('modal-close')) {
        const modal = document.getElementById('imageLightboxModal');
        if (modal) modal.style.display = 'none';
    }
};

// =========================================================================
// CSV / Excel Exporters
// =========================================================================

function exportInventoryToCSV() {
    const list = getFilteredInventory();
    if (list.length === 0) {
        alert('ไม่มีข้อมูลสินค้าสำหรับส่งออก');
        return;
    }

    const headers = ['รหัสสินค้า (SKU)', 'ชื่อสินค้า', 'หมวดหมู่', 'รายละเอียด', 'หน่วยนับ', 'ราคาขาย', 'ราคาทุน', 'คงเหลือ', 'มูลค่าทุนรวม', 'จุดสั่งซื้อขั้นต่ำ', 'สถานะสต็อก'];
    const rows = list.map(p => [
        `"${(p.code || '').replace(/"/g, '""')}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        `"${(p.description || '').replace(/"/g, '""')}"`,
        `"${(p.unit || '').replace(/"/g, '""')}"`,
        p.unit_price || 0,
        p.cost_price || 0,
        p.quantity_on_hand || 0,
        p.stock_value || 0,
        p.min_stock_level || 5,
        `"${p.stock_status === 'NORMAL' ? 'มีสินค้าพร้อมขาย' : (p.stock_status === 'LOW_STOCK' ? 'ใกล้หมดสต็อก' : 'สินค้าหมด')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadBlob(csvContent, `MAM_Inventory_Stock_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportGlobalMovementsToCSV() {
    const list = getFilteredMovements();
    if (list.length === 0) {
        alert('ไม่มีข้อมูลประวัติความเคลื่อนไหวสำหรับส่งออก');
        return;
    }

    const headers = ['วัน-เวลา', 'รหัสสินค้า', 'ชื่อสินค้า', 'ประเภทรายการ', 'จำนวนที่เปลี่ยน', 'คงเหลือหลังทำ', 'เอกสารอ้างอิง', 'หมายเหตุ', 'ผู้บันทึก'];
    const rows = list.map(m => [
        `"${new Date(m.created_at).toLocaleString('th-TH')}"`,
        `"${(m.product_code || '').replace(/"/g, '""')}"`,
        `"${(m.product_name || '').replace(/"/g, '""')}"`,
        `"${m.movement_type || ''}"`,
        m.change_qty,
        m.balance_after,
        `"${(m.ref_doc_number || '').replace(/"/g, '""')}"`,
        `"${(m.remarks || '').replace(/"/g, '""')}"`,
        `"${(m.created_by || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadBlob(csvContent, `MAM_Stock_Movements_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportStockCardToCSV() {
    if (!currentStockCardProduct || currentStockCardList.length === 0) {
        alert('ไม่มีข้อมูลใน Stock Card สำหรับส่งออก');
        return;
    }

    const headers = ['วัน-เวลา', 'เลขที่เอกสาร', 'ประเภทรายการ', 'รายการ/เหตุผล', 'จำนวน', 'คงเหลือ', 'ผู้บันทึก'];
    const rows = currentStockCardList.map(m => [
        `"${new Date(m.created_at).toLocaleString('th-TH')}"`,
        `"${(m.ref_doc_number || '').replace(/"/g, '""')}"`,
        `"${m.movement_type || ''}"`,
        `"${(m.remarks || '').replace(/"/g, '""')}"`,
        m.change_qty,
        m.balance_after,
        `"${(m.created_by || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadBlob(csvContent, `StockCard_${currentStockCardProduct.code}_${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadBlob(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =========================================================================
// Helpers
// =========================================================================

function getUserDisplayName() {
    try {
        const u = JSON.parse(localStorage.getItem('flowUser'));
        if (u && u.name) return u.name;
    } catch(e) {}
    return 'คุณอิศรพงศ์ โพธิ์งาม';
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

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
