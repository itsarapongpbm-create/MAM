/**
 * Products & Services Routes (Full CRUD)
 * Endpoint: /api/products
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. ดึงรายการสินค้าและบริการทั้งหมด (พร้อม Search & Filter)
router.get('/', async (req, res) => {
    try {
        const { search, type, category } = req.query;
        let sql = 'SELECT * FROM products';
        let params = [];
        let conditions = [];

        if (type) {
            conditions.push('type = ?');
            params.push(type);
        }

        if (category && category !== 'ALL') {
            conditions.push('category = ?');
            params.push(category);
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

// 2. ดึงรายละเอียดสินค้าเดี่ยวตาม ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({ error: 'ไม่พบสินค้าที่ระบุ' });
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. เพิ่มสินค้าหรือบริการใหม่
router.post('/', async (req, res) => {
    try {
        const { name, type, category, description, unit, unit_price, cost_price, min_stock, image_url, vat_rate } = req.body;
        if (!name) return res.status(400).json({ error: 'ชื่อสินค้าเป็นข้อมูลจำเป็น' });

        const prefix = (type === 'PRODUCT' ? 'PRD-' : 'SRV-');
        const maxRow = await db.getAsync(`SELECT MAX(CAST(substr(code, 5) AS INTEGER)) as max_num FROM products WHERE code LIKE '${prefix}%'`);
        const nextNum = ((maxRow && maxRow.max_num) || 0) + 1;
        const code = req.body.code || (prefix + String(nextNum).padStart(3, '0'));

        const result = await db.runAsync(`
            INSERT INTO products (
                company_id, code, name, type, category, description, unit, 
                unit_price, cost_price, min_stock, min_stock_level, image_url, vat_rate
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            code,
            name,
            type || 'PRODUCT',
            category || 'ทั่วไป',
            description || '',
            unit || 'ชิ้น',
            Number(unit_price) || 0,
            Number(cost_price) || 0,
            Number(min_stock) || 5,
            Number(min_stock) || 5,
            image_url || null,
            vat_rate !== undefined && vat_rate !== null && vat_rate !== '' ? Number(vat_rate) : 7
        ]);

        const created = await db.getAsync('SELECT * FROM products WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. แก้ไขข้อมูลและปรับราคาสินค้า (Real-time Price & Catalog Update)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'ไม่พบสินค้าที่ต้องการแก้ไข' });
        }

        const {
            name,
            category,
            description,
            unit,
            unit_price,
            cost_price,
            stock_quantity,
            min_stock,
            image_url,
            vat_rate
        } = req.body;

        await db.runAsync(`
            UPDATE products
            SET name = COALESCE(?, name),
                category = COALESCE(?, category),
                description = COALESCE(?, description),
                unit = COALESCE(?, unit),
                unit_price = COALESCE(?, unit_price),
                cost_price = COALESCE(?, cost_price),
                stock_quantity = COALESCE(?, stock_quantity),
                min_stock = COALESCE(?, min_stock),
                min_stock_level = COALESCE(?, min_stock_level),
                image_url = COALESCE(?, image_url),
                vat_rate = COALESCE(?, vat_rate)
            WHERE id = ?
        `, [
            name !== undefined ? name : null,
            category !== undefined ? category : null,
            description !== undefined ? description : null,
            unit !== undefined ? unit : null,
            unit_price !== undefined ? Number(unit_price) : null,
            cost_price !== undefined ? Number(cost_price) : null,
            stock_quantity !== undefined ? Number(stock_quantity) : null,
            min_stock !== undefined ? Number(min_stock) : null,
            min_stock !== undefined ? Number(min_stock) : null,
            image_url !== undefined ? image_url : null,
            vat_rate !== undefined ? Number(vat_rate) : null,
            id
        ]);

        const updated = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        res.json({
            message: 'อัปเดตข้อมูลสินค้าสำเร็จ',
            product: updated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. ลบสินค้า
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'ไม่พบสินค้าที่ต้องการลบ' });
        }

        await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
        res.json({ message: 'ลบสินค้าสำเร็จ', id: Number(id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
