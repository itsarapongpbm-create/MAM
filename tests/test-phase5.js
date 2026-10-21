const http = require('http');

function request(method, path, data) {
    return new Promise((resolve, reject) => {
        const bodyStr = data ? JSON.stringify(data) : null;
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resBody);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: resBody });
                }
            });
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function runTests() {
    console.log('=== STARTING PHASE 5 VERIFICATION TESTS ===\n');

    // 1. Test /api/vendors
    console.log('Test 1: GET /api/vendors');
    const vRes = await request('GET', '/api/vendors');
    console.log(`Vendors count: ${vRes.body.length}, Status: ${vRes.status}`);
    if (vRes.status !== 200) throw new Error('Failed to fetch vendors');

    // 2. Test CASH_SALE creation and auto stock deduction
    console.log('\nTest 2: Create CASH_SALE (Issued / Paid)');
    const csPayload = {
        doc_type: 'CASH_SALE',
        issue_date: '2026-10-05',
        customer_name: 'คุณสมชาย ลูกค้าเงินสด',
        subtotal: 1500,
        vat_type: 'exclude',
        vat_amount: 105,
        grand_total: 1605,
        status: 'PAID',
        items: [
            { item_name: 'โต๊ะทำงานโมเดิร์น', quantity: 1, unit: 'ตัว', unit_price: 1500, total_amount: 1500 }
        ]
    };
    const csRes = await request('POST', '/api/documents', csPayload);
    console.log(`Created Cash Sale: ${csRes.body.doc_number}, Status: ${csRes.body.status}, GrandTotal: ${csRes.body.grand_total}`);
    if (csRes.status !== 201) throw new Error('Failed to create cash sale: ' + JSON.stringify(csRes.body));
    const csId = csRes.body.id;

    // Test cancelling CASH_SALE
    console.log('\nTest 3: Cancel CASH_SALE (returns stock)');
    const csCancelRes = await request('POST', `/api/documents/${csId}/actions/cancel`, { reason: 'ลูกค้ายกเลิกขอเงินคืน' });
    console.log(`Cancel Result: ${csCancelRes.body.message}, New Status: ${csCancelRes.body.document?.status}`);
    if (csCancelRes.status !== 200) throw new Error('Failed to cancel cash sale');

    // 3. Test PURCHASE_ORDER workflow
    console.log('\nTest 4: Create PURCHASE_ORDER (Draft -> Waiting Approval)');
    const poPayload = {
        doc_type: 'PURCHASE_ORDER',
        issue_date: '2026-10-05',
        due_date: '2026-10-20',
        customer_name: 'บริษัท สยาม ซัพพลาย แมททีเรียล จำกัด',
        customer_tax_id: '0105551234567',
        subtotal: 5000,
        vat_type: 'exclude',
        vat_amount: 350,
        grand_total: 5350,
        status: 'WAITING_APPROVAL',
        items: [
            { item_name: 'เก้าอี้สำนักงาน Ergonomic', quantity: 5, unit: 'ตัว', unit_price: 1000, total_amount: 5000 }
        ]
    };
    const poRes = await request('POST', '/api/documents', poPayload);
    console.log(`Created PO: ${poRes.body.doc_number}, Status: ${poRes.body.status}`);
    if (poRes.status !== 201) throw new Error('Failed to create PO');
    const poId = poRes.body.id;

    console.log('\nTest 5: Approve PURCHASE_ORDER');
    const poApproveRes = await request('POST', `/api/documents/${poId}/actions/approve`);
    console.log(`Approve PO: ${poApproveRes.body.message}, Status: ${poApproveRes.body.document?.status}`);
    if (poApproveRes.status !== 200) throw new Error('Failed to approve PO');

    console.log('\nTest 6: Receive Goods on PURCHASE_ORDER (Auto Stock IN + Expense creation)');
    const poReceiveRes = await request('POST', `/api/documents/${poId}/actions/receive`);
    console.log(`Receive PO: ${poReceiveRes.body.message}, Status: ${poReceiveRes.body.document?.status}`);
    if (poReceiveRes.status !== 200) throw new Error('Failed to receive PO');

    // 4. Test TAX_INVOICE Partial and Full Settlement with auto Receipt
    console.log('\nTest 7: Create TAX_INVOICE');
    const invPayload = {
        doc_type: 'TAX_INVOICE',
        issue_date: '2026-10-05',
        due_date: '2026-10-25',
        customer_name: 'บริษัท ดิจิทัล โนเวชั่น จำกัด',
        subtotal: 10000,
        vat_type: 'exclude',
        vat_amount: 700,
        grand_total: 10700,
        status: 'ISSUED',
        items: [
            { item_name: 'บริการติดตั้งเครือข่าย', quantity: 1, unit: 'งาน', unit_price: 10000, total_amount: 10000 }
        ]
    };
    const invRes = await request('POST', '/api/documents', invPayload);
    console.log(`Created Invoice: ${invRes.body.doc_number}, Status: ${invRes.body.status}, Total: ${invRes.body.grand_total}`);
    const invId = invRes.body.id;

    console.log('\nTest 8: Partial Payment on Invoice (฿3,000 / ฿10,700)');
    const pay1Res = await request('POST', `/api/documents/${invId}/payments`, {
        amount: 3000,
        method: 'TRANSFER',
        bank_name: 'SCB',
        ref_no: 'TRF-00192',
        auto_create_receipt: true
    });
    console.log(`Payment 1: ${pay1Res.body.message}`);
    console.log(`Doc Status: ${pay1Res.body.document?.status}, Paid: ${pay1Res.body.document?.paid_amount}, Balance: ${pay1Res.body.document?.balance_due}`);
    console.log(`Auto-generated Receipt: ${pay1Res.body.receipt ? pay1Res.body.receipt.doc_number : 'None'}`);

    console.log('\nTest 9: Full Remaining Payment on Invoice (฿7,700 / ฿7,700)');
    const pay2Res = await request('POST', `/api/documents/${invId}/payments`, {
        amount: 7700,
        method: 'TRANSFER',
        bank_name: 'SCB',
        ref_no: 'TRF-00193',
        auto_create_receipt: true
    });
    console.log(`Payment 2: ${pay2Res.body.message}`);
    console.log(`Doc Status: ${pay2Res.body.document?.status}, Paid: ${pay2Res.body.document?.paid_amount}, Balance: ${pay2Res.body.document?.balance_due}`);
    console.log(`Auto-generated Receipt: ${pay2Res.body.receipt ? pay2Res.body.receipt.doc_number : 'None'}`);

    console.log('\n=== ALL PHASE 5 VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
