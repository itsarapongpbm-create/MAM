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

module.exports = router;
