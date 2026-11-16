/**
 * Banking & Financial Management Routes
 * Endpoint: /api/banking
 * จัดการบัญชีธนาคาร เงินสดย่อย รายการเดินบัญชี การโอนเงินภายใน และการกระทบยอด
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// รายการธนาคารในประเทศไทยที่รองรับ พร้อมรหัสสีและชื่อ
const SUPPORTED_BANKS = [
    { code: 'KBANK', nameTh: 'ธนาคารกสิกรไทย', nameEn: 'Kasikornbank', color: '#137f43', secondaryColor: '#e8f5e9' },
    { code: 'SCB', nameTh: 'ธนาคารไทยพาณิชย์', nameEn: 'Siam Commercial Bank', color: '#4e2a84', secondaryColor: '#f3e8ff' },
    { code: 'BBL', nameTh: 'ธนาคารกรุงเทพ', nameEn: 'Bangkok Bank', color: '#1e3a8a', secondaryColor: '#e0e7ff' },
    { code: 'KTB', nameTh: 'ธนาคารกรุงไทย', nameEn: 'Krungthai Bank', color: '#00a8e8', secondaryColor: '#e0f2fe' },
    { code: 'TTB', nameTh: 'ธนาคารทหารไทยธนชาต', nameEn: 'TMBThanachart Bank', color: '#0f4c81', secondaryColor: '#e0f2fe' },
    { code: 'BAY', nameTh: 'ธนาคารกรุงศรีอยุธยา', nameEn: 'Bank of Ayudhya', color: '#fdb813', secondaryColor: '#fef3c7' },
    { code: 'GSB', nameTh: 'ธนาคารออมสิน', nameEn: 'Government Savings Bank', color: '#eb008b', secondaryColor: '#fce7f3' },
    { code: 'UOB', nameTh: 'ธนาคารยูโอบี', nameEn: 'United Overseas Bank', color: '#0b2e6d', secondaryColor: '#e2e8f0' },
    { code: 'CASH', nameTh: 'เงินสด / เงินสดย่อย', nameEn: 'Petty Cash / Cash', color: '#334155', secondaryColor: '#f1f5f9' },
    { code: 'OTHER', nameTh: 'ธนาคารหรือช่องทางอื่นๆ', nameEn: 'Other Bank / Gateway', color: '#64748b', secondaryColor: '#f8fafc' }
];

// 1. ดึงรายการธนาคารที่รองรับ
router.get('/banks', (req, res) => {
    res.json(SUPPORTED_BANKS);
});

// 2. ดึงข้อมูลสรุป KPI การเงินรวม (Total Liquidity, Month Inflow, Month Outflow, Unreconciled Count)
router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // ยอดคงเหลือรวมทุกบัญชีที่ยังใช้งาน
        const balRow = await db.getAsync(`
            SELECT COALESCE(SUM(current_balance), 0) as total_balance, COUNT(*) as active_accounts
            FROM bank_accounts
            WHERE status = 'ACTIVE'
        `);

        // เงินเข้าเดือนนี้ (เฉพาะ INCOME / DEPOSIT ไม่รวมรายการโอนระหว่างบัญชีภายใน TRANSFER_IN)
        const inRow = await db.getAsync(`
            SELECT COALESCE(SUM(amount), 0) as month_inflow
            FROM bank_transactions
            WHERE type IN ('INCOME', 'DEPOSIT')
              AND substr(transaction_date, 1, 7) = ?
        `, [curYm]);

        // เงินออกเดือนนี้ (เฉพาะ EXPENSE / WITHDRAWAL รวมถึงค่าธรรมเนียม ไม่รวมรายการโอนระหว่างบัญชีภายใน TRANSFER_OUT)
        const outRow = await db.getAsync(`
            SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0) as month_outflow
            FROM bank_transactions
            WHERE type IN ('EXPENSE', 'WITHDRAWAL')
              AND substr(transaction_date, 1, 7) = ?
        `, [curYm]);

        // จำนวนรายการที่ยังไม่ได้กระทบยอด (Unreconciled)
        const unreconciledRow = await db.getAsync(`
            SELECT COUNT(*) as unreconciled_count
            FROM bank_transactions
            WHERE is_reconciled = 0
        `);

        res.json({
            totalBalance: balRow ? parseFloat(balRow.total_balance) : 0,
            activeAccounts: balRow ? balRow.active_accounts : 0,
            monthInflow: inRow ? parseFloat(inRow.month_inflow) : 0,
            monthOutflow: outRow ? parseFloat(outRow.month_outflow) : 0,
            netCashFlow: (inRow ? parseFloat(inRow.month_inflow) : 0) - (outRow ? parseFloat(outRow.month_outflow) : 0),
            unreconciledCount: unreconciledRow ? unreconciledRow.unreconciled_count : 0,
            currentPeriod: curYm
        });
    } catch (err) {
        console.error('Error fetching banking summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. ดึงรายการบัญชีธนาคารทั้งหมด
router.get('/accounts', async (req, res) => {
    try {
        const accounts = await db.allAsync(`
            SELECT 
                b.*,
                COALESCE((SELECT COUNT(*) FROM bank_transactions WHERE account_id = b.id AND is_reconciled = 0), 0) as unreconciled_count,
                (SELECT MAX(transaction_date) FROM bank_transactions WHERE account_id = b.id) as last_transaction_date,
                (SELECT COUNT(*) FROM bank_transactions WHERE account_id = b.id) as total_transactions
            FROM bank_accounts b
            WHERE b.status = 'ACTIVE'
            ORDER BY b.is_default DESC, b.id ASC
        `);

        // เติม bank metadata
        const enriched = (accounts || []).map(acc => {
            const meta = SUPPORTED_BANKS.find(s => s.code === acc.bank_code) || {
                color: '#64748b',
                secondaryColor: '#f8fafc',
                nameTh: acc.bank_code,
                nameEn: acc.bank_code
            };
            return {
                ...acc,
                bank_name_th: meta.nameTh,
                bank_name_en: meta.nameEn,
                bank_color: acc.color || meta.color,
                bank_secondary_color: meta.secondaryColor
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('Error listing bank accounts:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. ดึงข้อมูลบัญชีตาม ID
router.get('/accounts/:id', async (req, res) => {
    try {
        const acc = await db.getAsync(`SELECT * FROM bank_accounts WHERE id = ?`, [req.params.id]);
        if (!acc) return res.status(404).json({ error: 'ไม่พบข้อมูลบัญชีธนาคารนี้' });
        res.json(acc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. เพิ่มบัญชีธนาคารใหม่
router.post('/accounts', async (req, res) => {
    try {
        const {
            account_name,
            bank_code,
            bank_name,
            account_number,
            branch_name,
            account_type = 'SAVINGS',
            opening_balance,
            current_balance,
            promptpay_id,
            is_default = 0,
            color,
            notes
        } = req.body;

        const rawBank = String(bank_code || bank_name || '').trim();
        if (!account_name || !rawBank) {
            return res.status(400).json({ error: 'กรุณากรอกชื่อบัญชีและเลือกธนาคาร' });
        }

        const matchedBank = SUPPORTED_BANKS.find(
            b => b.code.toUpperCase() === rawBank.toUpperCase() || b.nameTh === rawBank || b.nameEn.toLowerCase() === rawBank.toLowerCase()
        );
        const resolvedBankCode = matchedBank ? matchedBank.code : rawBank.toUpperCase();

        const rawAccType = String(account_type || 'SAVINGS').toUpperCase();
        const resolvedAccountType = rawAccType === 'CASH'
            ? 'PETTY_CASH'
            : (['SAVINGS', 'CURRENT', 'PETTY_CASH', 'PROMPTPAY', 'OTHER'].includes(rawAccType) ? rawAccType : 'SAVINGS');

        const rawOpenBal = opening_balance !== undefined ? opening_balance : (current_balance !== undefined ? current_balance : 0);
        const openBal = parseFloat(rawOpenBal) || 0;
        const defVal = is_default ? 1 : 0;

        // ถ้าตั้งเป็น default ให้เคลียร์ default เดิม
        if (defVal === 1) {
            await db.runAsync(`UPDATE bank_accounts SET is_default = 0 WHERE company_id = 1`);
        }

        // Gen account_code
        const countRow = await db.getAsync(`SELECT COUNT(*) as count FROM bank_accounts WHERE bank_code = ?`, [resolvedBankCode]);
        const seq = (Number(countRow?.count) || 0) + 1;
        const account_code = `ACC-${resolvedBankCode}-${String(seq).padStart(2, '0')}`;

        const bankMeta = SUPPORTED_BANKS.find(b => b.code === resolvedBankCode);
        const cardColor = color || bankMeta?.color || '#334155';

        const insertRes = await db.runAsync(`
            INSERT INTO bank_accounts (
                company_id, account_code, account_name, bank_code, account_number, 
                branch_name, account_type, opening_balance, current_balance, promptpay_id, 
                is_default, color, notes
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            account_code, account_name, resolvedBankCode, account_number || '',
            branch_name || '', resolvedAccountType, openBal, openBal, promptpay_id || null,
            defVal, cardColor, notes || ''
        ]);

        const newId = insertRes?.lastID || insertRes?.insertId;

        // ถ้ามียอดยกมาเริ่มต้น ให้บันทึก Transaction
        if (openBal > 0 && newId) {
            const today = new Date().toISOString().split('T')[0];
            const nowTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            await db.runAsync(`
                INSERT INTO bank_transactions (
                    company_id, account_id, transaction_date, transaction_time, 
                    type, amount, balance_after, channel, description, 
                    is_reconciled, reconciled_at, created_by
                ) VALUES (1, ?, ?, ?, 'ADJUST', ?, ?, 'TRANSFER', 'ยอดยกมาเริ่มต้นเปิดบัญชี', 1, CURRENT_TIMESTAMP, 'Admin')
            `, [newId, today, nowTime, openBal, openBal]);
        }

        res.status(201).json({
            message: 'เพิ่มบัญชีธนาคารสำเร็จ',
            id: newId,
            account_code
        });
    } catch (err) {
        console.error('Error creating bank account:', err);
        res.status(500).json({ error: err.message });
    }
});

// 6. อัปเดตข้อมูลบัญชี
router.put('/accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            account_name,
            account_number,
            branch_name,
            account_type,
            promptpay_id,
            is_default,
            color,
            notes,
            status
        } = req.body;

        const existing = await db.getAsync(`SELECT * FROM bank_accounts WHERE id = ?`, [id]);
        if (!existing) return res.status(404).json({ error: 'ไม่พบบัญชีที่ต้องการแก้ไข' });

        if (is_default === 1 || is_default === true) {
            await db.runAsync(`UPDATE bank_accounts SET is_default = 0 WHERE company_id = 1 AND id != ?`, [id]);
        }

        const resolvedAccType = account_type
            ? (String(account_type).toUpperCase() === 'CASH' ? 'PETTY_CASH' : String(account_type).toUpperCase())
            : null;

        await db.runAsync(`
            UPDATE bank_accounts
            SET account_name = COALESCE(?, account_name),
                account_number = COALESCE(?, account_number),
                branch_name = COALESCE(?, branch_name),
                account_type = COALESCE(?, account_type),
                promptpay_id = ?,
                is_default = COALESCE(?, is_default),
                color = COALESCE(?, color),
                notes = COALESCE(?, notes),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            account_name, account_number, branch_name, resolvedAccType,
            promptpay_id || null, is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
            color, notes, status, id
        ]);

        res.json({ message: 'อัปเดตข้อมูลบัญชีสำเร็จ' });
    } catch (err) {
        console.error('Error updating bank account:', err);
        res.status(500).json({ error: err.message });
    }
});

// 7. ลบหรือปิดใช้งานบัญชี
router.delete('/accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const txCount = await db.getAsync(`
            SELECT COUNT(*) as count 
            FROM bank_transactions 
            WHERE account_id = ? AND type != 'ADJUST'
        `, [id]);

        if (txCount && txCount.count > 0) {
            // หากมีรายการธุรกรรมจริง ให้เปลี่ยนสถานะเป็น INACTIVE แทนการลบเพื่อรักษาความต่อเนื่องทางบัญชี
            await db.runAsync(`UPDATE bank_accounts SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
            return res.json({ message: 'บัญชีนี้มีประวัติธุรกรรมแล้ว ระบบได้เปลี่ยนสถานะเป็น "ปิดใช้งาน" เพื่อรักษาประวัติการเงิน' });
        }

        // หากไม่มีธุรกรรม ให้ลบได้
        await db.runAsync(`DELETE FROM bank_transactions WHERE account_id = ?`, [id]);
        await db.runAsync(`DELETE FROM bank_accounts WHERE id = ?`, [id]);
        res.json({ message: 'ลบบัญชีธนาคารเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Error deleting bank account:', err);
        res.status(500).json({ error: err.message });
    }
});

// 8. ดึงรายการเดินบัญชี / ความเคลื่อนไหว (Transactions Ledger)
router.get('/transactions', async (req, res) => {
    try {
        const {
            account_id,
            type,
            period = 'all',
            is_reconciled,
            search,
            limit = 100,
            offset = 0
        } = req.query;

        let whereClauses = ['1=1'];
        let params = [];

        if (account_id && account_id !== 'all') {
            whereClauses.push('t.account_id = ?');
            params.push(account_id);
        }

        if (type && type !== 'all') {
            whereClauses.push('t.type = ?');
            params.push(type);
        }

        if (is_reconciled !== undefined && is_reconciled !== 'all' && is_reconciled !== '') {
            whereClauses.push('t.is_reconciled = ?');
            params.push(parseInt(is_reconciled, 10));
        }

        const now = new Date();
        const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        if (period === 'this_month') {
            whereClauses.push("substr(t.transaction_date, 1, 7) = ?");
            params.push(curYm);
        } else if (period === 'last_month') {
            whereClauses.push("substr(t.transaction_date, 1, 7) = ?");
            params.push(prevYm);
        } else if (period === 'this_year') {
            whereClauses.push("substr(t.transaction_date, 1, 4) = ?");
            params.push(String(now.getFullYear()));
        }

        if (search && search.trim()) {
            whereClauses.push('(t.description LIKE ? OR t.ref_number LIKE ? OR t.payer_payee_name LIKE ?)');
            const s = `%${search.trim()}%`;
            params.push(s, s, s);
        }

        const whereSql = whereClauses.join(' AND ');

        const totalRow = await db.getAsync(`
            SELECT COUNT(*) as count 
            FROM bank_transactions t 
            WHERE ${whereSql}
        `, params);

        const rows = await db.allAsync(`
            SELECT 
                t.*,
                b.account_name,
                b.bank_code,
                b.account_number,
                b.color as bank_color
            FROM bank_transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE ${whereSql}
            ORDER BY t.transaction_date DESC, t.transaction_time DESC, t.id DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

        res.json({
            total: totalRow ? totalRow.count : 0,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            data: rows || []
        });
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ error: err.message });
    }
});

// 9. บันทึกรายการเงินเข้า/ออก ด้วยตนเอง (Manual Transaction)
router.post('/transactions', async (req, res) => {
    try {
        const {
            account_id,
            transaction_date,
            transaction_time,
            type, // 'INCOME', 'EXPENSE', 'ADJUST'
            amount,
            fee = 0,
            channel = 'TRANSFER',
            payer_payee_name,
            description,
            slip_url,
            ref_number
        } = req.body;

        const rawType = (type || req.body.tx_type || '').toUpperCase();
        const normalizedType = rawType === 'DEPOSIT' ? 'INCOME' : (rawType === 'WITHDRAWAL' ? 'EXPENSE' : rawType);

        if (!account_id || !transaction_date || !normalizedType || amount === undefined) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็น: บัญชี, วันที่, ประเภท, และจำนวนเงิน' });
        }

        const amt = parseFloat(amount);
        const feeAmt = parseFloat(fee) || 0;
        if (isNaN(amt) || (normalizedType === 'ADJUST' ? amt < 0 : amt <= 0)) {
            return res.status(400).json({ error: normalizedType === 'ADJUST' ? 'จำนวนเงินต้องไม่ติดลบ' : 'จำนวนเงินต้องมากกว่า 0' });
        }

        const acc = await db.getAsync(`SELECT * FROM bank_accounts WHERE id = ?`, [account_id]);
        if (!acc) return res.status(404).json({ error: 'ไม่พบบัญชีธนาคารนี้' });

        let newBalance = parseFloat(acc.current_balance);
        if (normalizedType === 'INCOME') {
            newBalance += amt;
        } else if (normalizedType === 'EXPENSE') {
            newBalance -= (amt + feeAmt);
        } else if (normalizedType === 'ADJUST') {
            newBalance = amt; // ตั้งยอดใหม่ตรงๆ (อนุญาต 0 บาทได้)
        }

        // อัปเดตยอดคงเหลือในบัญชี
        await db.runAsync(`
            UPDATE bank_accounts 
            SET current_balance = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [newBalance, account_id]);

        const timeStr = transaction_time || new Date().toTimeString().split(' ')[0].substring(0, 5);

        const insertRes = await db.runAsync(`
            INSERT INTO bank_transactions (
                company_id, account_id, transaction_date, transaction_time,
                type, amount, fee, balance_after, channel,
                ref_doc_type, ref_number, payer_payee_name,
                description, slip_url, is_reconciled, created_by
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?, 0, 'Admin')
        `, [
            account_id, transaction_date, timeStr,
            normalizedType, amt, feeAmt, newBalance, channel,
            ref_number || null, payer_payee_name || null,
            description || (normalizedType === 'INCOME' ? 'รับเงินเข้า' : (normalizedType === 'ADJUST' ? 'ปรับปรุงยอดคงเหลือ' : 'จ่ายเงินออก')),
            slip_url || null
        ]);

        res.status(201).json({
            message: 'บันทึกรายการสำเร็จ',
            id: insertRes?.lastID,
            new_balance: newBalance
        });
    } catch (err) {
        console.error('Error creating manual transaction:', err);
        res.status(500).json({ error: err.message });
    }
});

// 10. โอนเงินระหว่างบัญชีภายใน (Internal Transfer)
router.post('/transfers', async (req, res) => {
    try {
        const {
            from_account_id,
            to_account_id,
            amount,
            fee = 0,
            transfer_date,
            transfer_time,
            note,
            slip_url
        } = req.body;

        if (!from_account_id || !to_account_id || !amount) {
            return res.status(400).json({ error: 'กรุณาระบุบัญชีต้นทาง, บัญชีปลายทาง และจำนวนเงิน' });
        }

        if (parseInt(from_account_id, 10) === parseInt(to_account_id, 10)) {
            return res.status(400).json({ error: 'บัญชีต้นทางและบัญชีปลายทางต้องเป็นคนละบัญชีกัน' });
        }

        const amt = parseFloat(amount);
        const feeAmt = parseFloat(fee) || 0;
        if (isNaN(amt) || amt <= 0) {
            return res.status(400).json({ error: 'จำนวนเงินโอนต้องมากกว่า 0' });
        }

        const fromAcc = await db.getAsync(`SELECT * FROM bank_accounts WHERE id = ?`, [from_account_id]);
        const toAcc = await db.getAsync(`SELECT * FROM bank_accounts WHERE id = ?`, [to_account_id]);

        if (!fromAcc || !toAcc) {
            return res.status(404).json({ error: 'ไม่พบบัญชีต้นทางหรือปลายทาง' });
        }

        const totalDeduct = amt + feeAmt;
        if (parseFloat(fromAcc.current_balance) < totalDeduct) {
            return res.status(400).json({
                error: `ยอดเงินในบัญชีต้นทางไม่พอ (มี ฿${parseFloat(fromAcc.current_balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })} แต่ต้องการโอนรวมค่าธรรมเนียม ฿${totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`
            });
        }

        // รันเลขที่การโอน TR-YYYYMM-XXXX
        const now = new Date();
        const curYmStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const countRow = await db.getAsync(`
            SELECT COUNT(*) as count 
            FROM internal_transfers 
            WHERE transfer_number LIKE ?
        `, [`TR-${curYmStr}%`]);
        const seq = (Number(countRow?.count) || 0) + 1;
        const transfer_number = `TR-${curYmStr}-${String(seq).padStart(4, '0')}`;

        const tDate = transfer_date || now.toISOString().split('T')[0];
        const tTime = transfer_time || now.toTimeString().split(' ')[0].substring(0, 5);

        const newFromBal = parseFloat(fromAcc.current_balance) - totalDeduct;
        const newToBal = parseFloat(toAcc.current_balance) + amt;

        // บันทึก Internal Transfer
        await db.runAsync(`
            INSERT INTO internal_transfers (
                company_id, transfer_number, from_account_id, to_account_id,
                amount, fee, transfer_date, transfer_time, slip_url, note, created_by
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin')
        `, [transfer_number, from_account_id, to_account_id, amt, feeAmt, tDate, tTime, slip_url || null, note || null]);

        // อัปเดตยอดทั้งสองบัญชี
        await db.runAsync(`UPDATE bank_accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newFromBal, from_account_id]);
        await db.runAsync(`UPDATE bank_accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newToBal, to_account_id]);

        // บันทึก Transaction เงินออก (TRANSFER_OUT)
        await db.runAsync(`
            INSERT INTO bank_transactions (
                company_id, account_id, transaction_date, transaction_time,
                type, amount, fee, balance_after, channel,
                ref_doc_type, ref_number, description, slip_url, is_reconciled, created_by
            ) VALUES (1, ?, ?, ?, 'TRANSFER_OUT', ?, ?, ?, 'TRANSFER', 'TRANSFER', ?, ?, ?, 1, 'Admin')
        `, [
            from_account_id, tDate, tTime, amt, feeAmt, newFromBal,
            transfer_number, `โอนเงินไปยัง ${toAcc.account_name}${feeAmt > 0 ? ` (ค่าธรรมเนียม ฿${feeAmt.toFixed(2)})` : ''}`,
            slip_url || null
        ]);

        // บันทึก Transaction เงินเข้า (TRANSFER_IN)
        await db.runAsync(`
            INSERT INTO bank_transactions (
                company_id, account_id, transaction_date, transaction_time,
                type, amount, fee, balance_after, channel,
                ref_doc_type, ref_number, description, slip_url, is_reconciled, created_by
            ) VALUES (1, ?, ?, ?, 'TRANSFER_IN', ?, 0, ?, 'TRANSFER', 'TRANSFER', ?, ?, ?, 1, 'Admin')
        `, [
            to_account_id, tDate, tTime, amt, newToBal,
            transfer_number, `รับโอนเงินจาก ${fromAcc.account_name}`,
            slip_url || null
        ]);

        res.status(201).json({
            message: 'โอนเงินระหว่างบัญชีสำเร็จเรียบร้อย',
            transfer_number,
            from_balance: newFromBal,
            to_balance: newToBal
        });
    } catch (err) {
        console.error('Error handling internal transfer:', err);
        res.status(500).json({ error: err.message });
    }
});

// 11. ติ๊กสลับสถานะกระทบยอด (Reconcile Toggle)
router.patch('/transactions/:id/reconcile', async (req, res) => {
    try {
        const { id } = req.params;
        const tx = await db.getAsync(`SELECT is_reconciled FROM bank_transactions WHERE id = ?`, [id]);
        if (!tx) return res.status(404).json({ error: 'ไม่พบรายการธุรกรรมนี้' });

        const newStatus = tx.is_reconciled ? 0 : 1;
        const reconTime = newStatus === 1 ? new Date().toISOString() : null;

        await db.runAsync(`
            UPDATE bank_transactions 
            SET is_reconciled = ?, reconciled_at = ?
            WHERE id = ?
        `, [newStatus, reconTime, id]);

        res.json({
            message: newStatus === 1 ? 'กระทบยอดเรียบร้อยแล้ว' : 'ยกเลิกการกระทบยอด',
            is_reconciled: newStatus
        });
    } catch (err) {
        console.error('Error toggling reconcile status:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
