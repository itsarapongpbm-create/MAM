/**
 * Unified Database Module (PostgreSQL 16 Engine with SQLite Auto-Fallback)
 * ทำงานบน PostgreSQL 16 เป็นหลัก และสลับไป SQLite อัตโนมัติหาก Docker/Postgres ยังไม่พร้อม
 */

require('./env');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const sqlite3 = require('sqlite3').verbose();

const txStorage = new AsyncLocalStorage();
let sqliteTxQueue = Promise.resolve();

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
    types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
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
    let converted = sql.replace(/'(?:''|[^'])*'|(\?)/g, (match, q) => (q ? `$${++i}` : match));
    converted = converted.replace(/\bLIKE\b/gi, 'ILIKE');
    converted = converted.replace(/DATETIME\('now'\)/gi, 'CURRENT_TIMESTAMP');
    converted = converted.replace(
        /CAST\(\s*substr\(([^,]+),\s*([^)]+)\)\s*AS\s+INTEGER\s*\)/gi,
        (_, col, pos) => `CASE WHEN substr(${col}, CAST(${pos} AS INTEGER)) ~ '^[0-9]+$' THEN CAST(substr(${col}, CAST(${pos} AS INTEGER)) AS INTEGER) ELSE 0 END`
    );
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

function rawSqliteRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
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
        const activeTx = txStorage.getStore();
        if (activeTx && /^\s*(BEGIN(\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql)) {
            return { lastID: null, changes: 0 };
        }

        if (usePostgres && pool) {
            const queryTarget = (activeTx && activeTx.client) ? activeTx.client : pool;
            try {
                const isInsert = /^\s*insert\s+(?:or\s+ignore\s+)?into/i.test(sql);
                const hasReturning = /\breturning\s+/i.test(sql);
                const noIdTable = /^\s*insert\s+(?:or\s+ignore\s+)?into\s+"?(document_sequences|email_inbox_cache)"?\b/i.test(sql);
                const finalSql = convertSql(sql, true);
                const cleanSql = finalSql.replace(/;?\s*$/, '');

                if (isInsert && !hasReturning && !noIdTable) {
                    try {
                        const res = await queryTarget.query(`${cleanSql} RETURNING id`, params);
                        return {
                            lastID: res.rows[0] ? res.rows[0].id : null,
                            changes: res.rowCount || 0
                        };
                    } catch (err) {
                        if (err.message && err.message.includes('column "id" does not exist')) {
                            const fallbackRes = await queryTarget.query(cleanSql, params);
                            return { lastID: null, changes: fallbackRes.rowCount || 0 };
                        }
                        throw err;
                    }
                } else {
                    const res = await queryTarget.query(finalSql, params);
                    return {
                        lastID: (res.rows && res.rows[0] && res.rows[0].id) ? res.rows[0].id : null,
                        changes: res.rowCount || 0
                    };
                }
            } catch (err) {
                if (!activeTx && (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout'))) {
                    db.switchToSqlite();
                    return db.runAsync(sql, params);
                }
                throw err;
            }
        }

        // SQLite Execution
        const sqliteSql = convertSql(sql, false);
        return rawSqliteRun(sqliteSql, params);
    },

    allAsync: async function (sql, params = []) {
        const activeTx = txStorage.getStore();
        if (usePostgres && pool) {
            const queryTarget = (activeTx && activeTx.client) ? activeTx.client : pool;
            try {
                const res = await queryTarget.query(convertSql(sql, true), params);
                return res.rows || [];
            } catch (err) {
                if (!activeTx && (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout'))) {
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
        const activeTx = txStorage.getStore();
        if (usePostgres && pool) {
            const queryTarget = (activeTx && activeTx.client) ? activeTx.client : pool;
            try {
                const res = await queryTarget.query(convertSql(sql, true), params);
                return res.rows[0];
            } catch (err) {
                if (!activeTx && (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout'))) {
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
    },

    withTransaction: async function (fn) {
        const existingTx = txStorage.getStore();
        if (existingTx) {
            return fn(db);
        }

        if (usePostgres && pool) {
            let client;
            try {
                client = await pool.connect();
            } catch (err) {
                if (err.code === 'ECONNREFUSED' || err.message.includes('connection timeout')) {
                    db.switchToSqlite();
                    return db.withTransaction(fn);
                }
                throw err;
            }

            try {
                await client.query('BEGIN');
                const result = await txStorage.run({ isPg: true, client }, () => fn(db));
                await client.query('COMMIT');
                return result;
            } catch (err) {
                try { await client.query('ROLLBACK'); } catch (_) {}
                throw err;
            } finally {
                client.release();
            }
        }

        // SQLite serialized transaction
        const runSqliteTx = async () => {
            await rawSqliteRun('BEGIN TRANSACTION');
            try {
                const result = await txStorage.run({ isPg: false }, () => fn(db));
                await rawSqliteRun('COMMIT');
                return result;
            } catch (err) {
                try { await rawSqliteRun('ROLLBACK'); } catch (_) {}
                throw err;
            }
        };

        const txPromise = sqliteTxQueue.then(runSqliteTx, runSqliteTx);
        sqliteTxQueue = txPromise.catch(() => {});
        return txPromise;
    }
};

module.exports = db;
