/**
 * Initial Business Data Seeder (Production Clean Mode)
 * สร้างเฉพาะข้อมูลองค์กรหลัก (MAM DESIGN AND SERVICE) และบัญชีผู้ดูแลระบบเริ่มต้นเท่านั้น
 * ไม่มีข้อมูลบิลจำลอง ค่าใช้จ่ายจำลอง หรือลูกค้าจำลอง
 */

const { hashPassword } = require('../utils/password');

async function seedInitialData(db) {
    // 1. Seed or update default company (MAM DESIGN AND SERVICE - Single Organization)
    let existingCompany = await db.getAsync('SELECT id FROM companies WHERE id = 1 LIMIT 1');
    if (!existingCompany) {
        await db.runAsync(`
            INSERT INTO companies (id, code, name, name_en, logo_url, tax_id, branch, address, phone, email)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `, [
            'MAM',
            'บริษัท เอ็มเอเอ็ม ดีไซน์แอนด์เซอร์วิส จำกัด',
            'MAM DESIGN AND SERVICE CO., LTD.',
            '/assets/images/mam-logo.png',
            '0105565160161',
            'สำนักงานใหญ่',
            '46/14 ถนนริมคลองบางค้อ แขวงบางค้อ เขตจอมทอง กทม 10150',
            '0959393979',
            'contact@mamdesign.co.th'
        ]);
    } else {
        await db.runAsync(`
            UPDATE companies 
            SET code = COALESCE(NULLIF(code, ''), 'MAM'), 
                name = COALESCE(NULLIF(name, ''), 'บริษัท เอ็มเอเอ็ม ดีไซน์แอนด์เซอร์วิส จำกัด'), 
                name_en = COALESCE(NULLIF(name_en, ''), 'MAM DESIGN AND SERVICE CO., LTD.'),
                logo_url = COALESCE(NULLIF(logo_url, ''), '/assets/images/mam-logo.png'),
                email = COALESCE(NULLIF(email, ''), 'contact@mamdesign.co.th')
            WHERE id = 1
        `);
    }

    // 2. Seed default Admin user only if users table is completely empty
    const userCount = await db.getAsync('SELECT COUNT(*) as count FROM users');
    if (userCount && userCount.count === 0) {
        await db.runAsync(`
            INSERT INTO users (company_id, username, email, password, name, role, phone, avatar, status)
            VALUES (1, 'admin', 'admin@mamdesign.co.th', ?, 'คุณอิศรพงศ์ โพธิ์งาม', 'ADMIN', '095-939-3979', 'https://ui-avatars.com/api/?name=Itsarapong+Po&background=7D0A0A&color=fff&size=128', 'ACTIVE');
        `, [hashPassword('admin123')]);
        console.log('Seeded default Admin user.');
    }
}

module.exports = {
    seedInitialData
};
