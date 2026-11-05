/**
 * Unified Database Module (PostgreSQL 16 Engine with SQLite Auto-Fallback)
 * ทำงานบน PostgreSQL 16 เป็นหลัก และสลับไป SQLite อัตโนมัติหาก Docker/Postgres ยังไม่พร้อม
 */

require('./env');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const defaultDbPath = path.join(__dirname, '..', 'flowaccount.db');
const DB_PATH = process.env.DB_PATH ? path.resolve(__dirname, '../..', process.env.DB_PATH) : defaultDbPath;

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 1. เตรียม SQLite Client เสมอเพื่อเป็น Fallback
const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Failed to init SQLite fallback:', err.message);
});

let usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;

if (usePostgres) {
    const { Pool, types } = require('pg');
    types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000
    });

    pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
}

function convertSql(sql, isPg = usePostgres) {
    if (!isPg) {
        return sql.replace(/\bILIKE\b/gi, 'LIKE');
    }
    let i = 0;
    let converted = sql.replace(/\?/g, () => `$${++i}`);
    converted = converted.replace(/\bLIKE\b/gi, 'ILIKE');
    converted = converted.replace(/DATETIME\('now'\)/gi, 'CURRENT_TIMESTAMP');
    converted = converted.replace(/MAX\(\s*last_no\s*(\+\s*1\s*)?,\s*excluded\.last_no\s*\)/gi, (_, plusOne) =>
        `GREATEST(document_sequences.last_no${plusOne ? ' + 1' : ''}, excluded.last_no)`
    );
    converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    converted = converted.replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
    converted = converted.replace(/strftime\('%Y-%m',\s*([a-zA-Z0-9_]+)\)/gi, 'SUBSTRING($1, 1, 7)');
    converted = converted.replace(/strftime\('%Y',\s*([a-zA-Z0-9_]+)\)/gi, 'SUBSTRING($1, 1, 4)');
    converted = converted.replace(/strftime\('%m',\s*([a-zA-Z0-9_]+)\)/gi, 'SUBSTRING($1, 6, 2)');
    converted = converted.replace(/strftime\('%d',\s*([a-zA-Z0-9_]+)\)/gi, 'SUBSTRING($1, 9, 2)');
    converted = converted.replace(/date\('now'\)/gi, "TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')");
    converted = converted.replace(/date\(([a-zA-Z0-9_.]+)\)/gi, 'SUBSTRING($1, 1, 10)');
    converted = converted.replace(/instr\(/gi, 'STRPOS(');
    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
        converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
        if (!/ON\s+CONFLICT/i.test(converted)) {
            converted = converted.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
        }
    }
    return converted;
}

const db = {
    pool,
    convertSql,
    isPostgres: () => usePostgres,
    switchToSqlite: () => {
        usePostgres = false;
        db.pool = null;
        console.log('[FALLBACK] Switched database engine to SQLite (server/flowaccount.db)');
    },

    runAsync: async function (sql, params = []) {
        if (usePostgres && pool) {
            try {
                const isInsert = /^\s*insert\s+(?:or\s+ignore\s+)?into/i.test(sql);
                const hasReturning = /\breturning\s+/i.test(sql);
                const noIdTable = /^\s*insert\s+(?:or\s+ignore\s+)?into\s+"?(document_sequences|email_inbox_cache)"?\b/i.test(sql);
                const finalSql = convertSql(sql, true);

                if (isInsert && !hasReturning && !noIdTable) {
                    try {
                        const res = await pool.query(`${finalSql} RETURNING id`, params);
                        return {
                            lastID: res.rows[0] ? res.rows[0].id : null,
                            changes: res.rowCount || 0
                        };
                    } catch (err) {
                        if (err.message && err.message.includes('column "id" does not exist')) {
                            const fallbackRes = await pool.query(finalSql, params);
                            return { lastID: null, changes: fallbackRes.rowCount || 0 };
                        }
                        throw err;
                    }
                } else {
                    const res = await pool.query(finalSql, params);
                    return {
                        lastID: (res.rows && res.rows[0] && res.rows[0].id) ? res.rows[0].id : null,
                        changes: res.rowCount || 0
                    };
                }
            } catch (err) {
                if (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout')) {
                    db.switchToSqlite();
                    return db.runAsync(sql, params);
                }
                throw err;
            }
        }

        // SQLite Execution
        const sqliteSql = convertSql(sql, false);
        return new Promise((resolve, reject) => {
            sqliteDb.run(sqliteSql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    },

    allAsync: async function (sql, params = []) {
        if (usePostgres && pool) {
            try {
                const res = await pool.query(convertSql(sql, true), params);
                return res.rows || [];
            } catch (err) {
                if (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout')) {
                    db.switchToSqlite();
                    return db.allAsync(sql, params);
                }
                throw err;
            }
        }

        // SQLite Execution
        const sqliteSql = convertSql(sql, false);
        return new Promise((resolve, reject) => {
            sqliteDb.all(sqliteSql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    getAsync: async function (sql, params = []) {
        if (usePostgres && pool) {
            try {
                const res = await pool.query(convertSql(sql, true), params);
                return res.rows[0];
            } catch (err) {
                if (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout')) {
                    db.switchToSqlite();
                    return db.getAsync(sql, params);
                }
                throw err;
            }
        }

        // SQLite Execution
        const sqliteSql = convertSql(sql, false);
        return new Promise((resolve, reject) => {
            sqliteDb.get(sqliteSql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
};

module.exports = db;
