/* ═══════════════════════════════════════════════════════════════
   TeeTales — partials.js
   Tiny shared-markup helpers, loaded in <head> on every page (before
   the footer is parsed) so document.write() can inject identical
   blocks in place instead of hand-duplicating them per page.

   Kept deliberately minimal: only markup that is byte-identical
   across ALL 9 pages lives here. Anything that varies per page
   (nav link sets, footer sections) stays hand-authored in each HTML
   file — see WEB IMPROVEMENTS.md / CHANGELOG.md 2026-08-15 for why.
═══════════════════════════════════════════════════════════════ */

/* Footer bottom bar — trust line, privacy promise, copyright.
   Identical on every page (verified byte-for-byte before extracting). */
function renderFooterBottom() {
  document.write(
    '<div class="footer-bottom">' +
      '<p class="sl-trust-line">🇱🇰 Proudly Sri Lankan · Island-wide delivery · Pay only after you receive it</p>' +
      '<p class="privacy-promise">🔒 <strong>Our Privacy Promise:</strong> we never ask for personal details on this website — no accounts, no forms, no payment info collected here. Your details stay in our WhatsApp chat, are never shared, and never posted without your permission.</p>' +
      '<p>&copy; <span id="footerYear"></span> TeeTales. All rights reserved.</p>' +
    '</div>'
  );
}
