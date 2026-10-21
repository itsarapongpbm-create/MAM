/**
 * Users Management Routes
 * Endpoint: /api/users
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { hashPassword } = require('../utils/password');

// ดึงรายการผู้ใช้งานทั้งหมด
router.get('/', async (req, res) => {
    try {
        const users = await db.allAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url, 'https://ui-avatars.com/api/?name=' || name) as avatar, 
                   status, last_login, created_at 
            FROM users 
            ORDER BY id ASC
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// อนุมัติผู้ใช้งานจากหน้าจอตั้งค่า
router.post('/:id/approve', async (req, res) => {
    try {
        await db.runAsync("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'อนุมัติผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ปฏิเสธคำขอเข้าใช้งานจากหน้าจอตั้งค่า
router.post('/:id/reject', async (req, res) => {
    try {
        await db.runAsync("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'ปฏิเสธคำขอผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// เพิ่มผู้ใช้งานใหม่โดยตรงจากหน้าจอตั้งค่า
router.post('/', async (req, res) => {
    try {
        const { username, email, password, name, role, phone, avatar } = req.body;
        if (!email || !name || !role) {
            return res.status(400).json({ error: 'Email, name, and role are required' });
        }

        const genUsername = username || email.split('@')[0];
        const genPassword = hashPassword(password || 'flow1234');
        const userAvatar = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7D0A0A&color=fff&size=128`;

        const result = await db.runAsync(`
            INSERT INTO users (company_id, username, email, password, name, role, phone, avatar, avatar_url, status)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
            genUsername,
            email,
            genPassword,
            name,
            role,
            phone || '',
            userAvatar,
            userAvatar
        ]);

        const created = await db.getAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url) as avatar, 
                   status, created_at 
            FROM users 
            WHERE id = ?
        `, [result.lastID]);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// แก้ไขข้อมูลผู้ใช้งาน
router.put('/:id', async (req, res) => {
    try {
        const { name, role, phone, status, password, avatar } = req.body;
        let query = 'UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), phone = COALESCE(?, phone), status = COALESCE(?, status)';
        const params = [name, role, phone, status];

        if (password) {
            query += ', password = ?';
            params.push(hashPassword(password));
        }
        if (avatar) {
            query += ', avatar = ?, avatar_url = ?';
            params.push(avatar, avatar);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        await db.runAsync(query, params);
        const updated = await db.getAsync(`
            SELECT id, 
                   COALESCE(username, substr(email, 1, instr(email, '@') - 1)) as username, 
                   email, name, role, phone, 
                   COALESCE(avatar, avatar_url) as avatar, 
                   status, last_login 
            FROM users 
            WHERE id = ?
        `, [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ลบผู้ใช้งาน (ห้ามลบผู้ดูแลระบบหลัก id=1)
router.delete('/:id', async (req, res) => {
    try {
        if (req.params.id == 1) {
            return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลระบบหลักของบริษัทได้' });
        }
        await db.runAsync('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
