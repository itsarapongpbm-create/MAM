/**
 * Database Module Facade
 * รวมศูนย์การเชื่อมต่อฐานข้อมูล ตาราง ไมเกรชัน การรันเลขที่เอกสาร และข้อมูลเริ่มต้น
 * รองรับทั้ง PostgreSQL (Engine หลัก) และ SQLite (Auto-Fallback)
 */

const db = require('./config/db');
const { createTables } = require('./models/schema');
const { migrateDocumentsTable, runColumnMigrations } = require('./models/migrations');
const { syncDocumentSequences, getNextDocNumber, peekNextDocNumber } = require('./models/sequences');
const { recordStatusLog } = require('./services/audit.service');
const { seedInitialData } = require('./models/seed');

// ฟังก์ชันหลักสำหรับเริ่มต้นฐานข้อมูลเมื่อเซิร์ฟเวอร์เปิดทำงาน
async function initDatabase() {
    if (db.pool) {
        try {
            const testRes = await db.pool.query('SELECT current_database() as db_name, version()');
            console.log(`Connected to PostgreSQL database: [${testRes.rows[0].db_name}]`);

            // Ensure essential tables/columns exist on PostgreSQL even if initialized from an older volume
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS hamper_batch_orders (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
                    order_number VARCHAR(50) UNIQUE NOT NULL,
                    customer_name VARCHAR(255),
                    event_name VARCHAR(255),
                    order_date VARCHAR(20),
                    due_date VARCHAR(20),
                    status VARCHAR(30) DEFAULT 'PENDING',
                    total_hampers INTEGER DEFAULT 0,
                    total_sales NUMERIC(14, 2) DEFAULT 0,
                    total_cost NUMERIC(14, 2) DEFAULT 0,
                    items_json TEXT,
                    sourcing_json TEXT,
                    remarks TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
                    account_code VARCHAR(50) UNIQUE,
                    account_name VARCHAR(255) NOT NULL,
                    bank_code VARCHAR(30) NOT NULL,
                    account_number VARCHAR(50),
                    branch_name VARCHAR(150),
                    account_type VARCHAR(30) DEFAULT 'SAVINGS',
                    opening_balance NUMERIC(14, 2) DEFAULT 0,
                    current_balance NUMERIC(14, 2) DEFAULT 0,
                    promptpay_id VARCHAR(50),
                    is_default SMALLINT DEFAULT 0,
                    color VARCHAR(30),
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS bank_transactions (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
                    account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
                    transaction_date VARCHAR(20) NOT NULL,
                    transaction_time VARCHAR(20),
                    type VARCHAR(30) NOT NULL,
                    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
                    fee NUMERIC(14, 2) DEFAULT 0,
                    balance_after NUMERIC(14, 2) DEFAULT 0,
                    channel VARCHAR(30) DEFAULT 'TRANSFER',
                    ref_doc_type VARCHAR(30),
                    ref_doc_id INTEGER,
                    ref_number VARCHAR(100),
                    payer_payee_name VARCHAR(255),
                    description TEXT,
                    slip_url TEXT,
                    is_reconciled SMALLINT DEFAULT 0,
                    reconciled_at TIMESTAMPTZ,
                    created_by VARCHAR(100) DEFAULT 'Admin',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS internal_transfers (
                    id SERIAL PRIMARY KEY,
                    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE RESTRICT,
                    transfer_number VARCHAR(50) UNIQUE NOT NULL,
                    from_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
                    to_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
                    amount NUMERIC(14, 2) NOT NULL,
                    fee NUMERIC(14, 2) DEFAULT 0,
                    transfer_date VARCHAR(20) NOT NULL,
                    transfer_time VARCHAR(20),
                    slip_url TEXT,
                    note TEXT,
                    created_by VARCHAR(100) DEFAULT 'Admin',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE documents ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
            `);

            await syncDocumentSequences(db);
            return;
        } catch (err) {
            console.warn(`[NOTICE] PostgreSQL on Docker is starting or paused (${err.code || err.message}).`);
            console.log(`[INFO] Auto-switched to SQLite fallback mode so the system stays 100% online.`);
            db.switchToSqlite();
        }
    }

    // ทำงานบน SQLite
    await db.runAsync('PRAGMA foreign_keys = ON;');
    await createTables(db);
    await migrateDocumentsTable(db);
    await runColumnMigrations(db);
    await syncDocumentSequences(db);
    await seedInitialData(db);
}

module.exports = {
    db,
    initDatabase,
    getNextDocNumber,
    peekNextDocNumber,
    recordStatusLog
};
