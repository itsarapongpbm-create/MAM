/**
 * Database Module Facade
 * รวมศูนย์การเชื่อมต่อฐานข้อมูล ตาราง ไมเกรชัน การรันเลขที่เอกสาร และข้อมูลเริ่มต้น
 * (แยกโมดูลย่อยไว้ใน server/config, server/models, server/services เพื่อให้อ่านง่ายและประหยัด Token)
 */

const db = require('./config/db');
const { createTables } = require('./models/schema');
const { migrateDocumentsTable, runColumnMigrations } = require('./models/migrations');
const { syncDocumentSequences, getNextDocNumber, peekNextDocNumber } = require('./models/sequences');
const { recordStatusLog } = require('./services/audit.service');
const { seedInitialData } = require('./models/seed');

// ฟังก์ชันหลักสำหรับเริ่มต้นฐานข้อมูลเมื่อเซิร์ฟเวอร์เปิดทำงาน
async function initDatabase() {
    await db.runAsync('PRAGMA foreign_keys = ON;');

    // 1. สร้างตารางทั้งหมด (ถ้ายังไม่มี)
    await createTables(db);

    // 2. ตรวจสอบและไมเกรชันตาราง documents
    await migrateDocumentsTable(db);

    // 3. ตรวจสอบคอลัมน์ใหม่ (Alter Table)
    await runColumnMigrations(db);

    // 4. ซิงค์เลขที่เอกสารล่าสุด
    await syncDocumentSequences(db);

    // 5. ใส่ข้อมูลตัวอย่างตั้งต้น (ถ้ายังว่างอยู่)
    await seedInitialData(db);
}

module.exports = {
    db,
    initDatabase,
    getNextDocNumber,
    peekNextDocNumber,
    recordStatusLog
};
