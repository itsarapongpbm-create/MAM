/**
 * Inventory & Stock Management Routes (ERP Grade)
 * Endpoint: /api/inventory
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/db');

// 1. ดึงสถิติภาพรวมคลังสินค้า (Total SKUs, Stock Value, Normal, Low Stock, Out of Stock)
router.get('/stats', async (req, res) => {
    try {
        const { scope } = req.query;
        let sql = "SELECT * FROM products WHERE type = 'PRODUCT'";
        if (scope === 'RAW') {
            sql += " AND code NOT LIKE 'HMP-%'";
        }
        const products = await db.allAsync(sql);
        let totalValue = 0;
        let totalRetailValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let normalCount = 0;

        products.forEach(p => {
            const qty = Number(p.quantity_on_hand) || 0;
            const min = p.min_stock_level !== null && p.min_stock_level !== undefined ? Number(p.min_stock_level) : 5;
            const cost = Number(p.cost_price) || 0;
            const price = Number(p.unit_price) || 0;

            totalValue += cost * qty;
            totalRetailValue += price * qty;

            if (qty <= 0) {
                outOfStockCount++;
            } else if (qty <= min) {
                lowStockCount++;
            } else {
                normalCount++;
            }
        });

        res.json({
            total_skus: products.length,
            total_stock_value: totalValue,
            total_retail_value: totalRetailValue,
            normal_stock_count: normalCount,
            in_stock_count: normalCount + lowStockCount,
            low_stock_count: lowStockCount,
            out_of_stock_count: outOfStockCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. แนะนำรหัส SKU ถัดไปอัตโนมัติ (Next SKU Suggestion)
router.get('/next-sku', async (req, res) => {
    try {
        let { prefix, category } = req.query;
        let targetPrefix = 'SNK';

        if (prefix) {
            targetPrefix = prefix.toUpperCase().trim();
        } else if (category) {
            const cat = category.trim();
            if (cat.includes('กระเป๋า') || cat.includes('กระเช้า')) targetPrefix = 'BAG';
            else if (cat.includes('พรีเมียม') || cat.includes('แก้ว') || cat.includes('โบว์')) targetPrefix = 'PRM';
            else if (cat.includes('ของขวัญ') || cat.includes('ชุดกระเช้า')) targetPrefix = 'HMP';
            else targetPrefix = 'SNK';
        }

        const rows = await db.allAsync("SELECT code FROM products WHERE code LIKE ?", [`${targetPrefix}-%`]);
        let maxNum = 0;
        const regex = new RegExp(`^${targetPrefix}-(\\d+)`, 'i');
        rows.forEach(r => {
            const match = (r.code || '').match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });

        const nextSku = `${targetPrefix}-` + String(maxNum + 1).padStart(3, '0');
        res.json({ next_sku: nextSku, prefix: targetPrefix });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. ดึงหมวดหมู่สินค้าทั้งหมดที่มีในระบบ
router.get('/categories', async (req, res) => {
    try {
        const { scope } = req.query;
        let sql = "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''";
        if (scope === 'RAW') {
            sql += " AND code NOT LIKE 'HMP-%'";
        }
        sql += " ORDER BY category ASC";
        const rows = await db.allAsync(sql);
        const businessDefaultCats = scope === 'RAW'
            ? ['ขนมและของทานเล่น', 'แบบกระเป๋าและกระเช้า', 'สินค้าพรีเมียมและแก้วน้ำ']
            : ['ขนมและของทานเล่น', 'แบบกระเป๋าและกระเช้า', 'สินค้าพรีเมียมและแก้วน้ำ', 'ชุดกระเช้าของขวัญ'];
        const existingCats = rows.map(r => r.category).filter(Boolean);
        const combined = Array.from(new Set([...existingCats, ...businessDefaultCats]));
        res.json(combined);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. ดึงประวัติความเคลื่อนไหวสินค้าในสต็อก (Stock Card Movements)
router.get('/movements', async (req, res) => {
    try {
        const { product_id, movement_type, search, limit } = req.query;
        let query = `
            SELECT sm.*, p.name as product_name, p.code as product_code, p.unit
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (product_id) {
            query += ' AND sm.product_id = ?';
            params.push(product_id);
        }

        if (movement_type && movement_type !== 'ALL') {
            query += ' AND sm.movement_type = ?';
            params.push(movement_type);
        }

        if (search) {
            query += ' AND (p.name LIKE ? OR p.code LIKE ? OR sm.ref_doc_number LIKE ? OR sm.remarks LIKE ?)';
            const pattern = `%${search}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        query += ' ORDER BY sm.created_at DESC, sm.id DESC';
        query += ` LIMIT ${parseInt(limit) || 50}`;

        const movements = await db.allAsync(query, params);
        res.json(movements);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. ปรับปรุงจำนวนสินค้าในคลัง (Stock Adjustment / Count / In / Out)
router.post('/adjust', async (req, res) => {
    try {
        const {
            product_id,
            mode, // 'COUNT', 'IN', 'OUT'
            new_quantity,
            add_quantity,
            deduct_quantity,
            reason,
            ref_doc_number,
            movement_type,
            user_name
        } = req.body;

        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }

        const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) return res.status(404).json({ error: 'ไม่พบข้อมูลสินค้าที่ระบุ' });

        const currentQty = Number(product.quantity_on_hand) || 0;
        let targetQty = currentQty;
        let diffQty = 0;
        let actualMovementType = movement_type || 'ADJUST_COUNT';

        if (mode === 'IN') {
            const add = parseFloat(add_quantity) || 0;
            if (add <= 0) return res.status(400).json({ error: 'จำนวนรับเข้าต้องมากกว่า 0' });
            diffQty = add;
            targetQty = currentQty + add;
            actualMovementType = 'IN_PURCHASE';
        } else if (mode === 'OUT') {
            const deduct = parseFloat(deduct_quantity) || 0;
            if (deduct <= 0) return res.status(400).json({ error: 'จำนวนตัดจ่ายต้องมากกว่า 0' });
            if (deduct > currentQty) return res.status(400).json({ error: 'จำนวนที่ตัดจ่ายมากกว่ายอดสต็อกคงเหลือปัจจุบัน' });
            diffQty = -deduct;
            targetQty = currentQty - deduct;
            actualMovementType = movement_type || 'DAMAGE';
        } else {
            // mode === 'COUNT' or manual
            if (new_quantity === undefined || new_quantity === null || new_quantity === '') {
                return res.status(400).json({ error: 'กรุณาระบุจำนวนสต็อกที่ตรวจนับได้จริง' });
            }
            targetQty = Math.max(0, parseFloat(new_quantity));
            diffQty = targetQty - currentQty;
            actualMovementType = diffQty >= 0 ? 'ADJUST_COUNT' : 'DAMAGE';
        }

        await db.runAsync('UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?', [targetQty, targetQty, product_id]);

        const now = new Date();
        const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const autoDocNo = ref_doc_number || (actualMovementType === 'IN_PURCHASE' ? `RCV-${datePrefix}-${Math.floor(100 + Math.random() * 900)}` : `ADJ-${datePrefix}-${Math.floor(100 + Math.random() * 900)}`);

        await db.runAsync(`
            INSERT INTO stock_movements (
                product_id, company_id, movement_type, change_qty, balance_after,
                unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
            ) VALUES (?, 1, ?, ?, ?, ?, 'MANUAL_ADJUST', ?, ?, ?)
        `, [
            product_id,
            actualMovementType,
            diffQty,
            targetQty,
            product.cost_price || 0,
            autoDocNo,
            reason || 'ตรวจนับสต็อกสินค้าหน้างาน',
            user_name || 'ผู้ดูแลระบบ'
        ]);

        const updatedProduct = await db.getAsync('SELECT * FROM products WHERE id = ?', [product_id]);
        res.json({
            message: 'ปรับปรุงยอดสต็อกสินค้าเรียบร้อยแล้ว',
            product: updatedProduct,
            diff_qty: diffQty,
            balance: targetQty
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5.1 อัปโหลดไฟล์รูปภาพสินค้าเข้า MinIO Object Storage (S3)
router.post('/upload-image', async (req, res) => {
    try {
        const { image, filename } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'ไม่พบข้อมูลรูปภาพ (Missing image data)' });
        }

        const { uploadFile } = require('../services/storage.service');

        // Match base64 data URI format
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        let mimeType = 'image/jpeg';
        let ext = '.jpg';

        if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
            if (mimeType.includes('png')) ext = '.png';
            else if (mimeType.includes('webp')) ext = '.webp';
            else if (mimeType.includes('gif')) ext = '.gif';
            else if (mimeType.includes('svg')) ext = '.svg';
            else ext = '.jpg';
        } else {
            buffer = Buffer.from(image, 'base64');
        }

        const safeRandom = crypto.randomBytes(4).toString('hex');
        const timestamp = Date.now();
        const rawName = (filename || 'item').replace(/\.[^/.]+$/, '');
        const cleanName = rawName.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_').slice(0, 25);
        const finalFilename = `${timestamp}_${safeRandom}_${cleanName}${ext}`;

        // อัปโหลดเข้า MinIO Bucket: giftory-products
        const uploadResult = await uploadFile({
            buffer,
            filename: finalFilename,
            mimetype: mimeType,
            bucket: process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products',
            prefix: 'products'
        });

        res.json({
            success: true,
            url: uploadResult.publicUrl,
            filename: finalFilename,
            key: uploadResult.key,
            size: buffer.length
        });
    } catch (err) {
        console.error('Upload image error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัปโหลดรูปภาพได้: ' + err.message });
    }
});

// 6. เพิ่มสินค้าใหม่เข้าคลัง (Create Product with optional opening stock)
router.post('/', async (req, res) => {
    try {
        const {
            code,
            name,
            category,
            description,
            unit,
            unit_price,
            cost_price,
            quantity_on_hand,
            min_stock_level,
            image_url,
            user_name
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อสินค้า' });
        }

        // Determine SKU code
        let skuCode = (code || '').trim();
        if (!skuCode) {
            let pfx = 'SNK';
            const cat = (category || '').trim();
            if (cat.includes('กระเป๋า') || cat.includes('กระเช้า')) pfx = 'BAG';
            else if (cat.includes('พรีเมียม') || cat.includes('แก้ว') || cat.includes('โบว์')) pfx = 'PRM';
            else if (cat.includes('ของขวัญ') || cat.includes('ชุดกระเช้า')) pfx = 'HMP';

            const rows = await db.allAsync("SELECT code FROM products WHERE code LIKE ?", [`${pfx}-%`]);
            let maxNum = 0;
            const regex = new RegExp(`^${pfx}-(\\d+)`, 'i');
            rows.forEach(r => {
                const match = (r.code || '').match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            });
            skuCode = `${pfx}-` + String(maxNum + 1).padStart(3, '0');
        } else {
            // Check uniqueness
            const exist = await db.getAsync('SELECT id FROM products WHERE code = ?', [skuCode]);
            if (exist) {
                return res.status(400).json({ error: `รหัสสินค้า (SKU) "${skuCode}" มีอยู่ในระบบแล้ว` });
            }
        }

        const openingQty = (!isNaN(parseFloat(quantity_on_hand)) && quantity_on_hand !== '' && quantity_on_hand !== null) ? Math.max(0, parseFloat(quantity_on_hand)) : 0;
        const costVal = (!isNaN(parseFloat(cost_price)) && cost_price !== '' && cost_price !== null) ? parseFloat(cost_price) : 0;
        const priceVal = (!isNaN(parseFloat(unit_price)) && unit_price !== '' && unit_price !== null) ? parseFloat(unit_price) : 0;
        const minVal = (min_stock_level !== undefined && min_stock_level !== null && min_stock_level !== '' && !isNaN(parseFloat(min_stock_level))) ? parseFloat(min_stock_level) : 5;
        const defaultImg = image_url && image_url.trim() ? image_url.trim() : 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80';

        const result = await db.runAsync(`
            INSERT INTO products (
                company_id, code, name, type, category, description, unit,
                unit_price, cost_price, quantity_on_hand, stock_quantity, min_stock_level, min_stock, image_url, vat_rate
            ) VALUES (1, ?, ?, 'PRODUCT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 7)
        `, [
            skuCode,
            name.trim(),
            category ? category.trim() : 'ทั่วไป',
            description ? description.trim() : '',
            unit ? unit.trim() : 'ชิ้น',
            priceVal,
            costVal,
            openingQty,
            openingQty,
            minVal,
            minVal,
            defaultImg
        ]);

        const productId = result.lastID;

        // Record opening stock movement if quantity > 0
        if (openingQty > 0) {
            await db.runAsync(`
                INSERT INTO stock_movements (
                    product_id, company_id, movement_type, change_qty, balance_after,
                    unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                ) VALUES (?, 1, 'IN_PURCHASE', ?, ?, ?, 'INITIAL_STOCK', ?, 'ยอดยกมาเริ่มต้น / เพิ่มสินค้าใหม่เข้าคลัง', ?)
            `, [
                productId,
                openingQty,
                openingQty,
                costVal,
                `INIT-${skuCode}`,
                user_name || 'ผู้ดูแลระบบ'
            ]);
        }

        const created = await db.getAsync('SELECT * FROM products WHERE id = ?', [productId]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. แก้ไขข้อมูลสินค้า (Update Product details)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            code,
            name,
            category,
            description,
            unit,
            unit_price,
            cost_price,
            min_stock_level,
            image_url
        } = req.body;

        const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ error: 'ไม่พบสินค้าที่ต้องการแก้ไข' });

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อสินค้า' });
        }

        // Check if changing SKU code conflicts with another product
        if (code && code.trim() !== product.code) {
            const conflict = await db.getAsync('SELECT id FROM products WHERE code = ? AND id != ?', [code.trim(), id]);
            if (conflict) {
                return res.status(400).json({ error: `รหัสสินค้า (SKU) "${code.trim()}" มีอยู่ในระบบแล้ว` });
            }
        }

        const priceVal = (unit_price !== undefined && unit_price !== null && unit_price !== '' && !isNaN(parseFloat(unit_price))) ? parseFloat(unit_price) : product.unit_price;
        const costVal = (cost_price !== undefined && cost_price !== null && cost_price !== '' && !isNaN(parseFloat(cost_price))) ? parseFloat(cost_price) : product.cost_price;
        const minVal = (min_stock_level !== undefined && min_stock_level !== null && min_stock_level !== '' && !isNaN(parseFloat(min_stock_level))) ? parseFloat(min_stock_level) : product.min_stock_level;

        await db.runAsync(`
            UPDATE products SET
                code = ?,
                name = ?,
                category = ?,
                description = ?,
                unit = ?,
                unit_price = ?,
                cost_price = ?,
                min_stock_level = ?,
                min_stock = ?,
                image_url = ?
            WHERE id = ?
        `, [
            code ? code.trim() : product.code,
            name.trim(),
            category ? category.trim() : product.category,
            description !== undefined ? description.trim() : product.description,
            unit ? unit.trim() : product.unit,
            priceVal,
            costVal,
            minVal,
            minVal,
            image_url ? image_url.trim() : product.image_url,
            id
        ]);

        const updated = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        res.json({ message: 'แก้ไขข้อมูลสินค้าสำเร็จ', product: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. ลบสินค้าออกจากระบบ (Delete Product with dependency checks)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ error: 'ไม่พบสินค้าที่ต้องการลบ' });

        // Check if product is referenced in document_items
        const docUsage = await db.getAsync('SELECT COUNT(*) as cnt FROM document_items WHERE product_id = ?', [id]);
        if (docUsage && docUsage.cnt > 0) {
            return res.status(400).json({
                error: `ไม่สามารถลบสินค้า "${product.name}" ได้ เนื่องจากมีประวัติถูกอ้างอิงในเอกสารทางการค้าแล้ว (${docUsage.cnt} รายการ)\n\nแนะนำให้ตรวจนับและปรับยอดคงเหลือเป็น 0 แทน`
            });
        }

        // Delete associated movements and then delete product
        await db.runAsync('DELETE FROM stock_movements WHERE product_id = ?', [id]);
        await db.runAsync('DELETE FROM products WHERE id = ?', [id]);

        res.json({ message: `ลบสินค้า [${product.code}] ${product.name} สำเร็จ` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8.1 ดึงข้อมูลสินค้าชิ้นเดียวตาม ID หรือ Code (SKU)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const isNum = /^\d+$/.test(id);
        const product = isNum
            ? await db.getAsync('SELECT * FROM products WHERE id = ?', [id])
            : await db.getAsync('SELECT * FROM products WHERE code = ?', [id]);
        if (!product) return res.status(404).json({ error: 'ไม่พบสินค้าที่ระบุ' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. ดึงรายการสต็อกสินค้าทั้งหมด
router.get('/', async (req, res) => {
    try {
        const { category, status, search, scope } = req.query;
        let query = "SELECT * FROM products WHERE type = 'PRODUCT'";
        const params = [];

        if (scope === 'RAW') {
            query += " AND code NOT LIKE 'HMP-%'";
        }

        if (category && category !== 'ALL') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
            const pattern = `%${search}%`;
            params.push(pattern, pattern, pattern);
        }

        query += ' ORDER BY id ASC';
        let products = await db.allAsync(query, params);

        products = products.map(p => {
            const qty = Number(p.quantity_on_hand) || 0;
            const minLevel = p.min_stock_level !== null && p.min_stock_level !== undefined ? Number(p.min_stock_level) : 5;
            let stockStatus = 'NORMAL';
            if (qty <= 0) {
                stockStatus = 'OUT_OF_STOCK';
            } else if (qty <= minLevel) {
                stockStatus = 'LOW_STOCK';
            }
            return {
                ...p,
                quantity_on_hand: qty,
                cost_price: Number(p.cost_price) || 0,
                unit_price: Number(p.unit_price) || 0,
                stock_status: stockStatus,
                stock_value: (Number(p.cost_price) || 0) * qty,
                retail_value: (Number(p.unit_price) || 0) * qty
            };
        });

        if (status && status !== 'ALL') {
            products = products.filter(p => p.stock_status === status);
        }

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
