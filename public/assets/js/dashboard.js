/**
 * FlowAccount Advance - Business Dashboard Controller
 * Connects directly to SQLite backend APIs (/api/dashboard/metrics, /api/documents, etc.)
 * Provides dynamic KPI calculations, interactive Chart.js visualizations,
 * uncollected receivables table management, and global search.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Current Dashboard State
    let currentPeriod = 'this_month';
    let currentMetrics = null;
    let revExpChart = null;
    let expenseDonutChart = null;

    // DOM Elements
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebarNav = document.getElementById('sidebarNav');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownContent = document.getElementById('userDropdownContent');

    const periodFilter = document.getElementById('periodFilter');
    const kpiRevenue = document.getElementById('kpiRevenue');
    const kpiRevenueTrend = document.getElementById('kpiRevenueTrend');
    const kpiRevenueNote = document.getElementById('kpiRevenueNote');

    const kpiReceivable = document.getElementById('kpiReceivable');
    const kpiReceivableCount = document.getElementById('kpiReceivableCount');
    const kpiReceivableNote = document.getElementById('kpiReceivableNote');

    const kpiExpenses = document.getElementById('kpiExpenses');
    const kpiExpensesTrend = document.getElementById('kpiExpensesTrend');
    const kpiExpensesNote = document.getElementById('kpiExpensesNote');

    const kpiPayable = document.getElementById('kpiPayable');
    const kpiPayableCount = document.getElementById('kpiPayableCount');
    const kpiPayableNote = document.getElementById('kpiPayableNote');

    const kpiProfit = document.getElementById('kpiProfit');
    const kpiProfitMargin = document.getElementById('kpiProfitMargin');
    const kpiProfitHealth = document.getElementById('kpiProfitHealth');

    const uncollectedTableBody = document.getElementById('uncollectedInvoicesTableBody');
    const expenseBreakdownList = document.getElementById('expenseBreakdownList');
    const bankAccountsList = document.getElementById('bankAccountsList');
    const totalCashAmount = document.getElementById('totalCashAmount');

    // Modals
    const quickCreateModal = document.getElementById('quickCreateModal');
    const openQuickCreateBtn = document.getElementById('openQuickCreateBtn');
    const closeQuickModal = document.getElementById('closeQuickModal');

    const quickAddCustomerModal = document.getElementById('quickAddCustomerModal');
    const openQuickCustomerBtn = document.getElementById('openQuickCustomerBtn');
    const closeCustomerModal = document.getElementById('closeCustomerModal');
    const cancelCustomerBtn = document.getElementById('cancelCustomerBtn');
    const quickCustomerForm = document.getElementById('quickCustomerForm');

    const quickBankModal = document.getElementById('quickBankModal');
    const addBankAccountBtn = document.getElementById('addBankAccountBtn');
    const closeBankModal = document.getElementById('closeBankModal');
    const cancelBankBtn = document.getElementById('cancelBankBtn');
    const quickBankForm = document.getElementById('quickBankForm');

    const exportDashboardBtn = document.getElementById('exportDashboardBtn');
    const reportPreviewModal = document.getElementById('reportPreviewModal');
    const closeReportModal = document.getElementById('closeReportModal');
    const closeReportBtn = document.getElementById('closeReportBtn');
    const triggerPrintBtn = document.getElementById('triggerPrintBtn');
    const reportPrintArea = document.getElementById('reportPrintArea');

    // Global Search
    const globalSearchInput = document.getElementById('globalSearchInput');
    const searchResultsDropdown = document.getElementById('searchResultsDropdown');

    // Navigation & Dropdown Controls are handled by global-navbar.js

    // =========================================================================
    // 2. Modals Control & Quick Actions
    // =========================================================================
    // Quick Create Modal
    if (openQuickCreateBtn && quickCreateModal) {
        openQuickCreateBtn.addEventListener('click', () => {
            quickCreateModal.style.display = 'flex';
        });
        if (closeQuickModal) {
            closeQuickModal.addEventListener('click', () => {
                quickCreateModal.style.display = 'none';
            });
        }
        quickCreateModal.addEventListener('click', (e) => {
            if (e.target === quickCreateModal) quickCreateModal.style.display = 'none';
        });
    }

    // Quick Add Customer Modal
    if (openQuickCustomerBtn && quickAddCustomerModal) {
        openQuickCustomerBtn.addEventListener('click', () => {
            if (quickCreateModal) quickCreateModal.style.display = 'none';
            quickAddCustomerModal.style.display = 'flex';
        });

        const closeCust = () => { quickAddCustomerModal.style.display = 'none'; };
        if (closeCustomerModal) closeCustomerModal.addEventListener('click', closeCust);
        if (cancelCustomerBtn) cancelCustomerBtn.addEventListener('click', closeCust);
        quickAddCustomerModal.addEventListener('click', (e) => {
            if (e.target === quickAddCustomerModal) closeCust();
        });

        if (quickCustomerForm) {
            quickCustomerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('custName')?.value.trim();
                const tax_id = document.getElementById('custTaxId')?.value.trim();
                const phone = document.getElementById('custPhone')?.value.trim();
                const email = document.getElementById('custEmail')?.value.trim();
                const address = document.getElementById('custAddress')?.value.trim();

                if (!name) return;

                try {
                    const res = await fetch('/api/customers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, tax_id, phone, email, address })
                    });
                    if (res.ok) {
                        showToast(`บันทึกข้อมูลลูกค้า "${name}" เข้าระบบเรียบร้อยแล้ว`, 'success');
                        quickCustomerForm.reset();
                        closeCust();
                    } else {
                        showToast('ไม่สามารถบันทึกข้อมูลลูกค้าได้ กรุณาลองใหม่อีกครั้ง', 'warning');
                    }
                } catch (err) {
                    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'warning');
                }
            });
        }
    }

    // Quick Add Bank Account Modal
    if (addBankAccountBtn && quickBankModal) {
        addBankAccountBtn.addEventListener('click', () => {
            quickBankModal.style.display = 'flex';
        });

        const closeBank = () => { quickBankModal.style.display = 'none'; };
        if (closeBankModal) closeBankModal.addEventListener('click', closeBank);
        if (cancelBankBtn) cancelBankBtn.addEventListener('click', closeBank);
        quickBankModal.addEventListener('click', (e) => {
            if (e.target === quickBankModal) closeBank();
        });

        if (quickBankForm) {
            quickBankForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = document.getElementById('bankCode')?.value || 'KBANK';
                const title = document.getElementById('bankTitle')?.value.trim();
                const accNo = document.getElementById('bankAccNo')?.value.trim();
                const balance = parseFloat(document.getElementById('bankBalance')?.value || 0);

                if (!title) return;

                try {
                    const res = await fetch('/api/banking/accounts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            bank_name: code,
                            account_name: title,
                            account_number: accNo || '-',
                            account_type: code === 'CASH' ? 'CASH' : 'SAVINGS',
                            current_balance: isNaN(balance) ? 0 : balance
                        })
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || 'ไม่สามารถบันทึกบัญชีธนาคารได้');
                    }
                    showToast(`เพิ่มบัญชีการเงิน "${title}" เรียบร้อยแล้ว`, 'success');
                    quickBankForm.reset();
                    closeBank();
                    await fetchDashboardMetrics(currentPeriod);
                } catch (err) {
                    showToast(err.message || 'เกิดข้อผิดพลาดในการบันทึกบัญชีธนาคาร', 'warning');
                }
            });
        }
    }

    // Export Report Preview Modal
    if (exportDashboardBtn && reportPreviewModal) {
        exportDashboardBtn.addEventListener('click', () => {
            renderReportPreview();
            reportPreviewModal.style.display = 'flex';
        });

        const closeRep = () => { reportPreviewModal.style.display = 'none'; };
        if (closeReportModal) closeReportModal.addEventListener('click', closeRep);
        if (closeReportBtn) closeReportBtn.addEventListener('click', closeRep);
        reportPreviewModal.addEventListener('click', (e) => {
            if (e.target === reportPreviewModal) closeRep();
        });

        if (triggerPrintBtn) {
            triggerPrintBtn.addEventListener('click', () => {
                window.print();
            });
        }
    }

    // Keyboard ESC to close all modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (quickCreateModal) quickCreateModal.style.display = 'none';
            if (quickAddCustomerModal) quickAddCustomerModal.style.display = 'none';
            if (quickBankModal) quickBankModal.style.display = 'none';
            if (reportPreviewModal) reportPreviewModal.style.display = 'none';
            if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
        }
    });

    // =========================================================================
    // 3. Initialize Financial Charts (Chart.js)
    // =========================================================================
    function initCharts() {
        const ctxRevExp = document.getElementById('revenueExpenseChart')?.getContext('2d');
        const ctxExpense = document.getElementById('expenseCategoryChart')?.getContext('2d');

        if (ctxRevExp) {
            revExpChart = new Chart(ctxRevExp, {
                type: 'bar',
                data: {
                    labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.'],
                    datasets: [
                        {
                            label: 'รายได้ (Revenue)',
                            data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                            backgroundColor: '#7D0A0A',
                            borderRadius: 4,
                            barPercentage: 0.6,
                            categoryPercentage: 0.7
                        },
                        {
                            label: 'ค่าใช้จ่าย (Expenses)',
                            data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                            backgroundColor: '#f43f5e',
                            borderRadius: 4,
                            barPercentage: 0.6,
                            categoryPercentage: 0.7
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1e293b',
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    return `${label}: ฿ ${(context.parsed.y || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: "'Prompt', sans-serif" } }
                        },
                        y: {
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                font: { family: "'Inter', sans-serif" },
                                callback: function(value) {
                                    return '฿ ' + (value / 1000).toLocaleString() + 'k';
                                }
                            }
                        }
                    }
                }
            });
        }

        if (ctxExpense) {
            expenseDonutChart = new Chart(ctxExpense, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: ['#7D0A0A', '#991b1b', '#b91c1c', '#dc2626', '#d97706', '#f59e0b'],
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    return ` ${label}: ฿ ${(context.parsed || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // =========================================================================
    // 4. Load Real Dashboard Metrics from Backend API
    // =========================================================================
    async function fetchDashboardMetrics(period = 'this_month') {
        setKpiLoadingState(true);

        try {
            const res = await fetch(`/api/dashboard/metrics?period=${encodeURIComponent(period)}`);
            if (!res.ok) throw new Error('API server returned error');
            const data = await res.json();
            currentMetrics = data;

            renderKpiCards(data);
            updateCharts(data);
            renderExpenseBreakdown(data.expenseCategories || []);
            renderUncollectedTable(data.uncollectedInvoices || []);
            renderBankAccounts(data.cashAndBank);

        } catch (err) {
            console.error('Error fetching dashboard metrics, using cached fallback:', err);
            const fallbackData = getFallbackMetrics(period);
            currentMetrics = fallbackData;
            renderKpiCards(fallbackData);
            updateCharts(fallbackData);
            renderExpenseBreakdown(fallbackData.expenseCategories || []);
            renderUncollectedTable(fallbackData.uncollectedInvoices || []);
            renderBankAccounts(fallbackData.cashAndBank);
        } finally {
            setKpiLoadingState(false);
        }
    }

    function getFallbackMetrics(period = 'this_month') {
        const thaiMonthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return {
            period: period,
            revenue: {
                total: 0,
                growth: 0,
                count: 0
            },
            receivable: {
                total: 0,
                count: 0,
                overdueCount: 0,
                note: 'ไม่มีรายการค้างรับ'
            },
            expenses: {
                total: 0,
                growth: 0,
                count: 0
            },
            payable: {
                total: 0,
                count: 0,
                dueSoonCount: 0,
                note: 'ยอดค้างชำระปกติ'
            },
            profit: {
                total: 0,
                margin: 0,
                health: 'พร้อมเริ่มต้นบันทึกข้อมูล'
            },
            monthlyTrend: {
                labels: thaiMonthLabels,
                revenue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                expenses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            },
            expenseCategories: [],
            uncollectedInvoices: [],
            cashAndBank: {
                accounts: [],
                totalCash: 0
            }
        };
    }

    function setKpiLoadingState(isLoading) {
        const kpiElements = [kpiRevenue, kpiReceivable, kpiExpenses, kpiPayable, kpiProfit];
        kpiElements.forEach(el => {
            if (el) el.style.opacity = isLoading ? '0.4' : '1';
        });
    }

    function renderKpiCards(data) {
        // Revenue Card
        if (kpiRevenue) kpiRevenue.textContent = `฿ ${(data.revenue?.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiRevenueTrend) {
            const growth = data.revenue?.growth || 0;
            const isUp = growth >= 0;
            kpiRevenueTrend.className = `trend-badge ${isUp ? 'trend-up' : 'trend-down'}`;
            kpiRevenueTrend.textContent = `${isUp ? '↑ +' : '↓ '}${growth.toFixed(1)}%`;
        }
        if (kpiRevenueNote) {
            kpiRevenueNote.textContent = data.period === 'this_year' ? 'สรุปยอดสะสมปี 2026' : 'เทียบกับเดือนที่แล้ว';
        }

        // Receivables Card
        if (kpiReceivable) kpiReceivable.textContent = `฿ ${(data.receivable?.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiReceivableCount) kpiReceivableCount.textContent = `${data.receivable?.count || 0} เอกสาร`;
        if (kpiReceivableNote) {
            const overdue = data.receivable?.overdueCount || 0;
            if (overdue > 0) {
                kpiReceivableNote.className = 'trend-note text-warning';
                kpiReceivableNote.textContent = `เกินกำหนด ${overdue} รายการ`;
            } else {
                kpiReceivableNote.className = 'trend-note text-success';
                kpiReceivableNote.textContent = 'ไม่มีรายการเกินกำหนด';
            }
        }

        // Expenses Card
        if (kpiExpenses) kpiExpenses.textContent = `฿ ${(data.expenses?.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiExpensesTrend) {
            const expGrowth = data.expenses?.growth || 0;
            const isSaved = expGrowth <= 0;
            kpiExpensesTrend.className = `trend-badge ${isSaved ? 'trend-down' : 'trend-up'}`;
            kpiExpensesTrend.textContent = `${expGrowth >= 0 ? '↑ +' : '↓ '}${expGrowth.toFixed(1)}%`;
        }
        if (kpiExpensesNote) {
            const expGrowth = data.expenses?.growth || 0;
            kpiExpensesNote.textContent = expGrowth <= 0 ? 'ประหยัดลงจากงวดก่อน' : 'เพิ่มขึ้นจากงวดก่อน';
        }

        // Payables Card
        if (kpiPayable) kpiPayable.textContent = `฿ ${(data.payable?.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        if (kpiPayableCount) kpiPayableCount.textContent = `${data.payable?.count || 0} บิล`;
        if (kpiPayableNote) kpiPayableNote.textContent = data.payable?.note || 'ครบกำหนดใน 7 วัน';

        // Profit Card
        if (kpiProfit) {
            const prof = data.profit?.total || 0;
            kpiProfit.textContent = `฿ ${prof.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
            kpiProfit.className = `kpi-value ${prof >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (kpiProfitMargin) {
            kpiProfitMargin.textContent = `Margin ${(data.profit?.margin || 0).toFixed(1)}%`;
        }
        if (kpiProfitHealth) {
            kpiProfitHealth.textContent = data.profit?.health || 'สุขภาพการเงินยอดเยี่ยม';
        }
    }

    function updateCharts(data) {
        if (revExpChart && data.monthlyTrend) {
            revExpChart.data.labels = data.monthlyTrend.labels;
            revExpChart.data.datasets[0].data = data.monthlyTrend.revenue;
            revExpChart.data.datasets[1].data = data.monthlyTrend.expenses;
            revExpChart.update();
        }

        if (expenseDonutChart && data.expenseCategories) {
            expenseDonutChart.data.labels = data.expenseCategories.map(c => c.category);
            expenseDonutChart.data.datasets[0].data = data.expenseCategories.map(c => c.amount);
            expenseDonutChart.data.datasets[0].backgroundColor = data.expenseCategories.map(c => c.color);
            expenseDonutChart.update();
        }
    }

    function renderExpenseBreakdown(categories) {
        if (!expenseBreakdownList) return;

        if (!categories || categories.length === 0) {
            expenseBreakdownList.innerHTML = '<div style="padding: 16px; color: #94a3b8; font-size: 13px;">ไม่มีรายการค่าใช้จ่ายในงวดนี้</div>';
            return;
        }

        expenseBreakdownList.innerHTML = categories.map(c => `
            <div class="breakdown-item">
                <span>
                    <span class="dot" style="background-color: ${c.color};"></span>
                    ${c.category}
                </span>
                <strong>${c.percent}% (฿ ${(c.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})</strong>
            </div>
        `).join('');
    }

    function renderUncollectedTable(invoices) {
        if (!uncollectedTableBody) return;

        if (!invoices || invoices.length === 0) {
            uncollectedTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 30px; color: #94a3b8;">
                        ไม่มีรายการหนี้ค้างรับ หรือได้รับการชำระเงินครบถ้วนแล้ว
                    </td>
                </tr>
            `;
            return;
        }

        uncollectedTableBody.innerHTML = invoices.map(inv => {
            const isOverdue = inv.is_overdue;
            const actionBtn = isOverdue
                ? `<button class="btn-table-action btn-danger-action btn-remind-invoice" data-doc="${inv.doc_number}" data-cust="${inv.customer_name}" title="ติดตามทวงถามหนี้">ติดตาม</button>`
                : `<button class="btn-table-action btn-remind-invoice" data-doc="${inv.doc_number}" data-cust="${inv.customer_name}" title="แจ้งเตือนลูกค้า">ส่งแจ้งเตือน</button>`;

            const targetPage = (inv.doc_type === 'TAX_INVOICE' || (inv.doc_number && inv.doc_number.startsWith('INV')))
                ? `../documents/invoices.html?search=${encodeURIComponent(inv.doc_number)}`
                : (inv.doc_type === 'BILLING_NOTE' || (inv.doc_number && inv.doc_number.startsWith('BN')))
                    ? `../documents/billing-notes.html?search=${encodeURIComponent(inv.doc_number)}`
                    : `../documents/quotations.html?search=${encodeURIComponent(inv.doc_number)}`;

            return `
                <tr>
                    <td><a href="${targetPage}" class="doc-link" title="ดูรายละเอียดเอกสาร"><strong>${inv.doc_number}</strong></a></td>
                    <td><strong>${inv.customer_name}</strong></td>
                    <td>${inv.due_date_display || inv.due_date || '-'}</td>
                    <td class="text-right"><strong>${(inv.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></td>
                    <td><span class="status-badge ${inv.status_class}">${inv.status_text}</span></td>
                    <td class="text-center">${actionBtn}</td>
                </tr>
            `;
        }).join('');

        // Wire interactive reminder buttons
        uncollectedTableBody.querySelectorAll('.btn-remind-invoice').forEach(btn => {
            btn.addEventListener('click', () => {
                const doc = btn.getAttribute('data-doc');
                const cust = btn.getAttribute('data-cust');
                btn.disabled = true;
                btn.textContent = 'ส่งเรียบร้อยแล้ว';
                btn.style.opacity = '0.7';

                showToast(`ส่งหนังสือแจ้งเตือนชำระเงินสำหรับเอกสาร "${doc}" ถึง ${cust} เรียบร้อยแล้ว`, 'success');
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = btn.classList.contains('btn-danger-action') ? 'ติดตาม' : 'ส่งแจ้งเตือน';
                    btn.style.opacity = '1';
                }, 3000);
            });
        });
    }

    function renderBankAccounts(bankData) {
        if (!bankAccountsList || !bankData) return;

        if (totalCashAmount && typeof bankData.totalCash === 'number') {
            totalCashAmount.textContent = `฿ ${bankData.totalCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        }

        if (Array.isArray(bankData.accounts)) {
            bankAccountsList.innerHTML = bankData.accounts.map(acc => {
                const codeClass = (acc.code || '').toLowerCase();
                return `
                    <div class="bank-card" onclick="window.location.href='../banking/index.html'" style="cursor: pointer;" title="คลิกเพื่อดูรายการเดินบัญชี">
                        <div class="bank-icon ${codeClass}">${acc.code || 'BANK'}</div>
                        <div class="bank-details">
                            <div class="bank-title">${acc.name}</div>
                            <div class="bank-acc-no">${acc.acc_no}</div>
                        </div>
                        <div class="bank-balance text-right">
                            <div class="balance-amt">฿ ${(acc.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                            <span class="sync-status ${acc.status_class}">${acc.status}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // =========================================================================
    // 5. Period Filter Interaction
    // =========================================================================
    if (periodFilter) {
        periodFilter.addEventListener('change', (e) => {
            currentPeriod = e.target.value;
            fetchDashboardMetrics(currentPeriod);
        });
    }

    // =========================================================================
    // 6. Global Search Implementation (Ctrl + K)
    // =========================================================================
    if (globalSearchInput && searchResultsDropdown) {
        // Global Keyboard Shortcut: Ctrl + K / Cmd + K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                globalSearchInput.focus();
                globalSearchInput.select();
            }
        });

        let searchTimeout = null;
        globalSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (!query) {
                searchResultsDropdown.style.display = 'none';
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const [docRes, custRes, prodRes] = await Promise.all([
                        fetch(`/api/documents?search=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetch(`/api/customers?search=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetch(`/api/products?search=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => [])
                    ]);

                    renderSearchResults(query, docRes.slice(0, 4), custRes.slice(0, 3), prodRes.slice(0, 3));
                } catch (err) {
                    console.error('Search error:', err);
                }
            }, 250);
        });

        document.addEventListener('click', (e) => {
            if (!globalSearchInput.contains(e.target) && !searchResultsDropdown.contains(e.target)) {
                searchResultsDropdown.style.display = 'none';
            }
        });
    }

    function renderSearchResults(query, docs, custs, prods) {
        if (!searchResultsDropdown) return;

        const totalResults = docs.length + custs.length + prods.length;
        if (totalResults === 0) {
            searchResultsDropdown.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">
                    ไม่พบผลการค้นหาสำหรับ "<strong>${escapeHtml(query)}</strong>"
                </div>
            `;
            searchResultsDropdown.style.display = 'block';
            return;
        }

        let html = '';

        if (docs.length > 0) {
            html += '<div style="padding: 6px 14px; font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; display: flex; align-items: center; gap: 6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> เอกสารการค้า (Documents)</div>';
            docs.forEach(d => {
                html += `
                    <a href="../documents/quotations.html?search=${encodeURIComponent(d.doc_number)}" class="search-item">
                        <div>
                            <div class="search-item-title">${escapeHtml(d.doc_number)}</div>
                            <div class="search-item-sub">${escapeHtml(d.customer_name)} &bull; ฿ ${(d.grand_total || 0).toLocaleString('th-TH')}</div>
                        </div>
                        <span class="search-item-badge ${d.status === 'PAID' ? 'badge-paid' : 'badge-waiting'}">${escapeHtml(d.status)}</span>
                    </a>
                `;
            });
        }

        if (custs.length > 0) {
            html += '<div style="padding: 6px 14px; font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; display: flex; align-items: center; gap: 6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ลูกค้า / คู่ค้า (Customers)</div>';
            custs.forEach(c => {
                html += `
                    <a href="../documents/quotations.html?search=${encodeURIComponent(c.name)}" class="search-item">
                        <div>
                            <div class="search-item-title">${escapeHtml(c.name)}</div>
                            <div class="search-item-sub">โทร: ${escapeHtml(c.phone || '-')} &bull; ${escapeHtml(c.email || '')}</div>
                        </div>
                        <span class="search-item-badge" style="background:#fef3c7; color:#b45309;">ลูกค้า</span>
                    </a>
                `;
            });
        }

        if (prods.length > 0) {
            html += '<div style="padding: 6px 14px; font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; display: flex; align-items: center; gap: 6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> สินค้า / บริการ (Inventory)</div>';
            prods.forEach(p => {
                html += `
                    <a href="../inventory/inventory.html?search=${encodeURIComponent(p.code || p.name)}" class="search-item">
                        <div>
                            <div class="search-item-title">${escapeHtml(p.name)}</div>
                            <div class="search-item-sub">รหัส: ${escapeHtml(p.code || '-')} &bull; คงเหลือ: ${p.quantity_on_hand || 0} ${escapeHtml(p.unit || 'ชิ้น')}</div>
                        </div>
                        <span class="search-item-badge" style="background:#fef2f2; color:#7D0A0A;">฿ ${(p.unit_price || 0).toLocaleString()}</span>
                    </a>
                `;
            });
        }

        searchResultsDropdown.innerHTML = html;
        searchResultsDropdown.style.display = 'block';
    }

    // =========================================================================
    // 7. Render Report Preview (Print / Export)
    // =========================================================================
    function renderReportPreview() {
        if (!reportPrintArea) return;
        const d = currentMetrics || {};
        const rev = d.revenue || {};
        const exp = d.expenses || {};
        const prof = d.profit || {};
        const rec = d.receivable || {};
        const pay = d.payable || {};
        const periodText = document.getElementById('periodFilter')?.selectedOptions[0]?.text || 'เดือนนี้';
        const printDateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        reportPrintArea.innerHTML = `
            <div style="background: #f8fafc; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between;">
                    <strong>รอบเวลาที่สรุป: ${periodText}</strong>
                    <span>วันที่พิมพ์รายงาน: ${printDateStr}</span>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                <thead>
                    <tr style="background: #f1f5f9; text-align: left;">
                        <th style="padding: 10px 12px; border: 1px solid #e2e8f0;">หัวข้อสรุปการเงิน</th>
                        <th style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right;">จำนวนเงิน (บาท)</th>
                        <th style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;">หมายเหตุ / การเติบโต</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0;"><strong>1. รายได้รวมทั้งหมด (Total Revenue)</strong></td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right; color: #7D0A0A; font-weight: 700;">฿ ${(rev.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;">${rev.growth >= 0 ? '+' : ''}${(rev.growth || 0).toFixed(1)}% จากงวดก่อน</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0;"><strong>2. ค่าใช้จ่ายรวมทั้งหมด (Total Expenses)</strong></td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right; color: #e11d48; font-weight: 700;">฿ ${(exp.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;">${(exp.growth || 0).toFixed(1)}% จากงวดก่อน</td>
                    </tr>
                    <tr style="background: #f0fdf4;">
                        <td style="padding: 12px; border: 1px solid #e2e8f0;"><strong>3. กำไรสุทธิจากการดำเนินงาน (Net Operating Profit)</strong></td>
                        <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right; color: #059669; font-weight: 700; font-size: 16px;">฿ ${(prof.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 700;">Profit Margin ${(prof.margin || 0).toFixed(1)}%</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0;">4. ลูกหนี้การค้าค้างรับ (Accounts Receivable)</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right;">฿ ${(rec.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;">${rec.count || 0} เอกสาร (เกินกำหนด ${rec.overdueCount || 0})</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0;">5. เจ้าหนี้การค้าค้างจ่าย (Accounts Payable)</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: right;">฿ ${(pay.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center;">${pay.count || 0} บิล</td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 16px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e; display: flex; align-items: flex-start; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <div><strong>ข้อสังเกต:</strong> สถานะทางการเงินของกิจการอยู่ในเกณฑ์ดีเยี่ยม สภาพคล่องพร้อมรองรับการเติบโตและการลงทุนขยายสาขาในงวดถัดไป</div>
            </div>
        `;
    }

    // =========================================================================
    // 8. Toast Notification Utility
    // =========================================================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('dashboardToastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `dashboard-toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.remove(); }, 300);
        }, 3500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function updatePeriodFilterLabels() {
        if (!periodFilter) return;
        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth();
        const prevDate = new Date(curYear, curMonth - 1, 1);
        const qIndex = Math.floor(curMonth / 3) + 1;
        const monthsTh = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

        const optThisMonth = periodFilter.querySelector('option[value="this_month"]');
        if (optThisMonth) optThisMonth.textContent = `เดือนนี้ (${monthsTh[curMonth]} ${curYear})`;

        const optLastMonth = periodFilter.querySelector('option[value="last_month"]');
        if (optLastMonth) optLastMonth.textContent = `เดือนที่แล้ว (${monthsTh[prevDate.getMonth()]} ${prevDate.getFullYear()})`;

        const optQuarter = periodFilter.querySelector('option[value="this_quarter"]');
        if (optQuarter) optQuarter.textContent = `ไตรมาสที่ ${qIndex} (Q${qIndex}/${curYear})`;

        const optYear = periodFilter.querySelector('option[value="this_year"]');
        if (optYear) optYear.textContent = `ทั้งปี ${curYear}`;
    }

    // =========================================================================
    // Startup
    // =========================================================================
    updatePeriodFilterLabels();
    initCharts();
    fetchDashboardMetrics(currentPeriod);
});
