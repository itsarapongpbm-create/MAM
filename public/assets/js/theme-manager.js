/**
 * FlowAccount Advance - Global Brand Design & Theme Manager
 * 
 * Supports:
 * - Dynamic Brand Theming synchronized from Document Settings (mam_document_branding)
 * - Auto-computation of primary colors, rgb, hover, active, light tints, focus rings, gradients
 * - Auto-synchronization of brand logos across topbar, sidebar, auth forms, and reports
 * - Cross-tab and instant reactive updates via window storage event and custom events
 */

(function initThemeManager() {
    const DEFAULT_COLOR = '#7D0A0A';
    const DEFAULT_LOGO = '../assets/images/mam-logo.png';

    // Helper: Convert hex to { r, g, b }
    function hexToRgb(hex) {
        if (!hex) return { r: 125, g: 10, b: 10 };
        let clean = hex.replace('#', '').trim();
        if (clean.length === 3) {
            clean = clean.split('').map(c => c + c).join('');
        }
        if (clean.length !== 6) return { r: 125, g: 10, b: 10 };
        const num = parseInt(clean, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    // Helper: Convert RGB back to Hex
    function rgbToHex(r, g, b) {
        const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
        return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // Helper: Darken or lighten color
    function shadeColor(r, g, b, percent) {
        return rgbToHex(
            r * (1 + percent),
            g * (1 + percent),
            b * (1 + percent)
        );
    }

    // Main Theme Applier
    function applyThemeFromBranding() {
        const root = document.documentElement;
        let branding = {};
        try {
            const raw = localStorage.getItem('mam_document_branding');
            if (raw) branding = JSON.parse(raw);
        } catch (e) {
            branding = {};
        }

        const primaryColor = branding.themeColor || DEFAULT_COLOR;
        const { r, g, b } = hexToRgb(primaryColor);

        const hoverColor = shadeColor(r, g, b, -0.15); // 15% darker
        const activeColor = shadeColor(r, g, b, -0.30); // 30% darker
        const gradColor2 = shadeColor(r, g, b, 0.20);  // 20% brighter stop

        // 1. Dynamic Primary Palette Custom Properties
        root.style.setProperty('--primary-color', primaryColor);
        root.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
        root.style.setProperty('--primary-hover', hoverColor);
        root.style.setProperty('--primary-active', activeColor);
        root.style.setProperty('--primary-light', `rgba(${r}, ${g}, ${b}, 0.08)`);
        root.style.setProperty('--primary-light-border', `rgba(${r}, ${g}, ${b}, 0.22)`);
        root.style.setProperty('--primary-focus-ring', `rgba(${r}, ${g}, ${b}, 0.25)`);
        root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${primaryColor} 0%, ${gradColor2} 100%)`);
        root.style.setProperty('--primary-gradient-subtle', `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.08) 0%, rgba(${r}, ${g}, ${b}, 0.02) 100%)`);
        root.style.setProperty('--doc-theme-color', primaryColor);

        // 2. Lock Modern Sans-Serif Font Stack (Inter + Prompt)
        root.style.setProperty('--font-family-sans', "'Inter', 'Prompt', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif");

        // 3. Dynamic Logo Update across the Site
        const logoSrc = branding.logoSrc;
        if (logoSrc) {
            const logos = document.querySelectorAll('.topbar-logo img, .brand-logo img, .auth-brand-logo img, .sidebar-brand img, .report-header-print img');
            logos.forEach(img => {
                if (img.getAttribute('src') !== logoSrc) {
                    img.src = logoSrc;
                }
            });
        }
    }

    // Apply immediately when parsed
    applyThemeFromBranding();

    // Re-run on DOM ready to guarantee all img elements exist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyThemeFromBranding);
    } else {
        setTimeout(applyThemeFromBranding, 50);
    }

    // Listen for storage changes across browser tabs
    window.addEventListener('storage', (e) => {
        if (!e.key || e.key === 'mam_document_branding') {
            applyThemeFromBranding();
        }
    });

    // Listen for same-tab custom event
    window.addEventListener('mam:branding-updated', applyThemeFromBranding);

    // Expose ThemeManager globally
    window.ThemeManager = {
        apply: applyThemeFromBranding,
        getBranding: () => {
            try {
                return JSON.parse(localStorage.getItem('mam_document_branding') || '{}');
            } catch (e) {
                return {};
            }
        }
    };
})();
