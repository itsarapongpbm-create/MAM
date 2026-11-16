/**
 * FlowAccount Advance - Global Standard Navigation Bar Component
 * MAM DESIGN AND SERVICE CO., LTD.
 *
 * Provides a unified, consistent top header across all pages with:
 * - Fixed 64px height and responsive flexbox alignment
 * - Universal company brand identity and logo
 * - Responsive sidebar toggle (desktop collapse & mobile drawer)
 * - User profile dropdown with live user session sync
 * - Notification bell and help/guide shortcuts
 */

(function () {
    'use strict';

    if (window.__MAM_GLOBAL_NAVBAR_LOADED__) return;
    window.__MAM_GLOBAL_NAVBAR_LOADED__ = true;

    // Golden HTML template for the Top Navbar
    const GLOBAL_NAVBAR_HTML = `
        <div class="nav-left">
            <button class="btn-toggle-sidebar" id="toggleSidebarBtn" aria-label="Toggle menu" title="เปิด/ปิด เมนูด้านข้าง">
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>
            <a href="/dashboard/index.html" class="topbar-logo" title="หน้าหลักภาพรวมธุรกิจ">
                <img src="/assets/images/mam-logo.png" alt="MAM DESIGN AND SERVICE" style="height: 38px; width: auto; object-fit: contain;">
            </a>
            <div class="topbar-divider"></div>
            <div class="topbar-company-info">
                <span class="topbar-company-name" id="topbarCompanyName">บริษัท เอ็มเอเอ็ม ดีไซน์แอนด์เซอร์วิส จำกัด</span>
                <span class="badge-advance">INTERNAL CRM</span>
            </div>
        </div>

        <div class="nav-right">
            <!-- Notification Bell -->
            <button class="icon-button" id="topbarNotificationBtn" title="การแจ้งเตือน">
                <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span class="notification-badge" id="topbarNotificationBadge" style="display: none;">0</span>
            </button>

            <!-- Help & Support -->
            <button class="icon-button" id="topbarHelpBtn" title="ช่วยเหลือ / คู่มือ">
                <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </button>

            <div class="topbar-divider"></div>

            <!-- User Menu -->
            <div class="user-profile-menu">
                <button class="user-avatar-btn" id="userMenuBtn" type="button" aria-expanded="false" title="โปรไฟล์ผู้ใช้งาน">
                    <img src="https://ui-avatars.com/api/?name=Itsarapong+Po&background=7D0A0A&color=fff&size=64" alt="User Avatar" class="user-avatar-img" id="topbarUserAvatar">
                    <span class="user-display-name" id="topbarUserDisplayName">คุณอิศรพงศ์ โพธิ์งาม</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="user-dropdown-menu" id="userDropdownContent">
                    <div class="user-dropdown-header">
                        <strong id="dropdownUserFullName">Itsarapong P.</strong>
                        <small id="dropdownUserEmail">itsarapong@mamdesign.co.th</small>
                    </div>
                    <a href="/settings/users.html" class="dropdown-item">
                        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        <span>จัดการผู้ใช้งานและสิทธิ์</span>
                    </a>
                    <a href="/admin-web/settings.html" class="dropdown-item" id="openCompanyInfoLink">
                        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="22.01"></line><line x1="15" y1="22" x2="15" y2="22.01"></line><line x1="9" y1="6" x2="9" y2="6.01"></line><line x1="15" y1="6" x2="15" y2="6.01"></line><line x1="9" y1="10" x2="9" y2="10.01"></line><line x1="15" y1="10" x2="15" y2="10.01"></line><line x1="9" y1="14" x2="9" y2="14.01"></line><line x1="15" y1="14" x2="15" y2="14.01"></line><line x1="9" y1="18" x2="9" y2="18.01"></line><line x1="15" y1="18" x2="15" y2="18.01"></line></svg>
                        <span>ข้อมูลองค์กร (MAM DESIGN AND SERVICE)</span>
                    </a>
                    <div class="dropdown-divider"></div>
                    <a href="/auth/login.html" class="dropdown-item text-danger" id="topbarLogoutBtn">
                        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>ออกจากระบบ (Logout)</span>
                    </a>
                </div>
            </div>
        </div>
    `;

    function initGlobalNavbar() {
        const topNavbar = document.querySelector('header.top-navbar');
        if (!topNavbar) return;

        const existingSmtpPill = topNavbar.querySelector('#smtpStatusPill');
        const smtpPillClone = existingSmtpPill ? existingSmtpPill.cloneNode(true) : null;

        // If the navbar is missing critical elements (like dropdown or user menu), standardize it
        const hasCompleteNav = topNavbar.querySelector('#userDropdownContent') &&
                               topNavbar.querySelector('#topbarNotificationBtn') &&
                               topNavbar.querySelector('#topbarHelpBtn');

        if (!hasCompleteNav) {
            topNavbar.innerHTML = GLOBAL_NAVBAR_HTML;
            if (smtpPillClone) {
                const navRight = topNavbar.querySelector('.nav-right');
                if (navRight) {
                    navRight.insertBefore(smtpPillClone, navRight.firstChild);
                }
            }
        } else {
            const notifBadge = topNavbar.querySelector('.notification-badge');
            if (notifBadge && notifBadge.textContent.trim() === '3') {
                notifBadge.textContent = '0';
                notifBadge.style.display = 'none';
            }
        }

        // Attach event listeners safely
        setupSidebarToggle();
        setupUserDropdown();
        setupTopbarActionButtons();
        setupLogout();
        syncUserData();
        syncCompanyData();

        if (typeof window.applyRolePermissions === 'function') {
            window.applyRolePermissions();
        }
        if (typeof window.updateSidebarPendingBadges === 'function') {
            window.updateSidebarPendingBadges();
        }
    }

    function openBuiltInCompanyModal() {
        let modal = document.getElementById('mamGlobalCompanyModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mamGlobalCompanyModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
            modal.innerHTML = `
                <div style="background:#ffffff;border-radius:14px;width:100%;max-width:560px;box-shadow:0 24px 48px rgba(15,23,42,0.25);overflow:hidden;font-family:var(--font-main, \'Prompt\', sans-serif);">
                    <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
                        <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">ข้อมูลองค์กร (Company Profile)</h3>
                        <button type="button" id="closeMamCompanyModal" style="background:none;border:none;font-size:20px;color:#64748b;cursor:pointer;line-height:1;">&times;</button>
                    </div>
                    <form id="mamGlobalCompanyForm" style="padding:20px;display:flex;flex-direction:column;gap:12px;">
                        <div>
                            <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">ชื่อบริษัท (ภาษาไทย) *</label>
                            <input type="text" id="compModalName" required style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">ชื่อบริษัท (ภาษาอังกฤษ)</label>
                            <input type="text" id="compModalNameEn" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div>
                                <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
                                <input type="text" id="compModalTaxId" maxlength="13" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">สาขา</label>
                                <input type="text" id="compModalBranch" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div>
                                <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">เบอร์โทรศัพท์</label>
                                <input type="text" id="compModalPhone" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">อีเมล</label>
                                <input type="email" id="compModalEmail" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;">
                            </div>
                        </div>
                        <div>
                            <label style="display:block;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:4px;">ที่อยู่จดทะเบียน</label>
                            <textarea id="compModalAddress" rows="2" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;box-sizing:border-box;resize:vertical;"></textarea>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;padding-top:12px;border-top:1px solid #e2e8f0;">
                            <button type="button" id="cancelMamCompanyModal" style="padding:8px 16px;border:1px solid #cbd5e1;background:#ffffff;color:#475569;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">ยกเลิก</button>
                            <button type="submit" style="padding:8px 18px;border:none;background:#7D0A0A;color:#ffffff;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">บันทึกข้อมูลองค์กร</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);

            const close = () => { modal.style.display = 'none'; };
            modal.querySelector('#closeMamCompanyModal').addEventListener('click', close);
            modal.querySelector('#cancelMamCompanyModal').addEventListener('click', close);
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

            modal.querySelector('#mamGlobalCompanyForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    name: document.getElementById('compModalName').value.trim(),
                    name_en: document.getElementById('compModalNameEn').value.trim(),
                    tax_id: document.getElementById('compModalTaxId').value.trim(),
                    branch: document.getElementById('compModalBranch').value.trim(),
                    phone: document.getElementById('compModalPhone').value.trim(),
                    email: document.getElementById('compModalEmail').value.trim(),
                    address: document.getElementById('compModalAddress').value.trim()
                };
                try {
                    const res = await fetch('/api/company', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
                    sessionStorage.setItem('MAM_COMPANY_NAME', payload.name);
                    const nameEl = document.getElementById('topbarCompanyName');
                    if (nameEl && payload.name) nameEl.textContent = payload.name;
                    close();
                    if (typeof window.showToast === 'function') {
                        window.showToast('บันทึกสำเร็จ', 'อัปเดตข้อมูลองค์กรเรียบร้อยแล้ว', 'success');
                    } else {
                        alert('บันทึกข้อมูลองค์กรเรียบร้อยแล้ว');
                    }
                } catch (err) {
                    alert('เกิดข้อผิดพลาด: ' + err.message);
                }
            });
        }

        modal.style.display = 'flex';
        fetch('/api/company')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                document.getElementById('compModalName').value = data.name || data.name_th || '';
                document.getElementById('compModalNameEn').value = data.name_en || '';
                document.getElementById('compModalTaxId').value = data.tax_id || '';
                document.getElementById('compModalBranch').value = data.branch || 'สำนักงานใหญ่';
                document.getElementById('compModalPhone').value = data.phone || '';
                document.getElementById('compModalEmail').value = data.email || '';
                document.getElementById('compModalAddress').value = data.address || '';
            })
            .catch(() => {});
    }

    function setupTopbarActionButtons() {
        const companyInfoLink = document.getElementById('openCompanyInfoLink');
        if (companyInfoLink && !companyInfoLink.dataset.wired) {
            companyInfoLink.dataset.wired = '1';
            companyInfoLink.addEventListener('click', (e) => {
                const companyModal = document.getElementById('companyInfoModal') || document.getElementById('companyModal');
                if (companyModal) {
                    e.preventDefault();
                    companyModal.style.display = 'flex';
                    return;
                }
                e.preventDefault();
                const dropdown = document.getElementById('userDropdownContent');
                if (dropdown) dropdown.classList.remove('show');
                openBuiltInCompanyModal();
            });
        }

        const notifBtn = document.getElementById('topbarNotificationBtn');
        if (notifBtn && !notifBtn.dataset.wired) {
            notifBtn.dataset.wired = '1';
            notifBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/documents/quotations.html';
            });
        }

        const helpBtn = document.getElementById('topbarHelpBtn');
        if (helpBtn && !helpBtn.dataset.wired) {
            helpBtn.dataset.wired = '1';
            helpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                alert('คู่มือการใช้งานระบบ MAM DESIGN AND SERVICE CRM\n\n• เอกสารการขาย: สร้างใบเสนอราคา ใบวางบิล ใบกำกับภาษี ใบเสร็จรับเงิน\n• จัดซื้อ & ค่าใช้จ่าย: สร้างใบสั่งซื้อ (PO) และบันทึกค่าใช้จ่าย\n• การเงิน / ธนาคาร: บริหารบัญชีธนาคาร โอนเงิน และกระทบยอด\n• ติดต่อฝ่ายไอที/ผู้ดูแลระบบ: 02-415-1946');
            });
        }
    }

    function setupSidebarToggle() {
        const toggleBtn = document.getElementById('toggleSidebarBtn');
        const sidebarNav = document.getElementById('sidebarNav') || document.querySelector('.sidebar-nav');
        const appLayout = document.querySelector('.app-layout');

        if (!toggleBtn || !sidebarNav) return;

        // Clean existing listeners if any
        toggleBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (window.innerWidth <= 768) {
                // Mobile Drawer Toggle
                sidebarNav.classList.toggle('open');
                toggleMobileBackdrop(sidebarNav.classList.contains('open'), sidebarNav);
            } else {
                // Desktop Sidebar Collapse
                if (appLayout) {
                    appLayout.classList.toggle('sidebar-collapsed');
                }
                sidebarNav.classList.toggle('collapsed');
            }
        };
    }

    function toggleMobileBackdrop(show, sidebarNav) {
        let backdrop = document.getElementById('mamSidebarMobileBackdrop');
        if (show) {
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'mamSidebarMobileBackdrop';
                backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:105;backdrop-filter:blur(2px);';
                backdrop.onclick = () => {
                    sidebarNav.classList.remove('open');
                    toggleMobileBackdrop(false, sidebarNav);
                };
                document.body.appendChild(backdrop);
            }
            backdrop.style.display = 'block';
        } else if (backdrop) {
            backdrop.style.display = 'none';
        }
    }

    function setupUserDropdown() {
        const userBtn = document.getElementById('userMenuBtn');
        const dropdown = document.getElementById('userDropdownContent');

        if (!userBtn || !dropdown) return;

        userBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('show');
            dropdown.classList.toggle('show');
            userBtn.setAttribute('aria-expanded', !isOpen);
        };

        // Click outside closes dropdown
        document.addEventListener('click', (e) => {
            if (!userBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
                userBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function setupLogout() {
        const logoutBtn = document.getElementById('topbarLogoutBtn');
        if (!logoutBtn) return;

        logoutBtn.onclick = (e) => {
            if (window.performLogout) {
                window.performLogout(e);
                return;
            }
            e.preventDefault();
            if (confirm('ยืนยันการออกจากระบบ (Logout)?')) {
                try {
                    localStorage.removeItem('flowUser');
                    localStorage.removeItem('flowToken');
                    localStorage.removeItem('user');
                    localStorage.removeItem('token');
                    localStorage.removeItem('flowaccount_user');
                    sessionStorage.clear();
                } catch (err) {
                    console.warn('Storage clear error:', err);
                }
                window.location.href = '/auth/login.html';
            }
        };
    }

    function syncUserData() {
        try {
            const rawUser = localStorage.getItem('flowUser') ||
                            sessionStorage.getItem('currentUser') || 
                            localStorage.getItem('user') || 
                            localStorage.getItem('flowaccount_user');
            if (!rawUser) return;

            const user = JSON.parse(rawUser);
            const nameEl = document.getElementById('topbarUserDisplayName');
            const fullEl = document.getElementById('dropdownUserFullName');
            const emailEl = document.getElementById('dropdownUserEmail');
            const avatarEl = document.getElementById('topbarUserAvatar');

            const displayName = user.name || user.fullName || user.username || 'คุณอิศรพงศ์ โพธิ์งาม';
            const email = user.email || 'itsarapong@mamdesign.co.th';

            const ROLE_BADGES = {
                ADMIN: { title: 'เจ้าของกิจการ (Admin)', badgeClass: 'badge-role-admin' },
                ACCOUNTANT: { title: 'นักบัญชี (Accountant)', badgeClass: 'badge-role-accountant' },
                SALES: { title: 'พนักงานขาย (Sales)', badgeClass: 'badge-role-sales' }
            };
            const roleInfo = ROLE_BADGES[user.role] || ROLE_BADGES.ADMIN;

            if (nameEl) {
                nameEl.innerHTML = `${displayName} <span class="role-badge-pill ${roleInfo.badgeClass}">${roleInfo.title}</span>`;
            }
            if (fullEl) fullEl.textContent = displayName;
            if (emailEl) emailEl.textContent = email;

            if (avatarEl && (user.avatar || displayName)) {
                const avatarSrc = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7D0A0A&color=fff&size=64`;
                avatarEl.src = avatarSrc;
            }
        } catch (e) {
            // Ignore parse errors, keep defaults
        }
    }

    async function syncCompanyData() {
        try {
            const cachedName = sessionStorage.getItem('MAM_COMPANY_NAME');
            const nameEl = document.getElementById('topbarCompanyName');

            if (cachedName && nameEl) {
                nameEl.textContent = cachedName;
                return;
            }

            const res = await fetch('/api/company');
            if (res.ok) {
                const data = await res.json();
                const compName = data && (data.name || data.name_th);
                if (compName && nameEl) {
                    nameEl.textContent = compName;
                    sessionStorage.setItem('MAM_COMPANY_NAME', compName);
                }
            }
        } catch (e) {
            // Keep default company name
        }
    }

    // Auto-run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalNavbar);
    } else {
        initGlobalNavbar();
    }

    // Export to global scope
    window.initGlobalNavbar = initGlobalNavbar;
})();
