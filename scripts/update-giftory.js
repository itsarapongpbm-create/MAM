const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server', 'flowaccount.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    }
});

db.serialize(() => {
    // 1. Update company record
    db.run(`
        UPDATE companies 
        SET code = 'GIFTORY', 
            name = 'บริษัท กิฟทอรี่ จำกัด', 
            tax_id = '0105562089456',
            branch = 'สำนักงานใหญ่',
            address = '123 อาคารสาทรซิตี้ ทาวเวอร์ ชั้น 15 ถนนสาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพฯ 10120',
            phone = '02-821-5555',
            email = 'contact@giftory.com'
        WHERE id = 1
    `, function(err) {
        if (err) console.error('Error updating companies:', err);
        else console.log('Company updated:', this.changes);
    });

    // 2. Update users email
    db.run(`
        UPDATE users 
        SET email = 'admin@giftory.com'
        WHERE username = 'admin'
    `);
    db.run(`
        UPDATE users 
        SET email = 'accountant@giftory.com'
        WHERE username = 'accountant'
    `);
    db.run(`
        UPDATE users 
        SET email = 'sales@giftory.com'
        WHERE username = 'sales'
    `, function(err) {
        if (err) console.error('Error updating user emails:', err);
        else console.log('Users emails updated.');
    });

    // 3. Update any withholding taxes where payer was old company
    db.run(`
        UPDATE withholding_taxes
        SET payer_name = 'บริษัท กิฟทอรี่ จำกัด'
        WHERE payer_name LIKE '%นวัตกรรมดิจิทัล%'
    `, function(err) {
        if (err) console.error('Error updating withholding taxes:', err);
        else console.log('Withholding taxes updated:', this.changes);
    });

    // 4. Verify
    db.all(`SELECT id, username, email, role FROM users`, (err, rows) => {
        console.log('Current users:', rows);
    });
    db.get(`SELECT * FROM companies LIMIT 1`, (err, row) => {
        console.log('Current company:', row);
        db.close();
    });
});
