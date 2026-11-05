/**
 * FlowAccount Advance - Authentication & Role Permission Guard
 * Manages user session, role-based navigation visibility, and access control.
 */

const ROLE_PERMISSIONS = {
    ADMIN: {
        title: 'เจ้าของกิจการ (Admin)',
        badgeClass: 'badge-role-admin',
        allowedPaths: ['dashboard', 'documents', 'expenses', 'withholding-tax', 'inventory', 'banking', 'contacts', 'email', 'admin-web', 'settings'],
        canManageUsers: true,
        canViewFinancialMetrics: true
    },
    ACCOUNTANT: {
        title: 'นักบัญชี (Accountant)',
        badgeClass: 'badge-role-accountant',
        allowedPaths: ['dashboard', 'documents', 'expenses', 'withholding-tax', 'inventory', 'banking', 'contacts', 'email', 'admin-web'],
        canManageUsers: false,
        canViewFinancialMetrics: true
    },
    SALES: {
        title: 'พนักงานขาย (Sales)',
        badgeClass: 'badge-role-sales',
        allowedPaths: ['dashboard', 'documents', 'inventory', 'contacts', 'email'],
        canManageUsers: false,
        canViewFinancialMetrics: false
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ensureBankingMenu();
    ensureEmailMenu();
    ensureAdminWebMenu();
    cleanupDeadSidebarLinks();
    enforceAuthGuard();
    applyRolePermissions();
    setupUserDropdown();
    setupSidebarDropdowns();
    updateSidebarPendingBadges();
});

function getCurrentUser() {
    try {
        const stored = localStorage.getItem('flowUser') ||
                       sessionStorage.getItem('currentUser') ||
                       localStorage.getItem('user') ||
                       localStorage.getItem('flowaccount_user');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error parsing stored user:', e);
    }
    return null;
}
window.getCurrentUser = getCurrentUser;

function enforceAuthGuard() {
    const user = getCurrentUser();
    const currentPath = window.location.pathname.toLowerCase();
    const isRootLogin = currentPath === '/' || (currentPath.endsWith('/index.html') && !currentPath.includes('/dashboard/') && !currentPath.includes('/banking/'));
    const isAuthPage = isRootLogin || currentPath.includes('/auth/');

    if (!user) {
        if (!isAuthPage) {
            window.location.href = '/auth/login.html';
        }
        return;
    }

    // Check restricted modules for Sales
    if (user.role === 'SALES') {
        if (
            currentPath.includes('/expenses/') ||
            currentPath.includes('/withholding-tax/') ||
            currentPath.includes('/banking/') ||
            currentPath.includes('/admin-web/') ||
            currentPath.includes('/settings/users')
        ) {
            alert(`จำกัดสิทธิ์การเข้าถึง!\n\nบทบาทของคุณคือ "${ROLE_PERMISSIONS.SALES.title}"\nไม่มีสิทธิ์เข้าถึงส่วนงานบัญชี การเงิน หรือการตั้งค่าระบบ`);
            window.location.href = '/documents/quotations.html';
            return;
        }
    }

    // Check restricted modules for Accountant
    if (user.role === 'ACCOUNTANT') {
        if (currentPath.includes('/settings/users')) {
            alert(`จำกัดสิทธิ์การเข้าถึง!\n\nเฉพาะ "เจ้าของกิจการ (Admin)" เท่านั้นที่สามารถจัดการผู้ใช้งานและสิทธิ์ได้`);
            window.location.href = '/dashboard/index.html';
            return;
        }
    }
}

function applyRolePermissions() {
    const user = getCurrentUser();
    if (!user) return;
    const roleConfig = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.ADMIN;

    // 1. Update user info in topbar
    const nameEl = document.querySelector('.user-display-name');
    if (nameEl) {
        nameEl.innerHTML = `${user.name} <span class="role-badge-pill ${roleConfig.badgeClass}">${roleConfig.title}</span>`;
    }

    const avatarImg = document.querySelector('.user-avatar-img');
    if (avatarImg && user.avatar) {
        avatarImg.src = user.avatar;
    }

    const dropdownHeader = document.querySelector('.user-dropdown-header');
    if (dropdownHeader) {
        dropdownHeader.innerHTML = `
            <strong id="dropdownUserFullName">${user.name}</strong>
            <small id="dropdownUserEmail">${user.email}</small>
            <div style="margin-top: 4px;"><span class="role-badge-pill ${roleConfig.badgeClass}">${roleConfig.title}</span></div>
        `;
    }

    // 2. Adjust navigation based on role
    if (user.role === 'SALES') {
        // Hide expenses, withholding tax, banking & admin-web links from sidebar
        document.querySelectorAll('a[href*="expenses"], a[href*="withholding-tax"], a[href*="banking"], a[href*="admin-web"]').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('.menu-section-title').forEach(el => {
            if (el.textContent.includes('Admin Web')) {
                el.style.display = 'none';
            }
        });

        // Hide sensitive profit & cost elements if on dashboard
        document.querySelectorAll('.sensitive-financial-metric').forEach(el => {
            el.innerHTML = '<span style="color: #94a3b8; font-size: 15px;">[จำกัดสิทธิ์เฉพาะฝ่ายบัญชี/ผู้บริหาร]</span>';
        });
    }

    if (user.role !== 'ADMIN') {
        // Hide user management link
        document.querySelectorAll('a[href*="users.html"]').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('.menu-section-title').forEach(el => {
            if (el.textContent.includes('การตั้งค่าระบบ')) {
                el.style.display = 'none';
            }
        });
    }
}
window.applyRolePermissions = applyRolePermissions;

function setupUserDropdown() {
    const userBtn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdownContent');

    if (userBtn && dropdown) {
        userBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('show');
        };

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !userBtn.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    // Unified logout button handler
    const performLogout = (e) => {
        if (e) e.preventDefault();
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
    window.performLogout = performLogout;

    document.querySelectorAll('.btn-logout, a[href*="login.html"], #topbarLogoutBtn').forEach(btn => {
        btn.onclick = performLogout;
    });
}

/**
 * Setup Sidebar Dropdown / Accordion Toggles
 */
function setupSidebarDropdowns() {
    document.querySelectorAll('.menu-dropdown-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const group = btn.closest('.menu-dropdown-group');
            if (group) {
                const isOpen = group.classList.contains('open');
                if (isOpen) {
                    group.classList.remove('open');
                    btn.classList.remove('active');
                } else {
                    // Close other groups so only one is open at a time (Clean Accordion)
                    document.querySelectorAll('.menu-dropdown-group').forEach(other => {
                        if (other !== group) {
                            other.classList.remove('open');
                            const otherToggle = other.querySelector('.menu-dropdown-toggle');
                            if (otherToggle) otherToggle.classList.remove('active');
                        }
                    });
                    group.classList.add('open');
                    btn.classList.add('active');
                }
            }
        });
    });

    // Auto-open ONLY group with active child on page load; close all others
    document.querySelectorAll('.menu-dropdown-group').forEach(group => {
        if (group.querySelector('.submenu-item.active')) {
            group.classList.add('open');
            const toggle = group.querySelector('.menu-dropdown-toggle');
            if (toggle) toggle.classList.add('active');
        } else {
            group.classList.remove('open');
            const toggle = group.querySelector('.menu-dropdown-toggle');
            if (toggle) toggle.classList.remove('active');
        }
    });
}

/**
 * Update Sidebar Badges with real pending / unapproved counts
 */
async function updateSidebarPendingBadges() {
    try {
        const res = await fetch('/api/documents/pending-counts');
        if (!res.ok) return;
        const counts = await res.json();

        const updateLinkBadge = (linkSelector, count) => {
            const links = document.querySelectorAll(linkSelector);
            links.forEach(link => {
                let badge = link.querySelector('.submenu-badge');
                if (!badge && count > 0) {
                    badge = document.createElement('span');
                    badge.className = 'submenu-badge';
                    link.appendChild(badge);
                }
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count;
                        badge.style.display = 'inline-block';
                    } else {
                        badge.style.display = 'none';
                        badge.textContent = '0';
                    }
                }
            });
        };

        // 1. ใบเสนอราคา: รออนุมัติ
        updateLinkBadge('a[href*="quotations"]', counts.QUOTATION);

        // 2. ใบวางบิล: รอรับเงิน/ค้างชำระ
        updateLinkBadge('a[href*="billing-notes"]', counts.BILLING_NOTE);

        // 3. ใบกำกับภาษี: รอรับเงิน/ค้างชำระ
        updateLinkBadge('a[href*="invoices"]', counts.TAX_INVOICE);

        // 4. ใบเสร็จรับเงิน: จบงานแล้ว (ไม่แสดง)
        updateLinkBadge('a[href*="receipts"]', counts.RECEIPT);

        // 5. ขายสด: จบงานแล้ว (ไม่แสดง)
        updateLinkBadge('a[href*="cash-sales"]', counts.CASH_SALE);

        // 6. ใบสั่งซื้อ (PO): รออนุมัติ
        updateLinkBadge('a[href*="purchase-orders"]', counts.PURCHASE_ORDER);

        // 7. Top Notification Bell
        const notifBadge = document.querySelector('.notification-badge');
        if (notifBadge) {
            if (counts.total_pending > 0) {
                notifBadge.textContent = counts.total_pending;
                notifBadge.style.display = 'flex';
            } else {
                notifBadge.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error updating sidebar badges:', err);
    }
}
window.updateSidebarPendingBadges = updateSidebarPendingBadges;

/**
 * Ensure Email menu section is present in sidebarNav across all pages
 */
function ensureEmailMenu() {
    const sidebar = document.getElementById('sidebarNav') || document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    if (sidebar.querySelector('#emailDropdownGroup') || sidebar.querySelector('a[href*="/email/"]')) return;

    const isCampaignActive = window.location.pathname.includes('/email/campaign.html');
    const isInboxActive = window.location.pathname.includes('/email/inbox.html');
    const isAnyEmailActive = isCampaignActive || isInboxActive;

    const emailWrapper = document.createElement('div');
    emailWrapper.innerHTML = `
        <div class="menu-section-title">ระบบอีเมล (Email)</div>
        <div class="menu-dropdown-group ${isAnyEmailActive ? 'open' : ''}" id="emailDropdownGroup">
            <button type="button" class="menu-dropdown-toggle ${isAnyEmailActive ? 'active' : ''}" id="emailDropdownToggle">
                <div class="menu-toggle-content">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <span>ระบบอีเมล (Email)</span>
                </div>
                <svg class="dropdown-chevron" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="menu-dropdown-list">
                <a href="/email/campaign.html" class="submenu-item ${isCampaignActive ? 'active' : ''}">
                    <span>• เสนอขายกระเช้า (Giftory)</span>
                </a>
                <a href="/email/inbox.html" class="submenu-item ${isInboxActive ? 'active' : ''}">
                    <span>• กล่องข้อความ (Inbox)</span>
                </a>
            </div>
        </div>
    `;

    const sectionTitles = Array.from(sidebar.querySelectorAll('.menu-section-title'));
    const targetSection = sectionTitles.find(el =>
        el.textContent.includes('วิเคราะห์') ||
        el.textContent.includes('Admin Web') ||
        el.textContent.includes('การตั้งค่าระบบ')
    );

    if (targetSection) {
        while (emailWrapper.firstChild) {
            targetSection.parentNode.insertBefore(emailWrapper.firstChild, targetSection);
        }
    } else {
        const menuContainer = sidebar.querySelector('.sidebar-menu') || sidebar;
        while (emailWrapper.firstChild) {
            menuContainer.appendChild(emailWrapper.firstChild);
        }
    }
}
window.ensureEmailMenu = ensureEmailMenu;

/**
 * Ensure Admin Web menu section is present in sidebarNav before "การตั้งค่าระบบ"
 */
function ensureAdminWebMenu() {
    const sidebar = document.getElementById('sidebarNav') || document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    if (sidebar.querySelector('a[href*="/admin-web/"]')) return;

    const isOverviewActive = window.location.pathname.includes('/admin-web/overview.html');
    const isSettingsActive = window.location.pathname.includes('/admin-web/settings.html');

    const adminWebWrapper = document.createElement('div');
    adminWebWrapper.innerHTML = `
        <div class="menu-section-title">Admin Web</div>
        <a href="/admin-web/overview.html" class="menu-item ${isOverviewActive ? 'active' : ''}">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>ภาพรวมเว็บ (Web Overview)</span>
        </a>
        <a href="/admin-web/settings.html" class="menu-item ${isSettingsActive ? 'active' : ''}">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>ตั้งค่าเว็บไซต์ &amp; Edit</span>
        </a>
    `;

    const sectionTitles = Array.from(sidebar.querySelectorAll('.menu-section-title'));
    const settingsSection = sectionTitles.find(el => el.textContent.includes('การตั้งค่าระบบ'));

    if (settingsSection) {
        while (adminWebWrapper.firstChild) {
            settingsSection.parentNode.insertBefore(adminWebWrapper.firstChild, settingsSection);
        }
    } else {
        const menuContainer = sidebar.querySelector('.sidebar-menu') || sidebar;
        while (adminWebWrapper.firstChild) {
            menuContainer.appendChild(adminWebWrapper.firstChild);
        }
    }
}
window.ensureAdminWebMenu = ensureAdminWebMenu;

/**
 * Ensure Banking menu item is present in sidebarNav and rewrite any #banking links
 */
function ensureBankingMenu() {
    const sidebar = document.getElementById('sidebarNav') || document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    const isBankingActive = window.location.pathname.includes('/banking/');

    // Rewrite any placeholder #banking link
    const hashBanking = sidebar.querySelector('a[href="#banking"]');
    if (hashBanking) {
        hashBanking.setAttribute('href', '/banking/index.html');
        if (isBankingActive) hashBanking.classList.add('active');
        return;
    }

    // Check if already present
    const existingBanking = sidebar.querySelector('a[href*="banking/index.html"]') ||
                            (isBankingActive && sidebar.querySelector('a[href="index.html"]'));
    if (existingBanking) {
        if (isBankingActive) existingBanking.classList.add('active');
        return;
    }

    const bankingLink = document.createElement('a');
    bankingLink.href = '/banking/index.html';
    bankingLink.className = `menu-item ${isBankingActive ? 'active' : ''}`;
    bankingLink.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="2" y="5" width="20" height="14" rx="2"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
        </svg>
        <span>การเงิน / ธนาคาร</span>
    `;

    const contactsGroup = sidebar.querySelector('#contactsDropdownGroup');
    const inventoryGroup = sidebar.querySelector('#inventoryDropdownGroup');
    const menuContainer = sidebar.querySelector('.sidebar-menu') || sidebar;

    if (contactsGroup && contactsGroup.parentNode) {
        contactsGroup.parentNode.insertBefore(bankingLink, contactsGroup);
    } else if (inventoryGroup && inventoryGroup.parentNode) {
        inventoryGroup.parentNode.insertBefore(bankingLink, inventoryGroup.nextSibling);
    } else {
        menuContainer.appendChild(bankingLink);
    }
}
window.ensureBankingMenu = ensureBankingMenu;

/**
 * Remove dead #reports and #payroll sidebar links
 */
function cleanupDeadSidebarLinks() {
    const sidebar = document.getElementById('sidebarNav') || document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    sidebar.querySelectorAll('a[href="#reports"], a[href="#payroll"]').forEach(el => {
        el.remove();
    });

    sidebar.querySelectorAll('.menu-section-title').forEach(el => {
        if (el.textContent.includes('วิเคราะห์')) {
            el.remove();
        }
    });
}
window.cleanupDeadSidebarLinks = cleanupDeadSidebarLinks;



