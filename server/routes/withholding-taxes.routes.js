/**
 * Withholding Taxes (หนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ) Routes
 * Endpoint: /api/withholding-taxes
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

const SEQ_DOC_TYPE = 'WITHHOLDING_TAX';
const DOC_PREFIX = 'WHT';
const ALLOWED_FORM_TYPES = ['ภ.ง.ด.1', 'ภ.ง.ด.2', 'ภ.ง.ด.3', 'ภ.ง.ด.53'];
const ALLOWED_TAX_CONDITIONS = ['withheld', 'always', 'once'];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function periodOf(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const safe = isNaN(d.getTime()) ? new Date() : d;
    return `${safe.getFullYear()}${String(safe.getMonth() + 1).padStart(2, '0')}`;
}

function formatDocNumber(period, no) {
    return `${DOC_PREFIX}-${period}-${String(no).padStart(3, '0')}`;
}

// เลขที่สูงสุดที่มีอยู่จริงในตาราง (กันชนกับข้อมูลเก่าที่ออกก่อนใช้ document_sequences)
async function maxExistingNo(period) {
    const prefix = `${DOC_PREFIX}-${period}-`;
    const row = await db.getAsync(
        `SELECT MAX(CAST(substr(doc_number, ?) AS INTEGER)) AS mx FROM withholding_taxes WHERE doc_number LIKE ?`,
        [prefix.length + 1, `${prefix}%`]
    );
    return (row && row.mx) || 0;
}

// รันเลขที่ถัดไปแบบไม่ซ้ำ แม้มีการลบ/ยกเลิกเอกสาร (ใช้ตาราง document_sequences)
async function getNextWhtNumber(docDate) {
    const period = periodOf(docDate);
    const existing = await maxExistingNo(period);
    await db.runAsync(`
        INSERT INTO document_sequences (company_id, doc_type, period, last_no)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(company_id, doc_type, period)
        DO UPDATE SET last_no = MAX(last_no + 1, excluded.last_no), updated_at = CURRENT_TIMESTAMP
    `, [SEQ_DOC_TYPE, period, existing + 1]);
    const row = await db.getAsync(
        `SELECT last_no FROM document_sequences WHERE company_id = 1 AND doc_type = ? AND period = ?`,
        [SEQ_DOC_TYPE, period]
    );
    return formatDocNumber(period, row ? row.last_no : existing + 1);
}

async function peekNextWhtNumber(docDate) {
    const period = periodOf(docDate);
    const existing = await maxExistingNo(period);
    const row = await db.getAsync(
        `SELECT last_no FROM document_sequences WHERE company_id = 1 AND doc_type = ? AND period = ?`,
        [SEQ_DOC_TYPE, period]
    );
    return formatDocNumber(period, Math.max(row ? row.last_no : 0, existing) + 1);
}

async function getPayerCompany() {
    return db.getAsync('SELECT * FROM companies WHERE id = 1')
        .then(row => row || db.getAsync('SELECT * FROM companies ORDER BY id LIMIT 1'));
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

// ตรวจสอบและทำความสะอาดข้อมูลจากฟอร์ม (ใช้ร่วมกันทั้งสร้างใหม่และแก้ไข)
function validatePayload(body, isDraft = false) {
    const errors = [];
    const payeeName = String(body.payee_name || '').trim();
    const payeeTaxId = String(body.payee_tax_id || '').replace(/[^0-9]/g, '');
    let incomeAmount = round2(body.income_amount);
    let taxRate = Number(body.tax_rate) || 0;
    let incomeType = String(body.income_type || 'ค่าบริการ').trim();
    let taxAmount = 0;
    let itemsJson = null;
    const formType = ALLOWED_FORM_TYPES.includes(body.form_type) ? body.form_type : (isDraft ? 'ภ.ง.ด.53' : null);
    const taxCondition = ALLOWED_TAX_CONDITIONS.includes(body.tax_condition) ? body.tax_condition : 'withheld';

    const docDate = body.doc_date || new Date().toISOString().split('T')[0];

    // รองรับหลายรายการเงินได้ในใบเดียว (Multi-row)
    if (Array.isArray(body.items) && body.items.length > 0) {
        let totalIncome = 0;
        let totalTax = 0;
        const validItems = [];
        const typeSet = new Set();

        for (const it of body.items) {
            const amt = round2(it.income_amount);
            const rate = Number(it.tax_rate) || 0;
            if (amt > 0 || isDraft) {
                const itemTax = round2(amt * rate / 100);
                totalIncome += amt;
                totalTax += itemTax;
                const desc = String(it.income_type || 'ค่าบริการ').trim();
                typeSet.add(desc);
                validItems.push({
                    row_no: it.row_no || 5,
                    income_type: desc,
                    payment_date: it.payment_date || docDate,
                    income_amount: amt,
                    tax_rate: rate,
                    tax_amount: itemTax
                });
            }
        }

        if (validItems.length > 0) {
            incomeAmount = round2(totalIncome);
            taxAmount = round2(totalTax);
            taxRate = validItems[0].tax_rate;
            incomeType = Array.from(typeSet).join(', ') || 'ค่าบริการ';
            itemsJson = JSON.stringify(validItems);
        }
    } else {
        taxAmount = round2(incomeAmount * taxRate / 100);
    }

    if (!isDraft) {
        if (!payeeName) errors.push('กรุณาระบุชื่อผู้ถูกหักภาษี ณ ที่จ่าย');
        if (payeeTaxId.length !== 13) errors.push('เลขประจำตัวผู้เสียภาษีของผู้ถูกหักต้องมี 13 หลัก');
        if (!formType) errors.push('แบบยื่นภาษีไม่ถูกต้อง');
        if (!(incomeAmount > 0)) errors.push('จำนวนเงินที่จ่ายต้องมากกว่า 0');
        if (!(taxRate >= 0 && taxRate <= 100)) errors.push('อัตราภาษีไม่ถูกต้อง');
    } else {
        if (!payeeName && !payeeTaxId) {
            errors.push('กรุณาระบุชื่อคู่ค้า / ผู้ถูกหักภาษี หรือข้อมูลเบื้องต้นเพื่อบันทึกแบบร่าง');
        }
    }

    return {
        errors,
        data: {
            book_number: String(body.book_number || '01').trim() || '01',
            doc_date: docDate,
            form_type: formType || 'ภ.ง.ด.53',
            sequence_no: String(body.sequence_no || '1').trim() || '1',
            payee_type: formType === 'ภ.ง.ด.53' ? 'juristic' : 'personal',
            payee_tax_id: payeeTaxId,
            payee_name: payeeName || 'แบบร่าง (ยังไม่ระบุชื่อ)',
            payee_address: String(body.payee_address || '').trim(),
            income_type: incomeType,
            payment_date: body.payment_date || docDate,
            income_amount: incomeAmount,
            tax_rate: taxRate,
            // คำนวณภาษีฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าที่ส่งมาจากหน้าเว็บ
            tax_amount: taxAmount,
            tax_condition: taxCondition,
            ref_expense_number: String(body.ref_expense_number || '').trim(),
            items_json: itemsJson
        }
    };
}

// เงื่อนไขกรองข้อมูลที่ใช้ร่วมกันระหว่าง list และ stats
function buildFilters(query) {
    const { form_type, search, startDate, endDate, month, status } = query;
    let where = ' WHERE 1=1';
    const params = [];

    if (status) {
        where += ' AND status = ?';
        params.push(status);
    }
    if (form_type && form_type !== 'ALL') {
        where += ' AND form_type = ?';
        params.push(form_type);
    }
    if (search) {
        where += ' AND (doc_number LIKE ? OR payee_name LIKE ? OR payee_tax_id LIKE ? OR income_type LIKE ?)';
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
    }
    // เดือนภาษี (YYYY-MM) อ้างอิงวันที่จ่ายเงิน เพราะการยื่น ภ.ง.ด. นับตามเดือนที่จ่าย
    if (month && /^\d{4}-\d{2}$/.test(month)) {
        where += ' AND substr(COALESCE(payment_date, doc_date), 1, 7) = ?';
        params.push(month);
    }
    if (startDate) {
        where += ' AND doc_date >= ?';
        params.push(startDate);
    }
    if (endDate) {
        where += ' AND doc_date <= ?';
        params.push(endDate);
    }
    return { where, params };
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

// ดึงสถิติภาษีหัก ณ ที่จ่าย (ไม่นับรายการที่ยกเลิก) รองรับกรองตามเดือน ?month=YYYY-MM
router.get('/stats', async (req, res) => {
    try {
        const { where, params } = buildFilters({ month: req.query.month });
        const stats = await db.getAsync(`
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(tax_amount), 0) as total_tax_amount,
                COALESCE(SUM(income_amount), 0) as total_income_amount,
                SUM(CASE WHEN form_type = 'ภ.ง.ด.53' THEN 1 ELSE 0 END) as pnd53_count,
                COALESCE(SUM(CASE WHEN form_type = 'ภ.ง.ด.53' THEN tax_amount ELSE 0 END), 0) as pnd53_amount,
                SUM(CASE WHEN form_type = 'ภ.ง.ด.3' THEN 1 ELSE 0 END) as pnd3_count,
                COALESCE(SUM(CASE WHEN form_type = 'ภ.ง.ด.3' THEN tax_amount ELSE 0 END), 0) as pnd3_amount,
                SUM(CASE WHEN form_type = 'ภ.ง.ด.1' THEN 1 ELSE 0 END) as pnd1_count,
                COALESCE(SUM(CASE WHEN form_type = 'ภ.ง.ด.1' THEN tax_amount ELSE 0 END), 0) as pnd1_amount
            FROM withholding_taxes
            ${where} AND COALESCE(status, 'COMPLETED') NOT IN ('CANCELLED', 'DRAFT')
        `, params);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดูเลขที่เอกสารถัดไป (แสดงตัวอย่างในฟอร์ม ยังไม่จองเลข)
router.get('/next-number', async (req, res) => {
    try {
        res.json({ doc_number: await peekNextWhtNumber(req.query.date) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายการหนังสือรับรองหัก ณ ที่จ่ายทั้งหมด
router.get('/', async (req, res) => {
    try {
        const { where, params } = buildFilters(req.query);
        const rows = await db.allAsync(
            `SELECT * FROM withholding_taxes ${where} ORDER BY doc_date DESC, id DESC`,
            params
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายละเอียดหนังสือรับรองหัก ณ ที่จ่าย 1 ฉบับ
router.get('/:id', async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'ไม่พบหนังสือรับรองนี้' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// บันทึกหนังสือรับรองหัก ณ ที่จ่ายใหม่
router.post('/', async (req, res) => {
    try {
        const status = (req.body.status === 'DRAFT') ? 'DRAFT' : 'COMPLETED';
        const isDraft = status === 'DRAFT';
        const { errors, data } = validatePayload(req.body, isDraft);
        if (errors.length) return res.status(400).json({ error: errors.join('\n') });

        // ข้อมูลผู้จ่าย (ผู้มีหน้าที่หักภาษี) ดึงจากข้อมูลบริษัทในระบบเสมอ
        const company = await getPayerCompany();
        if (!company) return res.status(500).json({ error: 'ไม่พบข้อมูลบริษัทผู้จ่ายเงินในระบบ' });
        const payerName = company.branch ? `${company.name} (${company.branch})` : company.name;

        let docNumber = String(req.body.doc_number || '').trim();
        if (!docNumber || docNumber === 'AUTO') {
            docNumber = await getNextWhtNumber(data.doc_date);
        } else {
            const dup = await db.getAsync('SELECT id FROM withholding_taxes WHERE doc_number = ?', [docNumber]);
            if (dup) return res.status(409).json({ error: `เลขที่เอกสาร ${docNumber} มีอยู่แล้วในระบบ` });
        }

        const result = await db.runAsync(`
            INSERT INTO withholding_taxes (
                company_id, doc_number, book_number, doc_date, form_type, sequence_no,
                payer_tax_id, payer_name, payer_address,
                payee_type, payee_tax_id, payee_name, payee_address,
                income_type, payment_date, income_amount, tax_rate, tax_amount, tax_condition,
                ref_expense_number, items_json, status
            ) VALUES (
                1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `, [
            docNumber, data.book_number, data.doc_date, data.form_type, data.sequence_no,
            company.tax_id, payerName, company.address,
            data.payee_type, data.payee_tax_id, data.payee_name, data.payee_address,
            data.income_type, data.payment_date, data.income_amount, data.tax_rate, data.tax_amount, data.tax_condition,
            data.ref_expense_number, data.items_json, status
        ]);

        const created = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขหนังสือรับรอง (ไม่เปลี่ยนเลขที่เอกสารและข้อมูลผู้จ่ายเดิม)
router.put('/:id', async (req, res) => {
    try {
        const existing = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'ไม่พบหนังสือรับรองนี้' });
        if (existing.status === 'CANCELLED') return res.status(400).json({ error: 'หนังสือรับรองนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้' });

        const status = req.body.status || existing.status || 'COMPLETED';
        const isDraft = status === 'DRAFT';
        const { errors, data } = validatePayload(req.body, isDraft);
        if (errors.length) return res.status(400).json({ error: errors.join('\n') });

        await db.runAsync(`
            UPDATE withholding_taxes SET
                book_number = ?, doc_date = ?, form_type = ?, sequence_no = ?,
                payee_type = ?, payee_tax_id = ?, payee_name = ?, payee_address = ?,
                income_type = ?, payment_date = ?, income_amount = ?, tax_rate = ?, tax_amount = ?,
                tax_condition = ?, ref_expense_number = ?, items_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            data.book_number, data.doc_date, data.form_type, data.sequence_no,
            data.payee_type, data.payee_tax_id, data.payee_name, data.payee_address,
            data.income_type, data.payment_date, data.income_amount, data.tax_rate, data.tax_amount,
            data.tax_condition, data.ref_expense_number, data.items_json, status, req.params.id
        ]);

        const updated = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ยกเลิกหนังสือรับรอง (เก็บประวัติไว้ ไม่ลบทิ้ง เพื่อให้ตรวจสอบย้อนหลังได้)
router.post('/:id/cancel', async (req, res) => {
    try {
        const existing = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'ไม่พบหนังสือรับรองนี้' });
        if (existing.status === 'CANCELLED') return res.status(400).json({ error: 'หนังสือรับรองนี้ถูกยกเลิกไปแล้ว' });

        const reason = String((req.body && req.body.reason) || '').trim();
        if (!reason) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการยกเลิก' });

        await db.runAsync(`
            UPDATE withholding_taxes
            SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [reason, req.params.id]);

        const updated = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
