/**
 * Database Schema Definitions (DDL)
 * กำหนดโครงสร้างตารางทั้งหมด 13 ตารางในระบบ
 */

function documentsTableSql(tableName = 'documents') {
    return `
        CREATE TABLE IF NOT EXISTS ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            doc_type TEXT CHECK(doc_type IN ('QUOTATION', 'BILLING_NOTE', 'TAX_INVOICE', 'RECEIPT', 'CASH_SALE', 'PURCHASE_ORDER')) NOT NULL,
            doc_number TEXT UNIQUE,
            issue_date TEXT NOT NULL,
            due_date TEXT,
            ref_doc_number TEXT,
            customer_id INTEGER,
            customer_name TEXT NOT NULL,
            customer_tax_id TEXT,
            customer_branch TEXT,
            customer_address TEXT,
            customer_phone TEXT,
            customer_contact TEXT,
            salesperson TEXT,
            subtotal REAL NOT NULL DEFAULT 0,
            discount_type TEXT DEFAULT 'fixed',
            discount_value REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            vat_type TEXT DEFAULT 'exclude',
            vat_amount REAL DEFAULT 0,
            wht_type TEXT DEFAULT '0',
            wht_rate REAL DEFAULT 0,
            wht_amount REAL DEFAULT 0,
            grand_total REAL NOT NULL DEFAULT 0,
            status TEXT CHECK(status IN ('DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIAL_PAID', 'PAID', 'COMPLETED', 'REJECTED', 'CANCELLED')) DEFAULT 'DRAFT',
            remarks TEXT,
            terms TEXT,
            is_tax_invoice INTEGER DEFAULT 0,
            valid_until TEXT,
            credit_days INTEGER DEFAULT 30,
            credit_terms TEXT DEFAULT 'เครดิต 30 วัน',
            project_name TEXT,
            paid_amount REAL DEFAULT 0,
            balance_due REAL DEFAULT 0,
            seller_snapshot TEXT,
            created_by INTEGER,
            approved_by INTEGER,
            issued_at DATETIME,
            approved_at DATETIME,
            cancelled_at DATETIME,
            cancel_reason TEXT,
            updated_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id),
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        );
    `;
}

async function createTables(db) {
    // 1. ตารางข้อมูลบริษัท (Companies)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            name_en TEXT,
            logo_url TEXT,
            tax_id TEXT NOT NULL,
            branch TEXT DEFAULT 'สำนักงานใหญ่',
            address TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. ตารางลูกค้าและคู่ค้า (Customers & Vendors)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            contact_type TEXT DEFAULT 'CUSTOMER',
            entity_type TEXT DEFAULT 'JURISTIC',
            credit_days INTEGER DEFAULT 30,
            credit_terms TEXT DEFAULT 'เครดิต 30 วัน',
            business_location TEXT DEFAULT 'TH',
            tax_id TEXT,
            branch TEXT DEFAULT 'สำนักงานใหญ่',
            address TEXT,
            postal_code TEXT,
            shipping_address TEXT,
            office_phone TEXT,
            fax TEXT,
            website TEXT,
            contact_person TEXT,
            email TEXT,
            phone TEXT,
            mobile_phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 3. ตารางสินค้าและบริการ (Products & Services)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('PRODUCT', 'SERVICE')) DEFAULT 'SERVICE',
            category TEXT DEFAULT 'ทั่วไป',
            description TEXT,
            unit TEXT DEFAULT 'ชิ้น',
            unit_price REAL NOT NULL DEFAULT 0,
            cost_price REAL DEFAULT 0,
            quantity_on_hand REAL DEFAULT 0,
            stock_quantity REAL DEFAULT 0,
            min_stock_level REAL DEFAULT 5,
            min_stock REAL DEFAULT 5,
            image_url TEXT,
            vat_rate REAL DEFAULT 7,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 4. ตารางรายการสินค้าในเอกสาร (Document Items)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS document_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            row_order INTEGER DEFAULT 1,
            product_id INTEGER,
            source_item_id INTEGER,
            item_name TEXT NOT NULL,
            description TEXT,
            quantity REAL NOT NULL DEFAULT 1,
            unit TEXT DEFAULT 'ชิ้น',
            unit_price REAL NOT NULL DEFAULT 0,
            discount REAL DEFAULT 0,
            vat_rate REAL DEFAULT 7,
            total_amount REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(id)
        );
    `);

    // 5. ตารางตัวนับรันเลขที่เอกสาร (Document Sequences)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS document_sequences (
            company_id INTEGER NOT NULL,
            doc_type TEXT NOT NULL,
            period TEXT NOT NULL,
            last_no INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (company_id, doc_type, period)
        );
    `);

    // 6. ตารางความเชื่อมโยงระหว่างเอกสาร (Document Links เช่น QT -> INV -> RE)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS document_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_doc_id INTEGER NOT NULL,
            target_doc_id INTEGER NOT NULL,
            link_type TEXT CHECK(link_type IN ('CONVERT', 'GROUP', 'PAYMENT')) NOT NULL,
            amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(source_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY(target_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
            UNIQUE(source_doc_id, target_doc_id)
        );
    `);

    // 7. ตารางประวัติการรับชำระเงิน (Document Payments)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS document_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            paid_date TEXT NOT NULL,
            method TEXT CHECK(method IN ('CASH', 'TRANSFER', 'CHEQUE', 'CREDIT_CARD')) NOT NULL DEFAULT 'TRANSFER',
            bank_name TEXT,
            ref_no TEXT,
            amount REAL NOT NULL DEFAULT 0,
            wht_amount REAL DEFAULT 0,
            slip_url TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
    `);

    // 8. ตารางประวัติการเปลี่ยนสถานะเอกสาร Audit Log (Document Status Logs)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS document_status_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT,
            user_id INTEGER,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
    `);

    // 9. ตารางบันทึกค่าใช้จ่าย (Expenses)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            doc_number TEXT UNIQUE NOT NULL,
            transaction_date TEXT NOT NULL,
            due_date TEXT,
            ref_doc_number TEXT,
            vendor_name TEXT NOT NULL,
            vendor_tax_id TEXT,
            vendor_branch TEXT DEFAULT 'สำนักงานใหญ่',
            vendor_address TEXT,
            category TEXT NOT NULL,
            payment_status TEXT CHECK(payment_status IN ('PAID', 'UNPAID', 'DRAFT')) DEFAULT 'PAID',
            payment_method TEXT,
            subtotal REAL NOT NULL DEFAULT 0,
            vat_type TEXT DEFAULT 'exclude',
            vat_rate REAL DEFAULT 7,
            vat_amount REAL DEFAULT 0,
            wht_type TEXT DEFAULT '0',
            wht_rate REAL DEFAULT 0,
            wht_amount REAL DEFAULT 0,
            net_total REAL NOT NULL DEFAULT 0,
            slip_url TEXT,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 10. ตารางรายการย่อยในค่าใช้จ่าย (Expense Items)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS expense_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_id INTEGER NOT NULL,
            row_order INTEGER DEFAULT 1,
            description TEXT NOT NULL,
            category TEXT,
            amount REAL NOT NULL DEFAULT 0,
            vat_rate REAL DEFAULT 7,
            wht_rate REAL DEFAULT 0,
            total_amount REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE
        );
    `);

    // 11. ตารางภาษีหัก ณ ที่จ่าย 50 ทวิ (Withholding Taxes)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS withholding_taxes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            doc_number TEXT UNIQUE NOT NULL,
            book_number TEXT DEFAULT '01',
            doc_date TEXT NOT NULL,
            form_type TEXT CHECK(form_type IN ('ภ.ง.ด.1', 'ภ.ง.ด.2', 'ภ.ง.ด.3', 'ภ.ง.ด.53')) DEFAULT 'ภ.ง.ด.53',
            sequence_no TEXT DEFAULT '1',
            payer_tax_id TEXT NOT NULL DEFAULT '0105562089456',
            payer_name TEXT NOT NULL DEFAULT 'บริษัท เอ็มเอเอ็ม ดีไซน์แอนด์เซอร์วิส จำกัด',
            payer_address TEXT NOT NULL,
            payee_type TEXT DEFAULT 'juristic',
            payee_tax_id TEXT NOT NULL,
            payee_name TEXT NOT NULL,
            payee_address TEXT NOT NULL,
            income_type TEXT NOT NULL,
            payment_date TEXT NOT NULL,
            income_amount REAL NOT NULL DEFAULT 0,
            tax_rate REAL NOT NULL DEFAULT 3,
            tax_amount REAL NOT NULL DEFAULT 0,
            tax_condition TEXT DEFAULT 'withheld',
            ref_expense_number TEXT,
            status TEXT DEFAULT 'COMPLETED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 12. ตารางบัตรคุมสต็อกสินค้า (Stock Movements / Stock Card)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            product_id INTEGER NOT NULL,
            movement_type TEXT CHECK(movement_type IN ('IN_PURCHASE', 'OUT_SALE', 'ADJUST_COUNT', 'RETURN', 'DAMAGE')) NOT NULL,
            change_qty REAL NOT NULL,
            balance_after REAL NOT NULL,
            unit_cost REAL DEFAULT 0,
            ref_doc_type TEXT,
            ref_doc_number TEXT,
            remarks TEXT,
            created_by TEXT DEFAULT 'Admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 13. ตารางผู้ใช้งานระบบ (Users)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            username TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT CHECK(role IN ('ADMIN', 'ACCOUNTANT', 'SALES')) NOT NULL DEFAULT 'SALES',
            requested_role TEXT,
            phone TEXT,
            avatar TEXT,
            avatar_url TEXT,
            status TEXT CHECK(status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'REJECTED')) DEFAULT 'ACTIVE',
            approval_token TEXT,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 14. ตารางชุดกระเช้าของขวัญสำเร็จรูป (Gift Sets & Hampers)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS gift_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL DEFAULT 1,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            theme TEXT,
            selling_price REAL DEFAULT 0,
            cost_price REAL DEFAULT 0,
            packaging_desc TEXT,
            ribbon_desc TEXT,
            image_url TEXT,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
    `);

    // 15. ตารางรายการสินค้าในชุดกระเช้า (Gift Set Items / Recipe / BOM)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS gift_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gift_set_id INTEGER NOT NULL,
            product_id INTEGER,
            item_name TEXT NOT NULL,
            quantity REAL DEFAULT 1,
            unit_cost REAL DEFAULT 0,
            unit_price REAL DEFAULT 0,
            notes TEXT,
            FOREIGN KEY(gift_set_id) REFERENCES gift_sets(id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
        );
    `);

    // 16. ตารางแคชกล่องจดหมายขาเข้า (Email Inbox Fast Cache)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS email_inbox_cache (
            uid INTEGER PRIMARY KEY,
            seq INTEGER,
            subject TEXT,
            from_address TEXT,
            from_name TEXT,
            to_address TEXT,
            date TEXT,
            unread INTEGER DEFAULT 0,
            snippet TEXT,
            html_body TEXT,
            text_body TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 17. ตารางประวัติการส่งอีเมลแคมเปญและตอบกลับ (Email Campaign Logs)
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS email_campaign_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_name TEXT,
            recipient_email TEXT NOT NULL,
            recipient_company TEXT,
            recipient_contact TEXT,
            subject TEXT,
            status TEXT DEFAULT 'SENT',
            error_message TEXT,
            file_name TEXT,
            sent_by TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

module.exports = {
    documentsTableSql,
    createTables
};
