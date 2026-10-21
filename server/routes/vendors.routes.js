/**
 * Vendors Routes
 * Endpoint: /api/vendors
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงรายการคู่ค้า/ผู้จำหน่าย (ทั้งจาก Customers ที่เป็น VENDOR/BOTH และจาก Expenses)
router.get('/', async (req, res) => {
    try {
        const vendors = await db.allAsync(`
            SELECT id, code, name, contact_type, entity_type, credit_days, credit_terms,
                   business_location, tax_id, branch, address, postal_code, shipping_address,
                   office_phone, fax, website, contact_person, email, phone, mobile_phone, created_at
            FROM customers WHERE contact_type IN ('VENDOR', 'BOTH')
            ORDER BY id DESC
        `);
        res.json(vendors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงข้อมูลผู้จำหน่ายรายบุคคลตาม ID
router.get('/:id', async (req, res) => {
    try {
        const vendor = await db.getAsync("SELECT * FROM customers WHERE id = ? AND contact_type IN ('VENDOR', 'BOTH')", [req.params.id]);
        if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
        res.json(vendor);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// เพิ่มคู่ค้า/ผู้จำหน่ายใหม่
router.post('/', async (req, res) => {
    try {
        const {
            code: inputCode, name, contact_type, entity_type, credit_days, credit_terms,
            business_location, tax_id, branch, address, postal_code, shipping_address,
            office_phone, fax, website, contact_person, email, phone, mobile_phone
        } = req.body;

        if (!name) return res.status(400).json({ error: 'Vendor name is required' });

        let code = inputCode ? inputCode.trim() : '';
        if (!code) {
            const maxRow = await db.getAsync("SELECT MAX(CAST(substr(code, 5) AS INTEGER)) as max_num FROM customers WHERE code LIKE 'VEN-%'");
            const nextNum = ((maxRow && maxRow.max_num) || 0) + 1;
            code = `VEN-${String(nextNum).padStart(3, '0')}`;
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
            code, name, contact_type || 'VENDOR', entity_type || 'JURISTIC', days, terms,
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

// แก้ไขข้อมูลคู่ค้า/ผู้จำหน่าย
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
            WHERE id = ? AND contact_type IN ('VENDOR', 'BOTH')
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

// ลบข้อมูลผู้จำหน่าย
router.delete('/:id', async (req, res) => {
    try {
        await db.runAsync("DELETE FROM customers WHERE id = ? AND contact_type IN ('VENDOR', 'BOTH')", [req.params.id]);
        res.json({ message: 'Vendor deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
