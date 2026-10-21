/**
 * Database Migrations
 * ตรวจสอบโครงสร้างตารางเดิม และอัปเกรดคอลัมน์ใหม่อัตโนมัติ (ALTER TABLE) เพื่อรองรับเวอร์ชันล่าสุด
 */

const { documentsTableSql } = require('./schema');
const { hashPassword, isPasswordHashed } = require('../utils/password');

async function migrateDocumentsTable(db) {
    const tableInfo = await db.allAsync('PRAGMA table_info(documents)');
    if (!tableInfo || tableInfo.length === 0) {
        await db.runAsync(documentsTableSql('documents'));
        return;
    }
    const cols = tableInfo.map(c => c.name);
    const docNumCol = tableInfo.find(c => c.name === 'doc_number');
    const needsMigration = !cols.includes('is_tax_invoice') || (docNumCol && docNumCol.notnull === 1);

    if (needsMigration) {
        console.log('Migrating documents table to unified trade engine schema...');
        await db.runAsync('PRAGMA foreign_keys = OFF;');
        await db.runAsync(documentsTableSql('documents_new'));

        const creditTermsExpr = cols.includes('credit_terms') ? "COALESCE(credit_terms, 'เครดิต 30 วัน')" : "'เครดิต 30 วัน'";
        const creditDaysExpr = cols.includes('credit_days') ? "COALESCE(credit_days, 30)" : "30";

        await db.runAsync(`
            INSERT INTO documents_new (
                id, company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                status, remarks, terms, is_tax_invoice, credit_days, credit_terms, paid_amount, balance_due, created_at
            )
            SELECT 
                id, company_id, doc_type, doc_number, issue_date, due_date, ref_doc_number,
                customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
                salesperson, subtotal, discount_type, discount_value, discount_amount,
                vat_type, vat_amount, wht_type, wht_rate, wht_amount, grand_total,
                CASE 
                    WHEN status = 'WAITING' AND doc_type = 'QUOTATION' THEN 'WAITING_APPROVAL'
                    WHEN status = 'WAITING' AND doc_type IN ('BILLING_NOTE', 'TAX_INVOICE') THEN 'ISSUED'
                    WHEN status = 'WAITING' AND doc_type = 'RECEIPT' THEN 'PAID'
                    WHEN status IN ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED', 'WAITING_APPROVAL', 'ISSUED', 'PARTIAL_PAID', 'COMPLETED', 'REJECTED') THEN status
                    ELSE 'ISSUED'
                END,
                remarks, terms, 0,
                ${creditDaysExpr},
                ${creditTermsExpr},
                CASE WHEN status = 'PAID' THEN grand_total ELSE 0 END,
                CASE WHEN status = 'PAID' THEN 0 ELSE grand_total END,
                created_at
            FROM documents;
        `);

        await db.runAsync('DROP TABLE documents;');
        await db.runAsync('ALTER TABLE documents_new RENAME TO documents;');
        await db.runAsync('PRAGMA foreign_keys = ON;');
        console.log('Documents table successfully migrated.');
    }

    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_docs_type_status ON documents(doc_type, status);');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_docs_number ON documents(doc_number);');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_docs_date ON documents(issue_date);');
}

async function runColumnMigrations(db) {
    // 1. Auto-migrate products table columns
    const prodCols = await db.allAsync('PRAGMA table_info(products)');
    const colNames = prodCols.map(c => c.name);
    if (!colNames.includes('category')) await db.runAsync("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'ทั่วไป'");
    if (!colNames.includes('cost_price')) await db.runAsync("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0");
    if (!colNames.includes('quantity_on_hand')) await db.runAsync("ALTER TABLE products ADD COLUMN quantity_on_hand REAL DEFAULT 0");
    if (!colNames.includes('stock_quantity')) await db.runAsync("ALTER TABLE products ADD COLUMN stock_quantity REAL DEFAULT 0");
    if (!colNames.includes('min_stock_level')) await db.runAsync("ALTER TABLE products ADD COLUMN min_stock_level REAL DEFAULT 5");
    if (!colNames.includes('min_stock')) await db.runAsync("ALTER TABLE products ADD COLUMN min_stock REAL DEFAULT 5");
    if (!colNames.includes('image_url')) await db.runAsync("ALTER TABLE products ADD COLUMN image_url TEXT");

    // ซิงค์ค่า stock_quantity และ min_stock ให้ตรงกับ quantity_on_hand และ min_stock_level
    await db.runAsync("UPDATE products SET stock_quantity = quantity_on_hand WHERE stock_quantity IS NULL OR stock_quantity != quantity_on_hand");
    await db.runAsync("UPDATE products SET min_stock = min_stock_level WHERE min_stock IS NULL OR min_stock != min_stock_level");

    // 2. Auto-migrate users table columns
    const userCols = await db.allAsync('PRAGMA table_info(users)');
    const uColNames = userCols.map(c => c.name);
    if (!uColNames.includes('username')) {
        await db.runAsync("ALTER TABLE users ADD COLUMN username TEXT");
        await db.runAsync("UPDATE users SET username = substr(email, 1, instr(email, '@') - 1) WHERE username IS NULL");
    }
    if (!uColNames.includes('avatar')) {
        await db.runAsync("ALTER TABLE users ADD COLUMN avatar TEXT");
        await db.runAsync("UPDATE users SET avatar = avatar_url WHERE avatar IS NULL");
    }
    if (!uColNames.includes('avatar_url')) {
        await db.runAsync("ALTER TABLE users ADD COLUMN avatar_url TEXT");
        await db.runAsync("UPDATE users SET avatar_url = avatar WHERE avatar_url IS NULL");
    }
    if (!uColNames.includes('approval_token')) {
        await db.runAsync("ALTER TABLE users ADD COLUMN approval_token TEXT");
    }
    if (!uColNames.includes('requested_role')) {
        await db.runAsync("ALTER TABLE users ADD COLUMN requested_role TEXT");
    }

    // 2.1 เข้ารหัสรหัสผ่านเดิมในตาราง users ที่ยังเป็น Plaintext ให้เป็น Hash อัตโนมัติ
    const allUsers = await db.allAsync("SELECT id, password FROM users");
    for (const u of (allUsers || [])) {
        if (u.password && !isPasswordHashed(u.password)) {
            await db.runAsync("UPDATE users SET password = ? WHERE id = ?", [hashPassword(u.password), u.id]);
        }
    }

    // 3. Auto-migrate document_items columns
    const itemCols = await db.allAsync('PRAGMA table_info(document_items)');
    const itemColNames = itemCols.map(c => c.name);
    if (!itemColNames.includes('product_id')) await db.runAsync('ALTER TABLE document_items ADD COLUMN product_id INTEGER');
    if (!itemColNames.includes('source_item_id')) await db.runAsync('ALTER TABLE document_items ADD COLUMN source_item_id INTEGER');

    // 4. Auto-migrate customers columns
    const custCols = await db.allAsync('PRAGMA table_info(customers)');
    const custColNames = custCols.map(c => c.name);
    if (!custColNames.includes('contact_type')) await db.runAsync("ALTER TABLE customers ADD COLUMN contact_type TEXT DEFAULT 'CUSTOMER'");
    if (!custColNames.includes('entity_type')) await db.runAsync("ALTER TABLE customers ADD COLUMN entity_type TEXT DEFAULT 'JURISTIC'");
    if (!custColNames.includes('credit_days')) await db.runAsync("ALTER TABLE customers ADD COLUMN credit_days INTEGER DEFAULT 30");
    if (!custColNames.includes('business_location')) await db.runAsync("ALTER TABLE customers ADD COLUMN business_location TEXT DEFAULT 'TH'");
    if (!custColNames.includes('postal_code')) await db.runAsync("ALTER TABLE customers ADD COLUMN postal_code TEXT");
    if (!custColNames.includes('shipping_address')) await db.runAsync("ALTER TABLE customers ADD COLUMN shipping_address TEXT");
    if (!custColNames.includes('office_phone')) await db.runAsync("ALTER TABLE customers ADD COLUMN office_phone TEXT");
    if (!custColNames.includes('fax')) await db.runAsync("ALTER TABLE customers ADD COLUMN fax TEXT");
    if (!custColNames.includes('website')) await db.runAsync("ALTER TABLE customers ADD COLUMN website TEXT");
    if (!custColNames.includes('mobile_phone')) await db.runAsync("ALTER TABLE customers ADD COLUMN mobile_phone TEXT");

    // 5. Auto-migrate companies columns
    const compCols = await db.allAsync("PRAGMA table_info(companies)");
    const cColNames = compCols.map(c => c.name);
    if (!cColNames.includes('name_en')) {
        await db.runAsync("ALTER TABLE companies ADD COLUMN name_en TEXT");
    }
    if (!cColNames.includes('logo_url')) {
        await db.runAsync("ALTER TABLE companies ADD COLUMN logo_url TEXT");
    }

    // 6. Auto-migrate withholding_taxes columns (รองรับการแก้ไข / ยกเลิกหนังสือรับรอง 50 ทวิ)
    const whtCols = await db.allAsync("PRAGMA table_info(withholding_taxes)");
    const whtColNames = whtCols.map(c => c.name);
    if (whtCols.length > 0) {
        if (!whtColNames.includes('updated_at')) await db.runAsync("ALTER TABLE withholding_taxes ADD COLUMN updated_at DATETIME");
        if (!whtColNames.includes('cancelled_at')) await db.runAsync("ALTER TABLE withholding_taxes ADD COLUMN cancelled_at DATETIME");
        if (!whtColNames.includes('cancel_reason')) await db.runAsync("ALTER TABLE withholding_taxes ADD COLUMN cancel_reason TEXT");
        if (!whtColNames.includes('items_json')) await db.runAsync("ALTER TABLE withholding_taxes ADD COLUMN items_json TEXT");
    }

    // 7. Auto-migrate documents columns (รองรับ credit_terms, customer_phone, customer_contact)
    const docCols = await db.allAsync("PRAGMA table_info(documents)");
    const docColNames = docCols.map(c => c.name);
    if (!docColNames.includes('credit_terms')) {
        await db.runAsync("ALTER TABLE documents ADD COLUMN credit_terms TEXT DEFAULT 'เครดิต 30 วัน'");
    }
    if (!docColNames.includes('customer_phone')) {
        await db.runAsync("ALTER TABLE documents ADD COLUMN customer_phone TEXT");
    }
    if (!docColNames.includes('customer_contact')) {
        await db.runAsync("ALTER TABLE documents ADD COLUMN customer_contact TEXT");
    }
}

module.exports = {
    migrateDocumentsTable,
    runColumnMigrations
};
