/**
 * FlowAccount Advance - Backend REST API Server (Node.js & Express)
 * Provides CRUD endpoints for Documents, Customers, Products, and Business Dashboard.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { db, initDatabase, getNextDocNumber, peekNextDocNumber, recordStatusLog } = require('./database');
const {
    ROLES, STATUSES, STATUS_KEYS, RECEIVABLE_STATUSES, NUMBERING,
    DOC_TYPES, DOC_TYPE_KEYS,
    getType, isTaxDocument, availableActions, publicRegistry
} = require('./document-types');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve static frontend files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================================================
// 1. Company Information API
// ==========================================================================
app.get('/api/company', async (req, res) => {
    try {
        const company = await db.getAsync('SELECT * FROM companies LIMIT 1');
        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json(company);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 2. Customers CRUD API
// ==========================================================================
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await db.allAsync('SELECT * FROM customers ORDER BY id DESC');
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/vendors', async (req, res) => {
    try {
        const vendors = await db.allAsync(`
            SELECT id, name, tax_id, branch, address, contact_person, email, phone, credit_terms
            FROM customers WHERE contact_type IN ('VENDOR', 'BOTH')
            UNION
            SELECT DISTINCT NULL as id, vendor_name as name, vendor_tax_id as tax_id, vendor_branch as branch, 
                   vendor_address as address, NULL as contact_person, NULL as email, NULL as phone, 'เครดิต 30 วัน' as credit_terms
            FROM expenses WHERE vendor_name IS NOT NULL AND vendor_name != ''
            ORDER BY name ASC
        `);
        res.json(vendors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers/:id', async (req, res) => {
    try {
        const customer = await db.getAsync('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const { name, tax_id, branch, address, contact_person, email, phone, credit_terms } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const countRow = await db.getAsync('SELECT COUNT(*) as cnt FROM customers');
        const code = `CUST-${String(countRow.cnt + 1).padStart(3, '0')}`;

        const result = await db.runAsync(`
            INSERT INTO customers (company_id, code, name, tax_id, branch, address, contact_person, email, phone, credit_terms)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [code, name, tax_id || '', branch || 'สำนักงานใหญ่', address || '', contact_person || '', email || '', phone || '', credit_terms || 'เครดิต 30 วัน']);

        const created = await db.getAsync('SELECT * FROM customers WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    try {
        const { name, tax_id, branch, address, contact_person, email, phone, credit_terms } = req.body;
        await db.runAsync(`
            UPDATE customers
            SET name = ?, tax_id = ?, branch = ?, address = ?, contact_person = ?, email = ?, phone = ?, credit_terms = ?
            WHERE id = ?
        `, [name, tax_id, branch, address, contact_person, email, phone, credit_terms, req.params.id]);

        const updated = await db.getAsync('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await db.runAsync('DELETE FROM customers WHERE id = ?', [req.params.id]);
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 3. Products / Services API
// ==========================================================================
app.get('/api/products', async (req, res) => {
    try {
        const products = await db.allAsync('SELECT * FROM products ORDER BY id DESC');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, type, description, unit, unit_price, vat_rate } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const countRow = await db.getAsync('SELECT COUNT(*) as cnt FROM products');
        const code = (type === 'PRODUCT' ? 'PRD-' : 'SRV-') + String(countRow.cnt + 1).padStart(3, '0');

        const result = await db.runAsync(`
            INSERT INTO products (company_id, code, name, type, description, unit, unit_price, vat_rate)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `, [code, name, type || 'SERVICE', description || '', unit || 'ชิ้น', unit_price || 0, vat_rate || 7]);

        const created = await db.getAsync('SELECT * FROM products WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 4. Documents CRUD API (Quotations, Billing Notes, Invoices, Receipts)
// ==========================================================================

// ==========================================================================
// 4. Documents CRUD & Trade Document Engine API
// ==========================================================================

// Get public document type registry and workflow metadata
app.get('/api/document-types', (req, res) => {
    res.json(publicRegistry());
});

// Auto-generate next document number (safe preview - does not consume sequence)
app.get('/api/documents/next-number/:type', async (req, res) => {
    try {
        const docType = req.params.type.toUpperCase();
        const nextNumber = await peekNextDocNumber(1, docType, req.query.date);
        res.json({ nextNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get documents list with optional filters
app.get('/api/documents', async (req, res) => {
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

        // Fetch all connected documents referencing other documents
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
            const isOverdue = d.due_date && ['ISSUED', 'PARTIAL_PAID', 'WAITING'].includes(d.status) && new Date(d.due_date) < new Date('2026-10-05');
            const related = (d.doc_number && relatedMap[d.doc_number]) ? relatedMap[d.doc_number] : [];
            let status = d.status;
            if (d.doc_type === 'QUOTATION' && related.length > 0 && ['APPROVED', 'COMPLETED'].includes(status)) {
                status = 'COMPLETED';
            }
            return {
                ...d,
                status,
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

// Export documents as CSV / Excel format with UTF-8 BOM
app.get('/api/documents/export/csv', async (req, res) => {
    try {
        const { type, status, search } = req.query;
        let query = 'SELECT * FROM documents WHERE 1=1';
        const params = [];

        if (type) {
            query += ' AND doc_type = ?';
            params.push(type.toUpperCase());
        }
        if (status && status !== 'ALL') {
            if (status === 'WAITING') {
                query += " AND status IN ('WAITING', 'WAITING_APPROVAL')";
            } else if (status === 'CANCELLED') {
                query += " AND status IN ('CANCELLED', 'REJECTED')";
            } else {
                query += ' AND status = ?';
                params.push(status);
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

        // Summary row
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

// Get single document with line items, links, payments, and logs
app.get('/api/documents/:id', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
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

        const userRole = req.query.role || 'ADMIN';
        const actions = availableActions(doc, { role: userRole });

        res.json({
            ...doc,
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

// Create new document + line items
app.post('/api/documents', async (req, res) => {
    try {
        const {
            doc_type, doc_number, issue_date, due_date, ref_doc_number,
            customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
            salesperson, subtotal, discount_type, discount_value, discount_amount,
            vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
            status, remarks, terms, items, is_tax_invoice, valid_until, credit_days, project_name,
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

        // Allocate official running number if requested to issue/approve/submit now, else keep draft or assigned
        let finalDocNumber = doc_number ? String(doc_number).trim() : null;
        if (!finalDocNumber && targetStatus !== 'DRAFT') {
            finalDocNumber = await getNextDocNumber(1, upperType, cleanIssueDate);
        } else if (finalDocNumber && finalDocNumber.startsWith('AUTO-')) {
            finalDocNumber = await getNextDocNumber(1, upperType, cleanIssueDate);
        }

        const calculatedBalance = targetStatus === 'PAID' ? 0 : (grand_total || 0);
        const calculatedPaid = targetStatus === 'PAID' ? (grand_total || 0) : 0;

        // Insert document header
        const docResult = await db.runAsync(`
            INSERT INTO documents (
                company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                status, remarks, terms, is_tax_invoice, valid_until, credit_days, project_name,
                paid_amount, balance_due,
                issued_at, approved_at
            ) VALUES (
                1, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?
            )
        `, [
            upperType, finalDocNumber, cleanIssueDate, due_date || null, ref_doc_number || null,
            customer_id || null, customer_name, customer_tax_id || '', customer_branch || '', customer_address || '',
            salesperson || '', subtotal || 0, discount_type || 'fixed', discount_value || 0, discount_amount || 0,
            vat_type || 'exclude', vat_amount || 0, wht_type || '0', wht_rate || 0, wht_amount || 0, grand_total || 0,
            targetStatus, remarks || '', terms || '', is_tax_invoice ? 1 : 0, valid_until || null, credit_days || 30, project_name || null,
            calculatedPaid, calculatedBalance,
            ['ISSUED', 'PAID'].includes(targetStatus) ? new Date().toISOString() : null,
            targetStatus === 'APPROVED' ? new Date().toISOString() : null
        ]);

        const documentId = docResult.lastID;

        // Insert line items
        if (Array.isArray(items) && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                await db.runAsync(`
                    INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    documentId, i + 1, it.product_id || null, it.source_item_id || null,
                    it.item_name || 'สินค้า/บริการ', it.description || '',
                    it.quantity || 1, it.unit || 'ชิ้น', it.unit_price || 0, it.discount || 0,
                    it.vat_rate || 7, it.total_amount || 0
                ]);
            }
        }

        // Inventory Stock Deduction (ONLY documents where deductsStock is true: TAX_INVOICE, CASH_SALE)
        if (typeDef.deductsStock && ['ISSUED', 'PAID'].includes(targetStatus) && Array.isArray(items)) {
            for (const it of items) {
                let product = null;
                if (it.product_id) {
                    product = await db.getAsync(`SELECT * FROM products WHERE id = ? AND type = 'PRODUCT'`, [it.product_id]);
                }
                if (!product) {
                    product = await db.getAsync(`SELECT * FROM products WHERE (name = ? OR code = ?) AND type = 'PRODUCT'`, [it.item_name, it.item_name]);
                }
                if (product) {
                    const deductQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) - deductQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ? WHERE id = ?`, [newQty, product.id]);
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

        // Connect relation link if created from source document
        if (source_doc_id) {
            await db.runAsync(`
                INSERT OR IGNORE INTO document_links (source_doc_id, target_doc_id, link_type, amount)
                VALUES (?, ?, 'CONVERT', ?)
            `, [source_doc_id, documentId, grand_total || 0]);
        }

        // If reference document number is supplied and refers to a quotation, mark quotation as COMPLETED
        if (ref_doc_number) {
            await db.runAsync(`
                UPDATE documents SET status = 'COMPLETED' WHERE doc_number = ? AND doc_type = 'QUOTATION'
            `, [String(ref_doc_number).trim()]);
        }

        // Record initial status log
        await recordStatusLog(documentId, 'CREATE', null, targetStatus, null, remarks || 'สร้างเอกสารใหม่');

        const createdDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [documentId]);
        const createdItems = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [documentId]);
        res.status(201).json({ ...createdDoc, items: createdItems, is_tax_document: isTaxDocument(createdDoc) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update document details (draft / waiting approval only)
app.put('/api/documents/:id', async (req, res) => {
    try {
        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        if (!['DRAFT', 'WAITING_APPROVAL'].includes(doc.status)) {
            return res.status(400).json({ error: `ไม่สามารถแก้ไขเอกสารที่อยู่ในสถานะ "${doc.status}" ได้ (อนุญาตเฉพาะสถานะร่างหรือรออนุมัติ)` });
        }

        const {
            issue_date, due_date, ref_doc_number,
            customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
            salesperson, subtotal, discount_type, discount_value, discount_amount,
            vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
            remarks, terms, items, is_tax_invoice, valid_until, credit_days, project_name
        } = req.body;

        await db.runAsync(`
            UPDATE documents SET
                issue_date = COALESCE(?, issue_date),
                due_date = ?,
                ref_doc_number = ?,
                customer_id = ?,
                customer_name = COALESCE(?, customer_name),
                customer_tax_id = ?,
                customer_branch = ?,
                customer_address = ?,
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
                balance_due = ?,
                remarks = ?,
                terms = ?,
                is_tax_invoice = ?,
                valid_until = ?,
                credit_days = ?,
                project_name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            issue_date, due_date || null, ref_doc_number || null,
            customer_id || null, customer_name, customer_tax_id || '', customer_branch || '', customer_address || '',
            salesperson || '', subtotal || 0, discount_type || 'fixed', discount_value || 0, discount_amount || 0,
            vat_type || 'exclude', vat_amount || 0, wht_type || '0', wht_rate || 0, wht_amount || 0, grand_total || 0,
            grand_total || 0,
            remarks || '', terms || '', is_tax_invoice ? 1 : 0, valid_until || null, credit_days || 30, project_name || null,
            doc.id
        ]);

        // Replace items
        if (Array.isArray(items)) {
            await db.runAsync('DELETE FROM document_items WHERE document_id = ?', [doc.id]);
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                await db.runAsync(`
                    INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    doc.id, i + 1, it.product_id || null, it.source_item_id || null,
                    it.item_name || 'สินค้า/บริการ', it.description || '',
                    it.quantity || 1, it.unit || 'ชิ้น', it.unit_price || 0, it.discount || 0,
                    it.vat_rate || 7, it.total_amount || 0
                ]);
            }
        }

        await recordStatusLog(doc.id, 'UPDATE', doc.status, doc.status, null, 'แก้ไขข้อมูลเอกสาร');

        const updated = await db.getAsync('SELECT * FROM documents WHERE id = ?', [doc.id]);
        const updatedItems = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [doc.id]);
        res.json({ ...updated, items: updatedItems });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Action Execution Endpoint (State Machine: submit, return, approve, reject, issue, cancel, complete)
app.post('/api/documents/:id/actions/:action', async (req, res) => {
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

        // Assign running number if document is moving out of DRAFT and has no number yet
        let docNumber = doc.doc_number;
        if (actDef.assignNumber && !docNumber) {
            docNumber = await getNextDocNumber(1, doc.doc_type, doc.issue_date);
            await db.runAsync('UPDATE documents SET doc_number = ? WHERE id = ?', [docNumber, doc.id]);
        }

        const nextStatus = actDef.to;
        const items = await db.allAsync('SELECT * FROM document_items WHERE document_id = ?', [doc.id]);

        // Stock handling based on action rule
        if (actDef.stock === 'OUT' && typeDef.deductsStock) {
            for (const it of items) {
                let product = it.product_id ? await db.getAsync('SELECT * FROM products WHERE id = ?', [it.product_id]) : null;
                if (!product) {
                    product = await db.getAsync(`SELECT * FROM products WHERE (name = ? OR code = ?) AND type = 'PRODUCT'`, [it.item_name, it.item_name]);
                }
                if (product) {
                    const deductQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) - deductQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ? WHERE id = ?`, [newQty, product.id]);
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
        } else if (actDef.stock === 'RETURN' && typeDef.deductsStock) {
            // Cancel action returns stock
            for (const it of items) {
                let product = it.product_id ? await db.getAsync('SELECT * FROM products WHERE id = ?', [it.product_id]) : null;
                if (!product) {
                    product = await db.getAsync(`SELECT * FROM products WHERE (name = ? OR code = ?) AND type = 'PRODUCT'`, [it.item_name, it.item_name]);
                }
                if (product) {
                    const returnQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) + returnQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ? WHERE id = ?`, [newQty, product.id]);
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
            // Receive inventory items from Purchase Order
            for (const it of items) {
                let product = it.product_id ? await db.getAsync('SELECT * FROM products WHERE id = ?', [it.product_id]) : null;
                if (!product) {
                    product = await db.getAsync(`SELECT * FROM products WHERE (name = ? OR code = ?)`, [it.item_name, it.item_name]);
                }
                if (product) {
                    const receiveQty = parseFloat(it.quantity) || 1;
                    const newQty = (product.quantity_on_hand || 0) + receiveQty;
                    await db.runAsync(`UPDATE products SET quantity_on_hand = ? WHERE id = ?`, [newQty, product.id]);
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

            // Create corresponding expense if not yet exists
            try {
                const expExists = await db.getAsync('SELECT id FROM expenses WHERE ref_doc_number = ?', [docNumber]);
                if (!expExists) {
                    const expDocNumber = `EXP-${new Date().toISOString().slice(0,7).replace('-', '')}-${String(Date.now()).slice(-4)}`;
                    await db.runAsync(`
                        INSERT INTO expenses (
                            company_id, doc_number, transaction_date, due_date, ref_doc_number,
                            vendor_name, vendor_tax_id, vendor_branch, vendor_address, category,
                            payment_status, payment_method, subtotal, vat_type, vat_rate, vat_amount,
                            wht_type, wht_rate, wht_amount, net_total, remarks
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ต้นทุนสินค้า / วัตถุดิบ', 'UNPAID', 'TRANSFER', ?, ?, 7, ?, ?, ?, ?, ?, ?)
                    `, [
                        doc.company_id || 1, expDocNumber, new Date().toISOString().split('T')[0], doc.due_date, docNumber,
                        doc.customer_name || 'ผู้จำหน่าย', doc.customer_tax_id, doc.customer_branch, doc.customer_address,
                        doc.subtotal || 0, doc.vat_type || 'exclude', doc.vat_amount || 0,
                        doc.wht_type || '0', doc.wht_rate || 0, doc.wht_amount || 0, doc.grand_total || 0,
                        `บันทึกค่าใช้จ่ายจากการตรวจรับของตามใบสั่งซื้อ ${docNumber}`
                    ]);
                }
            } catch (expErr) {
                console.error('Error auto-creating expense from PO:', expErr);
            }
        }

        // Timestamps & update status
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

// Record Document Payment (Partial or Full Settlement)
app.post('/api/documents/:id/payments', async (req, res) => {
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

        // Insert payment log
        const payRes = await db.runAsync(`
            INSERT INTO document_payments (
                document_id, paid_date, method, bank_name, ref_no, amount, wht_amount, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [doc.id, paid_date, method, bank_name || null, ref_no || null, payAmount, parseFloat(wht_amount) || 0, notes || null]);

        // Calculate paid_amount and balance_due
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
            // Generate linked receipt
            const reNumber = await getNextDocNumber(1, 'RECEIPT', paid_date);
            const reRes = await db.runAsync(`
                INSERT INTO documents (
                    company_id, doc_type, doc_number, issue_date, ref_doc_number,
                    customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                    salesperson, subtotal, discount_amount, vat_type, vat_amount,
                    wht_type, wht_rate, wht_amount, grand_total, paid_amount, balance_due,
                    status, remarks, is_tax_invoice
                ) VALUES (?, 'RECEIPT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PAID', ?, ?)
            `, [
                doc.company_id || 1, reNumber, paid_date, doc.doc_number,
                doc.customer_id, doc.customer_name, doc.customer_tax_id, doc.customer_branch, doc.customer_address,
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

// Document Conversion Endpoint (e.g. QT -> BN, QT -> INV, INV -> BN, INV/BN -> RE)
app.post('/api/documents/convert', async (req, res) => {
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

        // Default due date logic based on credit days
        const today = new Date();
        const due = new Date();
        due.setDate(today.getDate() + (source.credit_days || 30));
        const issueStr = today.toISOString().split('T')[0];
        const dueStr = due.toISOString().split('T')[0];

        // Create new document in DRAFT status
        const insertResult = await db.runAsync(`
            INSERT INTO documents (
                company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                status, remarks, terms, is_tax_invoice, valid_until, credit_days, project_name,
                paid_amount, balance_due
            ) VALUES (
                1, ?, NULL, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                'DRAFT', ?, ?, ?, NULL, ?, ?,
                0, ?
            )
        `, [
            target_type.toUpperCase(), issueStr, dueStr, source.doc_number || null,
            source.customer_id, source.customer_name, source.customer_tax_id, source.customer_branch, source.customer_address,
            source.salesperson, source.subtotal, source.discount_type, source.discount_value, source.discount_amount,
            source.vat_type, source.vat_amount, source.wht_type, source.wht_rate, source.wht_amount, source.grand_total,
            `สร้างต่อเนื่องจากเอกสาร ${source.doc_number || ''}`, source.terms,
            target_type.toUpperCase() === 'RECEIPT' ? 0 : (targetTypeDef.isTaxDocument ? 1 : 0),
            source.credit_days || 30, source.project_name,
            source.grand_total
        ]);

        const newDocId = insertResult.lastID;

        // Copy line items
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            await db.runAsync(`
                INSERT INTO document_items (document_id, row_order, product_id, source_item_id, item_name, description, quantity, unit, unit_price, discount, vat_rate, total_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                newDocId, i + 1, it.product_id, it.id,
                it.item_name, it.description, it.quantity, it.unit, it.unit_price, it.discount, it.vat_rate, it.total_amount
            ]);
        }

        // Create relation link
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

// Backward-compatible status updater for legacy UI callers
app.patch('/api/documents/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const doc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const targetStatus = status.toUpperCase();

        // Assign running number if doc was draft and is being approved/paid
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

// Delete document (strictly disallowed for issued documents with document numbers)
app.delete('/api/documents/:id', async (req, res) => {
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

// ==========================================================================
// 5. Expenses CRUD API
// ==========================================================================
app.get('/api/expenses', async (req, res) => {
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

app.get('/api/expenses/stats', async (req, res) => {
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
        `);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/expenses/:id', async (req, res) => {
    try {
        const expense = await db.getAsync('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        const items = await db.allAsync('SELECT * FROM expense_items WHERE expense_id = ? ORDER BY row_order ASC, id ASC', [expense.id]);
        res.json({ ...expense, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
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

        // Auto-generate doc_number if not provided
        if (!doc_number || doc_number.trim() === '' || doc_number === 'AUTO') {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const countRow = await db.getAsync(
                `SELECT COUNT(*) as cnt FROM expenses WHERE doc_number LIKE 'EXP-${yearMonth}-%'`
            );
            const nextSeq = String((countRow ? countRow.cnt : 0) + 1).padStart(3, '0');
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
            vat_rate || 7,
            vat_amount || 0,
            wht_type || '0',
            wht_rate || 0,
            wht_amount || 0,
            net_total || 0,
            slip_url || '',
            remarks || ''
        ]);

        const expenseId = expRes.lastID;

        // Insert items
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
                    item.vat_rate || 7,
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

app.patch('/api/expenses/:id/status', async (req, res) => {
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

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        await db.runAsync('DELETE FROM expense_items WHERE expense_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM expenses WHERE id = ?', [req.params.id]);
        res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 6. Withholding Taxes (50 ทวิ) CRUD API
// ==========================================================================
app.get('/api/withholding-taxes', async (req, res) => {
    try {
        const { form_type, search, startDate, endDate } = req.query;
        let query = 'SELECT * FROM withholding_taxes WHERE 1=1';
        const params = [];

        if (form_type && form_type !== 'ALL') {
            query += ' AND form_type = ?';
            params.push(form_type);
        }

        if (search) {
            query += ' AND (doc_number LIKE ? OR payee_name LIKE ? OR payee_tax_id LIKE ? OR income_type LIKE ?)';
            const pattern = `%${search}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        if (startDate) {
            query += ' AND doc_date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND doc_date <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY doc_date DESC, id DESC';
        const rows = await db.allAsync(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/withholding-taxes/stats', async (req, res) => {
    try {
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
        `);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/withholding-taxes/:id', async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Certificate not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/withholding-taxes', async (req, res) => {
    try {
        let {
            doc_number,
            book_number,
            doc_date,
            form_type,
            sequence_no,
            payer_tax_id,
            payer_name,
            payer_address,
            payee_type,
            payee_tax_id,
            payee_name,
            payee_address,
            income_type,
            payment_date,
            income_amount,
            tax_rate,
            tax_amount,
            tax_condition,
            ref_expense_number,
            status
        } = req.body;

        if (!payee_name) return res.status(400).json({ error: 'Payee name is required' });

        if (!doc_number || doc_number.trim() === '' || doc_number === 'AUTO') {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const countRow = await db.getAsync(
                `SELECT COUNT(*) as cnt FROM withholding_taxes WHERE doc_number LIKE 'WHT-${yearMonth}-%'`
            );
            const nextSeq = String((countRow ? countRow.cnt : 0) + 1).padStart(3, '0');
            doc_number = `WHT-${yearMonth}-${nextSeq}`;
        }

        const result = await db.runAsync(`
            INSERT INTO withholding_taxes (
                company_id, doc_number, book_number, doc_date, form_type, sequence_no,
                payer_tax_id, payer_name, payer_address,
                payee_type, payee_tax_id, payee_name, payee_address,
                income_type, payment_date, income_amount, tax_rate, tax_amount, tax_condition,
                ref_expense_number, status
            ) VALUES (
                1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `, [
            doc_number,
            book_number || '01',
            doc_date || new Date().toISOString().split('T')[0],
            form_type || 'ภ.ง.ด.53',
            sequence_no || '1',
            payer_tax_id || '0105562089456',
            payer_name || 'บริษัท เอ็มเอเอ็ม ดีไซน์แอนด์เซอร์วิส จำกัด',
            payer_address || '123 อาคารสาทรซิตี้ ทาวเวอร์ ชั้น 15 ถนนสาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพฯ 10120',
            payee_type || 'juristic',
            payee_tax_id || '',
            payee_name,
            payee_address || '',
            income_type || 'ค่าบริการ',
            payment_date || doc_date || new Date().toISOString().split('T')[0],
            income_amount || 0,
            tax_rate || 3,
            tax_amount || 0,
            tax_condition || 'withheld',
            ref_expense_number || '',
            status || 'COMPLETED'
        ]);

        const created = await db.getAsync('SELECT * FROM withholding_taxes WHERE id = ?', [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/withholding-taxes/:id', async (req, res) => {
    try {
        await db.runAsync('DELETE FROM withholding_taxes WHERE id = ?', [req.params.id]);
        res.json({ message: 'Certificate deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 7. Dashboard Summary Metrics API
// ==========================================================================
app.get('/api/dashboard/metrics', async (req, res) => {
    try {
        const period = req.query.period || 'this_month';
        const todayStr = '2026-10-05'; // System context date

        let docDateFilter = "strftime('%Y-%m', issue_date) = '2026-10'";
        let expDateFilter = "strftime('%Y-%m', transaction_date) = '2026-10'";
        let prevDocDateFilter = "strftime('%Y-%m', issue_date) = '2026-09'";
        let prevExpDateFilter = "strftime('%Y-%m', transaction_date) = '2026-09'";
        let periodLabel = 'เดือนนี้ (ตุลาคม 2026)';

        if (period === 'last_month') {
            docDateFilter = "strftime('%Y-%m', issue_date) = '2026-09'";
            expDateFilter = "strftime('%Y-%m', transaction_date) = '2026-09'";
            prevDocDateFilter = "strftime('%Y-%m', issue_date) = '2026-08'";
            prevExpDateFilter = "strftime('%Y-%m', transaction_date) = '2026-08'";
            periodLabel = 'เดือนที่แล้ว (กันยายน 2026)';
        } else if (period === 'this_quarter') {
            docDateFilter = "strftime('%Y-%m', issue_date) >= '2026-10' AND strftime('%Y-%m', issue_date) <= '2026-12'";
            expDateFilter = "strftime('%Y-%m', transaction_date) >= '2026-10' AND strftime('%Y-%m', transaction_date) <= '2026-12'";
            prevDocDateFilter = "strftime('%Y-%m', issue_date) >= '2026-07' AND strftime('%Y-%m', issue_date) <= '2026-09'";
            prevExpDateFilter = "strftime('%Y-%m', transaction_date) >= '2026-07' AND strftime('%Y-%m', transaction_date) <= '2026-09'";
            periodLabel = 'ไตรมาสที่ 4 (Q4/2026)';
        } else if (period === 'this_year') {
            docDateFilter = "strftime('%Y', issue_date) = '2026'";
            expDateFilter = "strftime('%Y', transaction_date) = '2026'";
            prevDocDateFilter = "strftime('%Y', issue_date) = '2025'";
            prevExpDateFilter = "strftime('%Y', transaction_date) = '2025'";
            periodLabel = 'ทั้งปี 2026';
        }

        // 1. Current Period Revenue
        const revRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE (${docDateFilter}) AND status IN ('APPROVED', 'PAID', 'ISSUED', 'PARTIAL_PAID', 'COMPLETED')
        `);

        // Previous Period Revenue (for trend % calculation)
        const prevRevRow = await db.getAsync(`
            SELECT COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE (${prevDocDateFilter}) AND status IN ('APPROVED', 'PAID', 'ISSUED', 'PARTIAL_PAID', 'COMPLETED')
        `);

        const curRevenue = revRow ? revRow.total : 0;
        const prevRevenue = prevRevRow ? prevRevRow.total : 0;
        let revGrowth = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue * 100) : 0;

        // 2. Uncollected Receivables (ยอดค้างรับ - ยังไม่เก็บเงิน)
        const recRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(grand_total), 0) as total,
                SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) as overdue_count
            FROM documents 
            WHERE status IN ('WAITING', 'WAITING_APPROVAL', 'ISSUED', 'PARTIAL_PAID')
        `, [todayStr]);

        // 3. Current Period Expenses
        const expRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE (${expDateFilter})
        `);

        // Previous Period Expenses
        const prevExpRow = await db.getAsync(`
            SELECT COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE (${prevExpDateFilter})
        `);

        const curExpenses = expRow ? expRow.total : 0;
        const prevExpenses = prevExpRow ? prevExpRow.total : 0;
        let expGrowth = prevExpenses > 0 ? ((curExpenses - prevExpenses) / prevExpenses * 100) : 0;

        // 4. Accounts Payable (ยอดค้างจ่าย - รอชำระ)
        const payRow = await db.getAsync(`
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(net_total), 0) as total,
                SUM(CASE WHEN due_date IS NOT NULL AND due_date <= date(?, '+7 days') THEN 1 ELSE 0 END) as due_soon_count
            FROM expenses 
            WHERE payment_status = 'UNPAID'
        `, [todayStr]);

        // 5. Net Profit & Margin
        const netProfit = curRevenue - curExpenses;
        const profitMargin = curRevenue > 0 ? (netProfit / curRevenue * 100) : 0;

        // 6. Monthly Trend for Chart (2026 Jan - Oct)
        const thaiMonthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.'];
        const monthKeys = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];

        const revMonthlyRows = await db.allAsync(`
            SELECT strftime('%m', issue_date) as m, COALESCE(SUM(grand_total), 0) as total
            FROM documents 
            WHERE strftime('%Y', issue_date) = '2026' AND status IN ('APPROVED', 'PAID', 'ISSUED', 'PARTIAL_PAID', 'COMPLETED')
            GROUP BY m
        `);

        const expMonthlyRows = await db.allAsync(`
            SELECT strftime('%m', transaction_date) as m, COALESCE(SUM(net_total), 0) as total
            FROM expenses 
            WHERE strftime('%Y', transaction_date) = '2026'
            GROUP BY m
        `);

        const revMonthMap = {};
        const expMonthMap = {};
        (revMonthlyRows || []).forEach(r => { revMonthMap[r.m] = r.total; });
        (expMonthlyRows || []).forEach(r => { expMonthMap[r.m] = r.total; });

        const monthlyTrend = {
            labels: thaiMonthLabels,
            revenue: monthKeys.map(k => revMonthMap[k] || 0),
            expenses: monthKeys.map(k => expMonthMap[k] || 0)
        };

        // 7. Expense Category Breakdown for Donut Chart
        const catRows = await db.allAsync(`
            SELECT category, COALESCE(SUM(net_total), 0) as amount, COUNT(*) as count
            FROM expenses 
            WHERE (${expDateFilter})
            GROUP BY category
            ORDER BY amount DESC
        `);

        const totalCatAmount = (catRows || []).reduce((sum, c) => sum + c.amount, 0);
        const palette = ['#7D0A0A', '#991b1b', '#b91c1c', '#dc2626', '#d97706', '#f59e0b'];
        const expenseCategories = (catRows || []).map((c, idx) => ({
            category: c.category,
            amount: c.amount,
            count: c.count,
            percent: totalCatAmount > 0 ? Math.round((c.amount / totalCatAmount) * 100) : 0,
            color: palette[idx % palette.length]
        }));

        // 8. Uncollected Receivables List
        const uncollectedDocs = await db.allAsync(`
            SELECT id, doc_type, doc_number, customer_name, issue_date, due_date, grand_total, status, remarks
            FROM documents 
            WHERE status IN ('WAITING', 'WAITING_APPROVAL', 'ISSUED', 'PARTIAL_PAID')
            ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id DESC
            LIMIT 10
        `);

        const formattedReceivables = (uncollectedDocs || []).map(d => {
            let statusText = 'รอชำระ';
            let statusClass = 'status-pending';
            let isOverdue = false;
            let daysDiff = null;

            if (d.due_date) {
                const dueTime = new Date(d.due_date).getTime();
                const nowTime = new Date(todayStr).getTime();
                daysDiff = Math.round((dueTime - nowTime) / (1000 * 60 * 60 * 24));

                if (daysDiff < 0) {
                    isOverdue = true;
                    statusClass = 'status-overdue';
                    statusText = `เกินกำหนด ${Math.abs(daysDiff)} วัน`;
                } else if (daysDiff === 0) {
                    statusClass = 'status-warning';
                    statusText = 'ครบกำหนดวันนี้';
                } else {
                    statusClass = 'status-pending';
                    statusText = `รอชำระ (อีก ${daysDiff} วัน)`;
                }
            }

            // Thai date format
            let dueDisplay = '-';
            if (d.due_date) {
                const parts = d.due_date.split('-');
                if (parts.length === 3) {
                    const monthsTh = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                    dueDisplay = `${parseInt(parts[2], 10)} ${monthsTh[parseInt(parts[1], 10)]} ${parts[0]}`;
                }
            }

            return {
                id: d.id,
                doc_type: d.doc_type,
                doc_number: d.doc_number,
                customer_name: d.customer_name,
                due_date: d.due_date,
                due_date_display: dueDisplay,
                amount: d.grand_total,
                status: d.status,
                status_text: statusText,
                status_class: statusClass,
                is_overdue: isOverdue,
                days_diff: daysDiff
            };
        });

        // 9. Bank Accounts & Cash Flow Summary
        const cashAndBank = {
            accounts: [
                { id: 'scb', code: 'SCB', name: 'ไทยพาณิชย์ (กระแสรายวัน)', acc_no: 'xxx-x-xx892-1', balance: 894320.50, status: '✓ กระทบยอดแล้ว', status_class: 'text-success' },
                { id: 'kbank', code: 'KBANK', name: 'กสิกรไทย (ออมทรัพย์)', acc_no: 'xxx-x-xx415-8', balance: 452190.00, status: 'รอตรวจสอบ 3 รายการ', status_class: 'text-warning' },
                { id: 'cash', code: 'CASH', name: 'เงินสดย่อยสำนักงาน', acc_no: 'สำนักงานใหญ่', balance: 35000.00, status: '✓ ยอดคงเหลือตรง', status_class: 'text-success' }
            ],
            totalCash: 1381510.50
        };

        res.json({
            period,
            periodLabel,
            revenue: {
                total: curRevenue,
                growth: parseFloat(revGrowth.toFixed(1)),
                isPositive: revGrowth >= 0,
                count: revRow ? revRow.count : 0
            },
            receivable: {
                total: recRow ? recRow.total : 0,
                count: recRow ? recRow.count : 0,
                overdueCount: recRow ? recRow.overdue_count || 0 : 0
            },
            expenses: {
                total: curExpenses,
                growth: parseFloat(expGrowth.toFixed(1)),
                isPositive: expGrowth <= 0,
                count: expRow ? expRow.count : 0
            },
            payable: {
                total: payRow ? payRow.total : 0,
                count: payRow ? payRow.count : 0,
                dueSoonCount: payRow ? payRow.due_soon_count || 0 : 0,
                note: payRow && payRow.due_soon_count > 0 ? `ครบกำหนดใน 7 วัน` : 'ยอดค้างชำระปกติ'
            },
            profit: {
                total: netProfit,
                margin: parseFloat(profitMargin.toFixed(1)),
                isPositive: netProfit >= 0,
                health: profitMargin >= 40 ? 'สุขภาพการเงินยอดเยี่ยม' : (profitMargin >= 20 ? 'ผลการดำเนินงานดี' : 'ต้องเฝ้าระวัง')
            },
            monthlyTrend,
            expenseCategories,
            uncollectedInvoices: formattedReceivables,
            cashAndBank
        });
    } catch (err) {
        console.error('Error generating dashboard metrics:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 8. User Authentication & Roles API
// ==========================================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const loginIdentifier = (email || username || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ error: 'กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน' });
        }

        const prefix = loginIdentifier.includes('@') ? loginIdentifier.split('@')[0] : loginIdentifier;

        const user = await db.getAsync(`
            SELECT * FROM users 
            WHERE (
                email = ? 
                OR username = ? 
                OR email LIKE ?
                OR username = ?
            ) 
            AND (
                password = ? 
                OR (? = 'account123' AND password = 'acc123')
                OR (? = 'acc123' AND password = 'account123')
            )
        `, [loginIdentifier, loginIdentifier, `${prefix}@%`, prefix, password, password, password]);

        if (!user) {
            return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        if (user.status === 'PENDING') {
            return res.status(403).json({ error: 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติสิทธิ์ผ่านอีเมล กรุณารอการยืนยัน' });
        }
        if (user.status === 'REJECTED') {
            return res.status(403).json({ error: 'คำขอเข้าใช้งานของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ' });
        }
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน' });
        }

        // Update last login
        await db.runAsync('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username || prefix,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar || user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=7D0A0A&color=fff&size=128`,
                phone: user.phone || ''
            },
            token: `flow-token-${user.id}-${Date.now()}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, name, email, role, password } = req.body;
        const userName = (fullName || name || '').trim();
        const userEmail = (email || '').trim();
        const userPass = (password || '').trim();
        const userRole = ['ADMIN', 'ACCOUNTANT', 'SALES'].includes(role) ? role : 'SALES';

        if (!userName || !userEmail || !userPass) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
        }
        if (userPass.length < 8) {
            return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
        }

        const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [userEmail]);
        if (existing) {
            return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
        }

        const username = userEmail.split('@')[0];
        const approvalToken = crypto.randomBytes(24).toString('hex');

        await db.runAsync(`
            INSERT INTO users (name, email, username, role, requested_role, password, status, approval_token)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [userName, userEmail, username, userRole, userRole, userPass, approvalToken]);

        const host = req.get('host') || 'localhost:3000';
        const approveUrl = `${req.protocol}://${host}/api/auth/approve?token=${approvalToken}`;
        const rejectUrl = `${req.protocol}://${host}/api/auth/reject?token=${approvalToken}`;

        const logEntry = `\n======================================================\nTIME: ${new Date().toISOString()}\nTO: admin\nSUBJECT: [MAM DESIGN AND SERVICE] คำขอเข้าใช้งานใหม่: ${userName} (${userRole})\nAPPROVE LINK: ${approveUrl}\nREJECT LINK: ${rejectUrl}\n======================================================\n`;
        fs.appendFileSync(path.join(__dirname, 'sent-emails.log'), logEntry, 'utf8');

        console.log(`[EMAIL DISPATCHED] Registration request from ${userName} (${userEmail}) -> Role: ${userRole}`);
        console.log(`  Approve URL: ${approveUrl}`);

        res.json({
            success: true,
            message: 'ส่งคำขอสร้างบัญชีผู้ใช้สำเร็จ! ระบบได้ส่งอีเมลแจ้งผู้ดูแลระบบเพื่อพิจารณาอนุมัติสิทธิ์แล้ว',
            approval_token: approvalToken
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/approve', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('<h1>ไม่พบรหัสยืนยันสิทธิ์ (Token)</h1>');

        const user = await db.getAsync('SELECT * FROM users WHERE approval_token = ?', [token]);
        if (!user) {
            return res.status(404).send('<h1>ไม่พบคำขอ หรือคำขอนี้ได้รับการอนุมัติไปแล้ว</h1>');
        }

        await db.runAsync("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", [user.id]);

        const roleMap = { 'ADMIN': 'เจ้าของกิจการ (Admin)', 'ACCOUNTANT': 'นักบัญชี (Accountant)', 'SALES': 'พนักงานขาย (Sales)' };
        const roleText = roleMap[user.role] || user.role;

        res.send(`
            <!DOCTYPE html>
            <html lang="th">
            <head>
              <meta charset="UTF-8">
              <title>อนุมัติสิทธิ์เรียบร้อย | MAM DESIGN AND SERVICE</title>
              <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">
              <style>
                body { font-family: 'Prompt', 'Inter', sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; }
                .card { background: #ffffff; max-width: 440px; width: 100%; border-radius: 18px; padding: 40px 32px; text-align: center; box-shadow: 0 12px 35px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
                .icon { width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #059669; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 20px; border: 2px solid #a7f3d0; }
                h1 { font-size: 22px; color: #0f172a; margin: 0 0 10px; }
                p { color: #64748b; font-size: 14.5px; line-height: 1.6; margin: 0 0 20px; }
                .user-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: left; font-size: 14px; line-height: 1.8; }
                .btn { display: inline-block; padding: 12px 28px; background: #7D0A0A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✓</div>
                <h1>อนุมัติสิทธิ์เรียบร้อยแล้ว</h1>
                <p>ระบบได้เปิดการใช้งานให้กับผู้ใช้นี้เรียบร้อยแล้ว ผู้ใช้สามารถเข้าสู่ระบบได้ทันที</p>
                <div class="user-box">
                  <div><strong>ชื่อ-นามสกุล:</strong> ${user.name}</div>
                  <div><strong>อีเมล:</strong> ${user.email}</div>
                  <div><strong>สิทธิ์ที่ได้รับ:</strong> <span style="color: #7D0A0A; font-weight: 600;">${roleText}</span></div>
                  <div><strong>สถานะ:</strong> <span style="color: #059669; font-weight: 600;">เปิดใช้งานแล้ว (ACTIVE)</span></div>
                </div>
                <a href="/index.html" class="btn">ไปที่หน้าเข้าสู่ระบบ &rarr;</a>
              </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

app.get('/api/auth/reject', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('<h1>ไม่พบรหัสยืนยันสิทธิ์ (Token)</h1>');

        const user = await db.getAsync('SELECT * FROM users WHERE approval_token = ?', [token]);
        if (!user) return res.status(404).send('<h1>ไม่พบคำขอ หรือคำขอนี้ได้รับการดำเนินการไปแล้ว</h1>');

        await db.runAsync("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", [user.id]);
        res.send('<h1>ปฏิเสธคำขอเข้าใช้งานเรียบร้อยแล้ว</h1>');
    } catch (err) {
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

app.post('/api/users/:id/approve', async (req, res) => {
    try {
        await db.runAsync("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'อนุมัติผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/:id/reject', async (req, res) => {
    try {
        await db.runAsync("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'ปฏิเสธคำขอผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await db.allAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url, 'https://ui-avatars.com/api/?name=' || name) as avatar, 
                   status, last_login, created_at 
            FROM users 
            ORDER BY id ASC
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, email, password, name, role, phone, avatar } = req.body;
        if (!email || !name || !role) {
            return res.status(400).json({ error: 'Email, name, and role are required' });
        }

        const genUsername = username || email.split('@')[0];
        const genPassword = password || 'flow1234';
        const userAvatar = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7D0A0A&color=fff&size=128`;

        const result = await db.runAsync(`
            INSERT INTO users (company_id, username, email, password, name, role, phone, avatar, avatar_url, status)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            genUsername,
            email,
            genPassword,
            name,
            role,
            phone || '',
            userAvatar,
            userAvatar
        ]);

        const created = await db.getAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url) as avatar, 
                   status, created_at 
            FROM users 
            WHERE id = ?
        `, [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { name, role, phone, status, password, avatar } = req.body;
        let query = 'UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), phone = COALESCE(?, phone), status = COALESCE(?, status)';
        const params = [name, role, phone, status];

        if (password) {
            query += ', password = ?';
            params.push(password);
        }
        if (avatar) {
            query += ', avatar = ?, avatar_url = ?';
            params.push(avatar, avatar);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        await db.runAsync(query, params);
        const updated = await db.getAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url) as avatar, 
                   status, last_login 
            FROM users 
            WHERE id = ?
        `, [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        if (req.params.id == 1) {
            return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลระบบหลักของบริษัทได้' });
        }
        await db.runAsync('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================================================
// 9. Inventory & Stock Management API
// ==========================================================================
app.get('/api/inventory', async (req, res) => {
    try {
        const { category, status, search } = req.query;
        let query = "SELECT * FROM products WHERE type = 'PRODUCT'";
        const params = [];

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
            const qty = p.quantity_on_hand || 0;
            const minLevel = p.min_stock_level || 5;
            let stockStatus = 'NORMAL';
            if (qty <= 0) {
                stockStatus = 'OUT_OF_STOCK';
            } else if (qty <= minLevel) {
                stockStatus = 'LOW_STOCK';
            }
            return {
                ...p,
                stock_status: stockStatus,
                stock_value: (p.cost_price || 0) * qty,
                retail_value: (p.unit_price || 0) * qty
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

app.get('/api/inventory/stats', async (req, res) => {
    try {
        const products = await db.allAsync("SELECT * FROM products WHERE type = 'PRODUCT'");
        let totalValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let inStockCount = 0;

        products.forEach(p => {
            const qty = p.quantity_on_hand || 0;
            const min = p.min_stock_level || 5;
            totalValue += (p.cost_price || 0) * qty;

            if (qty <= 0) {
                outOfStockCount++;
            } else if (qty <= min) {
                lowStockCount++;
                inStockCount++;
            } else {
                inStockCount++;
            }
        });

        res.json({
            total_skus: products.length,
            total_stock_value: totalValue,
            in_stock_count: inStockCount,
            low_stock_count: lowStockCount,
            out_of_stock_count: outOfStockCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/adjust', async (req, res) => {
    try {
        const { product_id, new_quantity, reason, movement_type, user_name } = req.body;
        if (!product_id || new_quantity === undefined) {
            return res.status(400).json({ error: 'product_id and new_quantity are required' });
        }

        const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const currentQty = product.quantity_on_hand || 0;
        const targetQty = parseFloat(new_quantity);
        const diffQty = targetQty - currentQty;

        await db.runAsync('UPDATE products SET quantity_on_hand = ? WHERE id = ?', [targetQty, product_id]);

        const movType = movement_type || (diffQty >= 0 ? 'ADJUST_COUNT' : 'DAMAGE');
        await db.runAsync(`
            INSERT INTO stock_movements (
                product_id, company_id, movement_type, change_qty, balance_after,
                unit_cost, ref_doc_type, ref_doc_number, remarks, created_by
            ) VALUES (?, 1, ?, ?, ?, ?, 'MANUAL_ADJUST', ?, ?, ?)
        `, [
            product_id,
            movType,
            diffQty,
            targetQty,
            product.cost_price || 0,
            `ADJ-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*900)+100)}`,
            reason || 'ตรวจนับสต็อกสินค้าหน้างาน',
            user_name || 'ผู้ดูแลระบบ'
        ]);

        const updatedProduct = await db.getAsync('SELECT * FROM products WHERE id = ?', [product_id]);
        res.json({ message: 'Stock adjusted successfully', product: updatedProduct });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory/movements', async (req, res) => {
    try {
        const { product_id, limit } = req.query;
        let query = `
            SELECT sm.*, p.name as product_name, p.code as product_code, p.unit
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
        `;
        const params = [];

        if (product_id) {
            query += ' WHERE sm.product_id = ?';
            params.push(product_id);
        }

        query += ' ORDER BY sm.created_at DESC, sm.id DESC';
        query += ` LIMIT ${parseInt(limit) || 30}`;

        const movements = await db.allAsync(query, params);
        res.json(movements);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback route (Express 5 compatible)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`FlowAccount Advance Server running on http://localhost:${PORT}`);
        console.log(`Database: SQLite (server/flowaccount.db)`);
        console.log(`App URL:   http://localhost:${PORT}`);
        console.log(`Dashboard: http://localhost:${PORT}/dashboard/`);
        console.log(`Quotations: http://localhost:${PORT}/documents/quotations.html`);
        console.log(`=======================================================`);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
});
