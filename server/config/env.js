/**
 * Environment Variables Loader
 * โหลดตัวแปรจากไฟล์ .env เข้าสู่ process.env อัตโนมัติ (โดยไม่ทับค่าที่ตั้งจาก Hosting Environment)
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envPath)) return;

    try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) continue;

            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();

            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }

            if (key && process.env[key] === undefined) {
                process.env[key] = val;
            }
        }
    } catch (err) {
        console.error('Warning: Failed to parse .env file:', err.message);
    }
}

loadEnv();

module.exports = { loadEnv };
