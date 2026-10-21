/**
 * Document Sequences Generator
 * จัดการรันเลขที่เอกสารอัตโนมัติ (เช่น QT-202610-0001, INV-202610-0001) แบบ Concurrency-safe
 */

const db = require('../config/db');
const { getType } = require('../document-types');

async function syncDocumentSequences() {
    const docs = await db.allAsync(`SELECT doc_type, doc_number FROM documents WHERE doc_number IS NOT NULL`);
    for (const d of docs) {
        const m = String(d.doc_number).match(/^([A-Z]+)-(\d{6})-(\d+)$/);
        if (m) {
            const [, prefix, period, numStr] = m;
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > 0) {
                await db.runAsync(`
                    INSERT INTO document_sequences (company_id, doc_type, period, last_no)
                    VALUES (1, ?, ?, ?)
                    ON CONFLICT(company_id, doc_type, period)
                    DO UPDATE SET last_no = MAX(last_no, excluded.last_no)
                `, [d.doc_type, period, num]);
            }
        }
    }
}

async function getNextDocNumber(companyId = 1, docType, issueDate = null) {
    const typeDef = getType(docType);
    const prefix = typeDef ? typeDef.prefix : 'DOC';
    const dateObj = issueDate ? new Date(issueDate) : new Date();
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const period = `${yyyy}${mm}`;

    await db.runAsync(`
        INSERT INTO document_sequences (company_id, doc_type, period, last_no)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(company_id, doc_type, period)
        DO UPDATE SET last_no = last_no + 1, updated_at = CURRENT_TIMESTAMP
    `, [companyId, docType, period]);

    const row = await db.getAsync(`
        SELECT last_no FROM document_sequences WHERE company_id = ? AND doc_type = ? AND period = ?
    `, [companyId, docType, period]);

    const lastNo = row ? row.last_no : 1;
    return `${prefix}-${period}-${String(lastNo).padStart(4, '0')}`;
}

async function peekNextDocNumber(companyId = 1, docType, issueDate = null) {
    const typeDef = getType(docType);
    const prefix = typeDef ? typeDef.prefix : 'DOC';
    const dateObj = issueDate ? new Date(issueDate) : new Date();
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const period = `${yyyy}${mm}`;

    const row = await db.getAsync(`
        SELECT last_no FROM document_sequences WHERE company_id = ? AND doc_type = ? AND period = ?
    `, [companyId, docType, period]);

    const nextNo = (row ? row.last_no : 0) + 1;
    return `${prefix}-${period}-${String(nextNo).padStart(4, '0')}`;
}

module.exports = {
    syncDocumentSequences,
    getNextDocNumber,
    peekNextDocNumber
};
