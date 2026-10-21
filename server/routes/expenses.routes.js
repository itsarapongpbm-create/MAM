/**
 * Expenses Management Routes
 * Endpoint: /api/expenses
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงสถิติภาพรวมรายจ่าย (Total, Unpaid, Paid, Claimable VAT, WHT)
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getAsync(`
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(net_total), 0) as total_amount,
                SUM(CASE WHEN payment_status = 'UNPAID' THEN 1 ELSE 0 END) as unpaid_count,
                COALESCE(SUM(CASE WHEN payment_status = 'UNPAID' THEN net_total ELSE 0 END), 0) as unpaid_amount,
                SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) as paid_count,
                COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN net_total ELSE 0 END), 0) as paid_amount,
                COALESCE(SUM(vat_amount), 0) as claimable_vat,
                COALESCE(SUM(wht_amount), 0) as total_wht
            FROM expenses
            WHERE payment_status != 'DRAFT'
        `);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ส่งออกรายงานค่าใช้จ่ายเป็นไฟล์ CSV (Excel)
router.get('/export/csv', async (req, res) => {
    try {
        const { status, category, search } = req.query;
        let query = 'SELECT * FROM expenses WHERE 1=1';
        const params = [];

        if (status && status !== 'ALL') {
            query += ' AND payment_status = ?';
            params.push(status);
        }
        if (category && category !== 'ALL') {
            query += ' AND category = ?';
            params.push(category);
        }
        if (search) {
            query += ' AND (doc_number LIKE ? OR vendor_name LIKE ? OR ref_doc_number LIKE ? OR remarks LIKE ?)';
            const p = `%${search}%`;
            params.push(p, p, p, p);
        }

        query += ' ORDER BY transaction_date DESC, id DESC';
        const rows = await db.allAsync(query, params);

        const statusMap = {
            PAID: 'ชำระแล้ว',
            UNPAID: 'รอชำระเงิน',
            DRAFT: 'แบบร่าง'
        };

        const headers = ['วันที่ทำรายการ', 'เลขที่เอกสาร', 'อ้างอิง', 'ผู้จำหน่าย/ผู้ให้บริการ', 'เลขประจำตัวผู้เสียภาษี', 'หมวดหมู่', 'ยอดก่อนภาษี', 'ภาษีมูลค่าเพิ่ม (VAT)', 'ภาษีหัก ณ ที่จ่าย', 'ยอดสุทธิ', 'สถานะการชำระ', 'วิธีชำระเงิน', 'หมายเหตุ'];
        const csvRows = [headers.join(',')];

        for (const r of rows) {
            const vals = [
                `"${r.transaction_date || ''}"`,
                `"${r.doc_number || ''}"`,
                `"${r.ref_doc_number || ''}"`,
                `"${(r.vendor_name || '').replace(/"/g, '""')}"`,
                `"${r.vendor_tax_id || ''}"`,
                `"${(r.category || '').replace(/"/g, '""')}"`,
                r.subtotal || 0,
                r.vat_amount || 0,
                r.wht_amount || 0,
                r.net_total || 0,
                `"${statusMap[r.payment_status] || r.payment_status || ''}"`,
                `"${(r.payment_method || '').replace(/"/g, '""')}"`,
                `"${(r.remarks || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(vals.join(','));
        }

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Expenses_Report_${dateStr}.csv"`);
        res.send('\uFEFF' + csvRows.join('\r\n'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายการค่าใช้จ่ายทั้งหมด พร้อมตัวกรองสถานะ หมวดหมู่ วันที่ และค้นหา
router.get('/', async (req, res) => {
    try {
        const { status, category, search, startDate, endDate } = req.query;
        let query = 'SELECT * FROM expenses WHERE 1=1';
        const params = [];

        if (status && status !== 'ALL') {
            query += ' AND payment_status = ?';
            params.push(status);
        }

        if (category && category !== 'ALL') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (doc_number LIKE ? OR vendor_name LIKE ? OR ref_doc_number LIKE ? OR remarks LIKE ?)';
            const pattern = `%${search}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        if (startDate) {
            query += ' AND transaction_date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND transaction_date <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY transaction_date DESC, id DESC';
        const expenses = await db.allAsync(query, params);
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายละเอียดค่าใช้จ่าย 1 รายการ พร้อมรายการย่อย (Expense Items)
router.get('/:id', async (req, res) => {
    try {
        const expense = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        const items = await db.allAsync('SELECT * FROM expense_items WHERE expense_id = ? ORDER BY row_order ASC, id ASC', [expense.id]);
        res.json({ ...expense, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// บันทึกรายการค่าใช้จ่ายใหม่
router.post('/', async (req, res) => {
    try {
        let {
            doc_number,
            transaction_date,
            due_date,
            ref_doc_number,
            vendor_name,
            vendor_tax_id,
            vendor_branch,
            vendor_address,
            category,
            payment_status,
            payment_method,
            subtotal,
            vat_type,
            vat_rate,
            vat_amount,
            wht_type,
            wht_rate,
            wht_amount,
            net_total,
            slip_url,
            remarks,
            items
        } = req.body;

        if (!vendor_name) return res.status(400).json({ error: 'Vendor name is required' });

        if (!doc_number || doc_number.trim() === '' || doc_number === 'AUTO') {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const maxRow = await db.getAsync(
                `SELECT MAX(CAST(substr(doc_number, 12) AS INTEGER)) as max_num FROM expenses WHERE doc_number LIKE 'EXP-${yearMonth}-%'`
            );
            const nextSeq = String(((maxRow && maxRow.max_num) || 0) + 1).padStart(3, '0');
            doc_number = `EXP-${yearMonth}-${nextSeq}`;
        }

        const expRes = await db.runAsync(`
            INSERT INTO expenses (
                company_id, doc_number, transaction_date, due_date, ref_doc_number,
                vendor_name, vendor_tax_id, vendor_branch, vendor_address, category,
                payment_status, payment_method, subtotal, vat_type, vat_rate, vat_amount,
                wht_type, wht_rate, wht_amount, net_total, slip_url, remarks
            ) VALUES (
                1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `, [
            doc_number,
            transaction_date || new Date().toISOString().split('T')[0],
            due_date || transaction_date || new Date().toISOString().split('T')[0],
            ref_doc_number || '',
            vendor_name,
            vendor_tax_id || '',
            vendor_branch || 'สำนักงานใหญ่',
            vendor_address || '',
            category || 'ค่าใช้จ่ายทั่วไป',
            payment_status || 'PAID',
            payment_method || 'โอนเงิน',
            subtotal || 0,
            vat_type || 'exclude',
            vat_rate !== undefined && vat_rate !== null && vat_rate !== '' ? Number(vat_rate) : 7,
            vat_amount || 0,
            wht_type || '0',
            wht_rate || 0,
            wht_amount || 0,
            net_total || 0,
            slip_url || '',
            remarks || ''
        ]);

        const expenseId = expRes.lastID;

        if (items && Array.isArray(items) && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                await db.runAsync(`
                    INSERT INTO expense_items (expense_id, row_order, description, category, amount, vat_rate, wht_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    expenseId,
                    i + 1,
                    item.description || 'ค่าใช้จ่าย',
                    item.category || category || 'ทั่วไป',
                    item.amount || 0,
                    item.vat_rate !== undefined && item.vat_rate !== null && item.vat_rate !== '' ? Number(item.vat_rate) : 7,
                    item.wht_rate || 0,
                    item.total_amount || item.amount || 0
                ]);
            }
        }

        const created = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [expenseId]);
        const createdItems = await db.allAsync('SELECT * FROM expense_items WHERE expense_id = ?', [expenseId]);
        res.status(201).json({ ...created, items: createdItems });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขรายการค่าใช้จ่าย
router.put('/:id', async (req, res) => {
    try {
        const expense = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        let {
            doc_number,
            transaction_date,
            due_date,
            ref_doc_number,
            vendor_name,
            vendor_tax_id,
            vendor_branch,
            vendor_address,
            category,
            payment_status,
            payment_method,
            subtotal,
            vat_type,
            vat_rate,
            vat_amount,
            wht_type,
            wht_rate,
            wht_amount,
            net_total,
            slip_url,
            remarks,
            items
        } = req.body;

        if (!vendor_name) return res.status(400).json({ error: 'Vendor name is required' });

        await db.runAsync(`
            UPDATE expenses SET
                doc_number = ?,
                transaction_date = ?,
                due_date = ?,
                ref_doc_number = ?,
                vendor_name = ?,
                vendor_tax_id = ?,
                vendor_branch = ?,
                vendor_address = ?,
                category = ?,
                payment_status = ?,
                payment_method = ?,
                subtotal = ?,
                vat_type = ?,
                vat_rate = ?,
                vat_amount = ?,
                wht_type = ?,
                wht_rate = ?,
                wht_amount = ?,
                net_total = ?,
                slip_url = ?,
                remarks = ?
            WHERE id = ?
        `, [
            doc_number || expense.doc_number,
            transaction_date || expense.transaction_date,
            due_date || transaction_date || expense.due_date,
            ref_doc_number || '',
            vendor_name,
            vendor_tax_id || '',
            vendor_branch || 'สำนักงานใหญ่',
            vendor_address || '',
            category || 'ค่าใช้จ่ายทั่วไป',
            payment_status || 'PAID',
            payment_method || 'โอนเงิน',
            subtotal || 0,
            vat_type || 'exclude',
            vat_rate !== undefined && vat_rate !== null && vat_rate !== '' ? Number(vat_rate) : 7,
            vat_amount || 0,
            wht_type || '0',
            wht_rate || 0,
            wht_amount || 0,
            net_total || 0,
            slip_url || expense.slip_url || '',
            remarks || '',
            req.params.id
        ]);

        if (items && Array.isArray(items)) {
            await db.runAsync('DELETE FROM expense_items WHERE expense_id = ?', [req.params.id]);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                await db.runAsync(`
                    INSERT INTO expense_items (expense_id, row_order, description, category, amount, vat_rate, wht_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    req.params.id,
                    i + 1,
                    item.description || 'ค่าใช้จ่าย',
                    item.category || category || 'ทั่วไป',
                    item.amount || 0,
                    item.vat_rate !== undefined && item.vat_rate !== null && item.vat_rate !== '' ? Number(item.vat_rate) : 7,
                    item.wht_rate || 0,
                    item.total_amount || item.amount || 0
                ]);
            }
        }

        const updated = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        const updatedItems = await db.allAsync('SELECT * FROM expense_items WHERE expense_id = ? ORDER BY row_order ASC, id ASC', [req.params.id]);
        res.json({ ...updated, items: updatedItems });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// อัปเดตสถานะการชำระเงินค่าใช้จ่าย (PAID / UNPAID / DRAFT)
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });
        await db.runAsync('UPDATE expenses SET payment_status = ? WHERE id = ?', [status, req.params.id]);
        const updated = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลบรายการค่าใช้จ่าย
router.delete('/:id', async (req, res) => {
    try {
        await db.runAsync('DELETE FROM expense_items WHERE expense_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM expenses WHERE id = ?', [req.params.id]);
        res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
