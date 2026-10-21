/**
 * Products & Services Routes
 * Endpoint: /api/products
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงรายการสินค้าและบริการทั้งหมด
router.get('/', async (req, res) => {
    try {
        const { search, type } = req.query;
        let sql = 'SELECT * FROM products';
        let params = [];
        let conditions = [];

        if (type) {
            conditions.push('type = ?');
            params.push(type);
        }

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            conditions.push('(name LIKE ? OR code LIKE ? OR description LIKE ?)');
            params.push(term, term, term);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY id DESC';

        const products = await db.allAsync(sql, params);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// เพิ่มสินค้าหรือบริการใหม่
router.post('/', async (req, res) => {
    try {
        const { name, type, description, unit, unit_price, vat_rate } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const prefix = (type === 'PRODUCT' ? 'PRD-' : 'SRV-');
        const maxRow = await db.getAsync(`SELECT MAX(CAST(substr(code, 5) AS INTEGER)) as max_num FROM products WHERE code LIKE '${prefix}%'`);
        const nextNum = ((maxRow && maxRow.max_num) || 0) + 1;
        const code = prefix + String(nextNum).padStart(3, '0');

        const result = await db.runAsync(`
            INSERT INTO products (company_id, code, name, type, description, unit, unit_price, vat_rate)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `, [
            code, name, type || 'SERVICE', description || '', unit || 'ชิ้น', unit_price || 0,
            vat_rate !== undefined && vat_rate !== null && vat_rate !== '' ? Number(vat_rate) : 7
        ]);

        const created = await db.getAsync('SELECT * FROM products WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
