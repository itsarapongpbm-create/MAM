/**
 * MAM Document Engine - Document Type Registry
 * Single source of truth for prefixes, titles, status lifecycle (state machine),
 * role permissions, and tax/stock behaviour of every trade document.
 */

const ROLES = Object.freeze({ ADMIN: 'ADMIN', ACCOUNTANT: 'ACCOUNTANT', SALES: 'SALES' });
const ALL_ROLES = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.SALES];
const BACK_OFFICE = [ROLES.ADMIN, ROLES.ACCOUNTANT];
const ADMIN_ONLY = [ROLES.ADMIN];

const STATUSES = Object.freeze({
    DRAFT: { label: 'ฉบับร่าง' },
    WAITING_APPROVAL: { label: 'รออนุมัติ' },
    APPROVED: { label: 'อนุมัติแล้ว' },
    ISSUED: { label: 'รอชำระ' },
    PARTIAL_PAID: { label: 'ชำระบางส่วน' },
    PAID: { label: 'ชำระแล้ว' },
    COMPLETED: { label: 'ดำเนินการครบ' },
    REJECTED: { label: 'ไม่อนุมัติ' },
    CANCELLED: { label: 'ยกเลิก' }
});

/** Statuses that represent money still owed to us. */
const RECEIVABLE_STATUSES = ['ISSUED', 'PARTIAL_PAID'];

/**
 * Document numbering settings.
 * resetPeriod: 'MONTHLY' -> QT-202610-0001 | 'YEARLY' -> QT-2026-0001 | 'NEVER' -> QT-0001
 * yearEra: 'AD' (ค.ศ.) or 'BE' (พ.ศ.)
 */
const NUMBERING = Object.freeze({ resetPeriod: 'MONTHLY', yearEra: 'AD', padding: 4 });

// --- Reusable action definitions -------------------------------------------
// from: allowed current statuses, to: resulting status, roles: who may perform it.
// assignNumber: allocate the real running number at this step (drafts have none).
// stock: 'OUT' deducts inventory, 'RETURN' reverses a previous deduction.
const approvalActions = (submitRoles) => ({
    submit: { label: 'ส่งขออนุมัติ', from: ['DRAFT'], to: 'WAITING_APPROVAL', roles: submitRoles, assignNumber: true, validate: true },
    return: { label: 'ตีกลับเป็นร่าง', from: ['WAITING', 'WAITING_APPROVAL'], to: 'DRAFT', roles: ADMIN_ONLY },
    approve: { label: 'อนุมัติ', from: ['WAITING', 'WAITING_APPROVAL', 'REJECTED', 'CANCELLED', 'DRAFT'], to: 'APPROVED', roles: ADMIN_ONLY, assignNumber: true },
    reject: { label: 'ไม่อนุมัติ', from: ['WAITING', 'WAITING_APPROVAL', 'APPROVED'], to: 'REJECTED', roles: ADMIN_ONLY, requireReason: true },
    complete: { label: 'ปิดงาน', from: ['APPROVED'], to: 'COMPLETED', roles: BACK_OFFICE },
    reopen: { label: 'นำกลับมาแก้ไข', from: ['ISSUED', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED'], to: 'DRAFT', roles: BACK_OFFICE },
    cancel: { label: 'ยกเลิก', from: ['WAITING', 'WAITING_APPROVAL', 'APPROVED', 'DRAFT', 'ISSUED', 'PARTIAL_PAID', 'PAID'], to: 'CANCELLED', roles: BACK_OFFICE, requireReason: true }
});

const DOC_TYPES = Object.freeze({
    QUOTATION: {
        prefix: 'QT', titleTh: 'ใบเสนอราคา', titleEn: 'QUOTATION', side: 'SALES',
        isTaxDocument: false, deductsStock: false,
        listPage: 'quotations.html', editorPage: 'quotation-new.html',
        createRoles: ALL_ROLES,
        primaryActions: { [ROLES.ADMIN]: ['submit', 'approve'], default: ['submit'] },
        actions: approvalActions(ALL_ROLES)
    },
    BILLING_NOTE: {
        prefix: 'BN', titleTh: 'ใบวางบิล/ใบแจ้งหนี้', titleEn: 'BILLING NOTE', side: 'SALES',
        isTaxDocument: false, deductsStock: false,
        listPage: 'billing-notes.html', editorPage: 'billing-note-new.html',
        createRoles: ALL_ROLES,
        primaryActions: { default: ['issue'] },
        actions: {
            issue: { label: 'ออกใบวางบิล', from: ['DRAFT', 'CANCELLED'], to: 'ISSUED', roles: BACK_OFFICE, assignNumber: true, validate: true },
            pay: { label: 'บันทึกรับชำระ', from: ['ISSUED', 'PARTIAL_PAID'], to: 'PAID', roles: BACK_OFFICE },
            reopen: { label: 'เปลี่ยนเป็นรอชำระ', from: ['ISSUED', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED'], to: 'ISSUED', roles: BACK_OFFICE, assignNumber: true },
            cancel: { label: 'ยกเลิก', from: ['DRAFT', 'ISSUED', 'PARTIAL_PAID', 'PAID'], to: 'CANCELLED', roles: BACK_OFFICE, requireReason: true }
        }
    },
    TAX_INVOICE: {
        prefix: 'INV', titleTh: 'ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้', titleEn: 'TAX INVOICE', side: 'SALES',
        isTaxDocument: true, deductsStock: true,
        listPage: 'invoices.html', editorPage: 'invoice-new.html',
        createRoles: ALL_ROLES,
        primaryActions: { default: ['issue'] },
        actions: {
            issue: { label: 'ออกใบกำกับภาษี', from: ['DRAFT', 'CANCELLED'], to: 'ISSUED', roles: BACK_OFFICE, assignNumber: true, validate: true, stock: 'OUT' },
            pay: { label: 'บันทึกรับชำระ', from: ['ISSUED', 'PARTIAL_PAID'], to: 'PAID', roles: BACK_OFFICE },
            reopen: { label: 'เปลี่ยนเป็นรอชำระ', from: ['ISSUED', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED'], to: 'ISSUED', roles: BACK_OFFICE, assignNumber: true, stock: 'OUT' },
            cancel: { label: 'ยกเลิก', from: ['DRAFT', 'ISSUED', 'PARTIAL_PAID', 'PAID'], to: 'CANCELLED', roles: BACK_OFFICE, requireReason: true, stock: 'RETURN' }
        }
    },
    RECEIPT: {
        prefix: 'RE', titleTh: 'ใบเสร็จรับเงิน', titleEn: 'RECEIPT', side: 'SALES',
        // Becomes a tax document when is_tax_invoice = 1 (service income: tax point = payment).
        isTaxDocument: false, deductsStock: false,
        listPage: 'receipts.html', editorPage: 'cash-invoice-new.html',
        createRoles: BACK_OFFICE,
        primaryActions: { default: ['issue'] },
        actions: {
            issue: { label: 'บันทึกรับชำระ', from: ['DRAFT', 'CANCELLED'], to: 'PAID', roles: BACK_OFFICE, assignNumber: true, validate: true },
            confirm: { label: 'ยืนยันการรับชำระ', from: ['DRAFT', 'CANCELLED'], to: 'PAID', roles: BACK_OFFICE, assignNumber: true, validate: true },
            reopen: { label: 'เปลี่ยนเป็นรับชำระแล้ว', from: ['ISSUED', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED'], to: 'PAID', roles: BACK_OFFICE, assignNumber: true },
            cancel: { label: 'ยกเลิก', from: ['DRAFT', 'PAID'], to: 'CANCELLED', roles: BACK_OFFICE, requireReason: true }
        }
    },
    CASH_SALE: {
        prefix: 'CS', titleTh: 'ใบกำกับภาษี/ใบเสร็จรับเงิน', titleEn: 'TAX INVOICE / RECEIPT', side: 'SALES',
        isTaxDocument: true, deductsStock: true,
        listPage: 'cash-sales.html', editorPage: 'cash-sale-new.html',
        createRoles: BACK_OFFICE,
        primaryActions: { default: ['issue'] },
        actions: {
            issue: { label: 'บันทึกขายสด', from: ['DRAFT'], to: 'PAID', roles: BACK_OFFICE, assignNumber: true, validate: true, stock: 'OUT' },
            reopen: { label: 'นำกลับมาแก้ไข', from: ['ISSUED', 'APPROVED', 'PAID', 'CANCELLED', 'REJECTED'], to: 'DRAFT', roles: BACK_OFFICE, stock: 'RETURN' },
            cancel: { label: 'ยกเลิก', from: ['DRAFT', 'PAID'], to: 'CANCELLED', roles: BACK_OFFICE, requireReason: true, stock: 'RETURN' }
        }
    },
    PURCHASE_ORDER: {
        prefix: 'PO', titleTh: 'ใบสั่งซื้อ', titleEn: 'PURCHASE ORDER', side: 'PURCHASE',
        isTaxDocument: false, deductsStock: false,
        listPage: 'purchase-orders.html', editorPage: 'purchase-order-new.html',
        createRoles: BACK_OFFICE,
        primaryActions: { [ROLES.ADMIN]: ['submit', 'approve'], default: ['submit'] },
        actions: {
            ...approvalActions(BACK_OFFICE),
            receive: { label: 'ตรวจรับของ/เข้าสต็อก', from: ['APPROVED'], to: 'COMPLETED', roles: BACK_OFFICE, stock: 'IN' }
        }
    }
});

const DOC_TYPE_KEYS = Object.keys(DOC_TYPES);
const STATUS_KEYS = Object.keys(STATUSES);

function getType(docType) {
    return DOC_TYPES[String(docType || '').toUpperCase()] || null;
}

/** True when the document must satisfy Revenue Code s.86/4 (full tax invoice). */
function isTaxDocument(doc) {
    const def = getType(doc.doc_type);
    if (!def) return false;
    return def.isTaxDocument || (doc.doc_type === 'RECEIPT' && Number(doc.is_tax_invoice) === 1);
}

/** Actions the given user may perform on the document right now. */
function availableActions(doc, user) {
    const def = getType(doc.doc_type);
    if (!def || !user) return [];
    return Object.entries(def.actions)
        .filter(([, a]) => a.from.includes(doc.status) && a.roles.includes(user.role))
        .map(([key, a]) => ({ key, label: a.label, to: a.to, requireReason: !!a.requireReason }));
}

/** Public, JSON-safe view of the registry for the frontend. */
function publicRegistry() {
    const types = {};
    for (const [key, def] of Object.entries(DOC_TYPES)) {
        types[key] = {
            prefix: def.prefix, titleTh: def.titleTh, titleEn: def.titleEn, side: def.side,
            isTaxDocument: def.isTaxDocument, deductsStock: def.deductsStock,
            listPage: def.listPage, editorPage: def.editorPage,
            createRoles: def.createRoles, primaryActions: def.primaryActions,
            actions: Object.fromEntries(Object.entries(def.actions).map(([k, a]) => [k, {
                label: a.label, from: a.from, to: a.to, roles: a.roles, requireReason: !!a.requireReason
            }]))
        };
    }
    return { statuses: STATUSES, receivableStatuses: RECEIVABLE_STATUSES, numbering: NUMBERING, types };
}

module.exports = {
    ROLES, STATUSES, STATUS_KEYS, RECEIVABLE_STATUSES, NUMBERING,
    DOC_TYPES, DOC_TYPE_KEYS,
    getType, isTaxDocument, availableActions, publicRegistry
};
