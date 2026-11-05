/**
 * Customers CRUD Routes
 * Endpoint: /api/customers
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงรายการลูกค้าทั้งหมด
router.get('/', async (req, res) => {
    try {
        const { type, search } = req.query;
        let sql = 'SELECT * FROM customers';
        let params = [];
        let conditions = [];

        if (type) {
            conditions.push("(contact_type = ? OR contact_type = 'BOTH')");
            params.push(type);
        } else {
            conditions.push("(contact_type IN ('CUSTOMER', 'BOTH') OR contact_type IS NULL OR contact_type = '')");
        }

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            conditions.push('(name LIKE ? OR code LIKE ? OR tax_id LIKE ? OR email LIKE ? OR phone LIKE ?)');
            params.push(term, term, term, term, term);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY id DESC';
        const customers = await db.allAsync(sql, params);
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงข้อมูลลูกค้ารายบุคคลตาม ID
router.get('/:id', async (req, res) => {
    try {
        const customer = await db.getAsync('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// เพิ่มลูกค้าใหม่
router.post('/', async (req, res) => {
    try {
        const {
            code: inputCode, name, contact_type, entity_type, credit_days, credit_terms,
            business_location, tax_id, branch, address, postal_code, shipping_address,
            office_phone, fax, website, contact_person, email, phone, mobile_phone
        } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        let code = inputCode ? inputCode.trim() : '';
        if (!code) {
            const maxRow = await db.getAsync("SELECT MAX(CAST(substr(code, 6) AS INTEGER)) as max_num FROM customers WHERE code LIKE 'CUST-%'");
            const nextNum = ((maxRow && maxRow.max_num) || 0) + 1;
            code = `CUST-${String(nextNum).padStart(3, '0')}`;
        }

        const days = credit_days !== undefined ? parseInt(credit_days) || 0 : 30;
        const terms = credit_terms || (days > 0 ? `เครดิต ${days} วัน` : 'เงินสด');
        const effPhone = mobile_phone || phone || office_phone || '';

        const result = await db.runAsync(`
            INSERT INTO customers (
                company_id, code, name, contact_type, entity_type, credit_days, credit_terms,
                business_location, tax_id, branch, address, postal_code, shipping_address,
                office_phone, fax, website, contact_person, email, phone, mobile_phone
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            code, name, contact_type || 'CUSTOMER', entity_type || 'JURISTIC', days, terms,
            business_location || 'TH', tax_id || '', branch || 'สำนักงานใหญ่', address || '',
            postal_code || '', shipping_address || '', office_phone || '', fax || '',
            website || '', contact_person || '', email || '', effPhone, mobile_phone || ''
        ]);

        const created = await db.getAsync('SELECT * FROM customers WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขข้อมูลลูกค้า
router.put('/:id', async (req, res) => {
    try {
        const {
            code, name, contact_type, entity_type, credit_days, credit_terms,
            business_location, tax_id, branch, address, postal_code, shipping_address,
            office_phone, fax, website, contact_person, email, phone, mobile_phone
        } = req.body;

        const days = credit_days !== undefined ? parseInt(credit_days) || 0 : 30;
        const terms = credit_terms || (days > 0 ? `เครดิต ${days} วัน` : 'เงินสด');
        const effPhone = mobile_phone || phone || office_phone || '';

        await db.runAsync(`
            UPDATE customers
            SET code = COALESCE(?, code),
                name = COALESCE(?, name),
                contact_type = COALESCE(?, contact_type),
                entity_type = COALESCE(?, entity_type),
                credit_days = ?,
                credit_terms = ?,
                business_location = COALESCE(?, business_location),
                tax_id = ?,
                branch = ?,
                address = ?,
                postal_code = ?,
                shipping_address = ?,
                office_phone = ?,
                fax = ?,
                website = ?,
                contact_person = ?,
                email = ?,
                phone = ?,
                mobile_phone = ?
            WHERE id = ?
        `, [
            code, name, contact_type, entity_type, days, terms,
            business_location, tax_id || '', branch || 'สำนักงานใหญ่', address || '',
            postal_code || '', shipping_address || '', office_phone || '', fax || '',
            website || '', contact_person || '', email || '', effPhone, mobile_phone || '',
            req.params.id
        ]);

        const updated = await db.getAsync('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลบข้อมูลลูกค้า
router.delete('/:id', async (req, res) => {
    try {
        await db.runAsync('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
