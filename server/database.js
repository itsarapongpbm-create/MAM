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
