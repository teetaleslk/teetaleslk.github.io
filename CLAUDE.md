1. DO NOT WASTE TOKENS.
2. Act as an expert in Neuromarketing, Web Design, UX/UI, Conversion Rate Optimization (CRO) Specialist, Consumer Psychologist

---

## PROJECT: TeeTales — teetaleslk.github.io

Sri Lanka-based t-shirt e-commerce. Static multi-page HTML site hosted on GitHub Pages.
Ordering model: Cart → WhatsApp. No payment gateway. No login. No backend.

**WhatsApp number:** 94774407066
**Reference site:** haidi.lk (structure/professionalism only — not content)

---

## FILE STRUCTURE

| File | Purpose |
|------|---------|
| `index.html` | Homepage — hero, offers, category grid, collection preview, "More Ways to Shop" |
| `shop.html` | Full catalogue — URL filtering, badges, dynamic filters |
| `product.html` | Product detail — full info, qty selector, "You May Also Like" |
| `js/main.js` | All JS — GViz fetch, parsers, renderers, cart, WA message builder |
| `css/style.css` | All styles — mobile-first, CSS variables at top |
| `IMPROVEMENTS.md` | Roadmap + master checklist — source of truth |

---

## GOOGLE SHEET — WebStock tab (17 columns A–Q)

```
A(0)  ITEM_ID       B(1)  TYPE          C(2)  CATEGORY (TeeCategory)
D(3)  SIZE          E(4)  PRINT_SIZE    F(5)  STRIKE (STPrice — original)
G(6)  PRICE (DCPrice — sale)            H(7)  AGE_GRP
I(8)  SUITABLE      J(9)  STOCK         K(10) UNITS
L(11) BOOST         M(12) COLOUR        N(13) DESIGN (Sticker/Image name)
O(14) MATERIAL      P(15) IMAGE         Q(16) IMAGE2
R(17) COLOR_GROUP   ← Phase 16, not yet added
```

**Other sheet tabs:** OtherImg (category card photos), Offers

---

## CSS VARIABLES (top of style.css)

```
--primary: #1a1a2e   --accent: #e94560    --wa-green: #25d366
--wa-hover: #1ebe5a  --gold: #f5a623      --off-white: #f8f9fa
--text: #2d3436      --text-muted: #636e72 --border: #dee2e6
--radius-sm: 8px     --radius-md: 14px    --radius-lg: 22px
--shadow-sm/md/lg    --transition: 0.25s ease
```

---

## STRATEGIC RULES (never break these)

- **NEVER reveal margins or profit figures publicly.** Wholesale pricing discussed via WhatsApp only. Frame as "set your own price" not "earn Rs. X per tee."
- **Edit tool only — never full rewrites.** Edit only the specific part needed.
- **After every decision/discussion → update IMPROVEMENTS.md** in BOTH locations immediately.

---

## THREE RESELLER PARTNER MODELS

| Model | Who | What |
|-------|-----|------|
| TeeTales Partner | Micro-entrepreneurs, WA traders | Resell with TeeTales branding |
| Private Label | Budding brands, boutiques | We print with their own brand/label |
| Unbranded Wholesale | Event planners, corporates | Plain tees, no branding |

---

## IMPROVEMENTS.md — TWO SYNC LOCATIONS

| Location | Path |
|----------|------|
| Repo (source of truth) | `D:\TeeTales\GitHub\teetaleslk.github.io\IMPROVEMENTS.md` |
| Obsidian (mirror) | `G:\My Drive\Personal Documents\GD ObsidianNotes\TeeTales\IMPROVEMENTS.md` |

**Rules:**
- Repo is always edited first.
- Obsidian must be synced after every change.
- Use **Edit tool only** on Obsidian path (Write tool fails there).
- Status icons: ✅ done · ⏳ in progress · 🔲 not started

---

## CURRENT PHASE STATUS (as of 2026-07-10)

| Phase | Title | Status |
|-------|-------|--------|
| 1–3 | Bug Fixes, Sheet, Product Page | ✅ Done |
| 4 | Home Page Redesign | ⏳ Partial |
| 5 | Shop Page Improvements | ⏳ Partial |
| 6 | Bilingual (Sinhala) | 🔲 |
| 7 | Polish & SEO | ⏳ Partial |
| 8 | Advanced | 🔲 |
| 9 | Marketing & Sales Strategy | 🔲 |
| 10 | Customer Experience (Size Guide, Mobile Nav) | 🔲 |
| 11 | Trust & Conversion | ⏳ |
| 12 | Discovery & Engagement | ⏳ |
| 13 | Business Growth | ⏳ |
| 14 | Analytics | 🔲 |
| 15 | Technical Excellence | ⏳ |
| 16 | Colour & Size Variant Selector | 🔲 — architecture decided, not built |

**Next priority items:**
- 16.1: Add Color Group column R to WebStock sheet
- 10.1: Size guide
- 10.4: Mobile bottom nav bar
- 13.1: Custom Order page (custom.html)
- 14.1: Google Analytics 4
