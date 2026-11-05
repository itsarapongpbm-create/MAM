/**
 * Data Migration Pipeline: SQLite -> PostgreSQL 16
 * Reads from ./server/flowaccount.db and inserts cleanly into PostgreSQL (giftory_db)
 */

const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');
require('../server/config/env');

const sqlitePath = path.resolve(__dirname, '../server/flowaccount.db');
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://giftory_user:giftory_secret123@localhost:5432/giftory_db';

const tablesToMigrate = [
    { name: 'companies', hasId: true },
    { name: 'users', hasId: true },
    { name: 'customers', hasId: true },
    { name: 'products', hasId: true },
    { name: 'gift_sets', hasId: true },
    { name: 'gift_set_items', hasId: true },
    { name: 'documents', hasId: true },
    { name: 'document_items', hasId: true },
    { name: 'document_sequences', hasId: false },
    { name: 'document_links', hasId: true },
    { name: 'document_payments', hasId: true },
    { name: 'document_status_logs', hasId: true },
    { name: 'expenses', hasId: true },
    { name: 'expense_items', hasId: true },
    { name: 'withholding_taxes', hasId: true },
    { name: 'stock_movements', hasId: true },
    { name: 'email_inbox_cache', hasId: false },
    { name: 'email_campaign_logs', hasId: true },
    { name: 'bank_accounts', hasId: true },
    { name: 'bank_transactions', hasId: true },
    { name: 'internal_transfers', hasId: true }
];

function querySqlite(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function runMigration() {
    console.log('===============================================================');
    console.log('   Starting Data Migration: SQLite -> PostgreSQL 16');
    console.log(`   Source: ${sqlitePath}`);
    console.log(`   Target: ${pgConnectionString}`);
    console.log('===============================================================\n');

    const sqliteDb = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('Failed to open SQLite database:', err.message);
            process.exit(1);
        }
    });

    const pgClient = new Client({ connectionString: pgConnectionString });
    await pgClient.connect();
    console.log('Connected to PostgreSQL successfully.\n');

    let totalMigrated = 0;

    for (const table of tablesToMigrate) {
        const tableName = table.name;
        try {
            // Check if table exists in SQLite
            const tableExists = await querySqlite(
                sqliteDb,
                "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
                [tableName]
            );

            if (tableExists.length === 0) {
                console.log(`- [SKIP] ${tableName}: does not exist in SQLite.`);
                continue;
            }

            const rows = await querySqlite(sqliteDb, `SELECT * FROM "${tableName}"`);
            if (rows.length === 0) {
                console.log(`- [EMPTY] ${tableName}: 0 rows.`);
                continue;
            }

            // Get column names from the target PostgreSQL table
            const pgColsRes = await pgClient.query(
                `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
                [tableName]
            );
            const validPgCols = new Set(pgColsRes.rows.map(r => r.column_name));

            // Filter columns present in both SQLite rows and PostgreSQL table
            const sqliteCols = Object.keys(rows[0]);
            const matchedCols = sqliteCols.filter(col => validPgCols.has(col));

            if (matchedCols.length === 0) {
                console.log(`- [WARN] ${tableName}: no matching columns found.`);
                continue;
            }

            await pgClient.query('BEGIN');

            const colNames = matchedCols.map(c => `"${c}"`).join(', ');

            for (const row of rows) {
                const values = matchedCols.map(col => {
                    let val = row[col];
                    // Clean up nulls / booleans / strings
                    if (val === undefined) return null;
                    return val;
                });
                const placeholders = matchedCols.map((_, i) => `$${i + 1}`).join(', ');

                const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                await pgClient.query(insertSql, values);
            }

            // Reset sequence for SERIAL PK if table has an 'id' column
            if (table.hasId) {
                await pgClient.query(`
                    SELECT setval(
                        pg_get_serial_sequence('"${tableName}"', 'id'),
                        COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
                        (SELECT MAX(id) FROM "${tableName}") IS NOT NULL
                    )
                `);
            }

            await pgClient.query('COMMIT');
            console.log(`✓ [MIGRATED] ${tableName}: ${rows.length} rows transferred successfully.`);
            totalMigrated += rows.length;

        } catch (err) {
            await pgClient.query('ROLLBACK');
            console.error(`✗ [ERROR] Migrating table ${tableName}:`, err.message);
        }
    }

    console.log('\n===============================================================');
    console.log(`Migration Complete! Total rows transferred: ${totalMigrated}`);
    console.log('===============================================================');

    await pgClient.end();
    sqliteDb.close();
}

runMigration().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
});
