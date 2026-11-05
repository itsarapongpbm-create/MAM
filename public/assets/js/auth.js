/**
 * FlowAccount Authentication Template JavaScript
 * Handles validation, UI interactions, password toggle, and language switching.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailGroup = document.getElementById('emailGroup');
    const passwordGroup = document.getElementById('passwordGroup');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const eyeOpenIcon = togglePasswordBtn?.querySelector('.eye-open');
    const eyeSlashIcon = togglePasswordBtn?.querySelector('.eye-slash');
    const submitBtn = document.getElementById('submitBtn');
    const btnSpinner = submitBtn?.querySelector('.btn-spinner');
    const btnText = submitBtn?.querySelector('.btn-text');
    const alertBox = document.getElementById('alertMessage');
    const langSwitchBtn = document.getElementById('langSwitchBtn');
    const langText = document.getElementById('langText');
    const flagIcon = document.getElementById('flagIcon');
    const mobileAppBanner = document.getElementById('mobileAppBanner');
    const closeBannerBtn = document.getElementById('closeBanner');

    // Multi-Language Dictionary (TH / EN)
    const translations = {
        th: {
            pageTitle: 'เข้าสู่ระบบ | MAM DESIGN AND SERVICE',
            appDownloadText: 'ดาวน์โหลดฟรีได้แล้ววันนี้',
            appDownloadBtn: 'ดาวน์โหลด',
            loginTitle: 'ล็อกอินเข้าสู่ระบบ',
            emailLabel: 'อีเมล',
            emailPlaceholder: 'name@example.com',
            emailErrorRequired: 'กรุณากรอกอีเมล',
            emailErrorInvalid: 'กรุณากรอกอีเมลให้ถูกต้อง',
            passwordLabel: 'รหัสผ่าน',
            passwordPlaceholder: 'กรอกรหัสผ่าน',
            passwordErrorRequired: 'กรุณากรอกรหัสผ่าน',
            forgotPassword: 'ลืมรหัสผ่าน?',
            loginBtn: 'เข้าสู่ระบบ',
            noAccount: 'ยังไม่มีบัญชีกับเรา?',
            signUpFree: 'สมัครใช้งานฟรี',
            orDivider: 'หรือ',
            loginWithFacebook: 'เข้าสู่ระบบด้วย Facebook',
            loginWithGoogle: 'เข้าสู่ระบบด้วย Google',
            loginWithApple: 'เข้าสู่ระบบด้วย Apple',
            termsNotice: 'เมื่อเข้าสู่ระบบ ฉันได้ยอมรับ',
            privacyPolicy: 'นโยบายความเป็นส่วนตัว',
            and: 'และ',
            termsOfService: 'เงื่อนไขการใช้บริการ',
            nextLang: 'EN',
            flag: 'TH'
        },
        en: {
            pageTitle: 'Log in | MAM DESIGN AND SERVICE',
            appDownloadText: 'Download free today',
            appDownloadBtn: 'Download',
            loginTitle: 'Sign in to MAM DESIGN AND SERVICE',
            emailLabel: 'Email',
            emailPlaceholder: 'name@example.com',
            emailErrorRequired: 'Please enter your email',
            emailErrorInvalid: 'Please enter a valid email address',
            passwordLabel: 'Password',
            passwordPlaceholder: 'Enter your password',
            passwordErrorRequired: 'Please enter your password',
            forgotPassword: 'Forgot password?',
            loginBtn: 'Sign In',
            noAccount: "Don't have an account?",
            signUpFree: 'Sign up for free',
            orDivider: 'OR',
            loginWithFacebook: 'Continue with Facebook',
            loginWithGoogle: 'Continue with Google',
            loginWithApple: 'Continue with Apple',
            termsNotice: 'By continuing, you agree to our',
            privacyPolicy: 'Privacy Policy',
            and: 'and',
            termsOfService: 'Terms of Service',
            nextLang: 'TH',
            flag: 'EN'
        }
    };

    let currentLang = 'th';

    // 1. Password Visibility Toggle
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            
            if (isPassword) {
                eyeOpenIcon.style.display = 'none';
                eyeSlashIcon.style.display = 'block';
            } else {
                eyeOpenIcon.style.display = 'block';
                eyeSlashIcon.style.display = 'none';
            }
            passwordInput.focus();
        });
    }

    // 2. Clear validation state on input
    if (emailInput) {
        emailInput.addEventListener('input', () => {
            if (emailGroup && emailGroup.classList.contains('has-error')) {
                emailGroup.classList.remove('has-error');
            }
            hideAlert();
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            if (passwordGroup && passwordGroup.classList.contains('has-error')) {
                passwordGroup.classList.remove('has-error');
            }
            hideAlert();
        });
    }

    // Helper: Email Validation Regex
    function isValidEmail(email) {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).trim().toLowerCase());
    }

    // 3. Form Submission & Validation
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            let isValid = true;
            const emailVal = emailInput ? emailInput.value.trim() : '';
            const passwordVal = passwordInput ? passwordInput.value : '';

            // Email or Username verification
            if (!emailVal) {
                if (emailGroup) emailGroup.classList.add('has-error');
                if (emailError) emailError.textContent = translations[currentLang].emailErrorRequired;
                isValid = false;
            } else if (emailVal.includes('@') && !isValidEmail(emailVal)) {
                if (emailGroup) emailGroup.classList.add('has-error');
                if (emailError) emailError.textContent = translations[currentLang].emailErrorInvalid;
                isValid = false;
            } else {
                if (emailGroup) emailGroup.classList.remove('has-error');
            }

            // Password verification
            if (!passwordVal) {
                if (passwordGroup) passwordGroup.classList.add('has-error');
                if (passwordError) passwordError.textContent = translations[currentLang].passwordErrorRequired;
                isValid = false;
            } else {
                if (passwordGroup) passwordGroup.classList.remove('has-error');
            }

            if (!isValid) {
                return;
            }

            // Loading State
            setLoading(true);

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailVal, password: passwordVal })
                });

                const data = await res.json();
                setLoading(false);

                if (res.ok && data.success) {
                    // Store user session
                    localStorage.setItem('flowUser', JSON.stringify(data.user));
                    localStorage.setItem('flowToken', data.token);

                    showAlert(
                        currentLang === 'th' 
                            ? `เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${data.user.name} (${data.user.role})`
                            : `Login successful! Welcome ${data.user.name} (${data.user.role})`,
                        'success'
                    );

                    setTimeout(() => {
                        const isSubdir = window.location.pathname.includes('/auth/');
                        window.location.href = isSubdir ? '../dashboard/index.html' : 'dashboard/index.html';
                    }, 800);
                } else {
                    showAlert(data.error || (currentLang === 'th' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'Invalid email or password'), 'danger');
                    if (passwordInput) passwordInput.focus();
                }
            } catch (err) {
                setLoading(false);
                showAlert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + err.message, 'danger');
            }
        });
    }

    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            btnSpinner.style.display = 'inline-block';
            btnText.style.display = 'none';
        } else {
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
            btnText.style.display = 'inline-block';
        }
    }

    function showAlert(message, type = 'danger') {
        if (!alertBox) return;
        alertBox.className = `alert-box alert-${type}`;
        const alertText = alertBox.querySelector('.alert-text');
        if (alertText) alertText.textContent = message;
        alertBox.style.display = 'flex';
    }

    function hideAlert() {
        if (alertBox) alertBox.style.display = 'none';
    }

    // 4. Social Login Handlers (Mock)
    ['facebookLoginBtn', 'googleLoginBtn', 'appleLoginBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                const provider = id.replace('LoginBtn', '');
                showAlert(
                    currentLang === 'th' 
                        ? `กำลังเชื่อมต่อไปยัง ${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth...` 
                        : `Connecting to ${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth...`,
                    'success'
                );
            });
        }
    });

    // 5. Language Switcher
    if (langSwitchBtn) {
        langSwitchBtn.addEventListener('click', () => {
            currentLang = currentLang === 'th' ? 'en' : 'th';
            applyLanguage(currentLang);
        });
    }

    function applyLanguage(lang) {
        const dict = translations[lang];
        document.documentElement.lang = lang;
        document.title = dict.pageTitle;

        // Update elements with [data-i18n]
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });

        // Update input placeholders
        if (emailInput) emailInput.placeholder = dict.emailPlaceholder;
        if (passwordInput) passwordInput.placeholder = dict.passwordPlaceholder;

        // Update Switch Button Label
        if (langText) langText.textContent = dict.nextLang;
        if (flagIcon) flagIcon.textContent = dict.flag;

        // Hide any open alert
        hideAlert();
    }

    // 6. Mobile Banner Dismiss
    if (closeBannerBtn && mobileAppBanner) {
        closeBannerBtn.addEventListener('click', () => {
            mobileAppBanner.style.display = 'none';
        });
    }

    // Auto display mobile banner if screen is small
    function checkMobileView() {
        if (window.innerWidth <= 640 && mobileAppBanner) {
            mobileAppBanner.classList.add('active');
        }
    }
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
});
