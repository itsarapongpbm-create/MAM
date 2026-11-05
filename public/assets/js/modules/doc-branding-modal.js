/**
 * FlowAccount Advance - Document Branding & Custom Settings Modal Module
 * จัดการปรับแต่งอัตลักษณ์แบรนด์ โลโก้ เฉดสี ตราประทับ และลายเซ็นของเอกสาร
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'mam_doc_branding';
    const DEFAULT_BRANDING = {
        themeColor: '#7D0A0A',
        logoSrc: '../assets/images/mam-logo.png',
        logoHeight: 48,
        stampSrc: '../assets/images/mam-stamp.svg',
        showCompanyStamp: true,
        signatureSrc: '',
        showSellerSign: true,
        showCustomerSign: true,
        showBankAccount: true,
        bankName: 'ธนาคารกสิกรไทย (KBANK)',
        bankBranch: 'สาขาจอมทอง',
        bankAccountName: 'บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด',
        bankAccountNumber: '',
        bankAccountType: 'กระแสรายวัน',
        showRemarks: true,
        defaultRemarks: ''
    };

    function getDocType() {
        if (typeof window.getDocType === 'function') {
            return window.getDocType();
        }
        const path = window.location.pathname.toLowerCase();
        if (path.includes('cash-sale')) return 'CASH_SALE';
        if (path.includes('purchase-order')) return 'PURCHASE_ORDER';
        if (path.includes('billing')) return 'BILLING_NOTE';
        if (path.includes('cash-invoice')) return 'RECEIPT';
        if (path.includes('receipt')) return 'RECEIPT';
        if (path.includes('invoice')) return 'TAX_INVOICE';
        return 'QUOTATION';
    }

    function showToast(msg, type = 'success', title = 'ตั้งค่ารูปแบบเอกสาร') {
        if (typeof window.showDocToast === 'function') {
            window.showDocToast({
                type: type,
                title: title,
                message: msg,
                duration: 2500
            });
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg);
        } else {
            console.log(`[Branding] ${title}: ${msg}`);
        }
    }

    function loadSavedBranding() {
        try {
            const raw = localStorage.getItem('mam_doc_branding') || localStorage.getItem('mam_document_branding');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.defaultRemarks && (parsed.defaultRemarks.includes('012-3-45892-1') || parsed.defaultRemarks.includes('123-4-56789-0'))) {
                    parsed.defaultRemarks = '';
                    try { localStorage.setItem('mam_doc_branding', JSON.stringify(parsed)); } catch(err){}
                }
                return Object.assign({}, DEFAULT_BRANDING, parsed);
            }
        } catch (e) {
            console.warn('Failed to parse branding settings from localStorage', e);
        }
        return Object.assign({}, DEFAULT_BRANDING);
    }

    let currentBranding = loadSavedBranding();
    let tempBranding = Object.assign({}, currentBranding);

    function applyBranding(b) {
        if (!b) return;

        // 1. Theme Color CSS Variable
        if (b.themeColor) {
            document.documentElement.style.setProperty('--doc-theme-color', b.themeColor);
            document.documentElement.style.setProperty('--primary-color', b.themeColor);
            document.querySelectorAll('.doc-main-title').forEach(el => {
                el.style.color = b.themeColor;
            });
            document.querySelectorAll('.btn-save-approve').forEach(el => {
                el.style.backgroundColor = b.themeColor;
                el.style.borderColor = b.themeColor;
            });
        }

        // 2. Company Logo
        const logoImgs = document.querySelectorAll('#docCompanyLogo, .company-logo-placeholder img');
        logoImgs.forEach(img => {
            if (b.logoSrc) img.src = b.logoSrc;
            img.style.height = (b.logoHeight || 48) + 'px';
        });

        // 3. Customer Signature Toggle
        const custSignBox = document.getElementById('customerSignatureBox') || document.querySelector('.signatures-grid .sig-card:first-child, .signatures-section .sig-card:first-child');
        const signGrid = document.getElementById('signaturesGrid') || document.querySelector('.signatures-section, .signatures-grid');
        if (custSignBox) {
            custSignBox.style.display = b.showCustomerSign ? 'flex' : 'none';
        }

        // 4. Center Company Stamp Box & Image Toggle
        const centerStampBox = document.getElementById('centerStampBox') || document.querySelector('.sig-card-stamp');
        if (centerStampBox) {
            centerStampBox.style.display = b.showCompanyStamp ? 'flex' : 'none';
        }
        const stampImg = document.getElementById('companyStampImg');
        if (stampImg) {
            if (b.stampSrc) stampImg.src = b.stampSrc;
            stampImg.style.display = b.showCompanyStamp ? 'block' : 'none';
        }

        // Update grid columns depending on visibility
        if (signGrid) {
            signGrid.classList.remove('single-sign', 'no-stamp');
            if (!b.showCustomerSign && !b.showCompanyStamp) {
                signGrid.classList.add('single-sign', 'no-stamp');
            } else if (!b.showCustomerSign) {
                signGrid.classList.add('single-sign');
            } else if (!b.showCompanyStamp) {
                signGrid.classList.add('no-stamp');
            }
        }

        // 5. Seller Signature Image
        let signImg = document.getElementById('sellerSignatureImg');
        if (signImg) {
            if (b.signatureSrc) signImg.src = b.signatureSrc;
            signImg.style.display = (b.showSellerSign !== false && b.signatureSrc) ? 'block' : 'none';
        }

        // 6. Bank Account Box Display (print preview & editor)
        const paymentAccountBoxes = document.querySelectorAll('.payment-account-box');
        paymentAccountBoxes.forEach(box => {
            if (box.textContent.includes('ได้รับชำระเงินเรียบร้อยแล้ว')) return;
            if (b.showBankAccount === false) {
                box.style.display = 'none';
            } else {
                box.style.display = 'block';
                const bName = b.bankName || 'ธนาคารกสิกรไทย (KBANK)';
                const bBranch = b.bankBranch || 'สาขาจอมทอง';
                const bAccName = b.bankAccountName || 'บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด';
                const bAccNo = b.bankAccountNumber || '-';
                const bAccType = b.bankAccountType || 'กระแสรายวัน';
                box.innerHTML = `
                    <strong>ข้อมูลการชำระเงินผ่านธนาคาร:</strong><br>
                    ${bName} ${bBranch}<br>
                    ชื่อบัญชี: ${bAccName} | เลขที่: <strong>${bAccNo}</strong> (${bAccType})
                `;
            }
        });

        // 7. Remarks Box Display (print preview)
        const notesBoxes = document.querySelectorAll('.notes-box');
        notesBoxes.forEach(nb => {
            if (b.showRemarks === false) {
                nb.style.display = 'none';
            } else {
                nb.style.display = 'block';
            }
        });

        // 8. Editor Remarks Checkbox Sync
        const chkShowRemarks = document.getElementById('chkShowRemarksOnDoc');
        if (chkShowRemarks && b.showRemarks !== undefined) {
            chkShowRemarks.checked = (b.showRemarks !== false);
        }
    }

    // Initialize signature role titles according to document type
    function initSignaturesSection() {
        const docType = getDocType();
        const ROLE_MAP = {
            QUOTATION: {
                buyer: 'ผู้สั่งซื้อสินค้า',
                approver: 'ผู้อนุมัติ / เสนอราคาโดย'
            },
            BILLING_NOTE: {
                buyer: 'ผู้รับใบวางบิล',
                approver: 'ผู้วางบิล / เจ้าหน้าที่การเงิน'
            },
            TAX_INVOICE: {
                buyer: 'ผู้รับสินค้า / ได้รับสินค้าครบถ้วน',
                approver: 'ผู้ส่งสินค้า / ผู้อนุมัติ'
            },
            RECEIPT: {
                buyer: 'ผู้ชำระเงิน',
                approver: 'ผู้รับเงิน / เจ้าหน้าที่การเงิน'
            },
            CASH_SALE: {
                buyer: 'ผู้ชำระเงิน / ผู้รับสินค้า',
                approver: 'ผู้รับเงิน / ผู้อนุมัติ'
            },
            PURCHASE_ORDER: {
                buyer: 'ผู้ขาย / ผู้รับคำสั่งซื้อ',
                approver: 'ผู้สั่งซื้อ / ผู้อนุมัติสั่งซื้อ'
            }
        };
        const roles = ROLE_MAP[docType] || ROLE_MAP.QUOTATION;
        const buyerEl = document.getElementById('sigBuyerRoleTitle');
        const approverEl = document.getElementById('sigApproverRoleTitle');
        if (buyerEl) buyerEl.textContent = roles.buyer;
        if (approverEl) approverEl.textContent = roles.approver;
    }

    // Ensure modal HTML, styles, and toolbar button exist (dynamic auto-inject for all document editor and print pages)
    function ensureElements() {
        const toolbarRight = document.querySelector('.toolbar-right');
        const printToolbar = document.querySelector('.print-toolbar .toolbar-group:last-child');
        const targetToolbar = toolbarRight || printToolbar;

        if (targetToolbar && !document.getElementById('btnDocSettings')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = toolbarRight ? 'btn-doc-settings' : 'btn-toolbar btn-secondary';
            btn.id = 'btnDocSettings';
            btn.title = 'ตั้งค่ารูปแบบเอกสาร';
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>ตั้งค่ารูปแบบเอกสาร</span>
            `;
            if (toolbarRight) {
                toolbarRight.insertBefore(btn, toolbarRight.firstChild);
            } else if (printToolbar) {
                printToolbar.insertBefore(btn, printToolbar.firstChild);
            }
        }

        // Auto-inject modal CSS if not already defined (ensures standalone operation on print.html)
        if (!document.getElementById('mamBrandingModalInjectedStyles')) {
            const style = document.createElement('style');
            style.id = 'mamBrandingModalInjectedStyles';
            style.textContent = `
                .branding-modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 10000; display: none; align-items: center; justify-content: center; padding: 20px; opacity: 0; transition: opacity 0.25s ease; }
                .branding-modal-backdrop.active { display: flex; opacity: 1; }
                .branding-modal { background: #ffffff; width: 100%; max-width: 600px; max-height: 90vh; border-radius: 16px; box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.9); display: flex; flex-direction: column; overflow: hidden; transform: scale(0.96) translateY(12px); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
                .branding-modal-backdrop.active .branding-modal { transform: scale(1) translateY(0); }
                .branding-modal-header { padding: 18px 22px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #ffffff; flex-shrink: 0; }
                .branding-modal-title { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px; font-family: 'Prompt', -apple-system, sans-serif; }
                .branding-modal-subtitle { margin: 3px 0 0; font-size: 12px; color: #64748b; font-family: 'Prompt', -apple-system, sans-serif; }
                .branding-btn-close { background: #f8fafc; border: 1px solid #e2e8f0; font-size: 18px; line-height: 1; color: #64748b; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
                .branding-btn-close:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
                .branding-modal-body { padding: 20px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; font-family: 'Prompt', -apple-system, sans-serif; }
                .branding-group { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
                .branding-group-title { font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
                .branding-group-title span.tag { font-size: 11px; font-weight: 500; color: #475569; background: #e2e8f0; padding: 2px 8px; border-radius: 10px; }
                .branding-logo-box { display: flex; align-items: center; gap: 16px; margin-bottom: 4px; }
                .branding-logo-preview-wrap { width: 120px; height: 68px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 8px; overflow: hidden; flex-shrink: 0; }
                .branding-logo-preview-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .branding-logo-actions { flex: 1; display: flex; flex-direction: column; gap: 8px; }
                .branding-btn-upload { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155; padding: 7px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
                .branding-btn-upload:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
                .branding-btn-reset-link { background: none; border: none; color: #64748b; font-size: 11.5px; cursor: pointer; text-align: left; padding: 0; text-decoration: underline; transition: color 0.15s; font-family: inherit; }
                .branding-btn-reset-link:hover { color: #dc2626; }
                .branding-size-selector { display: flex; align-items: center; gap: 10px; padding-top: 10px; border-top: 1px solid #eef2f6; }
                .branding-size-label { font-size: 12px; color: #64748b; font-weight: 500; }
                .branding-size-pills { display: flex; gap: 6px; }
                .branding-size-pill { background: #ffffff; border: 1px solid #cbd5e1; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all 0.15s; font-family: inherit; }
                .branding-size-pill.active { background: #0d9488; border-color: #0d9488; color: #ffffff; font-weight: 600; }
                .branding-palette-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                .branding-color-btn { width: 100%; height: 32px; border-radius: 8px; border: 2px solid transparent; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
                .branding-color-btn.active { border-color: #0f172a; transform: scale(1.08); box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
                .branding-custom-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
                .branding-color-picker-wrap { display: flex; align-items: center; gap: 6px; }
                .branding-color-picker-wrap input[type="color"] { -webkit-appearance: none; border: none; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; background: transparent; padding: 0; }
                .branding-hex-input { width: 90px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; font-family: monospace; text-transform: uppercase; }
                .branding-stamp-preview-wrap, .branding-sign-preview-wrap { height: 75px; }
                .branding-empty-sign { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #94a3b8; font-size: 11px; }
                .branding-item-hint { font-size: 11.5px; color: #64748b; line-height: 1.4; margin-top: 2px; }
                .branding-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
                .branding-toggle-info { flex: 1; padding-right: 16px; }
                .branding-toggle-title { font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 2px; }
                .branding-toggle-desc { font-size: 11.5px; color: #64748b; line-height: 1.4; }
                .branding-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
                .branding-switch input { opacity: 0; width: 0; height: 0; }
                .branding-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 24px; }
                .branding-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 50%; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
                .branding-switch input:checked + .branding-slider { background-color: #0d9488; }
                .branding-switch input:checked + .branding-slider:before { transform: translateX(20px); }
                .branding-persistence-note { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; font-size: 12px; color: #065f46; margin-top: 4px; }
                .branding-modal-footer { padding: 14px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
                .branding-btn-reset-all { background: transparent; border: none; color: #64748b; font-size: 12.5px; font-weight: 500; cursor: pointer; padding: 6px 10px; border-radius: 6px; transition: all 0.2s; font-family: inherit; }
                .branding-btn-reset-all:hover { background: #e2e8f0; color: #0f172a; }
                .branding-footer-actions { display: flex; gap: 10px; }
                .branding-btn-cancel { background: #ffffff; border: 1px solid #cbd5e1; color: #475569; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
                .branding-btn-cancel:hover { background: #f1f5f9; color: #0f172a; }
                .branding-btn-save { background: var(--doc-theme-color, #7D0A0A); border: none; color: #ffffff; padding: 7px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(125, 10, 10, 0.25); transition: all 0.2s; font-family: inherit; }
                .branding-btn-save:hover { filter: brightness(1.1); transform: translateY(-1px); }
                .branding-input-field { width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; font-family: inherit; color: #1e293b; background: #ffffff; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s; }
                .branding-input-field:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15); }
                .branding-textarea-field { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; font-family: inherit; color: #1e293b; background: #ffffff; box-sizing: border-box; line-height: 1.45; resize: vertical; transition: border-color 0.15s, box-shadow 0.15s; }
                .branding-textarea-field:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15); }
                .branding-bank-preview-box { font-size: 11px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 7px 10px; line-height: 1.4; color: #1e293b; transition: all 0.2s; }
            `;
            document.head.appendChild(style);
        }

        const existingModal = document.getElementById('brandingModalBackdrop');
        if (existingModal) {
            if (!existingModal.querySelector('#brandingBankName') || !existingModal.querySelector('#brandingDefaultRemarks')) {
                existingModal.remove();
            }
        }

        if (!document.getElementById('brandingModalBackdrop')) {
            const modalHtml = `
            <div class="branding-modal-backdrop" id="brandingModalBackdrop">
                <div class="branding-modal">
                    <div class="branding-modal-header">
                        <div>
                            <h3 class="branding-modal-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0d9488;">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                ตั้งค่ารูปแบบเอกสาร
                            </h3>
                            <p class="branding-modal-subtitle">ปรับแต่งอัตลักษณ์แบรนด์ โลโก้ เฉดสี ตราประทับ ข้อมูลธนาคาร และหมายเหตุเอกสาร</p>
                        </div>
                        <button type="button" class="branding-btn-close" id="btnCloseBrandingModal" title="ปิด">&times;</button>
                    </div>
                    <div class="branding-modal-body">
                        <!-- Group 1: โลโก้บริษัท -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>โลโก้บริษัท (Company Logo)</span>
                                <span class="tag">SVG, PNG, JPG</span>
                            </div>
                            <div class="branding-logo-box">
                                <div class="branding-logo-preview-wrap">
                                    <img id="brandingModalLogoPreview" src="../assets/images/mam-logo.png" alt="Logo Preview">
                                </div>
                                <div class="branding-logo-actions">
                                    <input type="file" id="brandingLogoFileInput" accept=".svg,.png,.jpg,.jpeg" style="display: none;">
                                    <button type="button" class="branding-btn-upload" id="btnUploadLogoTrigger">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                             <polyline points="17 8 12 3 7 8"></polyline>
                                            <line x1="12" y1="3" x2="12" y2="15"></line>
                                        </svg>
                                        อัปโหลดโลโก้ใหม่
                                    </button>
                                    <button type="button" class="branding-btn-reset-link" id="btnResetDefaultLogo">ใช้โลโก้เริ่มต้น MAM</button>
                                </div>
                            </div>
                            <div class="branding-size-selector">
                                <span class="branding-size-label">ขนาดความสูง:</span>
                                <div class="branding-size-pills">
                                    <button type="button" class="branding-size-pill" data-size="38">เล็ก (38px)</button>
                                    <button type="button" class="branding-size-pill active" data-size="48">มาตรฐาน (48px)</button>
                                    <button type="button" class="branding-size-pill" data-size="64">ใหญ่ (64px)</button>
                                </div>
                            </div>
                        </div>

                        <!-- Group 2: เฉดสีธีมเอกสาร -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>เฉดสีธีมเอกสาร (Theme Palette)</span>
                                <span class="tag" id="currentColorLabelTag">#7D0A0A</span>
                            </div>
                            <div class="branding-palette-grid">
                                <button type="button" class="branding-color-btn active" data-color="#7D0A0A" style="background: #7D0A0A;" title="MAM Crimson (#7D0A0A)"></button>
                                <button type="button" class="branding-color-btn" data-color="#0d9488" style="background: #0d9488;" title="Teal (#0d9488)"></button>
                                <button type="button" class="branding-color-btn" data-color="#0891b2" style="background: #0891b2;" title="Cyan (#0891b2)"></button>
                                <button type="button" class="branding-color-btn" data-color="#2563eb" style="background: #2563eb;" title="Blue (#2563eb)"></button>
                                <button type="button" class="branding-color-btn" data-color="#7c3aed" style="background: #7c3aed;" title="Violet (#7c3aed)"></button>
                                <button type="button" class="branding-color-btn" data-color="#ea580c" style="background: #ea580c;" title="Orange (#ea580c)"></button>
                                <button type="button" class="branding-color-btn" data-color="#475569" style="background: #475569;" title="Slate (#475569)"></button>
                            </div>
                            <div class="branding-custom-row">
                                <div class="branding-color-picker-wrap">
                                    <input type="color" id="brandingCustomColorPicker" value="#7D0A0A">
                                    <label for="brandingCustomColorPicker" style="font-size: 12.5px; color: #475569; cursor: pointer; font-weight: 500;">เลือกสีอิสระ:</label>
                                </div>
                                <input type="text" id="brandingHexInput" class="branding-hex-input" value="#7D0A0A" maxlength="7" placeholder="#000000">
                            </div>
                        </div>

                        <!-- Group 3: ตราประทับบริษัท (Company Stamp) -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>ตราประทับบริษัท (Company Stamp)</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="tag">SVG, PNG, JPG</span>
                                    <label class="branding-switch" title="เปิด/ปิด การแสดงตรายาง">
                                        <input type="checkbox" id="brandingToggleCompanyStamp" checked>
                                        <span class="branding-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="branding-logo-box">
                                <div class="branding-logo-preview-wrap branding-stamp-preview-wrap">
                                    <img id="brandingModalStampPreview" src="../assets/images/mam-stamp.svg" alt="Stamp Preview">
                                </div>
                                <div class="branding-logo-actions">
                                    <input type="file" id="brandingStampFileInput" accept=".svg,.png,.jpg,.jpeg" style="display: none;">
                                    <button type="button" class="branding-btn-upload" id="btnUploadStampTrigger">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="17 8 12 3 7 8"></polyline>
                                            <line x1="12" y1="3" x2="12" y2="15"></line>
                                        </svg>
                                        อัปโหลดตรายางใหม่
                                    </button>
                                    <button type="button" class="branding-btn-reset-link" id="btnResetDefaultStamp">ใช้ตรายางเริ่มต้น MAM</button>
                                </div>
                            </div>
                            <div class="branding-item-hint">
                                แสดงตราประทับดิจิทัลรับรองความถูกต้องบนช่องลงนามของผู้จัดทำเอกสาร
                            </div>
                        </div>

                        <!-- Group 4: ลายเซ็นผู้ขาย / ผู้จัดทำเอกสาร (Seller Signature) -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>ลายเซ็นผู้ขาย / ผู้จัดทำ (Seller Signature)</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="tag">PNG, SVG, JPG</span>
                                    <label class="branding-switch" title="เปิด/ปิด การแสดงลายเซ็นผู้ขาย">
                                        <input type="checkbox" id="brandingToggleSellerSign" checked>
                                        <span class="branding-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="branding-logo-box">
                                <div class="branding-logo-preview-wrap branding-sign-preview-wrap">
                                    <img id="brandingModalSignPreview" src="" alt="Signature Preview" style="display: none;">
                                    <div id="brandingSignEmptyPlaceholder" class="branding-empty-sign">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                        </svg>
                                        <span>ยังไม่มีลายเซ็น</span>
                                    </div>
                                </div>
                                <div class="branding-logo-actions">
                                    <input type="file" id="brandingSignFileInput" accept=".png,.svg,.jpg,.jpeg" style="display: none;">
                                    <button type="button" class="branding-btn-upload" id="btnUploadSignTrigger">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="17 8 12 3 7 8"></polyline>
                                            <line x1="12" y1="3" x2="12" y2="15"></line>
                                        </svg>
                                        อัปโหลดรูปลายเซ็น
                                    </button>
                                    <button type="button" class="branding-btn-reset-link" id="btnClearSignature">ลบรูปลายเซ็น</button>
                                </div>
                            </div>
                            <div class="branding-item-hint">
                                แนะนำใช้รูปภาพโปร่งใส (PNG Transparent) เพื่อให้วางซ้อนเหนือเส้นลงนามได้อย่างเป็นธรรมชาติ
                            </div>
                        </div>

                        <!-- Group 5: ข้อมูลการชำระเงินผ่านธนาคาร (Bank Account) -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>ข้อมูลการชำระเงินผ่านธนาคาร (Bank Account)</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="tag">แสดงบนเอกสาร</span>
                                    <label class="branding-switch" title="เปิด/ปิด การแสดงข้อมูลบัญชีธนาคารบนเอกสาร">
                                        <input type="checkbox" id="brandingToggleBankAccount" checked>
                                        <span class="branding-slider"></span>
                                    </label>
                                </div>
                            </div>
                            
                            <div id="brandingBankFieldsWrap" style="display: flex; flex-direction: column; gap: 10px; margin-top: 2px;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                    <div>
                                        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">ธนาคาร:</label>
                                        <input type="text" id="brandingBankName" class="branding-input-field" placeholder="เช่น ธนาคารไทยพาณิชย์ (SCB)">
                                    </div>
                                    <div>
                                        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">สาขา:</label>
                                        <input type="text" id="brandingBankBranch" class="branding-input-field" placeholder="เช่น สาขาสาทรซิตี้ ทาวเวอร์">
                                    </div>
                                </div>

                                <div style="display: grid; grid-template-columns: 1.2fr 1fr 0.9fr; gap: 10px;">
                                    <div>
                                        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">ชื่อบัญชี:</label>
                                        <input type="text" id="brandingBankAccountName" class="branding-input-field" placeholder="ชื่อบัญชีบริษัท">
                                    </div>
                                    <div>
                                        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">เลขที่บัญชี:</label>
                                        <input type="text" id="brandingBankAccountNumber" class="branding-input-field" placeholder="xxx-x-xxxxx-x">
                                    </div>
                                    <div>
                                        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">ประเภทบัญชี:</label>
                                        <input type="text" id="brandingBankAccountType" class="branding-input-field" placeholder="เช่น กระแสรายวัน, ออมทรัพย์">
                                    </div>
                                </div>

                                <!-- Live Preview of Payment Account Box -->
                                <div style="margin-top: 4px;">
                                    <div style="font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                                        <span>ตัวอย่างการแสดงผลบนเอกสาร:</span>
                                        <span id="brandingBankStatusLabel" style="font-size: 11px; color: #0d9488; font-weight: 500;">แสดงผลปกติ</span>
                                    </div>
                                    <div id="brandingBankPreviewBox" class="branding-bank-preview-box">
                                        <strong>ข้อมูลการชำระเงินผ่านธนาคาร:</strong><br>
                                        <span id="previewBankLine1">ธนาคารกสิกรไทย (KBANK) สาขาจอมทอง</span><br>
                                        ชื่อบัญชี: <span id="previewBankName">บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด</span> | เลขที่: <strong id="previewBankNo">-</strong> (<span id="previewBankType">กระแสรายวัน</span>)
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Group 6: หมายเหตุเอกสารเริ่มต้น (Default Remarks) -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>หมายเหตุเอกสารเริ่มต้น (Default Remarks)</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="tag">แสดงบนเอกสาร</span>
                                    <label class="branding-switch" title="เปิด/ปิด การแสดงหมายเหตุบนเอกสาร">
                                        <input type="checkbox" id="brandingToggleRemarks" checked>
                                        <span class="branding-slider"></span>
                                    </label>
                                </div>
                            </div>
                            
                            <div id="brandingRemarksWrap" style="display: flex; flex-direction: column; gap: 8px; margin-top: 2px;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block;">ข้อความหมายเหตุเริ่มต้น (จะถูกใส่ในเอกสารใหม่อัตโนมัติ):</label>
                                <textarea id="brandingDefaultRemarks" class="branding-textarea-field" rows="3" placeholder="ระบุข้อความหมายเหตุเริ่มต้น เช่น เงื่อนไขการชำระ หรือข้อกำหนด"></textarea>
                                
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div class="branding-item-hint" style="margin-top: 0;">
                                        บันทึกหมายเหตุไว้ใช้เป็นค่าเริ่มต้นสำหรับเอกสารใหม่ทุกฉบับ
                                    </div>
                                    <div style="display: flex; gap: 10px;">
                                        <button type="button" class="branding-btn-reset-link" id="btnClearDefaultRemarks">ล้างข้อความ</button>
                                        <button type="button" class="branding-btn-reset-link" id="btnResetDefaultRemarks">ใช้ข้อความแนะนำ</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Group 7: การแสดงผลเพิ่มเติม (Display Options) -->
                        <div class="branding-group">
                            <div class="branding-group-title">
                                <span>ตัวเลือกเพิ่มเติม (Display Options)</span>
                            </div>
                            <div class="branding-toggle-row">
                                <div class="branding-toggle-info">
                                    <div class="branding-toggle-title">ช่องลายเซ็นลูกค้า (Customer Signature)</div>
                                    <div class="branding-toggle-desc">แสดงช่องให้ลูกค้าลงนามอนุมัติสั่งซื้อ / ยอมรับเอกสาร</div>
                                </div>
                                <label class="branding-switch">
                                    <input type="checkbox" id="brandingToggleCustomerSign" checked>
                                    <span class="branding-slider"></span>
                                </label>
                            </div>
                            <div class="branding-persistence-note">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                </svg>
                                <span>จดจำการตั้งค่าโลโก้ ตรายาง ลายเซ็น ข้อมูลธนาคาร และหมายเหตุ ไว้ใช้กับเอกสารทุกใบอัตโนมัติ</span>
                            </div>
                        </div>
                    </div>
                    <div class="branding-modal-footer">
                        <button type="button" class="branding-btn-reset-all" id="btnBrandingResetAll">รีเซ็ตค่าเริ่มต้น</button>
                        <div class="branding-footer-actions">
                            <button type="button" class="branding-btn-cancel" id="btnBrandingCancel">ยกเลิก</button>
                            <button type="button" class="branding-btn-save" id="btnBrandingSave">บันทึกการตั้งค่า</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    }

    let isInitialized = false;

    function initBrandingManager() {
        currentBranding = loadSavedBranding();
        tempBranding = Object.assign({}, currentBranding);

        ensureElements();
        initSignaturesSection();
        applyBranding(currentBranding);

        if (isInitialized) return;
        isInitialized = true;

        // Modal Elements
        const modalBackdrop = document.getElementById('brandingModalBackdrop');
        const btnDocSettings = document.getElementById('btnDocSettings');
        const btnCloseModal = document.getElementById('btnCloseBrandingModal');
        const btnCancel = document.getElementById('btnBrandingCancel');
        const btnSave = document.getElementById('btnBrandingSave');
        const btnResetAll = document.getElementById('btnBrandingResetAll');

        // Logo Controls
        const previewImg = document.getElementById('brandingModalLogoPreview');
        const fileInput = document.getElementById('brandingLogoFileInput');
        const btnUploadTrigger = document.getElementById('btnUploadLogoTrigger');
        const btnResetLogo = document.getElementById('btnResetDefaultLogo');
        const sizePills = document.querySelectorAll('.branding-size-pill');

        // Palette Controls
        const colorBtns = document.querySelectorAll('.branding-color-btn');
        const customColorPicker = document.getElementById('brandingCustomColorPicker');
        const hexInput = document.getElementById('brandingHexInput');
        const colorTag = document.getElementById('currentColorLabelTag');

        // Stamp Controls
        const previewStamp = document.getElementById('brandingModalStampPreview');
        const stampFileInput = document.getElementById('brandingStampFileInput');
        const btnUploadStamp = document.getElementById('btnUploadStampTrigger');
        const btnResetStamp = document.getElementById('btnResetDefaultStamp');
        const toggleStamp = document.getElementById('brandingToggleCompanyStamp');

        // Signature Controls
        const previewSign = document.getElementById('brandingModalSignPreview');
        const signPlaceholder = document.getElementById('brandingSignEmptyPlaceholder');
        const signFileInput = document.getElementById('brandingSignFileInput');
        const btnUploadSign = document.getElementById('btnUploadSignTrigger');
        const btnClearSign = document.getElementById('btnClearSignature');
        const toggleSellerSign = document.getElementById('brandingToggleSellerSign');
        const toggleCustSign = document.getElementById('brandingToggleCustomerSign');

        // Bank Account Controls
        const toggleBankAccount = document.getElementById('brandingToggleBankAccount');
        const brandingBankName = document.getElementById('brandingBankName');
        const brandingBankBranch = document.getElementById('brandingBankBranch');
        const brandingBankAccountName = document.getElementById('brandingBankAccountName');
        const brandingBankAccountNumber = document.getElementById('brandingBankAccountNumber');
        const brandingBankAccountType = document.getElementById('brandingBankAccountType');
        const previewBankLine1 = document.getElementById('previewBankLine1');
        const previewBankName = document.getElementById('previewBankName');
        const previewBankNo = document.getElementById('previewBankNo');
        const previewBankType = document.getElementById('previewBankType');
        const bankFieldsWrap = document.getElementById('brandingBankFieldsWrap');
        const bankPreviewBox = document.getElementById('brandingBankPreviewBox');
        const bankStatusLabel = document.getElementById('brandingBankStatusLabel');

        // Remarks Controls
        const toggleRemarks = document.getElementById('brandingToggleRemarks');
        const brandingDefaultRemarks = document.getElementById('brandingDefaultRemarks');
        const remarksWrap = document.getElementById('brandingRemarksWrap');
        const btnResetDefaultRemarks = document.getElementById('btnResetDefaultRemarks');
        const btnClearDefaultRemarks = document.getElementById('btnClearDefaultRemarks');

        function updateBankPreview() {
            const bName = (brandingBankName ? brandingBankName.value : (tempBranding.bankName || 'ธนาคารกสิกรไทย (KBANK)')).trim();
            const bBranch = (brandingBankBranch ? brandingBankBranch.value : (tempBranding.bankBranch || 'สาขาจอมทอง')).trim();
            const bAccName = (brandingBankAccountName ? brandingBankAccountName.value : (tempBranding.bankAccountName || 'บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด')).trim();
            const bAccNo = (brandingBankAccountNumber ? brandingBankAccountNumber.value : (tempBranding.bankAccountNumber || '-')).trim();
            const bAccType = (brandingBankAccountType ? brandingBankAccountType.value : (tempBranding.bankAccountType || 'กระแสรายวัน')).trim();

            if (previewBankLine1) previewBankLine1.textContent = `${bName} ${bBranch}`;
            if (previewBankName) previewBankName.textContent = bAccName;
            if (previewBankNo) previewBankNo.textContent = bAccNo;
            if (previewBankType) previewBankType.textContent = bAccType;

            const isEnabled = toggleBankAccount ? toggleBankAccount.checked : true;
            if (bankFieldsWrap) {
                bankFieldsWrap.style.opacity = isEnabled ? '1' : '0.45';
            }
            if (bankPreviewBox) {
                bankPreviewBox.style.display = isEnabled ? 'block' : 'none';
            }
            if (bankStatusLabel) {
                bankStatusLabel.textContent = isEnabled ? 'แสดงผลปกติ' : 'ปิดการแสดงผลบนเอกสาร';
                bankStatusLabel.style.color = isEnabled ? '#0d9488' : '#94a3b8';
            }
        }

        function updateRemarksPreview() {
            const isEnabled = toggleRemarks ? toggleRemarks.checked : true;
            if (remarksWrap) {
                remarksWrap.style.opacity = isEnabled ? '1' : '0.45';
            }
        }

        function syncModalUI(state) {
            // Logo
            if (previewImg && state.logoSrc) previewImg.src = state.logoSrc;

            if (sizePills) {
                sizePills.forEach(p => {
                    if (parseInt(p.dataset.size, 10) === (state.logoHeight || 48)) {
                        p.classList.add('active');
                    } else {
                        p.classList.remove('active');
                    }
                });
            }

            // Theme color
            const activeColor = (state.themeColor || '#7D0A0A').toLowerCase();
            if (colorBtns) {
                colorBtns.forEach(btn => {
                    if (btn.dataset.color.toLowerCase() === activeColor) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            if (customColorPicker) customColorPicker.value = state.themeColor || '#7D0A0A';
            if (hexInput) hexInput.value = (state.themeColor || '#7D0A0A').toUpperCase();
            if (colorTag) colorTag.textContent = (state.themeColor || '#7D0A0A').toUpperCase();

            // Stamp
            if (previewStamp) previewStamp.src = state.stampSrc || '../assets/images/mam-stamp.svg';
            if (toggleStamp) toggleStamp.checked = !!state.showCompanyStamp;

            // Seller Signature
            if (toggleSellerSign) toggleSellerSign.checked = state.showSellerSign !== false;
            if (state.signatureSrc) {
                if (previewSign) {
                    previewSign.src = state.signatureSrc;
                    previewSign.style.display = 'block';
                }
                if (signPlaceholder) signPlaceholder.style.display = 'none';
            } else {
                if (previewSign) previewSign.style.display = 'none';
                if (signPlaceholder) signPlaceholder.style.display = 'flex';
            }

            // Customer Signature
            if (toggleCustSign) toggleCustSign.checked = !!state.showCustomerSign;

            // Bank Account
            if (toggleBankAccount) toggleBankAccount.checked = state.showBankAccount !== false;
            if (brandingBankName) brandingBankName.value = state.bankName || 'ธนาคารกสิกรไทย (KBANK)';
            if (brandingBankBranch) brandingBankBranch.value = state.bankBranch || 'สาขาจอมทอง';
            if (brandingBankAccountName) brandingBankAccountName.value = state.bankAccountName || 'บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด';
            if (brandingBankAccountNumber) brandingBankAccountNumber.value = state.bankAccountNumber || '';
            if (brandingBankAccountType) brandingBankAccountType.value = state.bankAccountType || 'กระแสรายวัน';
            updateBankPreview();

            // Remarks
            if (toggleRemarks) toggleRemarks.checked = state.showRemarks !== false;
            if (brandingDefaultRemarks) brandingDefaultRemarks.value = state.defaultRemarks !== undefined ? state.defaultRemarks : DEFAULT_BRANDING.defaultRemarks;
            updateRemarksPreview();
        }

        function openModal() {
            tempBranding = Object.assign({}, currentBranding);
            syncModalUI(tempBranding);
            if (modalBackdrop) modalBackdrop.classList.add('active');
        }

        function closeModal(revert = false) {
            if (revert) {
                applyBranding(currentBranding);
            }
            if (modalBackdrop) modalBackdrop.classList.remove('active');
        }

        // Event Listeners
        if (btnDocSettings) {
            btnDocSettings.addEventListener('click', openModal);
        }
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => closeModal(true));
        }
        if (btnCancel) {
            btnCancel.addEventListener('click', () => closeModal(true));
        }
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) closeModal(true);
            });
        }

        // Logo Upload
        if (btnUploadTrigger && fileInput) {
            btnUploadTrigger.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!file.type.match(/(svg|png|jpeg|jpg)/i)) {
                    showToast('กรุณาเลือกไฟล์รูปภาพประเภท SVG, PNG หรือ JPG', 'warning', 'ประเภทไฟล์ไม่ถูกต้อง');
                    return;
                }

                if (file.size > 3 * 1024 * 1024) {
                    showToast('ขนาดไฟล์ต้องไม่เกิน 3MB', 'warning', 'ขนาดไฟล์เกินกำหนด');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    const dataUrl = loadEvent.target.result;
                    tempBranding.logoSrc = dataUrl;
                    if (previewImg) previewImg.src = dataUrl;
                    applyBranding(tempBranding);
                };
                reader.readAsDataURL(file);
            });
        }

        // Reset Logo
        if (btnResetLogo) {
            btnResetLogo.addEventListener('click', () => {
                tempBranding.logoSrc = '../assets/images/mam-logo.png';
                if (previewImg) previewImg.src = tempBranding.logoSrc;
                applyBranding(tempBranding);
            });
        }

        // Size Pills
        if (sizePills) {
            sizePills.forEach(pill => {
                pill.addEventListener('click', () => {
                    sizePills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    tempBranding.logoHeight = parseInt(pill.dataset.size, 10);
                    applyBranding(tempBranding);
                });
            });
        }

        // Preset Color Buttons
        if (colorBtns) {
            colorBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    colorBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const color = btn.dataset.color;
                    tempBranding.themeColor = color;
                    if (customColorPicker) customColorPicker.value = color;
                    if (hexInput) hexInput.value = color.toUpperCase();
                    if (colorTag) colorTag.textContent = color.toUpperCase();
                    applyBranding(tempBranding);
                });
            });
        }

        // Custom Color Picker & Hex Input
        function handleCustomColorChange(colorVal) {
            if (!colorVal) return;
            tempBranding.themeColor = colorVal;
            if (colorTag) colorTag.textContent = colorVal.toUpperCase();

            // Highlight matching preset or deselect all
            if (colorBtns) {
                colorBtns.forEach(btn => {
                    if (btn.dataset.color.toLowerCase() === colorVal.toLowerCase()) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
            applyBranding(tempBranding);
        }

        if (customColorPicker) {
            customColorPicker.addEventListener('input', (e) => {
                const val = e.target.value;
                if (hexInput) hexInput.value = val.toUpperCase();
                handleCustomColorChange(val);
            });
        }

        if (hexInput) {
            hexInput.addEventListener('input', (e) => {
                let val = e.target.value.trim();
                if (!val.startsWith('#')) val = '#' + val;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    if (customColorPicker) customColorPicker.value = val;
                    handleCustomColorChange(val);
                }
            });
        }

        // Stamp Upload
        if (btnUploadStamp && stampFileInput) {
            btnUploadStamp.addEventListener('click', () => stampFileInput.click());
            stampFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!file.type.match(/(svg|png|jpeg|jpg)/i)) {
                    showToast('กรุณาเลือกไฟล์รูปภาพประเภท SVG, PNG หรือ JPG', 'warning', 'ประเภทไฟล์ไม่ถูกต้อง');
                    return;
                }

                if (file.size > 3 * 1024 * 1024) {
                    showToast('ขนาดไฟล์ต้องไม่เกิน 3MB', 'warning', 'ขนาดไฟล์เกินกำหนด');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    const dataUrl = loadEvent.target.result;
                    tempBranding.stampSrc = dataUrl;
                    if (previewStamp) previewStamp.src = dataUrl;
                    applyBranding(tempBranding);
                };
                reader.readAsDataURL(file);
            });
        }

        // Reset Stamp
        if (btnResetStamp) {
            btnResetStamp.addEventListener('click', () => {
                tempBranding.stampSrc = '../assets/images/mam-stamp.svg';
                if (previewStamp) previewStamp.src = tempBranding.stampSrc;
                applyBranding(tempBranding);
            });
        }

        // Seller Signature Upload
        if (btnUploadSign && signFileInput) {
            btnUploadSign.addEventListener('click', () => signFileInput.click());
            signFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!file.type.match(/(png|svg|jpeg|jpg)/i)) {
                    showToast('กรุณาเลือกไฟล์รูปภาพประเภท PNG, SVG หรือ JPG', 'warning', 'ประเภทไฟล์ไม่ถูกต้อง');
                    return;
                }

                if (file.size > 3 * 1024 * 1024) {
                    showToast('ขนาดไฟล์ต้องไม่เกิน 3MB', 'warning', 'ขนาดไฟล์เกินกำหนด');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    const dataUrl = loadEvent.target.result;
                    tempBranding.signatureSrc = dataUrl;
                    if (previewSign) {
                        previewSign.src = dataUrl;
                        previewSign.style.display = 'block';
                    }
                    if (signPlaceholder) signPlaceholder.style.display = 'none';
                    applyBranding(tempBranding);
                };
                reader.readAsDataURL(file);
            });
        }

        // Clear Seller Signature
        if (btnClearSign) {
            btnClearSign.addEventListener('click', () => {
                tempBranding.signatureSrc = '';
                if (previewSign) previewSign.style.display = 'none';
                if (signPlaceholder) signPlaceholder.style.display = 'flex';
                applyBranding(tempBranding);
            });
        }

        // Toggles
        if (toggleStamp) {
            toggleStamp.addEventListener('change', (e) => {
                tempBranding.showCompanyStamp = e.target.checked;
                applyBranding(tempBranding);
            });
        }

        if (toggleSellerSign) {
            toggleSellerSign.addEventListener('change', (e) => {
                tempBranding.showSellerSign = e.target.checked;
                applyBranding(tempBranding);
            });
        }

        if (toggleCustSign) {
            toggleCustSign.addEventListener('change', (e) => {
                tempBranding.showCustomerSign = e.target.checked;
                applyBranding(tempBranding);
            });
        }

        // Bank Account Listeners
        [brandingBankName, brandingBankBranch, brandingBankAccountName, brandingBankAccountNumber, brandingBankAccountType].forEach(inp => {
            if (inp) {
                inp.addEventListener('input', () => {
                    tempBranding.bankName = brandingBankName ? brandingBankName.value : '';
                    tempBranding.bankBranch = brandingBankBranch ? brandingBankBranch.value : '';
                    tempBranding.bankAccountName = brandingBankAccountName ? brandingBankAccountName.value : '';
                    tempBranding.bankAccountNumber = brandingBankAccountNumber ? brandingBankAccountNumber.value : '';
                    tempBranding.bankAccountType = brandingBankAccountType ? brandingBankAccountType.value : '';
                    updateBankPreview();
                });
            }
        });

        if (toggleBankAccount) {
            toggleBankAccount.addEventListener('change', (e) => {
                tempBranding.showBankAccount = e.target.checked;
                updateBankPreview();
                applyBranding(tempBranding);
            });
        }

        // Remarks Listeners
        if (brandingDefaultRemarks) {
            brandingDefaultRemarks.addEventListener('input', () => {
                tempBranding.defaultRemarks = brandingDefaultRemarks.value;
            });
        }

        if (toggleRemarks) {
            toggleRemarks.addEventListener('change', (e) => {
                tempBranding.showRemarks = e.target.checked;
                updateRemarksPreview();
                applyBranding(tempBranding);
            });
        }

        if (btnResetDefaultRemarks) {
            btnResetDefaultRemarks.addEventListener('click', () => {
                const recommendedRemarks = '1. กรุณาชำระเงินภายในกำหนดเวลาที่ระบุในเอกสาร\n2. หากชำระด้วยเช็ค กรุณาสั่งจ่ายในนาม บริษัท แมม ดีไซน์ แอนด์ เซอร์วิส จำกัด ขีดคร่อม A/C PAYEE ONLY';
                tempBranding.defaultRemarks = recommendedRemarks;
                if (brandingDefaultRemarks) brandingDefaultRemarks.value = recommendedRemarks;
            });
        }

        if (btnClearDefaultRemarks) {
            btnClearDefaultRemarks.addEventListener('click', () => {
                tempBranding.defaultRemarks = '';
                if (brandingDefaultRemarks) brandingDefaultRemarks.value = '';
            });
        }

        // Reset All Defaults
        if (btnResetAll) {
            btnResetAll.addEventListener('click', () => {
                if (confirm('คุณต้องการรีเซ็ตการตั้งค่ารูปแบบเอกสารทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?')) {
                    tempBranding = Object.assign({}, DEFAULT_BRANDING);
                    syncModalUI(tempBranding);
                    applyBranding(tempBranding);
                }
            });
        }

        // Save
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                currentBranding = Object.assign({}, tempBranding);
                try {
                    localStorage.setItem('mam_doc_branding', JSON.stringify(currentBranding));
                    localStorage.setItem('mam_document_branding', JSON.stringify(currentBranding));
                } catch (e) {
                    console.error('Failed to save branding in localStorage', e);
                }
                applyBranding(currentBranding);
                closeModal(false);
                showToast('บันทึกการตั้งค่ารูปแบบเอกสารเรียบร้อยแล้ว');

                // Trigger site-wide reactive update
                window.dispatchEvent(new CustomEvent('mam:branding-updated'));
                window.dispatchEvent(new Event('storage'));
                if (window.ThemeManager && typeof window.ThemeManager.apply === 'function') {
                    window.ThemeManager.apply();
                }
            });
        }
    }

    window.initBrandingManager = initBrandingManager;
    window.applyDocBranding = applyBranding;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBrandingManager);
    } else {
        initBrandingManager();
    }
})();
