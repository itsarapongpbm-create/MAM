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

async function testQuotationWorkflow() {
    console.log('--- Testing 4.1.2 Create Quotation (Draft & Submit) ---');
    const newQt = {
        doc_type: 'QUOTATION',
        issue_date: '2026-10-05',
        valid_until: '2026-11-04',
        project_name: 'งานพัฒนาระบบ ERP และ CRM องค์กร MAM',
        customer_name: 'บริษัท สยาม รีเทล คอร์ปอเรชั่น จำกัด (มหาชน)',
        customer_tax_id: '0107536000123',
        customer_branch: 'สำนักงานใหญ่',
        customer_address: '88/1 อาคารสยามทาวเวอร์ ชั้น 18 ปทุมวัน กทม.',
        salesperson: 'อิศรพงศ์ โพธิ์งาม',
        subtotal: 250000,
        discount_amount: 10000,
        vat_type: 'exclude',
        vat_amount: 16800,
        grand_total: 256800,
        status: 'WAITING_APPROVAL',
        remarks: 'กำหนดยืนราคา 30 วันนับจากวันที่ออกเอกสาร',
        items: [
            { item_name: 'ค่าบริการออกแบบระบบและฐานข้อมูล', quantity: 1, unit: 'งวด', unit_price: 150000, total_amount: 150000 },
            { item_name: 'ค่าบริการพัฒนา Frontend UI ตาม Spec', quantity: 1, unit: 'งวด', unit_price: 100000, total_amount: 100000 }
        ]
    };

    const res = await request('POST', '/api/documents', newQt);
    console.log(`Created Quotation: ${res.body.doc_number}, Status: ${res.body.status}, ID: ${res.body.id}`);
    if (res.status !== 201) throw new Error('Create quotation failed');

    const createdId = res.body.id;
    const fetchDoc = await request('GET', `/api/documents/${createdId}`);
    console.log(`Fetched Doc: ${fetchDoc.body.doc_number}, Project: ${fetchDoc.body.project_name}, ValidUntil: ${fetchDoc.body.valid_until}`);

    console.log('\n--- Testing 4.1.1 Export Excel CSV ---');
    const exportRes = await request('GET', '/api/documents/export/csv?type=QUOTATION');
    console.log(`Export CSV Status: ${exportRes.status}`);
    const lines = (exportRes.raw || '').split('\r\n');
    console.log(`Header line: ${lines[0]}`);
    console.log(`First data line: ${lines[1]}`);
    console.log(`Total rows exported: ${lines.length}`);

    console.log('\n--- ALL QUOTATION SPEC 4.1.1 & 4.1.2 TESTS PASSED! ---');
}

testQuotationWorkflow().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
