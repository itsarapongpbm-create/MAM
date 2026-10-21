/**
 * Gift Sets & Hampers Management Routes (ERP Grade)
 * Endpoint: /api/gift-sets
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. ดึงรายการชุดกระเช้าทั้งหมด (พร้อม Filter: theme, search, min/max price)
router.get('/', async (req, res) => {
    try {
        const { theme, search, min_price, max_price, status } = req.query;
        let sql = `
            SELECT gs.*, 
                   COUNT(gsi.id) as item_count,
                   SUM(gsi.unit_cost * gsi.quantity) as calculated_cost,
                   COALESCE((SELECT p.quantity_on_hand FROM products p WHERE p.code = gs.code LIMIT 1), 0) as assembled_stock
            FROM gift_sets gs
            LEFT JOIN gift_set_items gsi ON gs.id = gsi.gift_set_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += " AND gs.status = ?";
            params.push(status);
        } else {
            sql += " AND gs.status != 'DELETED'";
        }

        if (theme && theme !== 'ALL') {
            sql += " AND gs.theme = ?";
            params.push(theme);
        }

        if (search) {
            sql += " AND (gs.name LIKE ? OR gs.code LIKE ? OR gs.packaging_desc LIKE ?)";
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        if (min_price) {
            sql += " AND gs.selling_price >= ?";
            params.push(Number(min_price));
        }

        if (max_price) {
            sql += " AND gs.selling_price <= ?";
            params.push(Number(max_price));
        }

        sql += " GROUP BY gs.id ORDER BY gs.id ASC";

        const giftSets = await db.allAsync(sql, params);
        res.json(giftSets);
    } catch (err) {
        console.error('Error fetching gift sets:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. ดึงรายชื่อหมวดหมู่ธีม (Themes) ทั้งหมดพร้อมจำนวนชุด
router.get('/themes', async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT theme, COUNT(*) as count 
            FROM gift_sets 
            WHERE status != 'DELETED' AND theme IS NOT NULL AND theme != ''
            GROUP BY theme 
            ORDER BY count DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. แนะนำรหัสชุดกระเช้าถัดไป (Next Code Suggestion)
router.get('/next-code', async (req, res) => {
    try {
        const rows = await db.allAsync("SELECT code FROM gift_sets WHERE code LIKE 'HMP-%' OR code LIKE 'SET-%'");
        let maxNum = 0;
        let prefix = 'HMP';
        rows.forEach(r => {
            const match = r.code.match(/(HMP|SET)-(\d+)/i);
            if (match) {
                prefix = match[1].toUpperCase();
                const num = parseInt(match[2], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        const nextCode = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
        res.json({ next_code: nextCode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. ดึงข้อมูลชุดกระเช้าเดี่ยว พร้อมรายการสินค้าในกระเช้าครบถ้วน (BOM Items)
router.get('/:id', async (req, res) => {
    try {
        const isNumeric = /^\d+$/.test(req.params.id);
        const set = isNumeric
            ? await db.getAsync("SELECT * FROM gift_sets WHERE id = ?", [req.params.id])
            : await db.getAsync("SELECT * FROM gift_sets WHERE code = ?", [req.params.id]);

        if (!set) {
            return res.status(404).json({ error: 'Gift set not found' });
        }

        const items = await db.allAsync(`
            SELECT gsi.*, 
                   p.code as product_code, 
                   p.name as product_real_name,
                   p.category as product_category,
                   p.unit as product_unit,
                   p.description as product_desc,
                   p.image_url as product_image,
                   p.quantity_on_hand as current_stock,
                   p.min_stock_level as min_stock,
                   p.cost_price as live_cost_price,
                   p.unit_price as live_unit_price
            FROM gift_set_items gsi
            LEFT JOIN products p ON gsi.product_id = p.id
            WHERE gsi.gift_set_id = ?
            ORDER BY gsi.id ASC
        `, [set.id]);

        const hamperProduct = await db.getAsync("SELECT id, quantity_on_hand FROM products WHERE code = ? LIMIT 1", [set.code]);

        res.json({
            ...set,
            assembled_stock: hamperProduct ? Number(hamperProduct.quantity_on_hand || 0) : 0,
            product_id: hamperProduct ? hamperProduct.id : null,
            items: items
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. สร้างชุดกระเช้าใหม่ (Custom Gift Set Builder หรือ Catalog Set)
router.post('/', async (req, res) => {
    try {
        const {
            code,
            name,
            theme,
            selling_price,
            cost_price,
            packaging_desc,
            ribbon_desc,
            image_url,
            items = []
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อชุดกระเช้า' });
        }

        let setCode = code;
        if (!setCode) {
            const lastRows = await db.allAsync("SELECT code FROM gift_sets WHERE code LIKE 'HMP-%'");
            let maxNum = 0;
            lastRows.forEach(r => {
                const match = r.code.match(/HMP-(\d+)/i);
                if (match) {
                    const n = parseInt(match[1], 10);
                    if (n > maxNum) maxNum = n;
                }
            });
            setCode = `HMP-${String(maxNum + 1).padStart(3, '0')}`;
        }

        // คำนวณต้นทุนรวมจาก items หากไม่ได้ส่งมา
        let totalCost = Number(cost_price) || 0;
        if (totalCost === 0 && items.length > 0) {
            totalCost = items.reduce((acc, it) => acc + ((Number(it.unit_cost) || 0) * (Number(it.quantity) || 1)), 0);
        }

        const insertSet = await db.runAsync(`
            INSERT INTO gift_sets (
                code, name, theme, selling_price, cost_price, packaging_desc, ribbon_desc, image_url, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            setCode,
            name.trim(),
            theme || 'Custom Set',
            Number(selling_price) || 0,
            totalCost,
            packaging_desc || '',
            ribbon_desc || '',
            image_url || '/assets/images/default-hamper.png'
        ]);

        const giftSetId = insertSet.lastID;

        // บันทึกรายการสินค้าในชุด (Items / Recipe)
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                await db.runAsync(`
                    INSERT INTO gift_set_items (
                        gift_set_id, product_id, item_name, quantity, unit_cost, unit_price, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    giftSetId,
                    item.product_id || null,
                    item.item_name || item.name || 'สินค้าในชุด',
                    Number(item.quantity) || 1,
                    Number(item.unit_cost) || 0,
                    Number(item.unit_price) || 0,
                    item.notes || ''
                ]);
            }
        }

        // ซิงค์หรือสร้างสินค้าในตาราง products ให้พร้อมค้นหาออกใบเสนอราคาได้ทันที
        const existingProd = await db.getAsync("SELECT id FROM products WHERE code = ?", [setCode]);
        if (!existingProd) {
            // สร้างเป็น product ในตาราง products (หมวดหมู่ 'ชุดกระเช้าของขวัญ')
            const desc = items.map(it => `• ${it.item_name} (${it.quantity} ชิ้น)`).join('\n');
            await db.runAsync(`
                INSERT INTO products (
                    code, name, type, description, unit, unit_price, cost_price, category, image_url, quantity_on_hand, stock_quantity, min_stock_level, min_stock
                ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, 1, 1, 0, 0)
            `, [
                setCode,
                name.trim(),
                packaging_desc ? `บรรจุภัณฑ์: ${packaging_desc}\n${desc}` : desc,
                Number(selling_price) || 0,
                totalCost,
                image_url || '/assets/images/default-hamper.png'
            ]);
        }

        res.status(201).json({
            message: 'สร้างชุดกระเช้าเรียบร้อยแล้ว',
            gift_set_id: giftSetId,
            code: setCode
        });
    } catch (err) {
        console.error('Error creating gift set:', err);
        res.status(500).json({ error: err.message });
    }
});

// 6. แก้ไขชุดกระเช้า
router.put('/:id', async (req, res) => {
    try {
        const {
            code,
            name,
            theme,
            selling_price,
            cost_price,
            packaging_desc,
            ribbon_desc,
            image_url,
            items
        } = req.body;

        const set = await db.getAsync("SELECT * FROM gift_sets WHERE id = ?", [req.params.id]);
        if (!set) return res.status(404).json({ error: 'Gift set not found' });

        let totalCost = Number(cost_price) || 0;
        if (Array.isArray(items) && totalCost === 0) {
            totalCost = items.reduce((acc, it) => acc + ((Number(it.unit_cost) || 0) * (Number(it.quantity) || 1)), 0);
        }

        const targetCode = (code && code.trim()) ? code.trim() : set.code;
        const targetName = (name && name.trim()) ? name.trim() : set.name;
        const targetPrice = selling_price !== undefined ? Number(selling_price) : set.selling_price;
        const targetPkg = packaging_desc !== undefined ? packaging_desc : set.packaging_desc;
        const targetRibbon = ribbon_desc !== undefined ? ribbon_desc : set.ribbon_desc;
        const targetImage = image_url || set.image_url || '/assets/images/default-hamper.png';

        await db.runAsync(`
            UPDATE gift_sets SET
                code = ?,
                name = ?,
                theme = COALESCE(?, theme),
                selling_price = ?,
                cost_price = ?,
                packaging_desc = ?,
                ribbon_desc = ?,
                image_url = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            targetCode, targetName, theme, targetPrice, totalCost, targetPkg, targetRibbon, targetImage, req.params.id
        ]);

        if (Array.isArray(items)) {
            await db.runAsync("DELETE FROM gift_set_items WHERE gift_set_id = ?", [req.params.id]);
            for (const item of items) {
                await db.runAsync(`
                    INSERT INTO gift_set_items (
                        gift_set_id, product_id, item_name, quantity, unit_cost, unit_price, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    req.params.id,
                    item.product_id || null,
                    item.item_name || item.name || 'สินค้าในชุด',
                    Number(item.quantity) || 1,
                    Number(item.unit_cost) || 0,
                    Number(item.unit_price) || 0,
                    item.notes || ''
                ]);
            }
        }

        // ซิงค์อัปเดตในตาราง products ด้วย
        const descItems = Array.isArray(items)
            ? items.map(it => `• ${it.item_name || it.name} (${it.quantity || 1} ชิ้น)`).join('\n')
            : '';
        const fullDesc = targetPkg ? `บรรจุภัณฑ์: ${targetPkg}\n${descItems}` : descItems;

        const existingProd = await db.getAsync("SELECT id FROM products WHERE code = ?", [set.code]);
        if (existingProd) {
            await db.runAsync(`
                UPDATE products SET
                    code = ?,
                    name = ?,
                    description = COALESCE(NULLIF(?, ''), description),
                    unit_price = ?,
                    cost_price = ?,
                    image_url = ?
                WHERE id = ?
            `, [targetCode, targetName, fullDesc, targetPrice, totalCost, targetImage, existingProd.id]);
        } else {
            await db.runAsync(`
                INSERT INTO products (
                    code, name, type, description, unit, unit_price, cost_price, category, image_url, quantity_on_hand, stock_quantity, min_stock_level, min_stock
                ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, 1, 1, 0, 0)
            `, [targetCode, targetName, fullDesc, targetPrice, totalCost, targetImage]);
        }

        res.json({
            message: 'อัปเดตชุดกระเช้าเรียบร้อยแล้ว',
            gift_set_id: Number(req.params.id),
            code: targetCode
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. สั่งประกอบชุดกระเช้า (Assemble Gift Set: ตัดสต็อกวัตถุดิบตามสูตร BOM และเพิ่มสต็อกกระเช้าสำเร็จรูป)
router.post('/:id/assemble', async (req, res) => {
    try {
        const buildQty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
        const userName = req.body.user_name || 'ฝ่ายผลิต/จัดกระเช้า';

        const set = await db.getAsync("SELECT * FROM gift_sets WHERE id = ?", [req.params.id]);
        if (!set) return res.status(404).json({ error: 'ไม่พบข้อมูลชุดกระเช้า' });

        const items = await db.allAsync(`
            SELECT gsi.*,
                   p.id as real_product_id,
                   p.code as product_code,
                   p.name as product_real_name,
                   p.unit as product_unit,
                   p.quantity_on_hand as current_stock,
                   p.cost_price as live_cost_price
            FROM gift_set_items gsi
            LEFT JOIN products p ON gsi.product_id = p.id
            WHERE gsi.gift_set_id = ?
        `, [set.id]);

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'ชุดกระเช้านี้ยังไม่มีรายการวัตถุดิบในสูตร BOM' });
        }

        // ตรวจสอบสต็อกวัตถุดิบทุกชิ้นก่อนตัด
        const shortages = [];
        for (const it of items) {
            if (!it.real_product_id) continue;
            const reqQty = (Number(it.quantity) || 1) * buildQty;
            const availQty = Number(it.current_stock) || 0;
            if (availQty < reqQty) {
                shortages.push(`[${it.product_code}] ${it.item_name} (ต้องการ ${reqQty} แต่มี ${availQty} ${it.product_unit || 'ชิ้น'})`);
            }
        }

        if (shortages.length > 0) {
            return res.status(400).json({
                error: `สต็อกวัตถุดิบไม่เพียงพอสำหรับการประกอบ ${buildQty} ชุด:\n- ${shortages.join('\n- ')}`
            });
        }

        const now = new Date();
        const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const asmDocNo = `ASM-${datePrefix}-${Math.floor(100 + Math.random() * 900)}`;

        await db.runAsync('BEGIN TRANSACTION');
        try {
            // 1. ตัดสต็อกวัตถุดิบรายชิ้นตามสูตร BOM
            let deductedCount = 0;
            for (const it of items) {
                if (!it.real_product_id) continue;
                const deductQty = (Number(it.quantity) || 1) * buildQty;
                const prevStock = Number(it.current_stock) || 0;
                const newStock = Math.max(0, prevStock - deductQty);

                await db.runAsync(
                    'UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?',
                    [newStock, newStock, it.real_product_id]
                );

                await db.runAsync(`
                    INSERT INTO stock_movements (
                        product_id, company_id, movement_type, change_qty, balance_after,
                        unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                    ) VALUES (?, 1, 'OUT_SALE', ?, ?, ?, 'HAMPER_ASSEMBLE', ?, ?, ?)
                `, [
                    it.real_product_id,
                    -deductQty,
                    newStock,
                    Number(it.live_cost_price || it.unit_cost) || 0,
                    asmDocNo,
                    `เบิกวัตถุดิบประกอบชุดกระเช้า [${set.code}] ${set.name} (${buildQty} ชุด)`,
                    userName
                ]);
                deductedCount++;
            }

            // 2. เพิ่มสต็อกให้สินค้าชุดกระเช้าสำเร็จรูป (HMP-xxx)
            let hamperProd = await db.getAsync("SELECT * FROM products WHERE code = ? LIMIT 1", [set.code]);
            let newHamperStock = buildQty;

            if (hamperProd) {
                const prevHamperStock = Number(hamperProd.quantity_on_hand) || 0;
                newHamperStock = prevHamperStock + buildQty;
                await db.runAsync(
                    'UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?',
                    [newHamperStock, newHamperStock, hamperProd.id]
                );
            } else {
                const desc = items.map(it => `• ${it.item_name} (${it.quantity} ชิ้น)`).join('\n');
                const ins = await db.runAsync(`
                    INSERT INTO products (
                        code, name, type, description, unit, unit_price, cost_price, category, image_url, quantity_on_hand, stock_quantity, min_stock_level, min_stock
                    ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, ?, ?, 0, 0)
                `, [
                    set.code,
                    set.name,
                    set.packaging_desc ? `บรรจุภัณฑ์: ${set.packaging_desc}\n${desc}` : desc,
                    Number(set.selling_price) || 0,
                    Number(set.cost_price) || 0,
                    set.image_url || '/assets/images/default-hamper.png',
                    buildQty,
                    buildQty
                ]);
                hamperProd = { id: ins.lastID };
            }

            await db.runAsync(`
                INSERT INTO stock_movements (
                    product_id, company_id, movement_type, change_qty, balance_after,
                    unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                ) VALUES (?, 1, 'IN_PURCHASE', ?, ?, ?, 'HAMPER_ASSEMBLE', ?, ?, ?)
            `, [
                hamperProd.id,
                buildQty,
                newHamperStock,
                Number(set.cost_price) || 0,
                asmDocNo,
                `รับเข้าชุดกระเช้าสำเร็จรูป [${set.code}] ${set.name} จากการสั่งประกอบ (${buildQty} ชุด)`,
                userName
            ]);

            await db.runAsync('COMMIT');

            res.json({
                message: `ประกอบชุดกระเช้า [${set.code}] จำนวน ${buildQty} ชุดสำเร็จ (ตัดวัตถุดิบ ${deductedCount} รายการ)`,
                assembled_qty: buildQty,
                new_hamper_stock: newHamperStock,
                deducted_items_count: deductedCount,
                ref_doc_number: asmDocNo
            });
        } catch (txErr) {
            await db.runAsync('ROLLBACK');
            throw txErr;
        }
    } catch (err) {
        console.error('Error assembling gift set:', err);
        res.status(500).json({ error: err.message });
    }
});

// 8. ลบชุดกระเช้า
router.delete('/:id', async (req, res) => {
    try {
        const set = await db.getAsync("SELECT * FROM gift_sets WHERE id = ?", [req.params.id]);
        if (!set) return res.status(404).json({ error: 'Gift set not found' });

        await db.runAsync("DELETE FROM gift_set_items WHERE gift_set_id = ?", [req.params.id]);
        await db.runAsync("DELETE FROM gift_sets WHERE id = ?", [req.params.id]);
        await db.runAsync("DELETE FROM products WHERE code = ? AND category = 'ชุดกระเช้าของขวัญ'", [set.code]);

        res.json({ message: 'ลบชุดกระเช้าเรียบร้อยแล้ว', code: set.code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
