/**
 * Email & Notification Service
 * จัดการการส่งอีเมลแจ้งเตือนผู้ดูแลระบบเพื่ออนุมัติคำขอเข้าใช้งานระบบ
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('../config/env');

function dispatchRegistrationEmail({ userName, userEmail, userRole, approvalToken, host, protocol = 'http' }) {
    const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;
    const approveUrl = `${baseUrl}/api/auth/approve?token=${approvalToken}`;
    const rejectUrl = `${baseUrl}/api/auth/reject?token=${approvalToken}`;

    const logEntry = `\n======================================================\nTIME: ${new Date().toISOString()}\nTO: admin\nSUBJECT: [MAM DESIGN AND SERVICE] คำขอเข้าใช้งานใหม่: ${userName} (${userRole})\nAPPROVE LINK: ${approveUrl}\nREJECT LINK: ${rejectUrl}\n======================================================\n`;
    const logPath = path.join(__dirname, '..', 'sent-emails.log');
    try {
        fs.appendFileSync(logPath, logEntry, 'utf8');
    } catch (e) {}

    console.log(`[EMAIL DISPATCHED] Registration request from ${userName} (${userEmail}) -> Role: ${userRole}`);
    console.log(`  Approve URL: ${approveUrl}`);

    // ส่งอีเมลจริงแจ้ง Admin หากตั้งค่า SMTP ไว้ใน .env
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const adminEmail = process.env.ADMIN_EMAIL || smtpUser;

    if (smtpUser && smtpPass && adminEmail) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: smtpUser, pass: smtpPass }
        });

        transporter.sendMail({
            from: process.env.SMTP_FROM || smtpUser,
            to: adminEmail,
            subject: `[MAM DESIGN AND SERVICE] คำขออนุมัติบัญชีผู้ใช้งานใหม่: ${userName} (${userRole})`,
            html: `
                <div style="font-family: 'Prompt', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #7D0A0A; margin-top: 0;">คำขอเข้าใช้งานระบบใหม่</h2>
                    <p>มีพนักงานลงทะเบียนขอเข้าใช้งานระบบ <strong>MAM DESIGN AND SERVICE</strong> รายละเอียดดังนี้:</p>
                    <ul style="line-height: 1.8;">
                        <li><strong>ชื่อ-นามสกุล:</strong> ${userName}</li>
                        <li><strong>อีเมล:</strong> ${userEmail}</li>
                        <li><strong>สิทธิ์ที่ขอ:</strong> ${userRole}</li>
                    </ul>
                    <div style="margin-top: 24px;">
                        <a href="${approveUrl}" style="display: inline-block; padding: 10px 20px; background: #059669; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-right: 10px;">✓ อนุมัติสิทธิ์ทันที</a>
                        <a href="${rejectUrl}" style="display: inline-block; padding: 10px 20px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">✕ ปฏิเสธคำขอ</a>
                    </div>
                </div>
            `
        }).catch(err => console.error('Registration SMTP notification error:', err.message));
    }

    return { approveUrl, rejectUrl };
}

function getApproveSuccessHtml(user, roleText) {
    return `
        <!DOCTYPE html>
        <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>อนุมัติสิทธิ์เรียบร้อย | MAM DESIGN AND SERVICE</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Prompt', 'Inter', sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; }
            .card { background: #ffffff; max-width: 440px; width: 100%; border-radius: 18px; padding: 40px 32px; text-align: center; box-shadow: 0 12px 35px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .icon { width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #059669; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 20px; border: 2px solid #a7f3d0; }
            h1 { font-size: 22px; color: #0f172a; margin: 0 0 10px; }
            p { color: #64748b; font-size: 14.5px; line-height: 1.6; margin: 0 0 20px; }
            .user-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: left; font-size: 14px; line-height: 1.8; }
            .btn { display: inline-block; padding: 12px 28px; background: #7D0A0A; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>อนุมัติสิทธิ์เรียบร้อยแล้ว</h1>
            <p>ระบบได้เปิดการใช้งานให้กับผู้ใช้นี้เรียบร้อยแล้ว ผู้ใช้สามารถเข้าสู่ระบบได้ทันที</p>
            <div class="user-box">
              <div><strong>ชื่อ-นามสกุล:</strong> ${user.name}</div>
              <div><strong>อีเมล:</strong> ${user.email}</div>
              <div><strong>สิทธิ์ที่ได้รับ:</strong> <span style="color: #7D0A0A; font-weight: 600;">${roleText}</span></div>
              <div><strong>สถานะ:</strong> <span style="color: #059669; font-weight: 600;">เปิดใช้งานแล้ว (ACTIVE)</span></div>
            </div>
            <a href="/index.html" class="btn">ไปที่หน้าเข้าสู่ระบบ &rarr;</a>
          </div>
        </body>
        </html>
    `;
}

module.exports = {
    dispatchRegistrationEmail,
    getApproveSuccessHtml
};
