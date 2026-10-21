const { initDatabase, db } = require('./database');
const http = require('http');

async function testBackend() {
    console.log('--- 1. Testing Database Queries ---');
    await initDatabase();

    const company = await db.getAsync('SELECT * FROM companies WHERE code = ?', ['MAM']);
    console.log('Company:', company.name, '(' + company.code + ')');

    const customers = await db.allAsync('SELECT * FROM customers');
    console.log(`Customers count: ${customers.length}`);

    const products = await db.allAsync('SELECT * FROM products');
    console.log(`Products count: ${products.length}`);

    const docs = await db.allAsync('SELECT * FROM documents');
    console.log(`Documents count: ${docs.length}`);

    console.log('--- 2. Testing Insert New Document ---');
    const newDoc = await db.runAsync(`
        INSERT INTO documents (
            company_id, doc_type, doc_number, issue_date, customer_name, subtotal, grand_total, status
        ) VALUES (
            1, 'QUOTATION', 'QT-TEST-999', '2026-10-02', 'บริษัท ทดสอบ จำกัด', 50000, 53500, 'WAITING_APPROVAL'
        );
    `);
    console.log('Inserted Document ID:', newDoc.lastID);

    const docItems = await db.runAsync(`
        INSERT INTO document_items (document_id, row_order, item_name, quantity, unit_price, total_amount)
        VALUES (?, 1, 'ทดสอบสินค้า 1', 1, 50000, 50000)
    `, [newDoc.lastID]);
    console.log('Inserted Document Item ID:', docItems.lastID);

    // Verify Read
    const verifyDoc = await db.getAsync('SELECT * FROM documents WHERE id = ?', [newDoc.lastID]);
    console.log('Verified Document:', verifyDoc.doc_number, 'Total:', verifyDoc.grand_total);

    // Clean up test document
    await db.runAsync('DELETE FROM document_items WHERE document_id = ?', [newDoc.lastID]);
    await db.runAsync('DELETE FROM documents WHERE id = ?', [newDoc.lastID]);
    console.log('Cleaned up test document.');

    console.log('--- All Backend Tests Passed Successfully! ---');
}

testBackend().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
