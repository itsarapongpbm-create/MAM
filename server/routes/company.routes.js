/**
 * Company Information Routes
 * Endpoint: /api/company
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ดึงข้อมูลบริษัท (MAM DESIGN AND SERVICE)
router.get('/', async (req, res) => {
    try {
        const company = await db.getAsync('SELECT * FROM companies ORDER BY id LIMIT 1');
        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json(company);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// อัปเดตข้อมูลบริษัท (PUT /api/company และ POST /api/company)
async function updateCompanyInfo(req, res) {
    try {
        const existing = await db.getAsync('SELECT * FROM companies ORDER BY id LIMIT 1');
        if (!existing) return res.status(404).json({ error: 'Company not found' });

        const {
            name,
            name_en,
            address,
            tax_id,
            branch,
            phone,
            email,
            website,
            logo_url
        } = req.body;

        await db.runAsync(`
            UPDATE companies
            SET name = COALESCE(?, name),
                name_en = COALESCE(?, name_en),
                address = COALESCE(?, address),
                tax_id = COALESCE(?, tax_id),
                branch = COALESCE(?, branch),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                website = COALESCE(?, website),
                logo_url = COALESCE(?, logo_url)
            WHERE id = ?
        `, [
            name !== undefined ? name : null,
            name_en !== undefined ? name_en : null,
            address !== undefined ? address : null,
            tax_id !== undefined ? tax_id : null,
            branch !== undefined ? branch : null,
            phone !== undefined ? phone : null,
            email !== undefined ? email : null,
            website !== undefined ? website : null,
            logo_url !== undefined ? logo_url : null,
            existing.id
        ]);

        const updated = await db.getAsync('SELECT * FROM companies WHERE id = ?', [existing.id]);
        res.json({
            message: 'บันทึกข้อมูลบริษัทเรียบร้อยแล้ว',
            company: updated,
            ...updated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

router.put('/', updateCompanyInfo);
router.post('/', updateCompanyInfo);

module.exports = router;
