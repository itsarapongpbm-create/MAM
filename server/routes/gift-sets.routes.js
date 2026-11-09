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

// ==========================================
// BATCH ORDERS & CONSOLIDATED SOURCING (BOM)
// ==========================================

// 3.1 ดึงรายการเลขที่ออเดอร์ถัดไป (Next Batch Order Number)
router.get('/batch-orders/next-number', async (req, res) => {
    try {
        const today = new Date();
        const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
        const prefix = `ORD-${yyyymmdd}-`;
        const rows = await db.allAsync(
            "SELECT order_number FROM hamper_batch_orders WHERE order_number LIKE ? ORDER BY id DESC",
            [`${prefix}%`]
        );
        let maxSeq = 0;
        rows.forEach(r => {
            const m = r.order_number.match(new RegExp(`^ORD-${yyyymmdd}-(\\d+)`));
            if (m) {
                const seq = parseInt(m[1], 10);
                if (seq > maxSeq) maxSeq = seq;
            }
        });
        const nextNumber = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
        res.json({ next_number: nextNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.2 ดึงรายการใบออเดอร์จัดกระเช้าทั้งหมด
router.get('/batch-orders', async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT * FROM hamper_batch_orders 
            ORDER BY id DESC
        `);
        const parsed = rows.map(r => {
            let items = [];
            let sourcing = [];
            try { items = JSON.parse(r.items_json || '[]'); } catch (_) {}
            try { sourcing = JSON.parse(r.sourcing_json || '[]'); } catch (_) {}
            return {
                ...r,
                items,
                sourcing
            };
        });
        res.json(parsed);
    } catch (err) {
        console.error('Error fetching batch orders:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3.3 คำนวณสรุปรายการของที่ต้องซื้อ/หยิบ (Calculate Consolidated Sourcing / BOM Aggregation)
router.post('/batch-orders/calculate-sourcing', async (req, res) => {
    try {
        const { hampers } = req.body; // Array of { gift_set_id, quantity }
        if (!hampers || !Array.isArray(hampers) || hampers.length === 0) {
            return res.status(400).json({ error: 'กรุณาระบุรายการกระเช้าและจำนวน' });
        }

        // 1. ดึงข้อมูลกระเช้าทั้งหมดตาม id
        const setIds = hampers.map(h => h.gift_set_id).filter(Boolean);
        if (setIds.length === 0) {
            return res.status(400).json({ error: 'ไม่พบรายการกระเช้าที่เลือก' });
        }

        const placeholders = setIds.map(() => '?').join(',');
        const giftSets = await db.allAsync(`SELECT * FROM gift_sets WHERE id IN (${placeholders})`, setIds);
        const giftSetMap = {};
        giftSets.forEach(s => { giftSetMap[s.id] = s; });

        // 2. ดึงสูตร BOM ของทุกกระเช้า
        const bomItems = await db.allAsync(`
            SELECT gsi.*, 
                   p.code as product_code, 
                   p.name as product_real_name,
                   p.category as product_category,
                   p.unit as product_unit,
                   p.description as product_desc,
                   p.image_url as product_image,
                   p.quantity_on_hand as current_stock,
                   p.cost_price as live_cost_price,
                   p.unit_price as live_unit_price
            FROM gift_set_items gsi
            LEFT JOIN products p ON gsi.product_id = p.id
            WHERE gsi.gift_set_id IN (${placeholders})
            ORDER BY gsi.gift_set_id, gsi.id ASC
        `, setIds);

        // 3. สร้าง Map และ Aggregate BOM
        const sourcingMap = {}; // key: product_id or code
        let totalHampersCount = 0;
        let totalSalesEst = 0;
        let totalCostEst = 0;

        hampers.forEach(h => {
            const set = giftSetMap[h.gift_set_id];
            const orderQty = Math.max(0, parseInt(h.quantity, 10) || 0);
            if (!set || orderQty <= 0) return;

            totalHampersCount += orderQty;
            totalSalesEst += (Number(set.selling_price) || 0) * orderQty;

            // ค้นหารายการในสูตร
            const setBOM = bomItems.filter(bi => bi.gift_set_id === set.id);
            setBOM.forEach(item => {
                const prodId = item.product_id || item.product_code || item.item_name;
                const reqPerSet = Number(item.quantity) || 1;
                const totalReqForHamper = reqPerSet * orderQty;
                const unitCost = Number(item.live_cost_price || item.unit_cost) || 0;

                totalCostEst += unitCost * totalReqForHamper;

                if (!sourcingMap[prodId]) {
                    sourcingMap[prodId] = {
                        product_id: item.product_id,
                        product_code: item.product_code || item.sku || '-',
                        item_name: item.product_real_name || item.item_name || 'ไม่ระบุชื่อ',
                        category: item.product_category || 'วัตถุดิบ',
                        unit: item.product_unit || 'ชิ้น',
                        image_url: item.product_image || '/assets/images/default-hamper.png',
                        description: item.product_desc || item.notes || '',
                        unit_cost: unitCost,
                        current_stock: Number(item.current_stock) || 0,
                        total_required_qty: 0,
                        hampers_used_in: []
                    };
                }

                sourcingMap[prodId].total_required_qty += totalReqForHamper;
                sourcingMap[prodId].hampers_used_in.push({
                    gift_set_id: set.id,
                    hamper_code: set.code,
                    hamper_name: set.name,
                    qty_per_set: reqPerSet,
                    order_hamper_qty: orderQty,
                    total_required: totalReqForHamper
                });
            });
        });

        // 4. สรุป shortage และจัดเรียง
        const sourcingList = Object.values(sourcingMap).map((row, index) => {
            const shortageQty = Math.max(0, row.total_required_qty - row.current_stock);
            const totalRowCost = row.total_required_qty * row.unit_cost;
            const shortageBudget = shortageQty * row.unit_cost;
            return {
                seq: index + 1,
                ...row,
                shortage_qty: shortageQty,
                is_shortage: shortageQty > 0,
                stock_status: shortageQty > 0 ? 'SHORTAGE' : 'SUFFICIENT',
                total_row_cost: totalRowCost,
                shortage_budget: shortageBudget
            };
        });

        // เรียง: รายการที่ขาดสต็อก (ต้องซื้อเพิ่ม) อยู่บนสุด แล้วตามด้วย SKU
        sourcingList.sort((a, b) => {
            if (a.is_shortage && !b.is_shortage) return -1;
            if (!a.is_shortage && b.is_shortage) return 1;
            return (a.product_code || '').localeCompare(b.product_code || '');
        });

        // คำนวณสรุปยอดรวม
        const totalDistinctItems = sourcingList.length;
        const totalPiecesRequired = sourcingList.reduce((acc, it) => acc + it.total_required_qty, 0);
        const totalShortagePieces = sourcingList.reduce((acc, it) => acc + it.shortage_qty, 0);
        const totalShortageBudget = sourcingList.reduce((acc, it) => acc + it.shortage_budget, 0);

        res.json({
            hampers_summary: {
                total_hampers: totalHampersCount,
                total_sales: totalSalesEst,
                total_cost: totalCostEst,
                est_margin: totalSalesEst - totalCostEst,
                est_margin_pct: totalSalesEst > 0 ? ((totalSalesEst - totalCostEst) / totalSalesEst * 100) : 0
            },
            sourcing_summary: {
                total_distinct_items: totalDistinctItems,
                total_pieces_required: totalPiecesRequired,
                total_shortage_pieces: totalShortagePieces,
                total_shortage_budget: totalShortageBudget,
                shortage_items_count: sourcingList.filter(it => it.is_shortage).length
            },
            sourcing_items: sourcingList
        });
    } catch (err) {
        console.error('Error calculating consolidated sourcing:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3.4 ดึงรายละเอียดใบออเดอร์เดี่ยว (Single Batch Order Detail)
router.get('/batch-orders/:id', async (req, res) => {
    try {
        const order = await db.getAsync("SELECT * FROM hamper_batch_orders WHERE id = ? OR order_number = ?", [req.params.id, req.params.id]);
        if (!order) return res.status(404).json({ error: 'ไม่พบใบออเดอร์นี้' });

        let items = [];
        let sourcing = [];
        try { items = JSON.parse(order.items_json || '[]'); } catch (_) {}
        try { sourcing = JSON.parse(order.sourcing_json || '[]'); } catch (_) {}

        res.json({
            ...order,
            items,
            sourcing
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.5 สร้างใบออเดอร์ใหม่ (Create Batch Order)
router.post('/batch-orders', async (req, res) => {
    try {
        const {
            order_number,
            customer_name,
            event_name,
            order_date,
            due_date,
            status,
            total_hampers,
            total_sales,
            total_cost,
            items,
            sourcing,
            remarks
        } = req.body;

        let finalOrderNo = order_number;
        if (!finalOrderNo || finalOrderNo.trim() === '') {
            const today = new Date();
            const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
            const prefix = `ORD-${yyyymmdd}-`;
            const rows = await db.allAsync(
                "SELECT order_number FROM hamper_batch_orders WHERE order_number LIKE ? ORDER BY id DESC",
                [`${prefix}%`]
            );
            let maxSeq = 0;
            rows.forEach(r => {
                const m = r.order_number.match(new RegExp(`^ORD-${yyyymmdd}-(\\d+)`));
                if (m) {
                    const seq = parseInt(m[1], 10);
                    if (seq > maxSeq) maxSeq = seq;
                }
            });
            finalOrderNo = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
        }

        const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);
        const sourcingJson = typeof sourcing === 'string' ? sourcing : JSON.stringify(sourcing || []);
        const orderDateVal = order_date || new Date().toISOString().slice(0, 10);

        const result = await db.runAsync(`
            INSERT INTO hamper_batch_orders (
                company_id, order_number, customer_name, event_name, order_date, due_date,
                status, total_hampers, total_sales, total_cost, items_json, sourcing_json, remarks
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            finalOrderNo,
            customer_name || 'ลูกค้าทั่วไป',
            event_name || 'เทศกาลปีใหม่',
            orderDateVal,
            due_date || orderDateVal,
            status || 'PENDING',
            Number(total_hampers) || 0,
            Number(total_sales) || 0,
            Number(total_cost) || 0,
            itemsJson,
            sourcingJson,
            remarks || ''
        ]);

        res.status(201).json({
            message: 'สร้างใบออเดอร์และบันทึกรายการรวมซื้อเรียบร้อยแล้ว',
            id: result.lastID,
            order_number: finalOrderNo
        });
    } catch (err) {
        console.error('Error creating batch order:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3.6 อัปเดตใบออเดอร์ (Update Batch Order)
router.put('/batch-orders/:id', async (req, res) => {
    try {
        const order = await db.getAsync("SELECT * FROM hamper_batch_orders WHERE id = ?", [req.params.id]);
        if (!order) return res.status(404).json({ error: 'ไม่พบใบออเดอร์นี้' });

        const {
            customer_name,
            event_name,
            order_date,
            due_date,
            status,
            total_hampers,
            total_sales,
            total_cost,
            items,
            sourcing,
            remarks
        } = req.body;

        const itemsJson = items !== undefined ? (typeof items === 'string' ? items : JSON.stringify(items)) : order.items_json;
        const sourcingJson = sourcing !== undefined ? (typeof sourcing === 'string' ? sourcing : JSON.stringify(sourcing)) : order.sourcing_json;

        await db.runAsync(`
            UPDATE hamper_batch_orders SET
                customer_name = ?,
                event_name = ?,
                order_date = ?,
                due_date = ?,
                status = ?,
                total_hampers = ?,
                total_sales = ?,
                total_cost = ?,
                items_json = ?,
                sourcing_json = ?,
                remarks = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            customer_name ?? order.customer_name,
            event_name ?? order.event_name,
            order_date ?? order.order_date,
            due_date ?? order.due_date,
            status ?? order.status,
            total_hampers ?? order.total_hampers,
            total_sales ?? order.total_sales,
            total_cost ?? order.total_cost,
            itemsJson,
            sourcingJson,
            remarks ?? order.remarks,
            req.params.id
        ]);

        res.json({ message: 'อัปเดตใบออเดอร์เรียบร้อยแล้ว', id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.7 ลบใบออเดอร์ (Delete Batch Order)
router.delete('/batch-orders/:id', async (req, res) => {
    try {
        const order = await db.getAsync("SELECT * FROM hamper_batch_orders WHERE id = ?", [req.params.id]);
        if (!order) return res.status(404).json({ error: 'ไม่พบใบออเดอร์นี้' });

        await db.runAsync("DELETE FROM hamper_batch_orders WHERE id = ?", [req.params.id]);
        res.json({ message: 'ลบใบออเดอร์เรียบร้อยแล้ว', order_number: order.order_number });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.8 ประกอบกระเช้าทั้งชุดตามใบออเดอร์ (Batch Assemble & Deduct Stock)
router.post('/batch-orders/:id/assemble', async (req, res) => {
    try {
        const order = await db.getAsync("SELECT * FROM hamper_batch_orders WHERE id = ?", [req.params.id]);
        if (!order) return res.status(404).json({ error: 'ไม่พบใบออเดอร์นี้' });

        if (order.status === 'ASSEMBLED' || order.status === 'COMPLETED') {
            return res.status(400).json({ error: 'ออเดอร์นี้ได้ทำการประกอบและตัดสต็อกไปแล้ว' });
        }

        let items = [];
        let sourcing = [];
        try { items = JSON.parse(order.items_json || '[]'); } catch (_) {}
        try { sourcing = JSON.parse(order.sourcing_json || '[]'); } catch (_) {}

        if (sourcing.length === 0) {
            return res.status(400).json({ error: 'ไม่พบรายการวัตถุดิบรวมในออเดอร์นี้' });
        }

        const userName = req.headers['x-user-name'] || 'Admin (Batch Order)';
        const asmDocNo = `ASM-${order.order_number}`;

        await db.runAsync('BEGIN TRANSACTION');

        try {
            let deductedCount = 0;

            // 1. ตัดสต็อกวัตถุดิบตามที่คำนวณใน sourcing_json
            for (const row of sourcing) {
                const deductQty = Number(row.total_required_qty) || 0;
                if (deductQty <= 0) continue;

                // ค้นหาสินค้าวัตถุดิบ
                let prod = null;
                if (row.product_id) {
                    prod = await db.getAsync("SELECT * FROM products WHERE id = ?", [row.product_id]);
                }
                if (!prod && row.product_code) {
                    prod = await db.getAsync("SELECT * FROM products WHERE code = ?", [row.product_code]);
                }

                if (prod) {
                    const currentStock = Number(prod.quantity_on_hand) || 0;
                    const newStock = currentStock - deductQty;

                    await db.runAsync(
                        'UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?',
                        [newStock, newStock, prod.id]
                    );

                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'OUT_SALE', ?, ?, ?, 'BATCH_HAMPER_ASSEMBLE', ?, ?, ?)
                    `, [
                        prod.id,
                        -deductQty,
                        newStock,
                        Number(prod.cost_price || row.unit_cost) || 0,
                        asmDocNo,
                        `เบิกวัตถุดิบประกอบกระเช้าตามใบออเดอร์ [${order.order_number}] (${deductQty} ${row.unit || 'ชิ้น'})`,
                        userName
                    ]);

                    deductedCount++;
                }
            }

            // 2. เพิ่มสต็อกให้สินค้าชุดกระเช้าสำเร็จรูปแต่ละแบบใน items_json
            for (const h of items) {
                const buildQty = Number(h.quantity) || 0;
                if (buildQty <= 0) continue;

                let hamperProd = await db.getAsync("SELECT * FROM products WHERE code = ? LIMIT 1", [h.code]);
                let newHamperStock = buildQty;

                if (hamperProd) {
                    const prevStock = Number(hamperProd.quantity_on_hand) || 0;
                    newHamperStock = prevStock + buildQty;
                    await db.runAsync(
                        'UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?',
                        [newHamperStock, newHamperStock, hamperProd.id]
                    );
                } else {
                    const ins = await db.runAsync(`
                        INSERT INTO products (
                            code, name, type, description, unit, unit_price, cost_price, category, image_url, quantity_on_hand, stock_quantity, min_stock_level, min_stock
                        ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, ?, ?, 0, 0)
                    `, [
                        h.code,
                        h.name,
                        `ชุดกระเช้าของขวัญ ${h.name} (${h.theme || 'มาตรฐาน'})`,
                        Number(h.selling_price) || 0,
                        Number(h.cost_price) || 0,
                        h.image_url || '/assets/images/default-hamper.png',
                        buildQty,
                        buildQty
                    ]);
                    hamperProd = { id: ins.lastID };
                }

                await db.runAsync(`
                    INSERT INTO stock_movements (
                        product_id, company_id, movement_type, change_qty, balance_after,
                        unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                    ) VALUES (?, 1, 'IN_PURCHASE', ?, ?, ?, 'BATCH_HAMPER_ASSEMBLE', ?, ?, ?)
                `, [
                    hamperProd.id,
                    buildQty,
                    newHamperStock,
                    Number(h.cost_price) || 0,
                    asmDocNo,
                    `รับเข้าชุดกระเช้าสำเร็จรูป [${h.code}] ${h.name} ตามใบออเดอร์ [${order.order_number}] (${buildQty} ชุด)`,
                    userName
                ]);
            }

            // 3. ปรับสถานะใบออเดอร์เป็น ASSEMBLED
            await db.runAsync("UPDATE hamper_batch_orders SET status = 'ASSEMBLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.id]);

            await db.runAsync('COMMIT');

            res.json({
                message: `ประกอบกระเช้าตามใบออเดอร์ [${order.order_number}] เรียบร้อยแล้ว (ตัดสต็อกวัตถุดิบ ${deductedCount} รายการ)`,
                ref_doc_number: asmDocNo,
                status: 'ASSEMBLED'
            });
        } catch (txErr) {
            await db.runAsync('ROLLBACK');
            throw txErr;
        }
    } catch (err) {
        console.error('Error batch assembling gift sets:', err);
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
                ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, 0, 0, 0, 0)
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
                ) VALUES (?, ?, 'PRODUCT', ?, 'ชุด', ?, ?, 'ชุดกระเช้าของขวัญ', ?, 0, 0, 0, 0)
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
router.post(['/:id/assemble', '/:id/produce'], async (req, res) => {
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
