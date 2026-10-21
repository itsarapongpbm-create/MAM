/**
 * User Authentication Routes
 * Endpoint: /api/auth
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { dispatchRegistrationEmail, getApproveSuccessHtml } = require('../services/email.service');
const { hashPassword, verifyPassword, isPasswordHashed } = require('../utils/password');

// เข้าสู่ระบบ (รองรับทั้ง Email และ Username พร้อม Password Hashing)
router.post('/login', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const loginIdentifier = (email || username || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ error: 'กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน' });
        }

        const prefix = loginIdentifier.includes('@') ? loginIdentifier.split('@')[0] : loginIdentifier;

        const candidates = await db.allAsync(`
            SELECT * FROM users 
            WHERE email = ? 
               OR username = ? 
               OR email LIKE ?
               OR username = ?
        `, [loginIdentifier, loginIdentifier, `${prefix}@%`, prefix]);

        const user = (candidates || []).find(u => verifyPassword(password, u.password));

        if (!user) {
            return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        // อัปเกรดรหัสผ่านเป็น Hash อัตโนมัติหากยังเป็น Plaintext
        if (!isPasswordHashed(user.password)) {
            await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), user.id]);
        }

        if (user.status === 'PENDING') {
            return res.status(403).json({ error: 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติสิทธิ์ผ่านอีเมล กรุณารอการยืนยัน' });
        }
        if (user.status === 'REJECTED') {
            return res.status(403).json({ error: 'คำขอเข้าใช้งานของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ' });
        }
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน' });
        }

        // ปรับปรุงเวลาเข้าใช้งานล่าสุด
        await db.runAsync('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username || prefix,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar || user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=7D0A0A&color=fff&size=128`,
                phone: user.phone || ''
            },
            token: `flow-token-${user.id}-${Date.now()}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลงทะเบียนผู้ใช้ใหม่ พร้อมสร้าง Approval Token และส่งอีเมลแจ้ง Admin
router.post('/register', async (req, res) => {
    try {
        const { fullName, name, email, role, password } = req.body;
        const userName = (fullName || name || '').trim();
        const userEmail = (email || '').trim();
        const userPass = (password || '').trim();
        const userRole = ['ADMIN', 'ACCOUNTANT', 'SALES'].includes(role) ? role : 'SALES';

        if (!userName || !userEmail || !userPass) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
        }
        if (userPass.length < 8) {
            return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
        }

        const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [userEmail]);
        if (existing) {
            return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
        }

        const username = userEmail.split('@')[0];
        const approvalToken = crypto.randomBytes(24).toString('hex');
        const hashedPass = hashPassword(userPass);

        await db.runAsync(`
            INSERT INTO users (name, email, username, role, requested_role, password, status, approval_token)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `, [userName, userEmail, username, userRole, userRole, hashedPass, approvalToken]);

        const host = req.get('host') || 'localhost:3000';
        dispatchRegistrationEmail({
            userName,
            userEmail,
            userRole,
            approvalToken,
            host,
            protocol: req.protocol
        });

        res.json({
            success: true,
            message: 'ส่งคำขอสร้างบัญชีผู้ใช้สำเร็จ! ระบบได้ส่งอีเมลแจ้งผู้ดูแลระบบเพื่อพิจารณาอนุมัติสิทธิ์แล้ว',
            approval_token: approvalToken
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลิงก์อนุมัติผ่านอีเมล (GET /api/auth/approve?token=xxx)
router.get('/approve', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('<h1>ไม่พบรหัสยืนยันสิทธิ์ (Token)</h1>');

        const user = await db.getAsync('SELECT * FROM users WHERE approval_token = ?', [token]);
        if (!user) {
            return res.status(404).send('<h1>ไม่พบคำขอ หรือคำขอนี้ได้รับการอนุมัติไปแล้ว</h1>');
        }

        await db.runAsync("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", [user.id]);

        const roleMap = { 'ADMIN': 'เจ้าของกิจการ (Admin)', 'ACCOUNTANT': 'นักบัญชี (Accountant)', 'SALES': 'พนักงานขาย (Sales)' };
        const roleText = roleMap[user.role] || user.role;

        res.send(getApproveSuccessHtml(user, roleText));
    } catch (err) {
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

// ลิงก์ปฏิเสธผ่านอีเมล (GET /api/auth/reject?token=xxx)
router.get('/reject', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('<h1>ไม่พบรหัสยืนยันสิทธิ์ (Token)</h1>');

        const user = await db.getAsync('SELECT * FROM users WHERE approval_token = ?', [token]);
        if (!user) return res.status(404).send('<h1>ไม่พบคำขอ หรือคำขอนี้ได้รับการดำเนินการไปแล้ว</h1>');

        await db.runAsync("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", [user.id]);
        res.send('<h1>ปฏิเสธคำขอเข้าใช้งานเรียบร้อยแล้ว</h1>');
    } catch (err) {
        res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
    }
});

// ขอรีเซ็ตรหัสผ่าน (POST /api/auth/forgot-password)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const userEmail = (email || '').trim();

        if (!userEmail) {
            return res.status(400).json({ error: 'กรุณากรอกอีเมล' });
        }

        const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [userEmail]);
        if (!user) {
            return res.status(404).json({ error: 'ไม่พบที่อยู่อีเมลนี้ในระบบ' });
        }

        res.json({
            success: true,
            message: `ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยัง ${userEmail} เรียบร้อยแล้ว (โปรดตรวจสอบกล่องข้อความ)`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

