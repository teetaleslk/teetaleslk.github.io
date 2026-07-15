/**
 * TeeTales — translations.js
 * Phase 6: Bilingual EN / සිං support
 *
 * Source of truth: /TTSE_Translation.md
 * Edit that file → push to GitHub → site reflects changes automatically.
 *
 * Usage in HTML:
 *   <span data-i18n="Home">Home</span>
 *   <button data-i18n="Order Now">Order Now</button>
 *   <input data-i18n-placeholder="Search" placeholder="Search">
 *
 * The data-i18n value MUST match the English column in the MD file exactly.
 * English text stays as the element's default content (EN mode fallback).
 */

const Translations = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let dict = {};
  let lang = localStorage.getItem('teetales_lang') || 'en';
  let loaded = false;

  // ── MD Parser ──────────────────────────────────────────────────────────────
  // Reads table rows like: | English phrase | සිංහල වචනය |
  function parseMd(text) {
    const result = {};
    const lines = text.split('\n');

    for (const line of lines) {
      // Must start and end with pipe
      if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) continue;

      // Split by pipe, trim each cell
      const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length < 2) continue;

      const eng = cells[0];
      const sin = cells[1];

      // Skip header row and separator row
      if (eng === 'English' || eng.startsWith('-') || sin === 'සිංහල' || sin.startsWith('-')) continue;
      // Skip note rows that start with bold/code markers
      if (eng.startsWith('*') || eng.startsWith('`')) continue;

      if (eng && sin) result[eng] = sin;
    }

    return result;
  }

  // ── Loader ─────────────────────────────────────────────────────────────────
  async function load() {
    try {
      // File is served from repo root by GitHub Pages
      const res = await fetch('/TTSE_Translation.md', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      dict = parseMd(text);
      loaded = true;
      console.log(`[i18n] Loaded ${Object.keys(dict).length} translations`);
    } catch (err) {
      console.warn('[i18n] Could not load translations file:', err.message);
      // Site still works — falls back to English text already in HTML
    }
  }

  // ── Translate ──────────────────────────────────────────────────────────────
  // Returns Sinhala if lang=si and translation exists; otherwise returns key
  function t(key) {
    if (lang === 'si' && dict[key]) return dict[key];
    return key;
  }

  // ── Apply to DOM ───────────────────────────────────────────────────────────
  function applyToPage() {
    // Text content: <span data-i18n="Home">Home</span>
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
      // Mark Sinhala text so CSS can apply iskoola pota font
      if (lang === 'si') {
        el.setAttribute('lang', 'si');
      } else {
        el.removeAttribute('lang');
      }
    });

    // Placeholders: <input data-i18n-placeholder="Search" placeholder="Search">
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });

    // Update <html lang=""> attribute for CSS hooks
    document.documentElement.setAttribute('lang', lang);

    // Update toggle button label
    updateToggleBtn();
  }

  // ── Toggle button ──────────────────────────────────────────────────────────
  function updateToggleBtn() {
    const btn = document.getElementById('lang-toggle');
    if (!btn) return;
    btn.textContent = lang === 'si' ? 'EN' : 'සිං';
    btn.setAttribute('aria-label', lang === 'si' ? 'Switch to English' : 'Switch to Sinhala');
    btn.setAttribute('title', lang === 'si' ? 'English' : 'සිංහල');
  }

  // ── Public: toggle language ────────────────────────────────────────────────
  function toggle() {
    lang = lang === 'en' ? 'si' : 'en';
    localStorage.setItem('teetales_lang', lang);
    applyToPage();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  // Call once per page — loads MD then applies saved language preference
  async function init() {
    await load();
    applyToPage(); // Always apply — default is Sinhala, user may have switched to EN
    updateToggleBtn();
  }

  // Public API
  return { init, toggle, t, getLang: () => lang };

})();

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Translations.init());
} else {
  Translations.init();
}
