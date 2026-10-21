/**
 * Audit Trail Service
 * บันทึกประวัติการเปลี่ยนสถานะและการกระทำต่างๆ กับเอกสาร (Status Logs)
 */

const db = require('../config/db');

async function recordStatusLog(documentId, action, fromStatus, toStatus, userId = null, reason = null) {
    await db.runAsync(`
        INSERT INTO document_status_logs (document_id, action, from_status, to_status, user_id, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [documentId, action, fromStatus, toStatus, userId, reason]);
}

module.exports = {
    recordStatusLog
};
