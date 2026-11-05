/**
 * Email Campaign & Gmail Integration Routes (IMAP & SMTP + SQLite Fast Cache)
 * Endpoint: /api/email
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('../config/db');

// อ่านการตั้งค่าอีเมล
const configPath = path.join(__dirname, '..', 'email-config.json');

function getEmailConfig() {
    let fileConfig = {};
    try {
        if (fs.existsSync(configPath)) {
            fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (err) {
        console.error('Error reading email-config.json:', err.message);
    }

    return {
        admin_email: process.env.ADMIN_EMAIL || fileConfig.admin_email || 'itsarapong.pbm@gmail.com',
        smtp_enabled: process.env.SMTP_ENABLED !== undefined ? process.env.SMTP_ENABLED === 'true' : (fileConfig.smtp_enabled !== false),
        smtp_host: process.env.SMTP_HOST || fileConfig.smtp_host || 'smtp.gmail.com',
        smtp_port: Number(process.env.SMTP_PORT || fileConfig.smtp_port || 587),
        smtp_user: process.env.SMTP_USER || fileConfig.smtp_user || 'itsarapong.pbm@gmail.com',
        smtp_pass: process.env.SMTP_PASS || fileConfig.smtp_pass || '',
        smtp_from: process.env.SMTP_FROM || fileConfig.smtp_from || 'MAM DESIGN AND SERVICE <itsarapong.pbm@gmail.com>',
        reply_to: process.env.SMTP_REPLY_TO || fileConfig.reply_to || 'sales@giftoryth.com'
    };
}

// สร้าง Transporter สำหรับ Nodemailer (SMTP ส่งอีเมล)
function createTransporter() {
    const config = getEmailConfig();
    return nodemailer.createTransport({
        host: config.smtp_host || 'smtp.gmail.com',
        port: config.smtp_port || 587,
        secure: config.smtp_port === 465,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        }
    });
}

// สร้าง IMAP Client สำหรับ ImapFlow (IMAP อ่านอีเมลสดจาก Gmail)
function createImapClient() {
    const config = getEmailConfig();
    const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        },
        logger: false
    });

    // ดักจับ error event เพื่อป้องกัน Unhandled 'error' event (เช่น ECONNRESET, ETIMEDOUT) ทำเซิร์ฟเวอร์หลุด/แครช
    client.on('error', (err) => {
        console.warn('[ImapFlow Client] Network/Connection Warning:', err?.message || err);
    });

    return client;
}

// สร้างตาราง Cache และตาราง Logs ใน SQLite เพื่อให้โหลดหน้าเว็บได้ทันทีภายใน 0.05 วินาที
async function ensureCacheTable() {
    try {
        const dtType = db.isPostgres() ? 'TIMESTAMP' : 'DATETIME';
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS email_inbox_cache (
                uid INTEGER PRIMARY KEY,
                seq INTEGER,
                subject TEXT,
                from_address TEXT,
                from_name TEXT,
                to_address TEXT,
                date TEXT,
                unread INTEGER DEFAULT 0,
                snippet TEXT,
                html_body TEXT,
                text_body TEXT,
                updated_at ${dtType} DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS email_campaign_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_name TEXT,
                recipient_email TEXT NOT NULL,
                recipient_company TEXT,
                recipient_contact TEXT,
                subject TEXT,
                status TEXT DEFAULT 'SENT',
                error_message TEXT,
                file_name TEXT,
                sent_by TEXT,
                sent_at ${dtType} DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error('Ensure Cache Table Error:', err.message);
    }
}
ensureCacheTable();

/**
 * ฟังก์ชันช่วยแยก CSV รองรับเครื่องหมายจุลภาคในเครื่องหมายคำพูด (Quote-aware parser)
 */
function parseCSV(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let field = '';

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (c === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push(field.trim());
            field = '';
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            row.push(field.trim());
            if (row.some(f => f.length > 0)) lines.push(row);
            row = [];
            field = '';
        } else {
            field += c;
        }
    }
    if (field || row.length > 0) {
        row.push(field.trim());
        if (row.some(f => f.length > 0)) lines.push(row);
    }
    return lines;
}

/**
 * 1. ดึงข้อมูลรายชื่อจาก Google Sheets
 * POST /api/email/fetch-sheet
 */
router.post('/fetch-sheet', async (req, res) => {
    try {
        const { sheetUrlOrId, sheetName = 'Lists' } = req.body;
        if (!sheetUrlOrId) {
            return res.status(400).json({ error: 'กรุณาระบุลิงก์หรือ ID ของ Google Sheets' });
        }

        const match = sheetUrlOrId.trim().match(/[-\w]{25,}/);
        const sheetId = match ? match[0] : sheetUrlOrId.trim();

        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error(`ไม่สามารถเชื่อมต่อ Google Sheets ได้ (HTTP Status: ${response.status}) กรุณาตรวจสอบว่าชีตนี้เปิดสิทธิ์ 'Anyone with the link can view' เรียบร้อยแล้ว`);
        }

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length <= 1) {
            return res.json({ success: true, count: 0, data: [], message: 'ไม่พบข้อมูลในแผ่นงานนี้' });
        }

        const list = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const company = row[1] ? row[1].trim() : '';
            if (company) {
                list.push({
                    rowId: i + 1,
                    no: row[0] || i,
                    company: company,
                    status: row[2] ? row[2].trim() : '',
                    phone: row[3] ? row[3].trim() : '',
                    backup_phone: row[4] ? row[4].trim() : '',
                    contact_person: row[5] ? row[5].trim() : '',
                    email: row[6] ? row[6].trim() : '',
                    position: row[7] ? row[7].trim() : ''
                });
            }
        }

        res.json({
            success: true,
            sheetId,
            sheetName,
            totalRows: list.length,
            validEmails: list.filter(item => item.email && item.email.includes('@')).length,
            data: list
        });
    } catch (err) {
        console.error('Fetch Google Sheet Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 2. บันทึกรายชื่อจาก Google Sheets เข้าสู่ตาราง Customers ของ MAM
 * POST /api/email/import-customers
 */
router.post('/import-customers', async (req, res) => {
    try {
        const { customers } = req.body;
        if (!Array.isArray(customers) || customers.length === 0) {
            return res.status(400).json({ error: 'ไม่พบรายการลูกค้าที่จะนำเข้า' });
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const item of customers) {
            if (!item.company) continue;

            const existing = await db.getAsync("SELECT id FROM customers WHERE name = ? OR (email = ? AND email != '')", [item.company, item.email || '']);
            if (existing) {
                skippedCount++;
                continue;
            }

            const nextCode = 'CUS-' + Math.floor(1000 + Math.random() * 9000);
            await db.runAsync(`
                INSERT INTO customers (
                    company_id, code, name, contact_type, entity_type,
                    contact_person, email, phone, created_at
                ) VALUES (1, ?, ?, 'CUSTOMER', 'JURISTIC', ?, ?, ?, CURRENT_TIMESTAMP)
            `, [nextCode, item.company, item.contact_person || '', item.email || '', item.phone || '']);

            importedCount++;
        }

        res.json({
            success: true,
            importedCount,
            skippedCount,
            message: `นำเข้าข้อมูลสำเร็จ ${importedCount} รายการ (มีอยู่แล้ว ${skippedCount} รายการ)`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 3. ส่งอีเมลทีละ 1 ฉบับ
 * POST /api/email/send-single
 */
router.post('/send-single', async (req, res) => {
    try {
        const {
            to,
            company = '',
            contact_person = '',
            doc_number = '',
            docNumber = '',
            subject = '',
            htmlBody = '',
            attachment = null
        } = req.body;

        if (!to || !to.includes('@')) {
            return res.status(400).json({ error: 'อีเมลผู้รับไม่ถูกต้อง' });
        }

        const docNoVal = doc_number || docNumber || 'QT2026-0089';

        const finalSubject = subject
            .replace(/\{\{company\}\}/gi, company)
            .replace(/\{\{contact_name\}\}/gi, contact_person || company)
            .replace(/\{\{doc_number\}\}/gi, docNoVal);

        const finalHtml = htmlBody
            .replace(/\{\{company\}\}/gi, company)
            .replace(/\{\{contact_name\}\}/gi, contact_person || company)
            .replace(/\{\{doc_number\}\}/gi, docNoVal);

        const config = getEmailConfig();
        const transporter = createTransporter();

        const mailOptions = {
            from: config.smtp_from || config.smtp_user,
            replyTo: config.reply_to || 'sales@giftoryth.com',
            to: to,
            subject: finalSubject,
            html: finalHtml
        };

        if (attachment && attachment.filename && attachment.content) {
            mailOptions.attachments = [{
                filename: attachment.filename,
                content: Buffer.from(attachment.content, 'base64'),
                contentType: attachment.contentType || 'application/pdf'
            }];
        }

        const info = await transporter.sendMail(mailOptions);

        try {
            await db.runAsync(`
                INSERT INTO email_campaign_logs (
                    campaign_name, recipient_email, recipient_company, recipient_contact,
                    subject, status, file_name, sent_by, sent_at
                ) VALUES (?, ?, ?, ?, ?, 'SENT', ?, 'MAM System', CURRENT_TIMESTAMP)
            `, ['Giftory 2026', to, company, contact_person, finalSubject, attachment ? attachment.filename : null]);
        } catch (logErr) {
            console.error('Failed to write email log to SQLite:', logErr.message);
        }

        res.json({
            success: true,
            messageId: info.messageId,
            to,
            company,
            message: 'ส่งอีเมลสำเร็จเรียบร้อย'
        });
    } catch (err) {
        console.error('Send Email Error:', err);

        try {
            await db.runAsync(`
                INSERT INTO email_campaign_logs (
                    campaign_name, recipient_email, recipient_company, recipient_contact,
                    subject, status, error_message, sent_by, sent_at
                ) VALUES (?, ?, ?, ?, ?, 'FAILED', ?, 'MAM System', CURRENT_TIMESTAMP)
            `, ['Giftory 2026', req.body.to, req.body.company || '', req.body.contact_person || '', req.body.subject || '', err.message]);
        } catch (logErr) {}

        res.status(500).json({ error: err.message });
    }
});

// ฟังก์ชันดึงอีเมลจาก Gmail และบันทึกลง SQLite Cache
async function syncGmailInbox(limit = 15) {
    const client = createImapClient();
    let lock = null;
    let emails = [];
    let status;

    try {
        await client.connect();
        lock = await client.getMailboxLock('INBOX');
        status = await client.status('INBOX', { messages: true, unseen: true });
        const total = status.messages || 0;
        if (total > 0) {
            const startSeq = Math.max(1, total - limit + 1);
            const range = `${startSeq}:*`;
            for await (const msg of client.fetch(range, { envelope: true, flags: true })) {
                const emailItem = {
                    uid: msg.uid,
                    seq: msg.seq,
                    subject: msg.envelope.subject || '(ไม่มีหัวข้อ)',
                    from: msg.envelope.from?.[0]?.address || '',
                    fromName: msg.envelope.from?.[0]?.name || msg.envelope.from?.[0]?.address || '',
                    to: msg.envelope.to?.[0]?.address || '',
                    date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
                    unread: !msg.flags.has('\\Seen')
                };
                emails.push(emailItem);

                // บันทึก/อัปเดตลง SQLite Cache
                await db.runAsync(`
                    INSERT INTO email_inbox_cache (uid, seq, subject, from_address, from_name, to_address, date, unread, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(uid) DO UPDATE SET
                        subject = excluded.subject,
                        from_address = excluded.from_address,
                        from_name = excluded.from_name,
                        to_address = excluded.to_address,
                        date = excluded.date,
                        unread = excluded.unread,
                        updated_at = CURRENT_TIMESTAMP
                `, [emailItem.uid, emailItem.seq, emailItem.subject, emailItem.from, emailItem.fromName, emailItem.to, emailItem.date, emailItem.unread ? 1 : 0]);
            }
        }
    } catch (err) {
        console.warn('[ImapFlow] syncGmailInbox warning:', err?.message || err);
    } finally {
        if (lock) {
            try { lock.release(); } catch (e) {}
        }
        try { await client.logout(); } catch (e) {}
    }
    emails.reverse();
    return { status, emails };
}

/**
 * 4. ดึงรายการอีเมลขาเข้า (ใช้ SQLite Fast Cache เพื่อความเร็วระดับมิลลิวินาที)
 * GET /api/email/inbox
 */
router.get('/inbox', async (req, res) => {
    const forceRefresh = req.query.refresh === 'true';

    // 1. ตรวจสอบว่ามี Cache ใน SQLite หรือไม่
    try {
        await ensureCacheTable();
        const cached = await db.allAsync(`
            SELECT uid, seq, subject, from_address AS "from", from_name AS "fromName", to_address AS "to", date, unread 
            FROM email_inbox_cache 
            ORDER BY uid DESC 
            LIMIT 25
        `);

        // ถ้ามีข้อมูลใน Cache และไม่ได้กดบังคับรีเฟรช ให้ส่งผลลัพธ์กลับทันที (< 50ms)!
        if (!forceRefresh && cached && cached.length > 0) {
            // ดึงสถานะ Unread ทั้งหมด
            const unreadCount = cached.filter(c => c.unread === 1).length;

            // Trigger sync ในเบื้องหลังแบบ asynchronous ไม่ต้องบล็อกผู้ใช้
            syncGmailInbox(10).catch(err => console.error('Background IMAP Sync Error:', err.message));

            return res.json({
                success: true,
                fromCache: true,
                totalMessages: cached.length,
                unseenMessages: unreadCount,
                emails: cached.map(c => ({ ...c, unread: c.unread === 1 }))
            });
        }
    } catch (cacheErr) {
        console.error('Read Cache Error:', cacheErr.message);
    }

    // 2. ถ้ายังไม่มี Cache หรือผู้ใช้กดปุ่ม "รีเฟรช" ให้ต่อ Gmail จริง
    try {
        const { status, emails } = await syncGmailInbox(parseInt(req.query.limit) || 15);
        res.json({
            success: true,
            fromCache: false,
            totalMessages: status ? status.messages : emails.length,
            unseenMessages: status ? status.unseen : 0,
            emails
        });
    } catch (err) {
        console.error('IMAP Inbox Error:', err);
        // หากต่อ Gmail มีปัญหา แต่มีข้อมูลใน Cache เก่า ให้ส่ง Cache เก่ากลับไปแทนเพื่อไม่ให้หน้าจอค้าง
        try {
            const fallbackCached = await db.allAsync(`
                SELECT uid, seq, subject, from_address AS "from", from_name AS "fromName", to_address AS "to", date, unread 
                FROM email_inbox_cache 
                ORDER BY uid DESC 
                LIMIT 25
            `);
            if (fallbackCached && fallbackCached.length > 0) {
                return res.json({
                    success: true,
                    fromCache: true,
                    isFallback: true,
                    totalMessages: fallbackCached.length,
                    unseenMessages: 0,
                    emails: fallbackCached.map(c => ({ ...c, unread: c.unread === 1 }))
                });
            }
        } catch (e) {}

        res.status(500).json({ error: 'ไม่สามารถดึงอีเมลจาก Gmail ได้: ' + err.message });
    }
});

/**
 * 5. ดึงเนื้อหาอีเมลฉบับเต็มตาม UID จาก Gmail INBOX (พร้อม Cache)
 * GET /api/email/message/:uid
 */
router.get('/message/:uid', async (req, res) => {
    const uid = req.params.uid;

    // 1. ตรวจสอบเนื้อหาใน Cache ก่อน
    try {
        const cached = await db.getAsync(`
            SELECT * FROM email_inbox_cache 
            WHERE uid = ? AND (html_body IS NOT NULL OR text_body IS NOT NULL)
        `, [uid]);

        if (cached && (cached.html_body || cached.text_body)) {
            await db.runAsync('UPDATE email_inbox_cache SET unread = 0 WHERE uid = ?', [uid]);
            return res.json({
                success: true,
                fromCache: true,
                message: {
                    uid: cached.uid,
                    subject: cached.subject || '(ไม่มีหัวข้อ)',
                    from: `${cached.from_name || ''} <${cached.from_address || ''}>`,
                    fromAddress: cached.from_address || '',
                    fromName: cached.from_name || '',
                    to: cached.to_address || '',
                    date: cached.date,
                    html: cached.html_body || cached.text_body,
                    text: cached.text_body
                }
            });
        }
    } catch (err) {
        console.error('Message Cache Lookup Error:', err.message);
    }

    // 2. ถ้ายังไม่มีใน Cache ให้ดึงจาก IMAP
    const client = createImapClient();
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let messageData = null;
        try {
            const message = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
            if (!message || !message.source) {
                return res.status(404).json({ error: 'ไม่พบข้อความอีเมลนี้' });
            }
            const parsed = await simpleParser(message.source);
            messageData = {
                uid: message.uid,
                subject: parsed.subject || '(ไม่มีหัวข้อ)',
                from: parsed.from?.text || '',
                fromAddress: parsed.from?.value?.[0]?.address || '',
                fromName: parsed.from?.value?.[0]?.name || '',
                to: parsed.to?.text || '',
                date: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
                html: parsed.html || parsed.textAsHtml || parsed.text,
                text: parsed.text,
                attachments: (parsed.attachments || []).map(a => ({
                    filename: a.filename,
                    contentType: a.contentType,
                    size: a.size
                }))
            };

            // บันทึกเนื้อหาลง Cache และตั้งสถานะเป็นอ่านแล้ว (unread = 0)
            await db.runAsync(`
                UPDATE email_inbox_cache 
                SET html_body = ?, text_body = ?, unread = 0, updated_at = CURRENT_TIMESTAMP
                WHERE uid = ?
            `, [messageData.html || '', messageData.text || '', uid]);

        } finally {
            lock.release();
        }
        await client.logout();

        res.json({
            success: true,
            fromCache: false,
            message: messageData
        });
    } catch (err) {
        console.error('IMAP Fetch Message Error:', err);
        try { await client.logout(); } catch (e) {}
        res.status(500).json({ error: 'ไม่สามารถอ่านเนื้อหาอีเมลได้: ' + err.message });
    }
});

/**
 * 6. ดูประวัติการส่งอีเมล
 * GET /api/email/logs
 */
router.get('/logs', async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT * FROM email_campaign_logs 
            ORDER BY id DESC 
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) {
        if (err.message.includes('no such table') || err.message.includes('does not exist')) {
            const dtType = db.isPostgres() ? 'TIMESTAMP' : 'DATETIME';
            await db.runAsync(`
                CREATE TABLE IF NOT EXISTS email_campaign_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_name TEXT,
                    recipient_email TEXT NOT NULL,
                    recipient_company TEXT,
                    recipient_contact TEXT,
                    subject TEXT,
                    status TEXT DEFAULT 'SENT',
                    error_message TEXT,
                    file_name TEXT,
                    sent_by TEXT,
                    sent_at ${dtType} DEFAULT CURRENT_TIMESTAMP
                )
            `);
            return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

/**
 * 7. ตรวจสอบสถานะการตั้งค่าอีเมล
 * GET /api/email/status
 */
router.get('/status', (req, res) => {
    const config = getEmailConfig();
    res.json({
        smtp_enabled: config.smtp_enabled,
        sender_email: config.smtp_user,
        sender_name: config.smtp_from,
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port
    });
});

module.exports = router;
