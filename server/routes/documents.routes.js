/**
 * Trade Documents Engine Routes
 * Endpoint: /api/documents
 * รองรับการทำงาน QT (ใบเสนอราคา), BN (ใบวางบิล), INV (ใบแจ้งหนี้), RE (ใบเสร็จรับเงิน), CS (ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ), PO (ใบสั่งซื้อ)
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getNextDocNumber, peekNextDocNumber } = require('../models/sequences');
const { recordStatusLog } = require('../services/audit.service');
const {
    getType,
    isTaxDocument,
    availableActions,
    publicRegistry
} = require('../document-types');

// ค้นหาสินค้าในตาราง products จาก product_id, ชื่อสินค้า, รหัส SKU หรือรูปแบบ "[SKU] ชื่อสินค้า"
async function findProductForLineItem(it, companyId = 1) {
    if (!it) return null;
    if (it.product_id) {
        const byId = await db.getAsync("SELECT * FROM products WHERE id = ? AND type = 'PRODUCT'", [it.product_id]);
        if (byId) return byId;
    }
    const rawName = String(it.item_name || '').trim();
    if (!rawName) return null;

    let product = await db.getAsync(
        "SELECT * FROM products WHERE company_id = ? AND (name = ? OR code = ?) AND type = 'PRODUCT'",
        [companyId, rawName, rawName]
    );
    if (product) return product;

    // รองรับรูปแบบ "[HMP-001] Soft Morning Bag" หรือ "[SNK-001] ชื่อสินค้า"
    const skuMatch = rawName.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (skuMatch) {
        const extractedCode = skuMatch[1].trim();
        const extractedName = skuMatch[2].trim();
        product = await db.getAsync(
            "SELECT * FROM products WHERE company_id = ? AND (code = ? OR name = ?) AND type = 'PRODUCT'",
            [companyId, extractedCode, extractedName]
        );
    }
    return product || null;
}

// ดูเลขที่เอกสารถัดไปล่วงหน้า (Safe Preview - ไม่นับลำดับจริง)
router.get('/next-number/:type', async (req, res) => {
    try {
        const docType = req.params.type.toUpperCase();
        const nextNumber = await peekNextDocNumber(1, docType, req.query.date);
        res.json({ nextNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงจำนวนเอกสารแจ้งเตือน / ค้างดำเนินการ (Pending / Waiting Approval Counts)
router.get('/pending-counts', async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT doc_type, status, COUNT(*) as cnt
            FROM documents
            GROUP BY doc_type, status
        `);

        const counts = {
            QUOTATION: 0,
            PURCHASE_ORDER: 0,
            BILLING_NOTE: 0,
            TAX_INVOICE: 0,
            RECEIPT: 0,
            CASH_SALE: 0,
            total_pending: 0
        };

        rows.forEach(r => {
            const dt = r.doc_type;
            const st = r.status;
            const cnt = Number(r.cnt) || 0;

            // 1. ใบเสนอราคา & ใบสั่งซื้อ: นับเฉพาะ "รออนุมัติ"
            if ((dt === 'QUOTATION' || dt === 'PURCHASE_ORDER') && ['WAITING', 'WAITING_APPROVAL'].includes(st)) {
                counts[dt] += cnt;
            }
            // 2. ใบวางบิล & ใบกำกับภาษี: นับเฉพาะ "รอรับเงิน/ค้างชำระ"
            else if ((dt === 'BILLING_NOTE' || dt === 'TAX_INVOICE') && ['ISSUED', 'PARTIAL_PAID'].includes(st)) {
                counts[dt] += cnt;
            }
        });

        counts.total_pending = counts.QUOTATION + counts.PURCHASE_ORDER + counts.BILLING_NOTE + counts.TAX_INVOICE;
        res.json(counts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ส่งออกรายการเอกสารเป็น CSV / Excel (UTF-8 BOM)
router.get('/export/csv', async (req, res) => {
    try {
        const { type, status, search } = req.query;
        let query = 'SELECT * FROM documents WHERE 1=1';
        const params = [];

        if (type) {
            const typeMap = {
                'QT': 'QUOTATION',
                'BN': 'BILLING_NOTE',
                'INV': 'TAX_INVOICE',
                'RE': 'RECEIPT',
                'CS': 'CASH_SALE',
                'PO': 'PURCHASE_ORDER'
            };
            const resolvedType = typeMap[type.toUpperCase()] || type.toUpperCase();
            query += ' AND doc_type = ?';
            params.push(resolvedType);
        }
        if (status && status !== 'ALL') {
            const st = status.toUpperCase();
            if (st === 'WAITING') {
                query += " AND status IN ('WAITING', 'WAITING_APPROVAL', 'ISSUED')";
            } else if (st === 'APPROVED') {
                query += " AND status IN ('APPROVED')";
            } else if (st === 'PAID') {
                query += " AND status IN ('PAID', 'COMPLETED')";
            } else if (st === 'CANCELLED') {
                query += " AND status IN ('CANCELLED', 'REJECTED')";
            } else {
                query += ' AND status = ?';
                params.push(st);
            }
        }
        if (search) {
            query += ' AND (doc_number LIKE ? OR customer_name LIKE ? OR ref_doc_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY id DESC';
        const docs = await db.allAsync(query, params);

        const statusMap = {
            DRAFT: 'ฉบับร่าง',
            WAITING: 'รออนุมัติ',
            WAITING_APPROVAL: 'รออนุมัติ',
            APPROVED: 'อนุมัติแล้ว',
            ISSUED: 'รอชำระ',
            PARTIAL_PAID: 'ชำระบางส่วน',
            PAID: 'ชำระแล้ว',
            COMPLETED: 'ดำเนินการครบ',
            REJECTED: 'ไม่อนุมัติ',
            CANCELLED: 'ยกเลิก'
        };

        const headers = [
            'ลำดับ',
            'เลขที่เอกสาร',
            'ประเภทเอกสาร',
            'วันที่ออกเอกสาร',
            'ใช้ได้ถึง/กำหนดชำระ',
            'รหัส/ชื่อลูกค้า',
            'เลขประจำตัวผู้เสียภาษี',
            'สาขา',
            'ชื่องาน/โครงการ',
            'พนักงานขาย',
            'ยอดรวมก่อนภาษี',
            'ส่วนลด',
            'ภาษีมูลค่าเพิ่ม',
            'ยอดสุทธิทั้งสิ้น',
            'ยอดชำระแล้ว',
            'ยอดคงค้าง',
            'สถานะ',
            'หมายเหตุ'
        ];

        let totalAmount = 0;
        const csvRows = [headers.map(h => `"${h}"`).join(',')];

        docs.forEach((d, idx) => {
            const grandTotal = d.grand_total || 0;
            totalAmount += grandTotal;
            const row = [
                idx + 1,
                d.doc_number || '(ฉบับร่าง)',
                d.doc_type,
                d.issue_date || '',
                d.valid_until || d.due_date || '',
                d.customer_name || '',
                d.customer_tax_id || '',
                d.customer_branch || 'สำนักงานใหญ่',
                d.project_name || '',
                d.salesperson || '',
                (d.subtotal || 0).toFixed(2),
                (d.discount_amount || 0).toFixed(2),
                (d.vat_amount || 0).toFixed(2),
                grandTotal.toFixed(2),
                (d.paid_amount || 0).toFixed(2),
                (d.balance_due || 0).toFixed(2),
                statusMap[d.status] || d.status,
                (d.remarks || '').replace(/[\r\n]+/g, ' ')
            ];
            csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        });

        // แถวสรุปรวมทั้งสิ้น
        csvRows.push('');
        csvRows.push([
            '"รวมทั้งสิ้น"',
            `"${docs.length} รายการ"`,
            '""', '""', '""', '""', '""', '""', '""', '""', '""', '""', '""',
            `"${totalAmount.toFixed(2)}"`,
            '""', '""', '""', '""'
        ].join(','));

        const filename = `${type || 'Documents'}_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csvRows.join('\r\n'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายการเอกสารทั้งหมด พร้อมตัวกรองประเภท สถานะ และคำค้นหา
router.get('/', async (req, res) => {
    try {
        const { type, status, search, doc_number } = req.query;
        let query = 'SELECT * FROM documents WHERE 1=1';
        const params = [];

        if (type) {
            const typeMap = {
                'QT': 'QUOTATION',
                'BN': 'BILLING_NOTE',
                'INV': 'TAX_INVOICE',
                'RE': 'RECEIPT',
                'CS': 'CASH_SALE',
                'PO': 'PURCHASE_ORDER'
            };
            const resolvedType = typeMap[type.toUpperCase()] || type.toUpperCase();
            query += ' AND doc_type = ?';
            params.push(resolvedType);
        }

        if (doc_number) {
            query += ' AND doc_number = ?';
            params.push(String(doc_number).trim());
        }

        if (status && status !== 'ALL') {
            const st = status.toUpperCase();
            if (st === 'WAITING') {
                query += " AND status IN ('WAITING', 'WAITING_APPROVAL', 'ISSUED')";
            } else if (st === 'APPROVED') {
                query += " AND status IN ('APPROVED')";
            } else if (st === 'PAID') {
                query += " AND status IN ('PAID', 'COMPLETED')";
            } else if (st === 'CANCELLED') {
                query += " AND status IN ('CANCELLED', 'REJECTED')";
            } else {
                query += ' AND status = ?';
                params.push(st);
            }
        }

        if (search) {
            query += ' AND (doc_number LIKE ? OR customer_name LIKE ? OR ref_doc_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY id DESC';
        const docs = await db.allAsync(query, params);

        // ดึงเอกสารที่เชื่อมโยงกันทั้งหมด
        const allRelated = await db.allAsync(`
            SELECT id, doc_type, doc_number, ref_doc_number, grand_total, status 
            FROM documents 
            WHERE ref_doc_number IS NOT NULL AND ref_doc_number != ''
        `);
        const relatedMap = {};
        allRelated.forEach(r => {
            const key = String(r.ref_doc_number).trim();
            if (!relatedMap[key]) relatedMap[key] = [];
            relatedMap[key].push({
                id: r.id,
                doc_type: r.doc_type,
                doc_number: r.doc_number,
                grand_total: r.grand_total,
                status: r.status
            });
        });

        const enriched = docs.map(d => {
            const isTax = isTaxDocument(d);
            const isOverdue = d.due_date && ['ISSUED', 'PARTIAL_PAID', 'WAITING'].includes(d.status) && new Date(d.due_date) < new Date();
            const related = (d.doc_number && relatedMap[d.doc_number]) ? relatedMap[d.doc_number] : [];
            let docStatus = d.status;
            if (d.doc_type === 'QUOTATION' && related.length > 0 && ['APPROVED', 'COMPLETED'].includes(docStatus)) {
                docStatus = 'COMPLETED';
            }
            return {
                ...d,
                status: docStatus,
                is_tax_document: isTax,
                is_overdue: !!isOverdue,
                related_documents: related
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายละเอียดเอกสาร 1 ใบ พร้อมรายการสินค้า ลิงก์เชื่อมโยง การชำระเงิน และ Audit Logs
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const isNumeric = /^\d+$/.test(idParam);
        const doc = isNumeric
            ? await db.getAsync('SELECT * FROM documents WHERE id = ?', [idParam])
            : await db.getAsync('SELECT * FROM documents WHERE doc_number = ?', [idParam]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const items = await db.allAsync('SELECT * FROM document_items WHERE document_id = ? ORDER BY row_order ASC', [doc.id]);
        const links = await db.allAsync(`
            SELECT dl.*, 
                   s.doc_number as source_number, s.doc_type as source_type,
                   t.doc_number as target_number, t.doc_type as target_type
            FROM document_links dl
            LEFT JOIN documents s ON s.id = dl.source_doc_id
            LEFT JOIN documents t ON t.id = dl.target_doc_id
            WHERE dl.source_doc_id = ? OR dl.target_doc_id = ?
        `, [doc.id, doc.id]);

        const payments = await db.allAsync('SELECT * FROM document_payments WHERE document_id = ? ORDER BY paid_date DESC', [doc.id]);
        const statusLogs = await db.allAsync('SELECT * FROM document_status_logs WHERE document_id = ? ORDER BY id ASC', [doc.id]);

        let customerInfo = null;
        if (doc.customer_id) {
            customerInfo = await db.getAsync('SELECT * FROM customers WHERE id = ?', [doc.customer_id]);
        }

        const userRole = req.query.role || 'ADMIN';
        const actions = availableActions(doc, { role: userRole });

        res.json({
            ...doc,
            customer_phone: doc.customer_phone || (customerInfo ? (customerInfo.phone || customerInfo.mobile_phone || customerInfo.office_phone) : '') || '',
            customer_contact: doc.customer_contact || (customerInfo ? customerInfo.contact_person : '') || '',
            credit_terms: doc.credit_terms || (customerInfo ? customerInfo.credit_terms : 'เครดิต 30 วัน') || 'เครดิต 30 วัน',
            is_tax_document: isTaxDocument(doc),
            items,
            links,
            payments,
            status_logs: statusLogs,
            available_actions: actions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// สร้างเอกสารใหม่ พร้อมรายการสินค้าและหักสต็อกอัตโนมัติ (ถ้ากำหนด)
router.post('/', async (req, res) => {
    try {
        const {
            doc_type, doc_number, issue_date, due_date, ref_doc_number,
            customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
            customer_phone, customer_contact,
            salesperson, subtotal, discount_type, discount_value, discount_amount,
            vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
            status, remarks, terms, items, is_tax_invoice, valid_until, credit_days, credit_terms, project_name,
            source_doc_id
        } = req.body;

        if (!doc_type || !customer_name) {
            return res.status(400).json({ error: 'doc_type and customer_name are required' });
        }

        const upperType = doc_type.toUpperCase();
        const typeDef = getType(upperType);
        if (!typeDef) {
            return res.status(400).json({ error: `Invalid doc_type: ${doc_type}` });
        }

        const cleanIssueDate = issue_date || new Date().toISOString().split('T')[0];
        let targetStatus = (status || 'DRAFT').toUpperCase();
        if (targetStatus === 'WAITING') {
            targetStatus = upperType === 'QUOTATION' ? 'WAITING_APPROVAL' : (['RECEIPT', 'CASH_SALE'].includes(upperType) ? 'PAID' : 'ISSUED');
        }

        // จัดการออกเลขที่เอกสารจริงถ้าไม่ใช่ร่าง
        let finalDocNumber = null;
        if (targetStatus !== 'DRAFT') {
            finalDocNumber = await getNextDocNumber(1, upperType, cleanIssueDate);
        }

        const calculatedBalance = targetStatus === 'PAID' ? 0 : (grand_total || 0);
        const calculatedPaid = targetStatus === 'PAID' ? (grand_total || 0) : 0;

        // บันทึก Header เอกสาร
        const docResult = await db.runAsync(`
            INSERT INTO documents (
                company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                customer_phone, customer_contact,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                status, remarks, terms, is_tax_invoice, valid_until, credit_days, credit_terms, project_name,
                paid_amount, balance_due,
                issued_at, approved_at
            ) VALUES (
                1, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?
            )
        `, [
            upperType, finalDocNumber, cleanIssueDate, due_date || null, ref_doc_number || null,
            customer_id || null, customer_name, customer_tax_id || '', customer_branch || '', customer_address || '',
            customer_phone || '', customer_contact || '',
            salesperson || '', subtotal || 0, discount_type || 'fixed', discount_value || 0, discount_amount || 0,
            vat_type || 'exclude', vat_amount || 0, wht_type || '0', wht_rate || 0, wht_amount || 0, grand_total || 0,
            targetStatus, remarks || '', terms || '', is_tax_invoice ? 1 : 0, valid_until || null,
            credit_days !== undefined && credit_days !== null && credit_days !== '' ? Number(credit_days) : 30,
            credit_terms || null, project_name || null,
            calculatedPaid, calculatedBalance,
            ['ISSUED', 'PAID'].includes(targetStatus) ? new Date().toISOString() : null,
            targetStatus === 'APPROVED' ? new Date().toISOString() : null
        ]);

        const documentId = docResult.lastID;

        // บันทึก Line Items
        if (Array.isArray(items) && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const matchedProd = await findProductForLineItem(it, 1);
                const resolvedProdId = it.product_id || (matchedProd ? matchedProd.id : null);
                it.product_id = resolvedProdId;
                await db.runAsync(`
                    INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    documentId, i + 1, resolvedProdId, it.source_item_id || null,
                    it.item_name || 'สินค้า/บริการ', it.description || '',
                    it.quantity || 1, it.unit || 'ชิ้น', it.unit_price || 0, it.discount || 0,
                    it.vat_rate !== undefined && it.vat_rate !== null && it.vat_rate !== '' ? Number(it.vat_rate) : 7,
                    it.total_amount || 0
                ]);
            }
        }

        // ตัดสต็อกสินค้าอัตโนมัติเฉพาะประเภท TAX_INVOICE หรือ CASH_SALE
        if (typeDef.deductsStock && ['ISSUED', 'PAID'].includes(targetStatus) && Array.isArray(items)) {
            for (const it of items) {
                const product = await findProductForLineItem(it, 1);
                if (product) {
                    const deductQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) - deductQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?`, [newQty, newQty, product.id]);
                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'OUT_SALE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.id,
                        -deductQty,
                        newQty,
                        product.cost_price || 0,
                        upperType,
                        finalDocNumber || `DOC-${documentId}`,
                        `ตัดสต็อกอัตโนมัติจากการออก ${typeDef.titleTh} ${finalDocNumber ? 'เลขที่ ' + finalDocNumber : ''}`,
                        salesperson || 'พนักงานขาย'
                    ]);
                }
            }
        }

        // เชื่อมโยง Link ถ้าแปลงหรืออ้างอิงมาจากเอกสารต้นทาง (Auto-resolve source_doc_id if ref_doc_number is present)
        let resolvedSourceId = source_doc_id ? Number(source_doc_id) : null;
        if (!resolvedSourceId && ref_doc_number) {
            const srcDoc = await db.getAsync('SELECT id, doc_type, status FROM documents WHERE doc_number = ?', [String(ref_doc_number).trim()]);
            if (srcDoc) {
                resolvedSourceId = srcDoc.id;
            }
        }

        if (resolvedSourceId) {
            await db.runAsync(`
                INSERT OR IGNORE INTO document_links (source_doc_id, target_doc_id, link_type, amount)
                VALUES (?, ?, 'CONVERT', ?)
            `, [resolvedSourceId, documentId, grand_total || 0]);

            // บันทึก Status Log ย้อนกลับไปยังเอกสารต้นทางว่ามีการสร้างเอกสารต่อเนื่อง
            await recordStatusLog(
                resolvedSourceId,
                'LINKED_DOWNSTREAM',
                null,
                null,
                null,
                `สร้างเอกสารต่อเนื่อง: ${typeDef.titleTh} เลขที่ ${finalDocNumber || `(ID ${documentId})`}`
            );
        }

        // ถ้าอ้างอิงใบเสนอราคา ให้ปรับสถานะใบเสนอราคาเป็น COMPLETED อัตโนมัติ
        if (ref_doc_number) {
            await db.runAsync(`
                UPDATE documents SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE doc_number = ? AND doc_type = 'QUOTATION'
            `, [String(ref_doc_number).trim()]);
        }

        // บันทึก Status Log
        await recordStatusLog(documentId, 'CREATE', null, targetStatus, null, remarks || 'สร้างเอกสารใหม่');

        const createdDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [documentId]);
        const createdItems = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [documentId]);
        res.status(201).json({ ...createdDoc, items: createdItems, is_tax_document: isTaxDocument(createdDoc) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขข้อมูลเอกสาร (อนุญาตเอกสารที่ไม่ได้อยู่ในสถานะ CANCELLED)
router.put('/:id', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        if (doc.status === 'CANCELLED') {
            return res.status(400).json({ error: `ไม่สามารถแก้ไขเอกสารที่อยู่ในสถานะ "CANCELLED" (ยกเลิก) ได้` });
        }

        const {
            status,
            issue_date, due_date, ref_doc_number,
            customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
            customer_phone, customer_contact,
            salesperson, subtotal, discount_type, discount_value, discount_amount,
            vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
            remarks, terms, items, is_tax_invoice, valid_until, credit_days, credit_terms, project_name
        } = req.body;

        let targetStatus = status ? status.toUpperCase() : doc.status;
        if (targetStatus === 'WAITING') {
            const docType = (doc.doc_type || '').toUpperCase();
            if (docType === 'QUOTATION') targetStatus = 'WAITING_APPROVAL';
            else if (['RECEIPT', 'CASH_SALE'].includes(docType)) targetStatus = 'PAID';
            else targetStatus = 'ISSUED';
        }

        let finalDocNumber = doc.doc_number;
        if (!finalDocNumber && targetStatus !== 'DRAFT') {
            finalDocNumber = await getNextDocNumber(1, doc.doc_type, issue_date || doc.issue_date);
        }

        const effGrandTotal = grand_total !== undefined ? parseFloat(grand_total) || 0 : (doc.grand_total || 0);
        let effPaidAmount = doc.paid_amount || 0;
        let effBalanceDue = doc.balance_due || 0;

        if (targetStatus === 'PAID') {
            effPaidAmount = effGrandTotal;
            effBalanceDue = 0;
        } else if (targetStatus === 'DRAFT') {
            effPaidAmount = 0;
            effBalanceDue = effGrandTotal;
        } else if (targetStatus === 'ISSUED') {
            effPaidAmount = parseFloat(doc.paid_amount || 0);
            effBalanceDue = Math.max(0, effGrandTotal - effPaidAmount);
        } else {
            effPaidAmount = parseFloat(doc.paid_amount || 0);
            effBalanceDue = Math.max(0, effGrandTotal - effPaidAmount);
        }

        const nowIso = new Date().toISOString();
        let issuedAt = doc.issued_at;
        let approvedAt = doc.approved_at;

        if (doc.status === 'DRAFT' && ['ISSUED', 'PAID'].includes(targetStatus) && !issuedAt) {
            issuedAt = nowIso;
        }
        if (targetStatus === 'APPROVED' && !approvedAt) {
            approvedAt = nowIso;
        }

        await db.runAsync(`
            UPDATE documents SET
                doc_number = COALESCE(?, doc_number),
                status = COALESCE(?, status),
                issue_date = COALESCE(?, issue_date),
                due_date = ?,
                ref_doc_number = ?,
                customer_id = ?,
                customer_name = COALESCE(?, customer_name),
                customer_tax_id = ?,
                customer_branch = ?,
                customer_address = ?,
                customer_phone = ?,
                customer_contact = ?,
                salesperson = ?,
                subtotal = ?,
                discount_type = ?,
                discount_value = ?,
                discount_amount = ?,
                vat_type = ?,
                vat_amount = ?,
                wht_type = ?,
                wht_rate = ?,
                wht_amount = ?,
                grand_total = ?,
                paid_amount = ?,
                balance_due = ?,
                issued_at = ?,
                approved_at = ?,
                remarks = ?,
                terms = ?,
                is_tax_invoice = ?,
                valid_until = ?,
                credit_days = ?,
                credit_terms = ?,
                project_name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            finalDocNumber, targetStatus,
            issue_date, due_date || null, ref_doc_number || null,
            customer_id || null, customer_name, customer_tax_id || '', customer_branch || '', customer_address || '',
            customer_phone !== undefined ? customer_phone : (doc.customer_phone || ''),
            customer_contact !== undefined ? customer_contact : (doc.customer_contact || ''),
            salesperson || '', subtotal || 0, discount_type || 'fixed', discount_value || 0, discount_amount || 0,
            vat_type || 'exclude', vat_amount || 0, wht_type || '0', wht_rate || 0, wht_amount || 0, effGrandTotal,
            effPaidAmount, effBalanceDue,
            issuedAt, approvedAt,
            remarks || '', terms || '', is_tax_invoice ? 1 : 0, valid_until || null,
            credit_days !== undefined && credit_days !== null && credit_days !== '' ? Number(credit_days) : 30,
            credit_terms !== undefined ? credit_terms : doc.credit_terms, project_name || null,
            doc.id
        ]);

        // อัปเดตรายการสินค้า
        if (Array.isArray(items)) {
            await db.runAsync('DELETE FROM document_items WHERE document_id = ?', [doc.id]);
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const matchedProd = await findProductForLineItem(it, doc.company_id || 1);
                const resolvedProdId = it.product_id || (matchedProd ? matchedProd.id : null);
                it.product_id = resolvedProdId;
                await db.runAsync(`
                    INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    doc.id, i + 1, resolvedProdId, it.source_item_id || null,
                    it.item_name || 'สินค้า/บริการ', it.description || '',
                    it.quantity || 1, it.unit || 'ชิ้น', it.unit_price || 0, it.discount || 0,
                    it.vat_rate !== undefined && it.vat_rate !== null && it.vat_rate !== '' ? Number(it.vat_rate) : 7,
                    it.total_amount || 0
                ]);
            }
        }

        // ตัดสต็อกสินค้าเมื่อเปลี่ยนสถานะจาก DRAFT เป็น ISSUED หรือ PAID
        const typeDef = getType(doc.doc_type);
        if (doc.status === 'DRAFT' && ['ISSUED', 'PAID'].includes(targetStatus) && typeDef && typeDef.deductsStock) {
            const currentItems = Array.isArray(items) ? items : await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [doc.id]);
            for (const it of currentItems) {
                const product = await findProductForLineItem(it, doc.company_id || 1);
                if (product) {
                    const deductQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) - deductQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?`, [newQty, newQty, product.id]);
                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'OUT_SALE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.id, -deductQty, newQty, product.cost_price || 0,
                        doc.doc_type, finalDocNumber, `ตัดสต็อกจากการบันทึกออกเอกสาร (${targetStatus})`, 'System'
                    ]);
                }
            }
        }

        await recordStatusLog(doc.id, 'UPDATE', doc.status, targetStatus, null, 'แก้ไขข้อมูลเอกสาร');

        const updated = await db.getAsync('SELECT * FROM documents WHERE id = ?', [doc.id]);
        const updatedItems = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [doc.id]);
        res.json({ ...updated, items: updatedItems });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดำเนินการตาม Workflow Action (submit, return, approve, reject, issue, cancel, complete)
router.post('/:id/actions/:action', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const actionKey = String(req.params.action || '').toLowerCase();
        const typeDef = getType(doc.doc_type);
        if (!typeDef) return res.status(400).json({ error: `Unknown document type ${doc.doc_type}` });

        const actDef = typeDef.actions?.[actionKey];
        if (!actDef) return res.status(400).json({ error: `Action "${actionKey}" is not supported for ${doc.doc_type}` });

        if (!actDef.from.includes(doc.status)) {
            return res.status(400).json({
                error: `ไม่สามารถทำรายการ "${actDef.label}" ได้ เนื่องจากเอกสารอยู่ในสถานะ "${doc.status}" (ต้องอยู่ในสถานะ: ${actDef.from.join(', ')})`
            });
        }

        const reason = req.body.reason ? String(req.body.reason).trim() : null;
        if (actDef.requireReason && !reason) {
            return res.status(400).json({ error: `กรุณาระบุเหตุผลในการทำรายการ "${actDef.label}"` });
        }

        // ออกเลขที่เอกสารจริงถ้าออกจาก DRAFT
        let docNumber = doc.doc_number;
        if (actDef.assignNumber && !docNumber) {
            docNumber = await getNextDocNumber(1, doc.doc_type, doc.issue_date);
            await db.runAsync('UPDATE documents SET doc_number = ? WHERE id = ?', [docNumber, doc.id]);
        }

        const nextStatus = actDef.to;
        const items = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [doc.id]);

        // จัดการสต็อกสินค้าตาม Action Rule
        if (actDef.stock === 'OUT' && typeDef.deductsStock && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(doc.status)) {
            for (const it of items) {
                const product = await findProductForLineItem(it, doc.company_id || 1);
                if (product) {
                    const deductQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) - deductQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?`, [newQty, newQty, product.id]);
                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'OUT_SALE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.id, -deductQty, newQty, product.cost_price || 0,
                        doc.doc_type, docNumber, `ตัดสต็อกจากการดำเนินการ ${actDef.label}`, 'System'
                    ]);
                }
            }
        } else if (actDef.stock === 'RETURN' && typeDef.deductsStock && ['ISSUED', 'PARTIAL_PAID', 'PAID', 'APPROVED', 'COMPLETED'].includes(doc.status)) {
            // ยกเลิกเอกสาร คืนยอดสต็อกสินค้า
            for (const it of items) {
                const product = await findProductForLineItem(it, doc.company_id || 1);
                if (product) {
                    const returnQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) + returnQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?`, [newQty, newQty, product.id]);
                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'RETURN', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.id, returnQty, newQty, product.cost_price || 0,
                        doc.doc_type, docNumber, `คืนสต็อกจากการยกเลิกเอกสาร (${reason || 'ไม่ระบุเหตุผล'})`, 'System'
                    ]);
                }
            }
        } else if (actDef.stock === 'IN') {
            // รับสินค้าเข้าสต็อกจากใบสั่งซื้อ (Purchase Order)
            for (const it of items) {
                const product = await findProductForLineItem(it, doc.company_id || 1);
                if (product) {
                    const receiveQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) + receiveQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ?, stock_quantity = ? WHERE id = ?`, [newQty, newQty, product.id]);
                    await db.runAsync(`
                        INSERT INTO stock_movements (
                            product_id, company_id, movement_type, change_qty, balance_after,
                            unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
                        ) VALUES (?, 1, 'IN_PURCHASE', ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.id, receiveQty, newQty, it.unit_price || product.cost_price || 0,
                        doc.doc_type, docNumber, `รับสินค้าเข้าสต็อกตามใบสั่งซื้อ`, 'System'
                    ]);
                }
            }

            // สร้างรายการบันทึกค่าใช้จ่ายอัตโนมัติจากใบสั่งซื้อ
            try {
                const expExists = await db.getAsync('SELECT id FROM expenses WHERE ref_doc_number = ?', [docNumber]);
                if (!expExists) {
                    const now = new Date();
                    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const maxRow = await db.getAsync(`SELECT MAX(CAST(substr(doc_number, 12) AS INTEGER)) as max_num FROM expenses WHERE doc_number LIKE 'EXP-${yearMonth}-%'`);
                    const nextSeq = String(((maxRow && maxRow.max_num) || 0) + 1).padStart(3, '0');
                    const expDocNumber = `EXP-${yearMonth}-${nextSeq}`;

                    const expRes = await db.runAsync(`
                        INSERT INTO expenses (
                            company_id, doc_number, transaction_date, due_date, ref_doc_number,
                            vendor_name, vendor_tax_id, vendor_branch, vendor_address, category,
                            payment_status, payment_method, subtotal, vat_type, vat_rate, vat_amount,
                            wht_type, wht_rate, wht_amount, net_total, remarks
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ต้นทุนสินค้า / วัตถุดิบ', 'UNPAID', 'TRANSFER', ?, ?, 7, ?, ?, ?, ?, ?, ?)
                    `, [
                        doc.company_id || 1, expDocNumber, now.toISOString().split('T')[0], doc.due_date, docNumber,
                        doc.customer_name || 'ผู้จำหน่าย', doc.customer_tax_id, doc.customer_branch, doc.customer_address,
                        doc.subtotal || 0, doc.vat_type || 'exclude', doc.vat_amount || 0,
                        doc.wht_type || '0', doc.wht_rate || 0, doc.wht_amount || 0, doc.grand_total || 0,
                        `บันทึกค่าใช้จ่ายจากการตรวจรับของตามใบสั่งซื้อ ${docNumber}`
                    ]);

                    const expId = expRes.lastID;
                    for (let i = 0; i < items.length; i++) {
                        const it = items[i];
                        const desc = it.description ? `${it.item_name || ''} - ${it.description}` : (it.item_name || 'สินค้าตามใบสั่งซื้อ');
                        await db.runAsync(`
                            INSERT INTO expense_items (
                                expense_id, row_order, description, category, amount, vat_rate, wht_rate, total_amount
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            expId, i + 1, desc, 'ต้นทุนสินค้า / วัตถุดิบ',
                            it.total_amount || ((it.quantity || 1) * (it.unit_price || 0)),
                            it.vat_rate !== undefined ? it.vat_rate : 7,
                            0,
                            it.total_amount || ((it.quantity || 1) * (it.unit_price || 0))
                        ]);
                    }
                }
            } catch (expErr) {
                console.error('Error auto-creating expense from PO:', expErr);
            }
        }

        // อัปเดตสถานะและ Timestamp
        let updateSql = 'UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP';
        const updateParams = [nextStatus];

        if (actionKey === 'approve') {
            updateSql += ', approved_at = CURRENT_TIMESTAMP';
        } else if (actionKey === 'issue') {
            updateSql += ', issued_at = CURRENT_TIMESTAMP';
        } else if (actionKey === 'cancel') {
            updateSql += ', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?';
            updateParams.push(reason);
        }

        if (nextStatus === 'PAID') {
            updateSql += ', paid_amount = grand_total, balance_due = 0';
        } else if (nextStatus === 'ISSUED') {
            updateSql += ', paid_amount = 0, balance_due = grand_total';
        }

        updateSql += ' WHERE id = ?';
        updateParams.push(doc.id);

        await db.runAsync(updateSql, updateParams);
        await recordStatusLog(doc.id, actionKey.toUpperCase(), doc.status, nextStatus, req.body.user_id || null, reason);

        const updatedDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [doc.id]);
        res.json({
            message: `ดำเนินการ "${actDef.label}" เรียบร้อยแล้ว`,
            document: updatedDoc,
            available_actions: availableActions(updatedDoc, { role: req.body.user_role || 'ADMIN' })
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// บันทึกรับชำระเงิน (Partial หรือ Full Payment)
router.post('/:id/payments', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' });

        if (doc.status === 'CANCELLED' || doc.status === 'DRAFT') {
            return res.status(400).json({ error: `ไม่สามารถบันทึกรับชำระสำหรับเอกสารสถานะ ${doc.status} ได้` });
        }

        const {
            paid_date = new Date().toISOString().split('T')[0],
            method = 'TRANSFER',
            bank_name,
            ref_no,
            amount,
            wht_amount = 0,
            notes,
            auto_create_receipt = false
        } = req.body;

        const payAmount = parseFloat(amount);
        if (!payAmount || payAmount <= 0) {
            return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินที่ถูกต้อง' });
        }

        // บันทึก Log การชำระเงิน
        const payRes = await db.runAsync(`
            INSERT INTO document_payments (
                document_id, paid_date, method, bank_name, ref_no, amount, wht_amount, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [doc.id, paid_date, method, bank_name || null, ref_no || null, payAmount, parseFloat(wht_amount) || 0, notes || null]);

        // คำนวณยอดชำระแล้วและยอดคงเหลือ
        const currentPaid = parseFloat(doc.paid_amount || 0);
        const newPaid = currentPaid + payAmount;
        const grandTotal = parseFloat(doc.grand_total || 0);
        const balanceDue = Math.max(0, grandTotal - newPaid);

        let newStatus = doc.status;
        if (balanceDue <= 0.001) {
            newStatus = 'PAID';
        } else {
            newStatus = 'PARTIAL_PAID';
        }

        await db.runAsync(`
            UPDATE documents 
            SET paid_amount = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newPaid, balanceDue, newStatus, doc.id]);

        await recordStatusLog(
            doc.id, 
            'PAYMENT_RECEIVED', 
            doc.status, 
            newStatus, 
            req.body.user_id || null, 
            `บันทึกรับชำระ ฿${payAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (คงค้าง ฿${balanceDue.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`
        );

        let createdReceipt = null;
        if (auto_create_receipt && (doc.doc_type === 'TAX_INVOICE' || doc.doc_type === 'BILLING_NOTE')) {
            const reNumber = await getNextDocNumber(1, 'RECEIPT', paid_date);
            const reRes = await db.runAsync(`
                INSERT INTO documents (
                    company_id, doc_type, doc_number, issue_date, ref_doc_number,
                    customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                    customer_phone, customer_contact,
                    salesperson, subtotal, discount_amount, vat_type, vat_amount,
                    wht_type, wht_rate, wht_amount, grand_total, paid_amount, balance_due,
                    status, remarks, is_tax_invoice
                ) VALUES (?, 'RECEIPT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PAID', ?, ?)
            `, [
                doc.company_id || 1, reNumber, paid_date, doc.doc_number,
                doc.customer_id, doc.customer_name, doc.customer_tax_id, doc.customer_branch, doc.customer_address,
                doc.customer_phone || '', doc.customer_contact || '',
                doc.salesperson, payAmount, 0, 'exclude', 0,
                doc.wht_type || '0', doc.wht_rate || 0, parseFloat(wht_amount) || 0, payAmount, payAmount,
                `ออกใบเสร็จรับเงินจากการชำระเอกสาร ${doc.doc_number}`,
                doc.doc_type === 'BILLING_NOTE' ? 1 : 0
            ]);

            const newReceiptId = reRes.lastID;
            await db.runAsync(`
                INSERT INTO document_items (
                    document_id, row_order, item_name, description, quantity, unit, unit_price, total_amount
                ) VALUES (?, 1, ?, ?, 1, 'งวด', ?, ?)
            `, [newReceiptId, `รับชำระตามเอกสาร ${doc.doc_number}`, `ช่องทาง: ${method} ${ref_no ? `(อ้างอิง: ${ref_no})` : ''}`, payAmount, payAmount]);

            await db.runAsync(`
                INSERT INTO document_links (source_doc_id, target_doc_id, link_type, amount)
                VALUES (?, ?, 'PAYMENT', ?)
            `, [doc.id, newReceiptId, payAmount]);

            createdReceipt = await db.getAsync('SELECT * FROM documents WHERE id = ?', [newReceiptId]);
        }

        const updatedDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [doc.id]);
        res.status(201).json({
            message: `บันทึกรับชำระเงินจำนวน ฿${payAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} เรียบร้อย`,
            payment_id: payRes.lastID,
            document: updatedDoc,
            receipt: createdReceipt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แปลงเอกสาร (เช่น QT -> BN, QT -> INV, INV -> BN, INV/BN -> RE)
router.post('/convert', async (req, res) => {
    try {
        const { source_id, target_type } = req.body;
        if (!source_id || !target_type) {
            return res.status(400).json({ error: 'source_id and target_type are required' });
        }

        const source = await db.getAsync('SELECT * FROM documents WHERE id = ?', [source_id]);
        if (!source) return res.status(404).json({ error: 'Source document not found' });

        const targetTypeDef = getType(target_type);
        if (!targetTypeDef) return res.status(400).json({ error: `Invalid target document type: ${target_type}` });

        const items = await db.allAsync('SELECT * FROM document_items WHERE document_id = ? ORDER BY row_order ASC', [source.id]);

        const today = new Date();
        const due = new Date();
        const effDays = (source.credit_days !== undefined && source.credit_days !== null && source.credit_days !== '') ? Number(source.credit_days) : 30;
        due.setDate(today.getDate() + effDays);
        const issueStr = today.toISOString().split('T')[0];
        const dueStr = due.toISOString().split('T')[0];

        const insertResult = await db.runAsync(`
            INSERT INTO documents (
                company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                customer_phone, customer_contact,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                status, remarks, terms, is_tax_invoice, valid_until, credit_days, credit_terms, project_name,
                paid_amount, balance_due
            ) VALUES (
                1, ?, NULL, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                'DRAFT', ?, ?, ?, NULL, ?, ?, ?,
                0, ?
            )
        `, [
            target_type.toUpperCase(), issueStr, dueStr, source.doc_number || null,
            source.customer_id, source.customer_name, source.customer_tax_id, source.customer_branch, source.customer_address,
            source.customer_phone || '', source.customer_contact || '',
            source.salesperson, source.subtotal, source.discount_type, source.discount_value, source.discount_amount,
            source.vat_type, source.vat_amount, source.wht_type, source.wht_rate, source.wht_amount, source.grand_total,
            `สร้างต่อเนื่องจากเอกสาร ${source.doc_number || ''}`, source.terms,
            target_type.toUpperCase() === 'RECEIPT' ? 0 : (targetTypeDef.isTaxDocument ? 1 : 0),
            effDays, source.credit_terms || (effDays === 0 ? 'เงินสด' : `เครดิต ${effDays} วัน`), source.project_name,
            source.grand_total
        ]);

        const newDocId = insertResult.lastID;

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            await db.runAsync(`
                INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                newDocId, i + 1, it.product_id, it.id,
                it.item_name, it.description, it.quantity, it.unit, it.unit_price, it.discount,
                it.vat_rate !== undefined && it.vat_rate !== null && it.vat_rate !== '' ? Number(it.vat_rate) : 7,
                it.total_amount
            ]);
        }

        await db.runAsync(`
            INSERT INTO document_links (source_doc_id, target_doc_id, link_type, amount)
            VALUES (?, ?, 'CONVERT', ?)
        `, [source.id, newDocId, source.grand_total]);

        await recordStatusLog(newDocId, 'CONVERT_FROM', null, 'DRAFT', null, `แปลงมาจาก ${source.doc_number || ('ID ' + source.id)}`);

        const createdDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [newDocId]);
        const createdItems = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [newDocId]);

        res.status(201).json({
            message: `สร้างเอกสาร ${targetTypeDef.titleTh} จาก ${source.doc_number || 'ต้นทาง'} สำเร็จ`,
            document: { ...createdDoc, items: createdItems, is_tax_document: isTaxDocument(createdDoc) }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// อัปเดตสถานะเอกสาร (Backward-compatible)
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const targetStatus = status.toUpperCase();

        let docNumber = doc.doc_number;
        if (!docNumber && targetStatus !== 'DRAFT') {
            docNumber = await getNextDocNumber(1, doc.doc_type, doc.issue_date);
            await db.runAsync('UPDATE documents SET doc_number = ? WHERE id = ?', [docNumber, doc.id]);
        }

        await db.runAsync('UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetStatus, req.params.id]);
        await recordStatusLog(doc.id, 'STATUS_UPDATE', doc.status, targetStatus, null, 'ปรับปรุงสถานะ');

        const updated = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลบเอกสาร (อนุญาตเฉพาะสถานะร่างที่ยังไม่มีเลขที่เอกสาร)
router.delete('/:id', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        if (doc.status !== 'DRAFT' && doc.doc_number) {
            return res.status(400).json({
                error: `ไม่อนุญาตให้ลบเอกสารที่ออกเลขที่แล้ว (${doc.doc_number}) เนื่องจากเป็นไปตามมาตรฐานการควบคุมเอกสารการค้าและภาษี กรุณาใช้คำสั่ง "ยกเลิก (Cancel)" เอกสารแทน`
            });
        }

        await db.runAsync('DELETE FROM document_items WHERE document_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM document_links WHERE source_doc_id = ? OR target_doc_id = ?', [req.params.id, req.params.id]);
        await db.runAsync('DELETE FROM document_status_logs WHERE document_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM documents WHERE id = ?', [req.params.id]);

        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
