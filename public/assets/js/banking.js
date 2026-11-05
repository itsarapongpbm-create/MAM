/**
 * FlowAccount Advance / MAM DESIGN AND SERVICE - Banking & Finance Logic
 * Handles Bank Accounts, Ledger, Transfers, and Reconciliation
 */

(function () {
    'use strict';

    // State
    let accountsList = [];
    let currentFilter = {
        account_id: 'all',
        type: 'all',
        period: 'this_month',
        is_reconciled: 'all',
        search: ''
    };

    // DOM Elements
    const totalCashEl = document.getElementById('kpiTotalBalance');
    const monthInflowEl = document.getElementById('kpiMonthInflow');
    const monthOutflowEl = document.getElementById('kpiMonthOutflow');
    const unreconciledCountEl = document.getElementById('kpiUnreconciledCount');
    const activeAccountsBadgeEl = document.getElementById('activeAccountsCountBadge');

    const bankCardsGrid = document.getElementById('bankCardsGrid');
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    const txEmptyState = document.getElementById('txEmptyState');
    const txCountBadge = document.getElementById('txCountBadge');

    // Filter Elements
    const filterAccountSelect = document.getElementById('filterAccountSelect');
    const filterTypeSelect = document.getElementById('filterTypeSelect');
    const filterPeriodSelect = document.getElementById('filterPeriodSelect');
    const filterReconcileSelect = document.getElementById('filterReconcileSelect');
    const searchTxInput = document.getElementById('searchTxInput');
    const btnRefresh = document.getElementById('btnRefreshLedger');

    // Modals
    const accountModal = document.getElementById('accountModal');
    const transferModal = document.getElementById('transferModal');
    const manualTxModal = document.getElementById('manualTxModal');
    const slipModal = document.getElementById('slipModal');

    // Forms
    const accountForm = document.getElementById('accountForm');
    const transferForm = document.getElementById('transferForm');
    const manualTxForm = document.getElementById('manualTxForm');

    // Formatters
    const formatCurrency = (val) => {
        const num = parseFloat(val) || 0;
        return '฿ ' + num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDateTh = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const months = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10)]} ${parts[0]}`;
        }
        return dateStr;
    };

    // 1. Load Financial Summary
    async function loadSummary() {
        try {
            const res = await fetch('/api/banking/summary');
            if (!res.ok) throw new Error('Failed to load banking summary');
            const data = await res.json();

            if (totalCashEl) totalCashEl.textContent = formatCurrency(data.totalBalance);
            if (monthInflowEl) monthInflowEl.textContent = formatCurrency(data.monthInflow);
            if (monthOutflowEl) monthOutflowEl.textContent = formatCurrency(data.monthOutflow);
            if (unreconciledCountEl) unreconciledCountEl.textContent = data.unreconciledCount;
            if (activeAccountsBadgeEl) activeAccountsBadgeEl.textContent = `${data.activeAccounts} บัญชี`;
        } catch (err) {
            console.error('Error in loadSummary:', err);
        }
    }

    // 2. Load & Render Bank Accounts
    async function loadAccounts() {
        try {
            const res = await fetch('/api/banking/accounts');
            if (!res.ok) throw new Error('Failed to load accounts');
            accountsList = await res.json();

            renderBankCards(accountsList);
            populateAccountDropdowns(accountsList);
        } catch (err) {
            console.error('Error in loadAccounts:', err);
        }
    }

    function renderBankCards(accounts) {
        if (!bankCardsGrid) return;
        if (!accounts || accounts.length === 0) {
            bankCardsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 30px; text-align: center; background: #ffffff; border-radius: 12px; border: 1px dashed #cbd5e1; color: #64748b;">
                    <p style="margin: 0 0 10px 0; font-weight: 500;">ยังไม่มีบัญชีธนาคารในระบบ</p>
                    <button type="button" class="btn-primary" onclick="window.BankingApp.openAccountModal()" style="height: 36px; padding: 0 14px; font-size: 13px;">+ เพิ่มบัญชีแรก</button>
                </div>
            `;
            return;
        }

        bankCardsGrid.innerHTML = accounts.map(acc => {
            const bankClass = (acc.bank_code || 'other').toLowerCase();
            const isCash = acc.bank_code === 'CASH' || acc.account_type === 'PETTY_CASH';
            const accTypeLabel = acc.account_type === 'CURRENT' ? 'กระแสรายวัน' : (isCash ? 'เงินสดย่อย' : 'ออมทรัพย์');
            const maskedNo = acc.account_number ? acc.account_number : (isCash ? 'เงินสดในมือ' : '-');

            return `
                <div class="atm-card ${bankClass}" data-id="${acc.id}" onclick="window.BankingApp.filterByAccount(${acc.id})" style="cursor: pointer;" title="คลิกเพื่อกรองรายการเดินบัญชีของบัญชีนี้">
                    <div class="atm-top">
                        <div class="atm-bank-badge">
                            <span class="bank-pill">${acc.bank_code}</span>
                            <span class="atm-account-type">${accTypeLabel}</span>
                        </div>
                        ${acc.is_default ? `
                            <span class="atm-default-badge" title="บัญชีหลักสำหรับพิมพ์ในเอกสาร">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                บัญชีหลัก
                            </span>
                        ` : ''}
                    </div>

                    <div class="atm-middle">
                        <div class="atm-balance-label">ยอดเงินคงเหลือในบัญชี</div>
                        <div class="atm-balance-val">${formatCurrency(acc.current_balance)}</div>
                    </div>

                    <div class="atm-bottom">
                        <div class="atm-account-info">
                            <div class="atm-name" title="${acc.account_name}">${acc.account_name}</div>
                            <div class="atm-number">
                                <span>${maskedNo}</span>
                                ${acc.account_number && !isCash ? `
                                    <button class="btn-copy-acc" title="คัดลอกเลขบัญชี" onclick="event.stopPropagation(); window.BankingApp.copyToClipboard('${acc.account_number}')">
                                        <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <div class="atm-actions" onclick="event.stopPropagation();">
                            <button class="atm-btn-action" title="โอนเงินออกจากบัญชีนี้" onclick="window.BankingApp.openTransferModal(${acc.id})">
                                โอนเงิน
                            </button>
                            <button class="atm-btn-action" title="บันทึกเงินเข้า/ออก" onclick="window.BankingApp.openManualTxModal(${acc.id})">
                                + บิล
                            </button>
                            <button class="atm-btn-action" title="แก้ไขบัญชี" onclick="window.BankingApp.openAccountModal(${acc.id})">
                                แก้ไข
                            </button>
                            <button class="atm-btn-action" title="ลบบัญชี" onclick="window.BankingApp.deleteAccount(${acc.id})" style="color: #fca5a5;">
                                ลบ
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function populateAccountDropdowns(accounts) {
        // Filter dropdown
        if (filterAccountSelect) {
            const currentVal = filterAccountSelect.value || 'all';
            filterAccountSelect.innerHTML = `<option value="all">ทุกลำดับบัญชี (ทั้งหมด)</option>` +
                accounts.map(a => `<option value="${a.id}">${a.bank_code} - ${a.account_name} (${formatCurrency(a.current_balance)})</option>`).join('');
            filterAccountSelect.value = currentVal;
        }

        // Modal Transfer: From & To
        const fromSelect = document.getElementById('transferFromAccount');
        const toSelect = document.getElementById('transferToAccount');
        const manualAccSelect = document.getElementById('manualTxAccount');

        const optHtml = accounts.map(a => `<option value="${a.id}">${a.bank_code} - ${a.account_name} (คงเหลือ ${formatCurrency(a.current_balance)})</option>`).join('');

        if (fromSelect) fromSelect.innerHTML = optHtml;
        if (toSelect) toSelect.innerHTML = optHtml;
        if (manualAccSelect) manualAccSelect.innerHTML = optHtml;

        // Auto select different accounts in transfer
        if (fromSelect && toSelect && accounts.length > 1) {
            fromSelect.selectedIndex = 0;
            toSelect.selectedIndex = 1;
        }
    }

    // 3. Load & Render Transactions
    async function loadTransactions() {
        try {
            const params = new URLSearchParams();
            if (currentFilter.account_id && currentFilter.account_id !== 'all') params.append('account_id', currentFilter.account_id);
            if (currentFilter.type && currentFilter.type !== 'all') params.append('type', currentFilter.type);
            if (currentFilter.period && currentFilter.period !== 'all') params.append('period', currentFilter.period);
            if (currentFilter.is_reconciled && currentFilter.is_reconciled !== 'all') params.append('is_reconciled', currentFilter.is_reconciled);
            if (currentFilter.search) params.append('search', currentFilter.search);

            const res = await fetch(`/api/banking/transactions?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load transactions');
            const data = await res.json();

            if (txCountBadge) txCountBadge.textContent = `${data.total} รายการ`;
            renderTransactions(data.data || []);
        } catch (err) {
            console.error('Error in loadTransactions:', err);
        }
    }

    function renderTransactions(transactions) {
        if (!transactionsTableBody) return;

        if (!transactions || transactions.length === 0) {
            transactionsTableBody.innerHTML = '';
            if (txEmptyState) txEmptyState.style.display = 'block';
            return;
        }

        if (txEmptyState) txEmptyState.style.display = 'none';

        transactionsTableBody.innerHTML = transactions.map(tx => {
            const isPositive = ['INCOME', 'TRANSFER_IN'].includes(tx.type) || (tx.type === 'ADJUST' && tx.amount >= 0);
            const amountClass = isPositive ? 'amount-in' : 'amount-out';
            const sign = isPositive ? '+' : '-';

            let typeBadgeClass = 'income';
            let typeLabel = 'เงินเข้า';
            if (tx.type === 'EXPENSE') { typeBadgeClass = 'expense'; typeLabel = 'เงินออก'; }
            else if (tx.type === 'TRANSFER_IN') { typeBadgeClass = 'transfer-in'; typeLabel = 'รับโอน'; }
            else if (tx.type === 'TRANSFER_OUT') { typeBadgeClass = 'transfer-out'; typeLabel = 'โอนออก'; }
            else if (tx.type === 'ADJUST') { typeBadgeClass = 'adjust'; typeLabel = 'ปรับปรุงยอด'; }

            const timeStr = tx.transaction_time ? ` <span style="font-size: 11px; color: #94a3b8;">${tx.transaction_time}</span>` : '';
            const refDisplay = tx.ref_number ? `<span style="font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; margin-left: 6px;">${tx.ref_number}</span>` : '';

            return `
                <tr>
                    <td style="white-space: nowrap;">
                        <div style="font-weight: 500;">${formatDateTh(tx.transaction_date)}</div>
                        ${timeStr}
                    </td>
                    <td>
                        <div style="font-weight: 600; font-size: 13px; color: #1e293b;">${tx.account_name || 'บัญชี'}</div>
                        <div style="font-size: 11.5px; color: #64748b;">${tx.bank_code || ''} ${tx.account_number || ''}</div>
                    </td>
                    <td>
                        <span class="tx-badge ${typeBadgeClass}">${typeLabel}</span>
                    </td>
                    <td>
                        <div style="font-weight: 500; color: #0f172a;">${tx.description || '-'} ${refDisplay}</div>
                        ${tx.payer_payee_name ? `<div style="font-size: 12px; color: #64748b;">คู่ค้า: ${tx.payer_payee_name}</div>` : ''}
                    </td>
                    <td class="text-right ${amountClass}">
                        ${sign}${formatCurrency(tx.amount)}
                        ${tx.fee > 0 ? `<div style="font-size: 11px; color: #94a3b8;">ค่าธรรมเนียม ฿${parseFloat(tx.fee).toFixed(2)}</div>` : ''}
                    </td>
                    <td class="text-right" style="font-family: var(--font-numeric); font-weight: 600; color: #334155;">
                        ${formatCurrency(tx.balance_after)}
                    </td>
                    <td class="text-center">
                        ${tx.slip_url ? `
                            <button type="button" class="btn-view-slip" onclick="window.BankingApp.viewSlip('${tx.slip_url}', '${tx.description || ''}')" title="ดูหลักฐานสลิป">
                                <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                <span>สลิป</span>
                            </button>
                        ` : '<span style="color: #cbd5e1;">-</span>'}
                    </td>
                    <td class="text-center">
                        <button type="button" class="btn-reconcile-toggle ${tx.is_reconciled ? 'reconciled' : 'pending'}" 
                                onclick="window.BankingApp.toggleReconcile(${tx.id})"
                                title="${tx.is_reconciled ? 'คลิกเพื่อยกเลิกการกระทบยอด' : 'คลิกเพื่อยืนยันว่ายอดตรงกับ Statement'}">
                            ${tx.is_reconciled ? `
                                <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                กระทบยอดแล้ว
                            ` : `
                                <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                รอตรวจสอบ
                            `}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 4. Modal Functions & API Submissions
    function openAccountModal(accountId = null) {
        if (!accountModal) return;
        const modalTitle = document.getElementById('accountModalTitle');
        const accIdInput = document.getElementById('accountIdInput');

        accountForm.reset();
        if (accountId) {
            modalTitle.textContent = 'แก้ไขบัญชีธนาคาร';
            accIdInput.value = accountId;
            const acc = accountsList.find(a => a.id === parseInt(accountId, 10));
            if (acc) {
                document.getElementById('accNameInput').value = acc.account_name || '';
                document.getElementById('accBankCodeSelect').value = acc.bank_code || 'KBANK';
                document.getElementById('accNumberInput').value = acc.account_number || '';
                document.getElementById('accBranchInput').value = acc.branch_name || '';
                document.getElementById('accTypeSelect').value = acc.account_type || 'SAVINGS';
                document.getElementById('accOpeningBalInput').value = acc.opening_balance || 0;
                document.getElementById('accOpeningBalInput').disabled = true; // ไม่ให้แก้ opening bal หลังสร้าง
                document.getElementById('accPromptPayInput').value = acc.promptpay_id || '';
                document.getElementById('accDefaultCheckbox').checked = Boolean(acc.is_default);
                document.getElementById('accNotesInput').value = acc.notes || '';
            }
        } else {
            modalTitle.textContent = '+ เพิ่มบัญชีธนาคาร / เงินสดย่อยใหม่';
            accIdInput.value = '';
            document.getElementById('accOpeningBalInput').disabled = false;
            document.getElementById('accOpeningBalInput').value = 0;
        }
        accountModal.style.display = 'flex';
    }

    function openTransferModal(fromId = null) {
        if (!transferModal) return;
        transferForm.reset();
        const now = new Date();
        document.getElementById('transferDate').value = now.toISOString().split('T')[0];
        document.getElementById('transferTime').value = now.toTimeString().split(' ')[0].substring(0, 5);

        if (fromId) {
            document.getElementById('transferFromAccount').value = fromId;
        }
        transferModal.style.display = 'flex';
    }

    function openManualTxModal(accId = null) {
        if (!manualTxModal) return;
        manualTxForm.reset();
        const now = new Date();
        document.getElementById('manualTxDate').value = now.toISOString().split('T')[0];
        document.getElementById('manualTxTime').value = now.toTimeString().split(' ')[0].substring(0, 5);

        if (accId) {
            document.getElementById('manualTxAccount').value = accId;
        }
        manualTxModal.style.display = 'flex';
    }

    function viewSlip(url, desc) {
        if (!slipModal) return;
        const img = document.getElementById('slipModalImg');
        const descEl = document.getElementById('slipModalDesc');
        if (img) img.src = url;
        if (descEl) descEl.textContent = desc || 'หลักฐานการโอนเงิน';
        slipModal.style.display = 'flex';
    }

    function closeModal(modalEl) {
        if (modalEl) modalEl.style.display = 'none';
    }

    // 5. Toggle Reconcile
    async function toggleReconcile(txId) {
        try {
            const res = await fetch(`/api/banking/transactions/${txId}/reconcile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to toggle reconcile status');
            // Refresh counts and current view
            await loadSummary();
            await loadAccounts();
            await loadTransactions();
        } catch (err) {
            alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะกระทบยอด: ' + err.message);
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert(`คัดลอกเลขบัญชี ${text} ไปยังคลิปบอร์ดแล้ว`);
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    }

    function filterByAccount(accountId) {
        const strId = String(accountId);
        currentFilter.account_id = (currentFilter.account_id === strId) ? 'all' : strId;
        if (filterAccountSelect) {
            filterAccountSelect.value = currentFilter.account_id;
        }
        loadTransactions();
    }

    async function deleteAccount(accountId) {
        const acc = accountsList.find(a => a.id === parseInt(accountId, 10));
        const accName = acc ? `${acc.bank_code} - ${acc.account_name}` : `#${accountId}`;
        if (!confirm(`ยืนยันการลบบัญชีธนาคาร "${accName}" หรือไม่?`)) return;

        try {
            const res = await fetch(`/api/banking/accounts/${accountId}`, {
                method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'ไม่สามารถลบบัญชีได้');

            if (String(currentFilter.account_id) === String(accountId)) {
                currentFilter.account_id = 'all';
                if (filterAccountSelect) filterAccountSelect.value = 'all';
            }
            await loadSummary();
            await loadAccounts();
            await loadTransactions();
        } catch (err) {
            alert('ข้อผิดพลาดในการลบบัญชี: ' + err.message);
        }
    }

    // 6. Setup Event Listeners
    function setupEventListeners() {
        // Filter changes
        if (filterAccountSelect) {
            filterAccountSelect.addEventListener('change', (e) => {
                currentFilter.account_id = e.target.value;
                loadTransactions();
            });
        }
        if (filterTypeSelect) {
            filterTypeSelect.addEventListener('change', (e) => {
                currentFilter.type = e.target.value;
                loadTransactions();
            });
        }
        if (filterPeriodSelect) {
            filterPeriodSelect.addEventListener('change', (e) => {
                currentFilter.period = e.target.value;
                loadTransactions();
            });
        }
        if (filterReconcileSelect) {
            filterReconcileSelect.addEventListener('change', (e) => {
                currentFilter.is_reconciled = e.target.value;
                loadTransactions();
            });
        }
        if (searchTxInput) {
            let debounceTimer;
            searchTxInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    currentFilter.search = e.target.value;
                    loadTransactions();
                }, 300);
            });
        }
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                loadSummary();
                loadAccounts();
                loadTransactions();
            });
        }

        // Account Form Submit
        if (accountForm) {
            accountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const accId = document.getElementById('accountIdInput').value;
                const body = {
                    account_name: document.getElementById('accNameInput').value.trim(),
                    bank_code: document.getElementById('accBankCodeSelect').value,
                    account_number: document.getElementById('accNumberInput').value.trim(),
                    branch_name: document.getElementById('accBranchInput').value.trim(),
                    account_type: document.getElementById('accTypeSelect').value,
                    opening_balance: parseFloat(document.getElementById('accOpeningBalInput').value) || 0,
                    promptpay_id: document.getElementById('accPromptPayInput').value.trim(),
                    is_default: document.getElementById('accDefaultCheckbox').checked ? 1 : 0,
                    notes: document.getElementById('accNotesInput').value.trim()
                };

                try {
                    const method = accId ? 'PUT' : 'POST';
                    const endpoint = accId ? `/api/banking/accounts/${accId}` : '/api/banking/accounts';

                    const res = await fetch(endpoint, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Failed to save account');

                    closeModal(accountModal);
                    await loadSummary();
                    await loadAccounts();
                    await loadTransactions();
                } catch (err) {
                    alert('ข้อผิดพลาด: ' + err.message);
                }
            });
        }

        // Transfer Form Submit
        if (transferForm) {
            transferForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fromId = document.getElementById('transferFromAccount').value;
                const toId = document.getElementById('transferToAccount').value;
                const amount = parseFloat(document.getElementById('transferAmount').value) || 0;
                const fee = parseFloat(document.getElementById('transferFee').value) || 0;
                const date = document.getElementById('transferDate').value;
                const time = document.getElementById('transferTime').value;
                const note = document.getElementById('transferNote').value.trim();

                if (fromId === toId) {
                    alert('กรุณาเลือกบัญชีต้นทางและปลายทางให้ไม่ตรงกัน');
                    return;
                }

                try {
                    const res = await fetch('/api/banking/transfers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            from_account_id: fromId,
                            to_account_id: toId,
                            amount,
                            fee,
                            transfer_date: date,
                            transfer_time: time,
                            note
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Transfer failed');

                    alert(`โอนเงินสำเร็จ! เลขที่บันทึก: ${data.transfer_number}`);
                    closeModal(transferModal);
                    await loadSummary();
                    await loadAccounts();
                    await loadTransactions();
                } catch (err) {
                    alert('ข้อผิดพลาดในการโอนเงิน: ' + err.message);
                }
            });
        }

        // Manual Transaction Type change (allow min=0 for ADJUST)
        const manualTxTypeEl = document.getElementById('manualTxType');
        const manualTxAmountEl = document.getElementById('manualTxAmount');
        if (manualTxTypeEl && manualTxAmountEl) {
            manualTxTypeEl.addEventListener('change', () => {
                manualTxAmountEl.min = manualTxTypeEl.value === 'ADJUST' ? '0' : '0.01';
            });
        }

        // Manual Transaction Form Submit
        if (manualTxForm) {
            manualTxForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const account_id = document.getElementById('manualTxAccount').value;
                const type = document.getElementById('manualTxType').value;
                const rawAmount = document.getElementById('manualTxAmount').value;
                const amount = parseFloat(rawAmount);
                if (isNaN(amount) || (type !== 'ADJUST' && amount <= 0) || (type === 'ADJUST' && amount < 0)) {
                    alert(type === 'ADJUST' ? 'กรุณาระบุยอดคงเหลือที่ต้องการปรับปรุง (ตั้งแต่ 0.00 ขึ้นไป)' : 'กรุณาระบุจำนวนเงินที่มากกว่า 0');
                    return;
                }
                const date = document.getElementById('manualTxDate').value;
                const time = document.getElementById('manualTxTime').value;
                const channel = document.getElementById('manualTxChannel').value;
                const payer_payee_name = document.getElementById('manualTxPartner').value.trim();
                const description = document.getElementById('manualTxDesc').value.trim();
                const ref_number = document.getElementById('manualTxRef').value.trim();

                try {
                    const res = await fetch('/api/banking/transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            account_id,
                            type,
                            amount,
                            transaction_date: date,
                            transaction_time: time,
                            channel,
                            payer_payee_name,
                            description,
                            ref_number
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Transaction failed');

                    closeModal(manualTxModal);
                    await loadSummary();
                    await loadAccounts();
                    await loadTransactions();
                } catch (err) {
                    alert('ข้อผิดพลาดในการบันทึกรายการ: ' + err.message);
                }
            });
        }

        // Close modal buttons
        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.getAttribute('data-close');
                if (targetId) closeModal(document.getElementById(targetId));
            });
        });

        // Close modals on clicking backdrop
        [accountModal, transferModal, manualTxModal, slipModal].forEach(m => {
            if (m) {
                m.addEventListener('click', (e) => {
                    if (e.target === m) closeModal(m);
                });
            }
        });
    }

    // Expose API for inline button handlers
    window.BankingApp = {
        openAccountModal,
        openTransferModal,
        openManualTxModal,
        viewSlip,
        closeModal,
        toggleReconcile,
        copyToClipboard,
        filterByAccount,
        deleteAccount,
        refresh: () => {
            loadSummary();
            loadAccounts();
            loadTransactions();
        }
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
        loadSummary();
        loadAccounts();
        loadTransactions();
    });
})();
