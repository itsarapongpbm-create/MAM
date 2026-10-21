/**
 * Database Connection & Query Helpers (SQLite)
 * จัดการการเชื่อมต่อฐานข้อมูล SQLite และ Promise wrapper เพื่อให้ใช้งานแบบ async/await ได้ง่าย
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
require('./env');

const defaultDbPath = path.join(__dirname, '..', 'flowaccount.db');
const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : defaultDbPath;

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', DB_PATH);
    }
});

// Helper สำหรับคำสั่ง INSERT, UPDATE, DELETE (คืนค่า { lastID, changes })
db.runAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// Helper สำหรับคำสั่ง SELECT หลายแถว (คืนค่า Array)
db.allAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Helper สำหรับคำสั่ง SELECT แถวเดียว (คืนค่า Object แถวแรก หรือ undefined)
db.getAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

module.exports = db;
