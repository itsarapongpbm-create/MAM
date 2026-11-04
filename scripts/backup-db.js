/**
 * Automated Database Backup System (PostgreSQL 16 & SQLite)
 * สำรองข้อมูลฐานข้อมูลทั้งหมดลงโฟลเดอร์ backups/ พร้อมระบบหมุนเวียนลบไฟล์เก่าอัตโนมัติ (30 วัน)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backupDir = path.resolve(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

function getTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
}

async function runBackup() {
    const timestamp = getTimestamp();
    console.log('===============================================================');
    console.log(`   Starting Database Backup [${new Date().toLocaleString('th-TH')}]`);
    console.log(`   Target Directory: ${backupDir}`);
    console.log('===============================================================\n');

    let pgSuccess = false;

    // 1. สำรองข้อมูล PostgreSQL จาก Docker Container
    try {
        console.log('1. Exporting PostgreSQL database (giftory_db)...');
        const pgBackupFile = path.join(backupDir, `giftory_postgres_${timestamp}.sql`);
        
        // รันคำสั่ง pg_dump ผ่าน docker exec
        const dumpCommand = `docker exec giftory-postgres pg_dump -U giftory_user giftory_db`;
        const dumpOutput = execSync(dumpCommand, { maxBuffer: 100 * 1024 * 1024 });
        
        fs.writeFileSync(pgBackupFile, dumpOutput);
        const stats = fs.statSync(pgBackupFile);
        console.log(`   ✓ PostgreSQL backup saved: ${path.basename(pgBackupFile)} (${(stats.size / 1024).toFixed(1)} KB)`);
        pgSuccess = true;
    } catch (err) {
        console.warn(`   ✗ PostgreSQL backup failed (Docker may be offline): ${err.message}`);
    }

    // 2. สำรองข้อมูลไฟล์ SQLite (flowaccount.db)
    try {
        console.log('\n2. Exporting SQLite database (flowaccount.db)...');
        const sqliteSource = path.resolve(__dirname, '../server/flowaccount.db');
        if (fs.existsSync(sqliteSource)) {
            const sqliteBackupFile = path.join(backupDir, `flowaccount_sqlite_${timestamp}.db`);
            fs.copyFileSync(sqliteSource, sqliteBackupFile);
            const stats = fs.statSync(sqliteBackupFile);
            console.log(`   ✓ SQLite backup saved: ${path.basename(sqliteBackupFile)} (${(stats.size / 1024).toFixed(1)} KB)`);
        }
    } catch (err) {
        console.warn(`   ✗ SQLite backup error: ${err.message}`);
    }

    // 3. หมุนเวียนลบไฟล์สำรองที่มีอายุเกิน 30 วัน เพื่อไม่ให้เปลืองพื้นที่
    console.log('\n3. Cleaning up backups older than 30 days...');
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const nowTime = Date.now();
    const files = fs.readdirSync(backupDir);

    let deletedCount = 0;
    for (const file of files) {
        const filePath = path.join(backupDir, file);
        const stat = fs.statSync(filePath);
        if (nowTime - stat.mtimeMs > retentionMs) {
            fs.unlinkSync(filePath);
            deletedCount++;
        }
    }
    console.log(`   Removed ${deletedCount} expired backup files.`);

    console.log('\n===============================================================');
    console.log('   Backup Complete Successfully!');
    console.log('===============================================================');
}

runBackup().catch(console.error);
