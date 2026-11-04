-- ==============================================================================
-- Giftory PostgreSQL Schema (Modern Relational Architecture)
-- Target: PostgreSQL 16+ on Docker (giftory_db)
-- ==============================================================================

-- Drop existing tables in reverse dependency order if recreating
DROP TABLE IF EXISTS email_campaign_logs CASCADE;
DROP TABLE IF EXISTS email_inbox_cache CASCADE;
DROP TABLE IF EXISTS gift_set_items CASCADE;
DROP TABLE IF EXISTS gift_sets CASCADE;
DROP TABLE IF EXISTS document_status_logs CASCADE;
DROP TABLE IF EXISTS document_payments CASCADE;
DROP TABLE IF EXISTS document_links CASCADE;
DROP TABLE IF EXISTS document_sequences CASCADE;
DROP TABLE IF EXISTS document_items CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS withholding_taxes CASCADE;
DROP TABLE IF EXISTS expense_items CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- 1. ตารางบริษัท/กิจการ (Companies)
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    logo_url TEXT,
    tax_id VARCHAR(20) NOT NULL,
    branch VARCHAR(100) DEFAULT 'สำนักงานใหญ่',
    address TEXT NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตารางผู้ใช้งานระบบ (Users)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'SALES' CHECK(role IN ('ADMIN', 'ACCOUNTANT', 'SALES', 'CUSTOMER')),
    requested_role VARCHAR(20),
    phone VARCHAR(50),
    avatar TEXT,
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'REJECTED')),
    approval_token TEXT,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. ตารางลูกค้าและคู่ค้า (Customers & Vendors)
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    contact_type VARCHAR(20) DEFAULT 'CUSTOMER',
    entity_type VARCHAR(20) DEFAULT 'JURISTIC',
    credit_days INTEGER DEFAULT 30,
    credit_terms VARCHAR(100) DEFAULT 'เครดิต 30 วัน',
    business_location VARCHAR(10) DEFAULT 'TH',
    tax_id VARCHAR(20),
    branch VARCHAR(100) DEFAULT 'สำนักงานใหญ่',
    address TEXT,
    postal_code VARCHAR(20),
    shipping_address TEXT,
    office_phone VARCHAR(50),
    phone VARCHAR(50),
    mobile_phone VARCHAR(50),
    fax VARCHAR(50),
    website VARCHAR(255),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. ตารางสินค้าและบริการ (Products & Services)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    code VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) DEFAULT 'SERVICE' CHECK(type IN ('PRODUCT', 'SERVICE')),
    category VARCHAR(100) DEFAULT 'ทั่วไป',
    description TEXT,
    unit VARCHAR(50) DEFAULT 'ชิ้น',
    unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(14, 2) DEFAULT 0,
    quantity_on_hand NUMERIC(14, 2) DEFAULT 0,
    stock_quantity NUMERIC(14, 2) DEFAULT 0,
    min_stock_level NUMERIC(14, 2) DEFAULT 5,
    min_stock NUMERIC(14, 2) DEFAULT 5,
    image_url TEXT,
    vat_rate NUMERIC(5, 2) DEFAULT 7,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. ตารางชุดกระเช้าของขวัญ (Gift Sets & Hampers)
CREATE TABLE gift_sets (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    theme VARCHAR(100),
    selling_price NUMERIC(14, 2) DEFAULT 0,
    cost_price NUMERIC(14, 2) DEFAULT 0,
    packaging_desc TEXT,
    ribbon_desc TEXT,
    image_url TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. ตารางสูตรส่วนประกอบในชุดกระเช้า (Gift Set Items / Recipe / BOM)
CREATE TABLE gift_set_items (
    id SERIAL PRIMARY KEY,
    gift_set_id INTEGER NOT NULL REFERENCES gift_sets(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(14, 2) DEFAULT 1,
    unit_cost NUMERIC(14, 2) DEFAULT 0,
    unit_price NUMERIC(14, 2) DEFAULT 0,
    notes TEXT
);

-- 7. ตารางเอกสารบัญชี (Documents - QT, INV, RE, BL, PO, etc.)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    doc_type VARCHAR(30) NOT NULL,
    doc_number VARCHAR(50) UNIQUE,
    issue_date VARCHAR(20) NOT NULL,
    due_date VARCHAR(20),
    ref_doc_number VARCHAR(50),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_tax_id VARCHAR(20),
    customer_branch VARCHAR(100),
    customer_address TEXT,
    customer_phone VARCHAR(50),
    customer_contact VARCHAR(255),
    salesperson VARCHAR(100),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount_type VARCHAR(20) DEFAULT 'fixed',
    discount_value NUMERIC(14, 2) DEFAULT 0,
    discount_amount NUMERIC(14, 2) DEFAULT 0,
    vat_type VARCHAR(20) DEFAULT 'exclude',
    vat_amount NUMERIC(14, 2) DEFAULT 0,
    wht_type VARCHAR(20) DEFAULT '0',
    wht_rate NUMERIC(5, 2) DEFAULT 0,
    wht_amount NUMERIC(14, 2) DEFAULT 0,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(30) DEFAULT 'DRAFT',
    remarks TEXT,
    terms TEXT,
    is_tax_invoice SMALLINT DEFAULT 0,
    valid_until VARCHAR(20),
    credit_days INTEGER DEFAULT 30,
    credit_terms VARCHAR(100) DEFAULT 'เครดิต 30 วัน',
    project_name VARCHAR(255),
    paid_amount NUMERIC(14, 2) DEFAULT 0,
    balance_due NUMERIC(14, 2) DEFAULT 0,
    seller_snapshot TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issued_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. ตารางรายการสินค้าในเอกสาร (Document Items)
CREATE TABLE document_items (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    row_order INTEGER DEFAULT 1,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    source_item_id INTEGER,
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity NUMERIC(14, 2) NOT NULL DEFAULT 1,
    unit VARCHAR(50) DEFAULT 'ชิ้น',
    unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(14, 2) DEFAULT 0,
    vat_rate NUMERIC(5, 2) DEFAULT 7,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
);

-- 9. ตารางตัวนับรันเลขที่เอกสาร (Document Sequences)
CREATE TABLE document_sequences (
    company_id INTEGER NOT NULL,
    doc_type VARCHAR(30) NOT NULL,
    period VARCHAR(20) NOT NULL,
    last_no INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, doc_type, period)
);

-- 10. ตารางความเชื่อมโยงระหว่างเอกสาร (Document Links เช่น QT -> INV -> RE)
CREATE TABLE document_links (
    id SERIAL PRIMARY KEY,
    source_doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    link_type VARCHAR(30) NOT NULL,
    amount NUMERIC(14, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_doc_id, target_doc_id)
);

-- 11. ตารางประวัติการรับชำระเงิน (Document Payments)
CREATE TABLE document_payments (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    paid_date VARCHAR(20) NOT NULL,
    method VARCHAR(30) NOT NULL DEFAULT 'TRANSFER',
    bank_name VARCHAR(100),
    ref_no VARCHAR(100),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    wht_amount NUMERIC(14, 2) DEFAULT 0,
    slip_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. ตารางประวัติการเปลี่ยนสถานะเอกสาร Audit Log (Document Status Logs)
CREATE TABLE document_status_logs (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. ตารางค่าใช้จ่าย (Expenses)
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    doc_number VARCHAR(50) UNIQUE NOT NULL,
    transaction_date VARCHAR(20) NOT NULL,
    due_date VARCHAR(20),
    ref_doc_number VARCHAR(50),
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tax_id VARCHAR(20),
    vendor_branch VARCHAR(100) DEFAULT 'สำนักงานใหญ่',
    vendor_address TEXT,
    category VARCHAR(100) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'PAID',
    payment_method VARCHAR(50),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    vat_type VARCHAR(20) DEFAULT 'exclude',
    vat_rate NUMERIC(5, 2) DEFAULT 7,
    vat_amount NUMERIC(14, 2) DEFAULT 0,
    wht_type VARCHAR(20) DEFAULT '0',
    wht_rate NUMERIC(5, 2) DEFAULT 0,
    wht_amount NUMERIC(14, 2) DEFAULT 0,
    net_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    slip_url TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. ตารางรายการย่อยในค่าใช้จ่าย (Expense Items)
CREATE TABLE expense_items (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    row_order INTEGER DEFAULT 1,
    description TEXT NOT NULL,
    category VARCHAR(100),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    vat_rate NUMERIC(5, 2) DEFAULT 7,
    wht_rate NUMERIC(5, 2) DEFAULT 0,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
);

-- 15. ตารางภาษีหัก ณ ที่จ่าย 50 ทวิ (Withholding Taxes)
CREATE TABLE withholding_taxes (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    doc_number VARCHAR(50) UNIQUE NOT NULL,
    book_number VARCHAR(50) DEFAULT '01',
    doc_date VARCHAR(20) NOT NULL,
    form_type VARCHAR(20) DEFAULT 'ภ.ง.ด.53',
    sequence_no VARCHAR(20) DEFAULT '1',
    payer_tax_id VARCHAR(20) NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    payer_address TEXT NOT NULL,
    payee_type VARCHAR(20) DEFAULT 'juristic',
    payee_tax_id VARCHAR(20) NOT NULL,
    payee_name VARCHAR(255) NOT NULL,
    payee_address TEXT NOT NULL,
    income_type VARCHAR(255) NOT NULL,
    payment_date VARCHAR(20) NOT NULL,
    income_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 3,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tax_condition VARCHAR(50) DEFAULT 'withheld',
    ref_expense_number VARCHAR(50),
    status VARCHAR(20) DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. ตารางบัตรคุมสต็อกสินค้า (Stock Movements / Stock Card)
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL,
    change_qty NUMERIC(14, 2) NOT NULL,
    balance_after NUMERIC(14, 2) NOT NULL,
    unit_cost NUMERIC(14, 2) DEFAULT 0,
    ref_doc_type VARCHAR(30),
    ref_doc_number VARCHAR(50),
    remarks TEXT,
    created_by VARCHAR(100) DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 17. ตารางประวัติอีเมล (Email Logs)
CREATE TABLE email_inbox_cache (
    uid BIGINT PRIMARY KEY,
    seq INTEGER,
    subject TEXT,
    from_address VARCHAR(255),
    from_name VARCHAR(255),
    to_address VARCHAR(255),
    date VARCHAR(100),
    unread SMALLINT DEFAULT 0,
    snippet TEXT,
    html_body TEXT,
    text_body TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_campaign_logs (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_company VARCHAR(255),
    recipient_contact VARCHAR(255),
    subject TEXT,
    status VARCHAR(50) DEFAULT 'SENT',
    error_message TEXT,
    file_name VARCHAR(255),
    sent_by VARCHAR(100),
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for optimal performance
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_gift_sets_code ON gift_sets(code);
CREATE INDEX idx_gift_set_items_set_id ON gift_set_items(gift_set_id);
CREATE INDEX idx_documents_doc_number ON documents(doc_number);
CREATE INDEX idx_documents_type_status ON documents(doc_type, status);
CREATE INDEX idx_document_items_doc_id ON document_items(document_id);
CREATE INDEX idx_stock_movements_prod_id ON stock_movements(product_id);
