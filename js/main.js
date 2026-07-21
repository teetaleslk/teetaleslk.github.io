/* ═══════════════════════════════════════════════════════════════
   TeeTales — main.js
   Live Google Sheets integration + full marketing features

   Marketing tactics applied from playbook:
   ✓ Strike-through pricing (Left-Digit Effect anchor)
   ✓ Trending / Hot / New / Low-stock urgency badges
   ✓ Tag-based filtering (Flowers, Superheroes, Quotes, etc.)
   ✓ Visual colour swatch filter
   ✓ WhatsApp messages with upsell suggestion (Parasite Placement)
   ✓ Gifter-aware WhatsApp pre-fill
   ✓ Social proof via popularity ranking
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
/*
  ╔══════════════════════════════════════════════╗
  ║  HOW TO EDIT TEETALES WITHOUT KNOWING CODE   ║
  ╠══════════════════════════════════════════════╣
  ║  • Change WhatsApp number → WA_NUMBER below  ║
  ║  • Change currency label  → CURRENCY below   ║
  ║  • Add/remove products    → Google Sheet      ║
  ║  • Add category images    → OtherImg tab      ║
  ║  • Add deals/offers       → Offers tab        ║
  ╚══════════════════════════════════════════════╝
*/
const CONFIG = {
  SHEET_ID:    '1rHyu237K7jfq8WMMZgMkrU-ves5PNYUkvrS3qWQqZho',  // ← Your Google Sheet ID (from the URL)
  SHEET_NAME:  'WebStock',   // ← product catalogue tab name in the sheet
  OFFERS_TAB:  'Offers',     // ← deals/promotions tab name in the sheet
  WA_NUMBER:   '94774407066',  // ← WhatsApp number WITHOUT + sign (e.g. 94XXXXXXXXX)
  CURRENCY:    'Rs.',          // ← currency label shown before prices
  REFRESH_MIN: 5,
  // Social media — UPDATE THESE with your actual profile URLs
  SOCIAL: {
    facebook:  'https://facebook.com/teetales',
    instagram: 'https://instagram.com/teetales.tshirt',
    tiktok:    'https://tiktok.com/@tee.tales.tshirt',
  },
};

/*
  Column index map — matches WebStock sheet headers (A–Q, 17 cols, updated 2026-07-21):
  A(0): ItemID     | B(1): Type       | C(2): TeeCategory
  D(3): Size       | E(4): PrintSize  | F(5): Discounted (Yes/No)
  G(6): OrgPrice   | H(7): DCPrice    | I(8): BulkPrice
  J(9): Age Grp    | K(10): Suitable for | L(11): Stock Status
  M(12): Units     | N(13): Boost Status | O(14): Colour
  P(15): Sticker/Image (Design Name) | Q(16): Print Location
  Images come from the repo (img/products/<last5>.jpg) — no sheet columns.
  Material is always "Single Jersey" — no sheet column.
  BulkPrice (I) is the per-item 5+ price, sheet formula (2026-07-21):
    =IF(AND(B2="Kids",D2="S"), G2-101, IF(AND(B2="Kids",D2="M"), G2-125, G2-151))
  — standard items get OrgPrice−151; Kids S/M get a smaller gap so bulk price
  never sells below unit cost (see TBOS Break-even Analysis).
*/
const COL = {
  ITEM_ID:    0,
  TYPE:       1,
  CATEGORY:   2,  // C: TeeCategory (e.g. "Round Neck", "Polo")
  SIZE:       3,  // D: Size
  PRINT_SIZE: 4,  // E: PrintSize
  DISCOUNTED: 5,  // F: "Yes" = DCPrice applies (OrgPrice struck) · "No" = sell at OrgPrice
  ORG_PRICE:  6,  // G: OrgPrice — original/anchor price
  DC_PRICE:   7,  // H: DCPrice  — discounted price (used only when Discounted = Yes)
  BULK_PRICE: 8,  // I: BulkPrice — per-item 5+ bulk price (formula above)
  AGE_GRP:    9,  // J: Age Grp
  SUITABLE:  10,  // K: Suitable for  ("Ladies", "Gents", "Unisex")
  STOCK:     11,  // L: Stock Status  ("In Stock", "Almost Gone", "Sold Out")
  UNITS:     12,  // M: Units  — how many physical pieces available (default 1 if blank)
  BOOST:     13,  // N: Boost Status  ("New", "Hot", "Trending", "Stock Clearance"…)
  COLOUR:         14,  // O: Colour
  DESIGN:         15,  // P: Sticker/Image — design name
  PRINT_LOCATION: 16,  // Q: Print Location (e.g. "Front", "Back", "Left Chest")
};
const MATERIAL_DEFAULT = 'Single Jersey';

/* ── PRODUCT MAP — populated by parseTableData, used by cart ── */
const _ttProdMap = {};  // id → product object

/* ── STATE ──────────────────────────────────────────────────── */
let allProducts   = [];
let activeAge     = 'all';
let activeGender  = 'all';
let activeTag     = 'all';
let activeColour  = 'all';
let activeSize    = 'all';
let activeBoost   = 'all';      // 'all' | 'new' | 'hot'  (?boost= URL param)
let activeSort    = 'featured'; // 'featured' | 'newest' | 'price-asc' | 'price-desc'
let searchQuery   = '';

/* ── DOM REFS ───────────────────────────────────────────────── */
const grid          = document.getElementById('productsGrid');
const loadingState  = document.getElementById('loadingState');
const emptyState    = document.getElementById('emptyState');
const resultsBar    = document.getElementById('resultsBar');
const filterSummary = document.getElementById('filterSummary');
const searchInput   = document.getElementById('searchInput');
const searchClear   = document.getElementById('searchClear');
const footerYear    = document.getElementById('footerYear');

/* ═══════════════════════════════════════════════════════════════
   FETCH & PARSE
═══════════════════════════════════════════════════════════════ */
async function fetchSheetTab(tabName) {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(tabName)}&_=${Date.now()}`;

  // 10-second timeout — fail fast instead of spinning forever
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);

  try {
    const res  = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    clearTimeout(timer);

    // GViz wraps JSON in a callback — strip it
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/);
    if (!match) throw new Error('Sheet not public or tab name wrong.');

    const json = JSON.parse(match[1]);
    if (json.status !== 'ok') throw new Error(json.errors?.[0]?.message || 'Sheet error');
    return json.table;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — check your internet connection.');
    throw err;
  }
}

async function fetchProducts() {
  const table = await fetchSheetTab(CONFIG.SHEET_NAME);
  const products = parseTableData(table);
  assignFamilyImages(products);
  return products;
}

/* Family image inheritance: items without their own image file fall back to the
   image of the LOWEST-numbered item in their family (own file always wins). */
function assignFamilyImages(products) {
  const fams = {};
  products.forEach(p => {
    if (!p.design?.length) return;
    const k = familyKeyOf(p);
    (fams[k] = fams[k] || []).push(p);
  });
  Object.values(fams).forEach(list => {
    const nums = list.map(p => (String(p.id).match(/(\d{5})$/) || [])[1]).filter(Boolean).sort();
    if (!nums.length) return;
    list.forEach(p => { p.leadNum = nums[0]; });
  });
}

function parseTableData(table) {
  const rows = table.rows || [];
  return rows
    .map((row, idx) => {
      const cells = row.c || [];
      const val = (i) => {
        const c = cells[i];
        return (c && c.v !== null && c.v !== undefined) ? String(c.v).trim() : '';
      };
      const numVal = (i) => {
        const c = cells[i];
        if (!c || c.v === null) return null;
        const n = parseFloat(c.v); return isNaN(n) ? null : n;
      };

      const itemId = val(COL.ITEM_ID);
      const type   = val(COL.TYPE);
      if (!itemId && !type) return null;  // skip blank rows

      // Parse design name — split by comma, trim, keep original case
      const rawDesign = val(COL.DESIGN);
      const design = rawDesign
        ? rawDesign.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      /* Price logic (2026-07-19): Discounted=Yes → sell at DCPrice, OrgPrice struck.
         Discounted=No → sell at OrgPrice, no strike-through. */
      const discounted = val(COL.DISCOUNTED).toLowerCase().startsWith('y');
      const orgPrice   = numVal(COL.ORG_PRICE);
      const dcPrice    = numVal(COL.DC_PRICE);
      const bulkPrice  = numVal(COL.BULK_PRICE);

      const product = {
        id:         itemId || `item-${idx + 1}`,
        type:       type   || 'T-Shirt',
        category:   val(COL.CATEGORY),
        size:       val(COL.SIZE),
        printSize:  val(COL.PRINT_SIZE),
        org:        orgPrice,                                        // retail anchor (struck-through)
        price:      (discounted && dcPrice) ? dcPrice : orgPrice,    // selling price
        strike:     (discounted && dcPrice && orgPrice > dcPrice) ? orgPrice : null,
        bulkPrice:  bulkPrice,                                       // per-item 5+ price straight from the sheet
        ageGrp:     val(COL.AGE_GRP).toLowerCase(),
        suitable:   val(COL.SUITABLE).toLowerCase(),
        stock:      val(COL.STOCK) || 'In Stock',
        boost:      val(COL.BOOST),
        printLocation: val(COL.PRINT_LOCATION),
        material:      MATERIAL_DEFAULT,
        /* Images always from repo: img/products/<last 5 digits of ItemID>.jpg (+A) */
        image:         repoImg(itemId, ''),
        image2:        repoImg(itemId, 'A'),
        colour:     val(COL.COLOUR),
        design,
        units:      numVal(COL.UNITS) || 1,  // max qty customer can add to cart
      };
      _ttProdMap[product.id] = product;  // register in lookup map for cart
      return product;
    })
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════
   OFFERS — fetch + render from "Offers" tab
   HOW TO ADD / REMOVE A DEAL:
   1. Open Google Sheet → "Offers" tab
   2. Set column A (Status) = "Active" to show the deal, or "Expired" to hide it
   3. The Deals section on the website disappears automatically when no active offers exist

   Sheet columns (A–G):
     A: Status      "Active" or "Expired"
     B: Badge       e.g. "FREE DELIVERY" / "🔥 HOT DEAL"
     C: Title       e.g. "Kids Bundle Deal"
     D: Description e.g. "3 tees for great prices — islandwide delivery!"
     E: StrikePrice e.g. 3000  (leave blank = no strikethrough)
     F: DealPrice   e.g. 2250
     G: WA Text     pre-filled WhatsApp message (plain text, not encoded)
═══════════════════════════════════════════════════════════════ */
const OFFER_COL = {
  STATUS:  0,  // A
  BADGE:   1,  // B
  TITLE:   2,  // C
  DESC:    3,  // D
  STRIKE:  4,  // E
  PRICE:   5,  // F
  WA_TEXT: 6,  // G
};

async function fetchOffers() {
  let table;
  try {
    table = await fetchSheetTab(CONFIG.OFFERS_TAB);
  } catch (err) {
    console.error('[TeeTales] fetchOffers failed:', err);
    return [];
  }

  const rows = table.rows || [];
  return rows
    .map(row => {
      const cells = row.c || [];
      // Raw string value — use formatted display (c.f) as fallback for text cells
      const v = (i) => {
        const c = cells[i];
        if (!c || c.v === null || c.v === undefined) return '';
        return String(c.f !== undefined && c.f !== null ? c.f : c.v).trim();
      };
      // Number value — strip currency symbols and commas then parse
      const n = (i) => {
        const c = cells[i];
        if (!c || c.v === null || c.v === undefined) return null;
        if (typeof c.v === 'number') return c.v;
        // Formatted string like "Rs2,700.00" — strip non-numeric chars except dot
        const raw = String(c.f || c.v).replace(/[^0-9.]/g, '');
        const num = parseFloat(raw);
        return isNaN(num) ? null : num;
      };
      const status = v(OFFER_COL.STATUS).toLowerCase();
      if (status !== 'active') return null;
      const title = v(OFFER_COL.TITLE);
      if (!title) return null;
      return {
        badge:  v(OFFER_COL.BADGE),
        title,
        desc:   v(OFFER_COL.DESC),
        strike: n(OFFER_COL.STRIKE),
        price:  n(OFFER_COL.PRICE),
        waText: v(OFFER_COL.WA_TEXT),
      };
    })
    .filter(Boolean);
}

function createOfferCard(offer) {
  const card = document.createElement('div');
  card.className = 'offer-card';

  const strikeHtml = offer.strike
    ? `<span class="offer-strike">${CONFIG.CURRENCY} ${formatNum(offer.strike)}</span>`
    : '';

  const priceHtml = offer.price
    ? `<div class="offer-price-row">
        ${strikeHtml}
        <span class="offer-price">${CONFIG.CURRENCY} ${formatNum(offer.price)}</span>
        ${offer.strike ? `<span class="offer-save">💰 Save ${CONFIG.CURRENCY} ${formatNum(offer.strike - offer.price)}</span>` : ''}
       </div>`
    : '';

  const waMsg = offer.waText || `Hi TeeTales! I'd like to know more about the "${offer.title}" offer. 👕`;
  const waLink = `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;

  card.innerHTML = `
    ${offer.badge ? `<div class="offer-badge">${escHtml(offer.badge)}</div>` : ''}
    <div class="offer-body">
      <h3 class="offer-title">${escHtml(offer.title)}</h3>
      ${offer.desc ? `<p class="offer-desc">${escHtml(offer.desc)}</p>` : ''}
      ${priceHtml}
      <a href="${waLink}" target="_blank" rel="noopener" class="offer-wa-btn">
        <i class="fab fa-whatsapp"></i> Grab This Deal
      </a>
    </div>`;
  return card;
}

async function renderOffers() {
  const grid = document.getElementById('offersGrid');
  const section = document.getElementById('offersSection');
  if (!grid || !section) return;

  try {
    const offers = await fetchOffers();
    if (!offers.length) {
      section.style.display = 'none';  // hide section entirely if no active offers
      return;
    }
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    offers.forEach(o => frag.appendChild(createOfferCard(o)));
    grid.appendChild(frag);
    section.style.display = '';  // make visible
  } catch (err) {
    console.error('[TeeTales] renderOffers failed:', err);
    section.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════════════
   DYNAMIC FILTERS — built from live data
═══════════════════════════════════════════════════════════════ */

/** Collect all unique tags from products and render tag pills */
let tagShowAll = false;
function buildTagFilter(base) {
  const group = document.getElementById('tagFilterGroup');
  const pills = document.getElementById('tagFilter');
  if (!group || !pills) return;
  const counts = new Map();  // lowercase → {label, n} (dedupes, counts popularity)
  base.forEach(p => p.design.forEach(t => {
    const k = t.trim().toLowerCase();
    if (!k) return;
    const e = counts.get(k) || { label: t.trim(), n: 0 };
    e.n++; counts.set(k, e);
  }));
  if (!counts.size) { group.style.display = 'none'; activeTag = 'all'; return; }
  if (activeTag !== 'all' && !counts.has(activeTag.trim().toLowerCase())) activeTag = 'all';

  const TAG_MAX = 10;
  const all = [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  let show = all;
  if (!tagShowAll && all.length > TAG_MAX) {
    show = all.slice(0, TAG_MAX);
    if (activeTag !== 'all' && !show.some(e => e.label === activeTag)) {
      const sel = all.find(e => e.label === activeTag);
      if (sel) show = [...show, sel];   // selected design always stays visible
    }
  }
  pills.innerHTML = `<button class="tag-pill${activeTag === 'all' ? ' active' : ''}" data-tag="all">All Designs</button>` +
    show.map(e =>
      `<button class="tag-pill${activeTag === e.label ? ' active' : ''}" data-tag="${escHtml(e.label)}">${escHtml(e.label)}</button>`).join('') +
    (all.length > TAG_MAX
      ? `<button class="tag-pill tag-more">${tagShowAll ? 'Show less ▲' : `+${all.length - show.length} more ▾`}</button>`
      : '');
  group.style.display = 'flex';
  pills.onclick = (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    if (pill.classList.contains('tag-more')) { tagShowAll = !tagShowAll; applyFilters(); return; }
    activeTag = pill.dataset.tag;
    applyFilters();
  };
}

/** Collect all unique colours and render colour swatch buttons */
function buildColourFilter(base) {
  const group = document.getElementById('colourFilterGroup');
  const wrap  = document.getElementById('colourFilter');
  if (!group || !wrap) return;
  const present = new Set(base.map(p => colourGroupOf(p.colour)).filter(Boolean));
  if (!present.size) { group.style.display = 'none'; activeColour = 'all'; return; }
  if (activeColour !== 'all' && !present.has(activeColour)) activeColour = 'all';
  wrap.innerHTML = `<button class="colour-all-btn${activeColour === 'all' ? ' active' : ''}" data-colour="all">All</button>` +
    COLOUR_GROUPS.filter(([g]) => present.has(g)).map(([g, hex]) =>
      `<button class="colour-btn${activeColour === g ? ' active' : ''}" data-colour="${g}" title="${g}" aria-label="${g}"
        style="background:${hex}${g === 'White' ? ';border:2px solid #ccc' : ''}"></button>`).join('') +
    (present.has('Other') ? `<button class="colour-btn${activeColour === 'Other' ? ' active' : ''}" data-colour="Other" title="Other" style="background:#ccc"></button>` : '');
  group.style.display = 'flex';
  wrap.onclick = (e) => {
    const btn = e.target.closest('.colour-btn, .colour-all-btn');
    if (!btn) return;
    activeColour = btn.dataset.colour;
    applyFilters();
  };
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE HELPERS
═══════════════════════════════════════════════════════════════ */
/* Repo image fallback: when the sheet has no link, look for a file in
   img/products/ named after the ItemID's trailing digits.
   ItemID …00001 → 00001.jpg (Image1) / 00001A.jpg (Image2)
   Workflow: drop renamed .jpg files in img/products/, push — done.
   Missing files fall back to the "Photo coming soon" placeholder via onerror. */
function repoImgBase(itemId, suffix) {
  // Rule: LAST 5 characters of ItemID are always digits = the image number
  // e.g. KP2XLU00001 → 00001 → img/products/00001.jpg
  // Extra views: 00001A, 00001B … 00001Z (sequential — stop at first gap)
  const m = String(itemId || '').trim().match(/(\d{5})$/);
  return m ? `img/products/${m[1]}${suffix}` : '';
}
function repoImg(itemId, suffix) {
  const b = repoImgBase(itemId, suffix);
  return b ? `${b}.jpg` : '';
}

/* Probe a repo image (no extension) across IMG_EXTS; call onFound(url) with
   the first extension that actually loads. Silent if none exist. */
/* Probe an item's image: its OWN number first, then the family lead's (inheritance) */
function probeFam(p, suffix, onFound) {
  const own = repoImgBase(p.id, suffix);
  const ownNum = (String(p.id).match(/(\d{5})$/) || [])[1];
  probeImg(own, onFound, () => {
    if (p.leadNum && p.leadNum !== ownNum) probeImg(`img/products/${p.leadNum}${suffix}`, onFound);
  });
}

function probeImg(base, onFound, onFail) {
  if (!base) { if (onFail) onFail(); return; }
  let i = 0;
  const tryNext = () => {
    if (i >= IMG_EXTS.length) { if (onFail) onFail(); return; }
    const url = `${base}.${IMG_EXTS[i++]}`;
    const im = new Image();
    im.onload  = () => onFound(url);
    im.onerror = tryNext;
    im.src = url;
  };
  tryNext();
}

/* onerror handler with extension cascade for repo images:
   .jpg → .jpeg → .png → .webp → .JPG → .JPEG, then the fallback.
   fallback: 'remove' = remove the element · anything else = placeholder HTML */
const IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG'];
window.ttImgErr = function (el, fallback) {
  const src = el.getAttribute('src') || '';
  const m = src.match(/^(img\/products\/)(\d{5})([A-Z]?)\.(\w+)$/);
  if (m) {
    const next = IMG_EXTS[IMG_EXTS.indexOf(m[4]) + 1];
    if (next) { el.src = `${m[1]}${m[2]}${m[3]}.${next}`; return; }
    const lead = el.dataset.lead;                      // family fallback: lowest-numbered sibling
    if (lead && lead !== m[2]) { el.dataset.lead = ''; el.src = `${m[1]}${lead}${m[3]}.${IMG_EXTS[0]}`; return; }
  } else {
    const g = src.match(/^(img\/[^.]+)\.(\w+)$/);   // other repo images (categories etc.)
    if (g) {
      const next = IMG_EXTS[IMG_EXTS.indexOf(g[2]) + 1];
      if (next) { el.src = `${g[1]}.${next}`; return; }
    }
  }
  if (fallback === 'remove') el.remove();
  else el.parentElement.innerHTML = fallback || window.placeholderHtml();
};

function resolveImageUrl(raw) {
  if (!raw) return null;
  raw = raw.trim();
  // Already a non-Drive URL — use as-is
  if (raw.startsWith('http') && !raw.includes('drive.google.com') && !raw.includes('docs.google.com')) return raw;
  // Extract file ID from any Drive share link format
  const fileMatch = raw.match(/\/file\/d\/([^/?]+)/);
  if (fileMatch) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`;
  const idMatch   = raw.match(/[?&]id=([^&]+)/);
  if (idMatch)   return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
  const openMatch = raw.match(/open\?id=([^&]+)/);
  if (openMatch) return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w600`;
  return raw;
}

/*
  COLOUR MAP — used to render the colour dot swatches on product cards.
  To add a new colour: add a line like  newcolour: '#hexcode',
  The key must be lowercase and match what you type in the Google Sheet Colour column.
*/
const COLOUR_MAP = {
  white: '#ffffff', black: '#1a1a1a', red: '#e94560', blue: '#3498db',
  navy: '#1a1a2e', green: '#27ae60', yellow: '#f1c40f', orange: '#e67e22',
  purple: '#9b59b6', pink: '#fd79a8', grey: '#95a5a6', gray: '#95a5a6',
  brown: '#8b5e3c', maroon: '#6d1f1f', cream: '#f5f0e0', beige: '#f5f0e0',
  teal: '#00b5a5', cyan: '#00cec9', lime: '#a3cb38', khaki: '#bda55d',
  coral: '#ff7675', lavender: '#a29bfe', gold: '#f5a623', silver: '#b2bec3',
  rose: '#e84393', sky: '#74b9ff', mint: '#55efc4', peach: '#ffeaa7',
  charcoal: '#2d3436', olive: '#6d8b74', wine: '#722f37', mustard: '#e3aa00',
};
/* ── SIZE-FAMILY GROUPING (Phase 16, no sheet change) ──
   Rows are "the same tee in another size" when Design+Colour+Type+Category+PrintSize match. */
function familyKeyOf(p) {
  // Same sticker design + same colour + same Type (Kids/Adults) + same TeeCategory → one family
  return [(p.design[0] || '').trim().toLowerCase(), (p.colour || '').toLowerCase(),
          (p.type || '').toLowerCase(), (p.category || '').toLowerCase()].join('|');
}
function familyMembers(p) {
  if (!p.design?.length) return [];
  const k = familyKeyOf(p);
  return Object.values(_ttProdMap).filter(q => q.design?.length && familyKeyOf(q) === k);
}

/* Basic colour groups — any shade maps to one group (faceted colour filter) */
/* Order = display order: rainbow flow (R→O→Y→G→B→V→pink), then neutrals.
   A new colour shade auto-joins its group's fixed rainbow position. */
const COLOUR_GROUPS = [
  ['Red',    '#e94560', ['red', 'maroon', 'wine', 'burgundy']],
  ['Orange', '#e67e22', ['orange', 'rust']],
  ['Yellow', '#f1c40f', ['yellow', 'gold', 'mustard']],
  ['Green',  '#27ae60', ['green', 'olive', 'lime', 'mint']],
  ['Blue',   '#3498db', ['blue', 'navy', 'sky', 'royal', 'teal', 'cyan', 'denim', 'turquoise']],
  ['Purple', '#9b59b6', ['purple', 'lavender', 'lavendar', 'violet', 'plum', 'lilac', 'mauve', 'tauve']],
  ['Pink',   '#fd79a8', ['pink', 'rose', 'coral', 'peach', 'magenta', 'fuchsia']],
  ['Brown',  '#8b5e3c', ['brown', 'beige', 'khaki', 'tan', 'sand']],
  ['Black',  '#1a1a1a', ['black', 'charcoal']],
  ['Grey',   '#95a5a6', ['grey', 'gray', 'silver', 'ash']],
  ['White',  '#ffffff', ['white', 'cream', 'ivory']],
];
function colourGroupOf(name) {
  const n = (name || '').toLowerCase();
  if (!n) return null;
  for (const [g, , keys] of COLOUR_GROUPS) if (keys.some(k => n.includes(k))) return g;
  return 'Other';
}

function getSwatchColor(colourName) {
  if (!colourName) return null;
  const key = colourName.toLowerCase().replace(/\s+/g, '');
  if (COLOUR_MAP[key]) return COLOUR_MAP[key];
  for (const [k, v] of Object.entries(COLOUR_MAP)) {
    if (key.includes(k)) return v;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   BADGE HELPERS  (Stock Status + Boost Status)
═══════════════════════════════════════════════════════════════ */

/** Column H — stock availability badge */
function getStockBadgeHtml(stockStatus) {
  const s = (stockStatus || '').toLowerCase();
  if (s.includes('out'))  return `<span class="badge badge-out">✕ Sold Out</span>`;
  if (s.includes('low') || s.includes('few') || s.includes('almost')) return `<span class="badge badge-low">⚡ Almost Gone</span>`;
  return `<span class="badge badge-in-stock">✓ In Stock</span>`;
}

/** Stock sort priority — Almost Gone first, In Stock second, Sold Out last */
function stockPriority(stock) {
  const s = (stock || '').toLowerCase();
  if (s.includes('low') || s.includes('few') || s.includes('almost')) return 0;
  if (s.includes('out')) return 2;
  return 1;
}

/** Combined audience label from Age Grp + Suitable For */
function getAudienceLabel(ageGrp, suitable) {
  const age    = (ageGrp  || '').toLowerCase();
  const suit   = (suitable || '').toLowerCase();
  const isKids = age !== 'adults';
  if (isKids  && suit === 'ladies')  return { label: "Girls' Tee",  emoji: '👧' };
  if (isKids  && suit === 'gents')   return { label: "Boys' Tee",   emoji: '👦' };
  if (isKids  && suit === 'unisex')  return { label: "Kids' Tee",   emoji: '🧒' };
  if (!isKids && suit === 'ladies')  return { label: "Ladies' Tee", emoji: '👩' };
  if (!isKids && suit === 'gents')   return { label: "Gents' Tee",  emoji: '👨' };
  if (!isKids && suit === 'unisex')  return { label: "Adults' Tee", emoji: '👕' };
  if (isKids)                        return { label: "Kids' Tee",   emoji: '🧒' };
  if (!isKids)                       return { label: 'Adults',      emoji: '🧑' };
  return { label: '', emoji: '' };
}

/** Column I — marketing/urgency boost (New, Hot, Trending, Best Seller…) */
function getBoostBadgeHtml(boostStatus) {
  // Boost Status is multi-select (comma-separated, e.g. "Hot, Gifts").
  // Shows up to 2 badges: urgency first, suitability (Gifts) second.
  const b = (boostStatus || '').toLowerCase();
  if (!b) return '';
  const out = [];
  if (b.includes('clearance'))   out.push(`<span class="badge badge-clearance">💥 Stock Clearance</span>`);
  if (b.includes('hot'))         out.push(`<span class="badge badge-hot">🔥 Hot Pick</span>`);
  if (b.includes('new'))         out.push(`<span class="badge badge-new">🏷️ New In</span>`);
  if (b.includes('trending'))    out.push(`<span class="badge badge-trending">📈 Trending</span>`);
  if (b.includes('best seller') || b.includes('bestseller'))
                                 out.push(`<span class="badge badge-trending">⭐ Best Seller</span>`);
  if (b.includes('featured'))    out.push(`<span class="badge badge-new">Featured</span>`);
  if (b.includes('gift'))        out.push(`<span class="badge badge-gift">🎁 Gift Pick</span>`);
  return out.slice(0, 2).join(' ');
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════════ */
function renderProducts(products) {
  grid.querySelectorAll('.product-card').forEach(el => el.remove());

  if (products.length === 0) {
    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
    resultsBar.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  loadingState.style.display = 'none';

  const count = products.length;
  resultsBar.textContent = `Showing ${count} item${count !== 1 ? 's' : ''}`;

  const frag = document.createDocumentFragment();
  products.forEach(p => frag.appendChild(createProductCard(p)));
  grid.appendChild(frag);
}

function createProductCard(p) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const isOutOfStock = p.stock.toLowerCase().includes('out');

  /* ── Image ── */
  const imgUrl  = resolveImageUrl(p.image);
  const imgInner = imgUrl
    ? `<img src="${escHtml(imgUrl)}" alt="${escHtml(p.type)}" loading="lazy"
           data-lead="${escHtml(p.leadNum || '')}" onerror="ttImgErr(this)" />`
    : `<div class="card-img-placeholder"><span>👕</span><small>Photo coming soon</small></div>`;

  /* ── Badges ── */
  const saleBadge = (p.strike && p.price && p.price < p.strike)
    ? (() => {
        const disc = Math.round((1 - p.price / p.strike) * 100);
        return `<span class="badge badge-sale">Save ${disc}%</span>`;
      })()
    : '';
  const stockBadge  = getStockBadgeHtml(p.stock);
  const boostBadge  = getBoostBadgeHtml(p.boost);
  const audience    = getAudienceLabel(p.ageGrp, p.suitable);
  const audienceBadge = audience.label
    ? `<span class="badge badge-audience">${audience.emoji} ${audience.label}</span>`
    : '';
  if (audience.label) card.dataset.audience = audience.label;

  /* ── Add to Cart button ── */
  const cartBtn = isOutOfStock
    ? `<button class="card-cart-btn" disabled>✕ Sold Out</button>`
    : `<button class="card-cart-btn" onclick="cartAddFromCard('${escHtml(p.id)}')">
         <i class="fas fa-shopping-bag"></i> Add to Cart
       </button>`;

  /* ── Price block ── */
  let priceHtml = '';
  if (p.price !== null && p.strike !== null && p.strike > p.price) {
    const disc = Math.round((1 - p.price / p.strike) * 100);
    priceHtml = `<div class="card-price">
      <span class="price-current">${CONFIG.CURRENCY} ${formatNum(p.price)}</span>
      <span class="price-original">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span>
      <span class="price-badge">-${disc}%</span>
    </div>`;
  } else if (p.price !== null) {
    priceHtml = `<div class="card-price"><span class="price-only">${CONFIG.CURRENCY} ${formatNum(p.price)}</span></div>`;
  } else if (p.strike !== null) {
    priceHtml = `<div class="card-price"><span class="price-only">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span></div>`;
  } else {
    priceHtml = `<div class="card-price"><span style="font-size:.83rem;color:var(--mid-gray)">Ask for price</span></div>`;
  }

  /* ── Tags ── */
  const tagsHtml = p.design.length
    ? `<div class="card-tags">${p.design.slice(0, 3).map(t => `<span class="card-tag-chip">${t}</span>`).join('')}</div>`
    : '';

  /* ── Colour swatch + size bar (always visible) ── */
  const swatchColor = getSwatchColor(p.colour);
  const swatchDot   = p.colour
    ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}" title="${escHtml(p.colour)}"></span>`
    : '';
  const colourLabel = p.colour ? `<span class="card-meta-colour">${escHtml(p.colour)}</span>` : '';
  const ageIsRange  = p.ageGrp && p.ageGrp !== 'adults';
  const ageLabel    = ageIsRange ? `<span class="card-meta-age">🎂 ${escHtml(p.ageGrp)}</span>` : '';
  const moreSizes   = familyMembers(p).filter(q => q.id !== p.id && !q.stock.toLowerCase().includes('out')).length;
  const sizeLabel   = p.size
    ? `<span class="card-meta-size">Size: <strong>${escHtml(p.size)}</strong>${moreSizes ? ` <span class="card-more-sizes">+${moreSizes} more size${moreSizes > 1 ? 's' : ''}</span>` : ''}</span>`
    : '';

  const metaParts   = [colourLabel, ageLabel, sizeLabel].filter(Boolean);
  const metaBar     = metaParts.length
    ? `<div class="card-meta-bar">${swatchDot}${metaParts.join('<span class="card-meta-sep">·</span>')}</div>`
    : '';

  /* ── Assemble ── */
  card.innerHTML = `
    <div class="card-img-area">
      <div class="card-img-link">${imgInner}</div>
      <div class="card-badges">
        ${boostBadge}
      </div>
      <div class="card-badge-tr">
        ${audienceBadge}
      </div>
      <button class="card-wish${wishHas(p.id) ? ' saved' : ''}" aria-label="Save for later"
        onclick="event.stopPropagation(); wishToggle('${escHtml(p.id)}', this)">
        <i class="${wishHas(p.id) ? 'fas' : 'far'} fa-heart"></i>
      </button>
      <div class="card-wa-hover">${cartBtn}</div>
    </div>
    <div class="card-info">
      <div class="card-type">${escHtml((p.design?.[0] ? `${p.design[0]} — ${p.type} ${p.category || ''} Tee`.replace(/\s+/g, ' ') : p.type) + (p.size ? ` (${p.size})` : ''))}</div>
      ${stockBadge ? `<div class="card-stock-row">${stockBadge}</div>` : ''}
      ${priceHtml}
      ${metaBar}
      ${tagsHtml}
    </div>`;

  /* ── Navigate to product page on card click (but not on WA button) ── */
  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    window.location.href = `product.html?id=${encodeURIComponent(p.id)}`;
  });
  card.style.cursor = 'pointer';

  return card;
}

window.placeholderHtml = () =>
  `<div class="card-img-placeholder"><span>👕</span><small>Photo coming soon</small></div>`;


/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function formatNum(n) {
  return Number(n).toLocaleString('en-LK');
}

/* ═══════════════════════════════════════════════════════════════
   FILTERING
═══════════════════════════════════════════════════════════════ */
/* Cross-faceted filtering: every group's options come from products matching
   all OTHER active filters ("exclude self") — click order never matters. */
function contextFor(except) {
  let f = allProducts;
  if (except !== 'age') {
    if (activeAge === 'adults') f = f.filter(p => p.ageGrp === 'adults');
    else if (activeAge === 'kids') f = f.filter(p => p.ageGrp !== 'adults');
  }
  if (except !== 'gender') {
    if (activeGender === 'ladies' || activeGender === 'gents')
      f = f.filter(p => p.suitable === activeGender || p.suitable === 'unisex');
    else if (activeGender !== 'all') f = f.filter(p => p.suitable === activeGender);
  }
  if (activeBoost === 'new')  f = f.filter(p => (p.boost || '').toLowerCase().includes('new'));
  else if (activeBoost === 'hot')
    f = f.filter(p => /hot|trending|clearance/i.test(p.boost || '') || p.strike);
  else if (activeBoost === 'gifts')
    f = f.filter(p => (p.boost || '').toLowerCase().includes('gift'));
  if (except !== 'tag'    && activeTag    !== 'all') f = f.filter(p => p.design.includes(activeTag));
  if (except !== 'colour' && activeColour !== 'all') f = f.filter(p => colourGroupOf(p.colour) === activeColour);
  if (except !== 'size'   && activeSize   !== 'all') f = f.filter(p => (p.size || '').toLowerCase() === activeSize);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    f = f.filter(p =>
      p.type.toLowerCase().includes(q)   ||
      p.colour.toLowerCase().includes(q) ||
      p.size.toLowerCase().includes(q)   ||
      p.id.toLowerCase().includes(q)     ||
      p.design.some(t => t.toLowerCase().includes(q))
    );
  }
  return f;
}

function applyFilters() {
  /* Rebuild every option group from its own "all others" context */
  updateStaticPillAvailability();
  buildTagFilter(contextFor('tag'));
  buildColourFilter(contextFor('colour'));
  buildSizeFilter(contextFor('size'));

  /* Final result = all filters applied */
  let f = contextFor(null);

  // Sort (5.4): price sorts override; otherwise stock priority
  if      (activeSort === 'price-asc')  f = [...f].sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (activeSort === 'price-desc') f = [...f].sort((a, b) => (b.price || 0) - (a.price || 0));
  else {
    if (activeSort === 'newest') f = [...f].reverse();
    f.sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock));
  }

  renderProducts(f);
  updateFilterSummary();
}

/* Category + Suitable For pills: grey out choices with no products in the
   current cross-context (never hidden — greyed keeps the layout stable). */
function updateStaticPillAvailability() {
  const ageCtx = contextFor('age');
  document.querySelectorAll('#ageFilter .pill').forEach(pill => {
    const v = pill.dataset.age;
    pill.disabled = v !== 'all' &&
      !ageCtx.some(p => v === 'adults' ? p.ageGrp === 'adults' : p.ageGrp !== 'adults');
    pill.classList.toggle('active', v === activeAge);
  });
  const genCtx = contextFor('gender');
  document.querySelectorAll('#genderFilter .pill').forEach(pill => {
    const v = pill.dataset.gender;
    pill.disabled = v !== 'all' &&
      !genCtx.some(p => (v === 'ladies' || v === 'gents') ? (p.suitable === v || p.suitable === 'unisex') : p.suitable === v);
    pill.classList.toggle('active', v === activeGender);
  });
}

function updateFilterSummary() {
  if (!filterSummary) return;
  const chip = (key, icon, label) =>
    `<button class="filter-tag" data-clear="${key}" title="Remove this filter"><i class="fas ${icon}"></i> ${label} <span class="filter-tag-x">✕</span></button>`;
  const tags = [];
  if (activeAge    !== 'all') tags.push(chip('age',    'fa-users',   capitalize(activeAge)));
  if (activeGender !== 'all') tags.push(chip('gender', 'fa-filter',  capitalize(activeGender)));
  if (activeTag    !== 'all') tags.push(chip('tag',    'fa-tag',     escHtml(activeTag)));
  if (activeColour !== 'all') tags.push(chip('colour', 'fa-palette', capitalize(activeColour)));
  if (activeSize   !== 'all') tags.push(chip('size',   'fa-ruler',   `Size ${activeSize.toUpperCase()}`));
  if (activeBoost  !== 'all') tags.push(chip('boost',  'fa-fire',    ({new: 'New Arrivals', hot: 'Hot Deals', gifts: 'Gift Picks'})[activeBoost]));
  if (searchQuery)            tags.push(chip('search', 'fa-search',  `"${escHtml(searchQuery)}"`));
  if (tags.length >= 2)
    tags.push(`<button class="filter-tag filter-clear-all" data-clear="all" title="Remove all filters">Clear all ✕</button>`);
  filterSummary.innerHTML = tags.join('');
  filterSummary.onclick = (e) => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    clearFilter(btn.dataset.clear);
  };
}

/* Remove one filter (or all) and re-run */
function clearFilter(key) {
  const clearSearch = () => {
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.style.display = 'none';
  };
  if (key === 'age'    || key === 'all') activeAge    = 'all';
  if (key === 'gender' || key === 'all') activeGender = 'all';
  if (key === 'tag'    || key === 'all') activeTag    = 'all';
  if (key === 'colour' || key === 'all') activeColour = 'all';
  if (key === 'size'   || key === 'all') activeSize   = 'all';
  if (key === 'boost'  || key === 'all') activeBoost  = 'all';
  if (key === 'search' || key === 'all') clearSearch();
  applyFilters();
}

/* ═══════════════════════════════════════════════════════════════
   EXTRA FILTER INJECTION  (Tag + Colour rows — injected once)
═══════════════════════════════════════════════════════════════ */
function injectExtraFilters() {
  const bar = document.querySelector('.filters-bar .filters-row');
  if (!bar) return;

  if (!document.getElementById('tagFilterGroup')) {
    const tagGroup = document.createElement('div');
    tagGroup.className = 'filter-group';
    tagGroup.id = 'tagFilterGroup';
    tagGroup.style.display = 'none';
    tagGroup.innerHTML = `
      <span class="filter-label"><i class="fas fa-tag"></i> Design</span>
      <div class="filter-pills" id="tagFilter"></div>`;
    bar.appendChild(tagGroup);
  }

  if (!document.getElementById('sizeFilterGroup')) {
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'filter-group';
    sizeGroup.id = 'sizeFilterGroup';
    sizeGroup.style.display = 'none';
    sizeGroup.innerHTML = `
      <span class="filter-label"><i class="fas fa-ruler"></i> Size</span>
      <div class="filter-pills" id="sizeFilter"></div>`;
    bar.appendChild(sizeGroup);
  }

  if (!document.getElementById('colourFilterGroup')) {
    const colGroup = document.createElement('div');
    colGroup.className = 'filter-group';
    colGroup.id = 'colourFilterGroup';
    colGroup.style.display = 'none';
    colGroup.innerHTML = `
      <span class="filter-label"><i class="fas fa-palette"></i> Colour</span>
      <div class="colour-filter-wrap" id="colourFilter"></div>`;
    bar.appendChild(colGroup);
  }
}

/* Size filter pills — sizes that actually exist in the data, S→3XL order */
const SIZE_LADDER = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl'];
function buildSizeFilter(base) {
  const group = document.getElementById('sizeFilterGroup');
  const pills = document.getElementById('sizeFilter');
  if (!group || !pills) return;
  const avail = new Set(base.map(p => (p.size || '').toLowerCase()));
  if (activeSize !== 'all' && !avail.has(activeSize)) activeSize = 'all';
  pills.innerHTML = `<button class="pill${activeSize === 'all' ? ' active' : ''}" data-size="all">All</button>` +
    SIZE_LADDER.map(sz =>
      `<button class="pill${activeSize === sz ? ' active' : ''}" data-size="${sz}"${avail.has(sz) ? '' : ' disabled'}>${sz.toUpperCase()}</button>`).join('');
  group.style.display = 'flex';
  pills.onclick = (e) => {
    const pill = e.target.closest('.pill');
    if (!pill || pill.disabled) return;
    activeSize = pill.dataset.size;
    applyFilters();
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOME PAGE — 4 Adults + 4 Kids preview
═══════════════════════════════════════════════════════════════ */

/*
  fetchOtherImages — loads images from the "OtherImg" Google Sheet tab.
  That tab has two columns:
    A: ID        — a unique name you choose (e.g. "ForLadiesCategory")
    B: Image URL — paste a Google Drive share link here

  In index.html, any element with  data-img-id="ForLadiesCategory"
  will get that image set as its background automatically.

  To add/update a category photo:
    1. Upload the photo to Google Drive → share as "Anyone with the link"
    2. Paste the share URL in the OtherImg tab next to the matching ID
    3. Hard-refresh the site (Ctrl+Shift+R) — image appears instantly
*/
async function fetchOtherImages() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=OtherImg&_=${Date.now()}`;
    const text = await (await fetch(url)).text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/)[1]);
    const map = {};
    (json.table.rows || []).forEach(r => {
      const id = r.c[0]?.v, img = r.c[1]?.v;
      if (id && img) map[id] = resolveImageUrl(img);  // resolveImageUrl converts Drive share links to direct thumbnail URLs
    });
    return map;
  } catch { return {}; }  // if sheet fetch fails, cards fall back to their CSS gradient colour
}

async function initHome() {
  renderOffers();
  /* Category card photos — repo file wins, OtherImg sheet is the fallback.
     Repo naming: img/categories/<data-img-id>.jpg (any ext), e.g.
     img/categories/ForLadiesCategory.jpg — just drop the file & push. */
  fetchOtherImages().then(map => {
    document.querySelectorAll('[data-img-id]').forEach(el => {
      const sheetUrl = map[el.dataset.imgId];
      if (sheetUrl) el.style.backgroundImage = `url('${sheetUrl}')`;  // sheet fallback (legacy)
      probeImg(`img/categories/${el.dataset.imgId}`, url => {
        el.style.backgroundImage = `url('${url}')`;                   // repo image overrides
      });
    });
  });

  const adultsGrid = document.getElementById('homeAdultsGrid');
  const kidsGrid   = document.getElementById('homeKidsGrid');
  if (!adultsGrid && !kidsGrid) return;

  try {
    const products = await fetchProducts();

    /* New Arrivals + Hot Deals horizontal strips (4.4 / 4.5) — hidden when empty */
    const strip = (sectionId, gridId, items) => {
      const sec  = document.getElementById(sectionId);
      const grid = document.getElementById(gridId);
      if (!sec || !grid) return;
      if (!items.length) { sec.style.display = 'none'; return; }
      sec.style.display = '';
      const frag = document.createDocumentFragment();
      items.slice(0, 10).forEach(p => frag.appendChild(createProductCard(p)));
      grid.innerHTML = '';
      grid.appendChild(frag);
    };
    const inStock = products.filter(p => !p.stock.toLowerCase().includes('out'));
    strip('newArrivalsSection', 'newArrivalsStrip',
      inStock.filter(p => (p.boost || '').toLowerCase().includes('new')).reverse());
    strip('hotDealsSection', 'hotDealsStrip',
      inStock.filter(p => /hot|trending|clearance/i.test(p.boost || '') || p.strike));
    strip('giftPicksSection', 'giftPicksStrip',
      inStock.filter(p => (p.boost || '').toLowerCase().includes('gift')));

    // Show top 4 adults + top 4 kids on the home page preview
    // "Almost Gone" items bubble to the top (urgency tactic)
    // To show more/fewer cards, change the .slice(0, 4) number
    const adults = products
      .filter(p => p.ageGrp === 'adults')
      .sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock))
      .slice(0, 4);

    const kids = products
      .filter(p => p.ageGrp !== 'adults')
      .sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock))
      .slice(0, 4);

    if (adultsGrid) {
      adultsGrid.innerHTML = '';
      if (adults.length) {
        const frag = document.createDocumentFragment();
        adults.forEach(p => frag.appendChild(createProductCard(p)));
        adultsGrid.appendChild(frag);
      } else {
        adultsGrid.innerHTML = '<p class="preview-empty">Check back soon for adults styles!</p>';
      }
    }

    if (kidsGrid) {
      kidsGrid.innerHTML = '';
      if (kids.length) {
        const frag = document.createDocumentFragment();
        kids.forEach(p => frag.appendChild(createProductCard(p)));
        kidsGrid.appendChild(frag);
      } else {
        kidsGrid.innerHTML = '<p class="preview-empty">Check back soon for kids styles!</p>';
      }
    }
  } catch (err) {
    console.error('Failed to load home preview:', err);
    if (adultsGrid) adultsGrid.innerHTML = '<p class="preview-empty">Unable to load products right now.</p>';
    if (kidsGrid)   kidsGrid.innerHTML   = '<p class="preview-empty">Unable to load products right now.</p>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   SHOP PAGE — full catalogue with filters
   This runs on shop.html only (detected by #productsGrid in the DOM).
   URL parameters auto-activate filters:
     shop.html?age=adults&suitable=ladies  → shows Ladies Adults only
     shop.html?age=kids                    → shows all Kids items
═══════════════════════════════════════════════════════════════ */
async function initShop() {
  // Pre-select filters from URL params: ?age=adults|kids  &suitable=ladies|gents|unisex
  const params    = new URLSearchParams(window.location.search);
  const ageParam  = (params.get('age')      || '').toLowerCase();
  const suitParam = (params.get('suitable') || '').toLowerCase();

  if (ageParam === 'adults' || ageParam === 'kids') {
    activeAge = ageParam;
    const ageFilter = document.getElementById('ageFilter');
    if (ageFilter) {
      ageFilter.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.age === ageParam);
      });
    }
  }

  if (suitParam === 'ladies' || suitParam === 'gents' || suitParam === 'unisex') {
    activeGender = suitParam;
    const genderFilter = document.getElementById('genderFilter');
    if (genderFilter) {
      genderFilter.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.gender === suitParam);
      });
    }
  }

  // ?design=CAT — pre-filter by design tag (used by "same design, other sizes" link on product page)
  const designParam = (params.get('design') || '').trim();
  if (designParam) activeTag = designParam;

  // ?boost=new|hot — navbar "New In" / "Hot Deals" deep links (4.2 / 5.2)
  const boostParam = (params.get('boost') || '').toLowerCase();
  if (['new', 'hot', 'gifts'].includes(boostParam)) activeBoost = boostParam;

  // Sort dropdown (5.4)
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    applyFilters();
  });

  injectExtraFilters();

  // Age filter
  const ageFilter = document.getElementById('ageFilter');
  if (ageFilter) {
    ageFilter.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      ageFilter.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeAge = pill.dataset.age;
      applyFilters();
    });
  }

  // Gender / Suitable For filter
  const genderFilter = document.getElementById('genderFilter');
  if (genderFilter) {
    genderFilter.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      genderFilter.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeGender = pill.dataset.gender;
      applyFilters();
    });
  }

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      if (searchClear) searchClear.style.display = searchQuery ? 'flex' : 'none';
      applyFilters();
    });
  }
  if (searchClear) {
    searchClear.style.display = 'none';
    searchClear.addEventListener('click', () => {
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      searchClear.style.display = 'none';
      applyFilters();
    });
  }

  // Fetch + render
  try {
    allProducts = await fetchProducts();
    applyFilters();

    /* 8.4 Freshness note — reassures stock is live */
    const freshEl = document.getElementById('freshNote');
    if (freshEl) {
      const loadedAt = Date.now();
      const tick = () => {
        const m = Math.round((Date.now() - loadedAt) / 60000);
        freshEl.textContent = m < 1 ? '● Stock live — updated just now' : `● Stock live — updated ${m} min ago`;
      };
      tick();
      setInterval(tick, 60000);
    }
  } catch (err) {
    if (loadingState) {
      loadingState.innerHTML = `
        <div class="error-state">
          <div class="empty-icon">⚠️</div>
          <h3>Could not load products</h3>
          <p>${escHtml(err.message)}</p>
          <button onclick="location.reload()" class="btn btn-outline" style="margin-top:12px">
            Try Again
          </button>
        </div>`;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCT DETAIL PAGE  (product.html?id=xxx)
═══════════════════════════════════════════════════════════════ */
async function initProduct() {
  const id      = new URLSearchParams(window.location.search).get('id');
  const loadEl  = document.getElementById('pdLoading');
  const errEl   = document.getElementById('pdError');
  const contEl  = document.getElementById('pdContent');
  const relWrap = document.getElementById('pdRelatedWrap');

  if (!id) { loadEl.style.display = 'none'; errEl.style.display = 'block'; return; }

  try {
    const products = await fetchProducts();
    const p = products.find(q => q.id === id);
    if (!p) { loadEl.style.display = 'none'; errEl.style.display = 'block'; return; }

    /* Page title & breadcrumb */
    const bcEl = document.getElementById('pdBcName');
    const ageSlug = (p.type || '').toLowerCase() === 'kids' ? 'kids' : 'adults';
    if (bcEl) bcEl.innerHTML = `<a class="pd-bc-type" href="shop.html?age=${ageSlug}">${escHtml(p.type)}</a>`;

    /* Main image */
    const imgUrl  = resolveImageUrl(p.image);
    const img2Url = resolveImageUrl(p.image2);
    const mainImgEl = document.getElementById('pdMainImg');
    mainImgEl.innerHTML = imgUrl
      ? `<img id="pdMainImgTag" src="${escHtml(imgUrl)}" alt="${escHtml(p.type)}" data-lead="${escHtml(p.leadNum || '')}"
             onerror="ttImgErr(this,'<div class=\\'pd-img-placeholder\\'><span>👕</span><small>Photo coming soon</small></div>')" />`
      : `<div class="pd-img-placeholder"><span>👕</span><small>Photo coming soon</small></div>`;

    /* 8.1 Lightbox — click the main image to zoom fullscreen */
    mainImgEl.style.cursor = 'zoom-in';
    mainImgEl.addEventListener('click', () => {
      const img = document.getElementById('pdMainImgTag');
      if (img) openLightbox(img.src);
    });

    /* Extra image thumbnails: <num>A … <num>Z — sequential, stops at first missing.
       Add as many views as you like: 00001A.jpg, 00001B.jpg, 00001C.jpg … */
    {
      const thumbEl = document.getElementById('pdThumbRow');
      const makeThumb = (url, label) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.alt = `${p.type} — ${label}`;
        thumb.className = 'pd-thumb';
        thumb.addEventListener('click', () => {
          const main = document.getElementById('pdMainImgTag');
          if (main) main.src = url;
          thumbEl.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });
        thumbEl.appendChild(thumb);
        return thumb;
      };
      const addThumb = (letterIdx) => {
        if (letterIdx >= 26 || !thumbEl) return;
        const suffix = String.fromCharCode(65 + letterIdx); // A, B, C …
        probeFam(p, suffix, url => {
          makeThumb(url, `view ${letterIdx + 2}`);
          addThumb(letterIdx + 1);   // found → try the next letter
        });
      };
      /* Main image first (highlighted), then extra views A, B, C … */
      probeFam(p, '', url => {
        makeThumb(url, 'main view').classList.add('active');
      });
      if (thumbEl) addThumb(0);
    }

    /* Size guide image by product type: img/sizeguide/kids.jpg / adults.jpg
       (any extension — jpg/jpeg/png/webp). Shown only if the file exists. */
    probeImg(`img/sizeguide/${(p.type || '').trim().toLowerCase()}`, url => {
      const sg = document.getElementById('pdSizeGuide');
      if (sg) sg.innerHTML = `
        <div class="pd-sizeguide">
          <div class="pd-sizeguide-title">📏 Size Guide</div>
          <img src="${url}" alt="Size guide" loading="lazy" />
        </div>`;
    });

    /* Badges */
    const audience = getAudienceLabel(p.ageGrp, p.suitable);
    const audBadge = audience.label
      ? `<span class="badge badge-audience">${audience.emoji} ${audience.label}</span>` : '';
    document.getElementById('pdBadges').innerHTML =
      `${getBoostBadgeHtml(p.boost)} ${getStockBadgeHtml(p.stock)}`;

    /* Title */
    /* Title: design-first (sell the story) — "Harry Potter — Kids Plain Tee" */
    const pdTitleText = (p.design?.[0]
      ? `${p.design[0]} — ${p.type} ${p.category || ''} Tee`.replace(/\s+/g, ' ')
      : p.type) + (p.size ? ` (${p.size})` : '');
    document.getElementById('pdTitle').textContent = pdTitleText;

    /* 7.2 SEO: unique title + meta description + Product JSON-LD */
    document.title = `${pdTitleText} — TeeTales`;
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `${pdTitleText}${p.price ? ` — ${CONFIG.CURRENCY} ${formatNum(p.price)}` : ''}. Premium DTF-printed tee. Order via WhatsApp, islandwide delivery in Sri Lanka.`);
    const ldEl = document.createElement('script');
    ldEl.type = 'application/ld+json';
    ldEl.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product',
      name: pdTitleText, sku: p.id,
      image: p.image ? `${location.origin}/${p.image}` : undefined,
      brand: { '@type': 'Brand', name: 'TeeTales' },
      offers: {
        '@type': 'Offer', priceCurrency: 'LKR', price: p.price || p.org || 0,
        availability: p.stock.toLowerCase().includes('out')
          ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    });
    document.head.appendChild(ldEl);

    /* Price */
    let priceHtml = '';
    if (p.price !== null && p.strike !== null && p.strike > p.price) {
      const disc = Math.round((1 - p.price / p.strike) * 100);
      priceHtml = `<span class="pd-price-current">${CONFIG.CURRENCY} ${formatNum(p.price)}</span>
                   <span class="pd-price-strike">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span>
                   <span class="price-badge">-${disc}%</span>`;
    } else if (p.price !== null) {
      priceHtml = `<span class="pd-price-current">${CONFIG.CURRENCY} ${formatNum(p.price)}</span>`;
    } else if (p.strike !== null) {
      priceHtml = `<span class="pd-price-current">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span>`;
    } else {
      priceHtml = `<span class="pd-price-ask">Contact us for price</span>`;
    }
    document.getElementById('pdPrice').innerHTML = priceHtml;

    // Bulk promo banner (TBOS spec) — full-width line above image + details
    const pdBulk = (p.bulkPrice && p.price && p.bulkPrice < p.price) ? p.bulkPrice : null;
    const bulkBannerEl = document.getElementById('pdBulkBanner');
    if (bulkBannerEl) bulkBannerEl.innerHTML =
      `<div class="pd-bulk-note pd-bulk-banner">👨‍👩‍👧‍👦 Buying for a family or group? <strong>5+ tees switch to bulk prices automatically</strong>${pdBulk ? ` — this tee just <strong>${CONFIG.CURRENCY} ${formatNum(pdBulk)}</strong> each` : ''}. Mix any sizes & designs!</div>`;

    /* Meta list */
    const swatchColor = getSwatchColor(p.colour);
    const swatchDot   = p.colour
      ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}"></span>` : '';
    const ageIsKids   = p.ageGrp && p.ageGrp !== 'adults';
    const metaItems   = [
      p.colour     ? `<div class="pd-meta-item"><dt>Colour</dt><dd>${swatchDot}${escHtml(p.colour)}</dd></div>` : '',
      p.size       ? `<div class="pd-meta-item"><dt>Size</dt><dd><span class="pd-size-chip">${escHtml(p.size)}</span></dd></div>` : '',
      p.category   ? `<div class="pd-meta-item"><dt>Style</dt><dd>${escHtml(p.category)}</dd></div>` : '',
      /* Print Size: adults only (kids is always NA) */
      (p.printSize && p.printSize.toLowerCase() !== 'na' && (p.type || '').toLowerCase() !== 'kids')
                   ? `<div class="pd-meta-item"><dt>Print Size</dt><dd>${escHtml(p.printSize)}</dd></div>` : '',
      ageIsKids    ? `<div class="pd-meta-item"><dt>Age Group</dt><dd>🎂 ${escHtml(p.ageGrp)}</dd></div>` : '',
      p.material   ? `<div class="pd-meta-item"><dt>Material</dt><dd>${escHtml(p.material)}</dd></div>` : '',
      p.design.length
        ? `<div class="pd-meta-item pd-meta-full"><dt>Design</dt><dd>${p.design.map(t => `<span class="card-tag-chip">${escHtml(t)}</span>`).join('')}</dd></div>`
        : '',
    ].filter(Boolean);
    document.getElementById('pdMeta').innerHTML = metaItems.join('');

    /* Available Sizes — same design+colour tee in other sizes (Phase 16) */
    const fam = familyMembers(p);
    const sizeRowEl = document.getElementById('pdSizeRow');
    if (sizeRowEl && fam.length > 1) {
      const bySize = {};
      fam.forEach(q => { bySize[(q.size || '').toLowerCase()] = q; });
      const ordered = [...SIZE_LADDER.filter(sz => bySize[sz]),
                       ...Object.keys(bySize).filter(sz => !SIZE_LADDER.includes(sz))];
      sizeRowEl.innerHTML = `
        <div class="pd-sizerow">
          <span class="pd-sizerow-label">Available Sizes</span>
          <div class="pd-sizerow-chips">${ordered.map(sz => {
            const q = bySize[sz], label = sz.toUpperCase();
            if (q.id === p.id) return `<span class="pd-size-opt current" title="You're viewing this size">${label}</span>`;
            if (q.stock.toLowerCase().includes('out')) return `<span class="pd-size-opt out" title="Sold out">${label}</span>`;
            return `<a class="pd-size-opt" href="product.html?id=${encodeURIComponent(q.id)}" title="View ${label}">${label}</a>`;
          }).join('')}</div>
          <span class="pd-sizerow-hint">Tap a size to switch</span>
        </div>`;
    }

    /* Add to Cart — qty selector + button */
    const isOut = p.stock.toLowerCase().includes('out');
    if (isOut) {
      document.getElementById('pdOrderBtn').innerHTML =
        `<button class="pd-add-cart-btn" disabled>✕ Sold Out</button>
         <p class="pd-qty-itemid" style="margin-top:8px">Item ID: ${p.id}</p>`;
    } else {
      document.getElementById('pdOrderBtn').innerHTML = `
        <div class="pd-qty-wrap">
          <span class="pd-qty-label">Qty:</span>
          <button class="qty-btn" id="pdQtyMinus" disabled>−</button>
          <span class="qty-num" id="pdQtyVal">1</span>
          <button class="qty-btn" id="pdQtyPlus" ${p.units <= 1 ? 'disabled' : ''}>+</button>
          <span class="pd-qty-max">(${p.units} available)</span>
          <span class="pd-qty-itemid">Item ID: ${p.id}</span>
        </div>
        <button class="pd-add-cart-btn" id="pdAddCart">
          <i class="fas fa-shopping-bag"></i> Add to Cart
        </button>`;
      let pdQty = 1;
      document.getElementById('pdQtyPlus').addEventListener('click', () => {
        if (pdQty < p.units) {
          pdQty++;
          document.getElementById('pdQtyVal').textContent = pdQty;
          document.getElementById('pdQtyMinus').disabled = false;
          if (pdQty >= p.units) document.getElementById('pdQtyPlus').disabled = true;
        }
      });
      document.getElementById('pdQtyMinus').addEventListener('click', () => {
        if (pdQty > 1) {
          pdQty--;
          document.getElementById('pdQtyVal').textContent = pdQty;
          document.getElementById('pdQtyPlus').disabled = false;
          if (pdQty <= 1) document.getElementById('pdQtyMinus').disabled = true;
        }
      });
      document.getElementById('pdAddCart').addEventListener('click', () => {
        cartAdd(p, pdQty);
        openCart();
      });

      // (12.7 "other sizes" prompt removed — superseded by the Available Sizes row)
    }

    /* Show content */
    loadEl.style.display = 'none';
    contEl.style.display = 'block';

    /* Related products — same audience first, then anything in stock */
    const related = products
      .filter(q => q.id !== p.id && !q.stock.toLowerCase().includes('out'))
      .sort((a, b) => {
        const score = r => {
          if (r.suitable === p.suitable && r.ageGrp === p.ageGrp) return 3;
          if (r.suitable === p.suitable || r.ageGrp === p.ageGrp) return 2;
          return 0;
        };
        return score(b) - score(a);
      })
      .slice(0, 4);

    if (related.length) {
      const grid = document.getElementById('pdRelatedGrid');
      related.forEach(rp => grid.appendChild(createProductCard(rp)));
      relWrap.style.display = 'block';
    }

  } catch (err) {
    if (loadEl) loadEl.style.display = 'none';
    if (errEl)  { errEl.style.display = 'block'; errEl.innerHTML = `<p style="font-size:2.5rem;margin-bottom:12px">😕</p><p>Failed to load product. <a href="shop.html">Browse the shop →</a></p>`; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   CART — localStorage, no account needed
   Stored as: [{id, type, ageGrp, colour, design, size, price, units, qty}]
   To edit WA message format: see buildCartWAMessage()
═══════════════════════════════════════════════════════════════ */
const CART_KEY = 'tt_cart';
const cartGet  = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
const cartSave = c  => { localStorage.setItem(CART_KEY, JSON.stringify(c)); cartBadgeUpdate(); };

function cartAdd(p, qty = 1) {
  const cart = cartGet();
  const ex = cart.find(i => i.id === p.id);
  if (ex) {
    ex.qty = Math.min(ex.qty + qty, ex.units);
  } else {
    cart.push({ id: p.id, type: p.type, ageGrp: p.ageGrp, colour: p.colour,
                design: p.design, size: p.size, price: p.price ?? p.strike,
                strike: p.strike, org: p.org, bulkPrice: p.bulkPrice, lead: p.leadNum || '',
                units: p.units, qty: Math.min(qty, p.units) });
  }
  cartSave(cart);
  cartToast();
}

function cartUpdateQty(id, delta) {
  const cart = cartGet();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(0, Math.min(item.qty + delta, item.units));
  if (item.qty === 0) cart.splice(cart.indexOf(item), 1);
  cartSave(cart);
  refreshCartViews();
}
window.cartUpdateQty = cartUpdateQty;

function cartRemove(id) { cartSave(cartGet().filter(i => i.id !== id)); refreshCartViews(); }
window.cartRemove = cartRemove;

/* Re-render whichever cart views exist (drawer always; cart.html page if present) */
function refreshCartViews() {
  renderCartDrawer();
  if (document.getElementById('cartPage')) renderCartPage();
}

function cartCount() { return cartGet().reduce((s, i) => s + i.qty, 0); }

/* ── BULK PRICING (auto-applies at BULK_MIN+ total units, mixed sizes/designs count)
   BulkPrice now comes straight from WebStock column I (2026-07-21) — set per item by the
   sheet formula =IF(AND(Type="Kids",Size="S"),OrgPrice-101,IF(AND(Type="Kids",Size="M"),
   OrgPrice-125,OrgPrice-151)) — standard items get the flat Rs.151 gap, Kids S/M get a
   smaller gap so bulk price never sells below unit cost (see TBOS Break-even Analysis). */
const BULK_MIN = 5;
function bulkPriceOf(i) {
  const b = i.bulkPrice;
  return (b && i.price && b < i.price) ? b : null;   // only if it's a real saving
}
function cartBulkActive(cart) { return (cart || cartGet()).reduce((s, i) => s + i.qty, 0) >= BULK_MIN; }
function cartEffPrice(i, bulkOn) { return (bulkOn ? bulkPriceOf(i) : null) ?? i.price ?? 0; }
function cartSingleTotal(cart) { return cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0); }
function cartOrgTotal(cart)    { return cart.reduce((s, i) => s + ((i.org || i.strike || i.price || 0)) * i.qty, 0); }  // anchor total

/* One price line for a cart item: ~~Org~~ price + DISCOUNT/BULK tag + percent off.
   <5: ~~Org~~ DC [DISCOUNT] −9%  ·  ≥5: ~~Org~~ Bulk [BULK] −14%  ·  no cut: plain Org */
function cartItemPriceHtml(item, bulk) {
  const anchor = item.org || item.strike;
  const shown  = bulk ?? item.price;
  if (!shown) return '';
  const hasCut = anchor && anchor > shown;
  const now    = `<span class="cart-price-now">${CONFIG.CURRENCY} ${formatNum(shown)}</span>`;
  const strike = hasCut ? ` <span class="cart-price-strike">${CONFIG.CURRENCY} ${formatNum(anchor)}</span>` : '';
  const pct    = hasCut ? ` <span class="cart-pct-chip">-${Math.round((anchor - shown) / anchor * 100)}%</span>` : '';
  const tag    = bulk   ? ` <span class="cart-bulk-tag">BULK</span>` : '';
  return `${now}${strike}${pct}${tag}`;
}

function cartTotal() {
  const cart = cartGet(), bulkOn = cartBulkActive(cart);
  return cart.reduce((s, i) => s + cartEffPrice(i, bulkOn) * i.qty, 0);
}

function cartBadgeUpdate() {
  const n = cartCount();
  document.querySelectorAll('#cartBadge, #cartBadgeMobile').forEach(b => {
    b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none';
  });
  const btn = document.getElementById('cartBtn');
  if (btn) btn.title = n === 0 ? 'Your cart is empty' : `${n} item${n !== 1 ? 's' : ''} in your cart`;
}

/* 10.4 Mobile bottom nav needs the same live badge — id collision avoided via querySelectorAll above */

/* ── 9.2 Delivery note / occasion date (optional) — appended to WA order message ── */
const CART_NOTE_KEY = 'tt_cart_note';
const cartNoteGet  = () => localStorage.getItem(CART_NOTE_KEY) || '';
const cartNoteSave = v  => localStorage.setItem(CART_NOTE_KEY, v);
window.cartNoteSave = cartNoteSave;
function cartNoteFieldHtml() {
  return `<div class="cart-note-field">
    <label for="cartNoteInput">📝 Delivery note / occasion (optional)</label>
    <input type="text" id="cartNoteInput" maxlength="120" placeholder="e.g. Need by Friday — birthday gift"
           value="${escHtml(cartNoteGet())}" oninput="cartNoteSave(this.value)" />
  </div>`;
}

/* ── Cart → Wishlist: "Save for later" moves one item out of the cart ── */
function cartSaveForLater(id) {
  const cart = cartGet();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const w = wishGet();
  if (!w.some(x => x.id === id)) {
    const name = `${item.design?.[0] ? item.design[0] + ' — ' : ''}${item.type} ${item.colour || ''}`.trim() + (item.size ? ` (${item.size})` : '');
    w.push({ id: item.id, name, price: item.price, lead: item.lead || '' });
    wishSave(w);
  }
  cartRemove(id);
}
window.cartSaveForLater = cartSaveForLater;

function cartToast() {
  let t = document.getElementById('cartToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cartToast'; t.className = 'cart-toast';
    document.body.appendChild(t);
  }
  t.textContent = '✓ Added to cart';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2000);
}

// Called from product card "Add to Cart" onclick
function cartAddFromCard(id) {
  const p = _ttProdMap[id];
  if (!p || p.stock.toLowerCase().includes('out')) return;
  cartAdd(p, 1);
  openCart();
}
window.cartAddFromCard = cartAddFromCard;

function openCart()  {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
window.openCart  = openCart;
window.closeCart = closeCart;

function buildCartWAMessage() {
  // Format: [ID] Adults · Navy · Cat · M · Rs. 1,299 × 2
  const cart = cartGet(), bulkOn = cartBulkActive(cart);
  const lines = cart.map((item, i) => {
    const age    = item.ageGrp === 'adults' ? 'Adults' : 'Kids';
    const design = item.design?.[0] || '';
    const eff    = cartEffPrice(item, bulkOn);
    const isBulk = bulkOn && bulkPriceOf(item);
    const price  = eff ? `${CONFIG.CURRENCY} ${formatNum(eff)}${isBulk ? ' (bulk)' : ''}` : '';
    return `${i + 1}. [${item.id}] ${age} · ${item.colour} · ${design} · ${item.size} · ${price} × ${item.qty}`;
  });
  const saved   = cartOrgTotal(cart) - cartTotal();
  const bulkNote = bulkOn && saved > 0
    ? `\n🎉 Bulk price applied (${cartCount()} tees) — saving ${CONFIG.CURRENCY} ${formatNum(saved)}\n`
    : '';
  const note = cartNoteGet().trim();
  const noteLine = note ? `\n📝 Note: ${note}\n` : '';
  return `Hi TeeTales! 👋 I'd like to order:\n\n${lines.join('\n')}\n${bulkNote}${noteLine}\nTotal: ${CONFIG.CURRENCY} ${formatNum(cartTotal())}\n\nPlease confirm availability! 👕`;
}

function renderCartDrawer() {
  const body   = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (!body) return;
  const cart = cartGet();
  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>Your cart is empty</p>
      <a href="shop.html" onclick="closeCart()" class="btn btn-primary" style="margin-top:16px;display:inline-block">Browse Tees</a></div>`;
    if (footer) footer.style.display = 'none';
    return;
  }
  const bulkOn = cartBulkActive(cart);

  /* Bulk banner / nudge (TBOS Bulk Pricing UX spec) */
  const n = cart.reduce((s, i) => s + i.qty, 0);
  let bulkHtml = '';
  if (bulkOn) {
    const saved = cartOrgTotal(cart) - cartTotal();
    if (saved > 0) {
      const pct = Math.round(saved / cartOrgTotal(cart) * 100);
      bulkHtml = `<div class="cart-bulk-banner">🎉 <strong>Bulk price unlocked!</strong> You're saving ${CONFIG.CURRENCY} ${formatNum(saved)} (${pct}% off) on this order</div>`;
    }
  } else if (n >= 3) {
    // Marginal framing: what would the 5-tee order cost vs now + what bulk saves on current tees
    const need = BULK_MIN - n;
    const savedIfBulk = cart.reduce((s, i) => {
      const b = bulkPriceOf(i);
      return s + (b ? (i.price - b) * i.qty : 0);
    }, 0);
    if (savedIfBulk > 0) {
      const pct = Math.round(savedIfBulk / cartSingleTotal(cart) * 100);
      bulkHtml = `<div class="cart-bulk-nudge">💡 Add <strong>${need} more tee${need > 1 ? 's' : ''}</strong> (any size or design) & <strong>Bulk Price unlocks on ALL ${BULK_MIN}</strong> — that's ~${pct}% off every tee already in your cart!</div>`;
    }
  }

  body.innerHTML = bulkHtml + cart.map(item => {
    const age    = item.ageGrp === 'adults' ? 'Adults' : 'Kids';
    const design = item.design?.[0] || '';
    const bulk  = bulkOn ? bulkPriceOf(item) : null;
    const price = cartItemPriceHtml(item, bulk);
    return `
    <div class="cart-item">
      <img class="cart-item-img" src="${escHtml(repoImg(item.id, ''))}" alt=""
           data-lead="${escHtml(item.lead || '')}" loading="lazy" onerror="ttImgErr(this,'remove')" />
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.type)}</div>
        <div class="cart-item-meta">${escHtml(age)} · ${escHtml(item.colour)} · ${escHtml(design)} · ${escHtml(item.size)}</div>
        <div class="cart-item-id">ID: ${escHtml(item.id)}</div>
        <div class="cart-item-price">${price}</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="cartUpdateQty('${escHtml(item.id)}',-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="cartUpdateQty('${escHtml(item.id)}',1)"
          ${item.qty >= item.units ? 'disabled title="Max available"' : ''}>+</button>
        <button class="cart-item-save" onclick="cartSaveForLater('${escHtml(item.id)}')" title="Save for later"><i class="far fa-heart"></i></button>
        <button class="cart-item-remove" onclick="cartRemove('${escHtml(item.id)}')">✕</button>
      </div>
    </div>`;
  }).join('');
  if (footer) {
    footer.style.display = 'block';
    /* Retail / Saved / Total breakdown — same as cart.html, so the savings are
       visible even to shoppers who never open the full cart page */
    const orgTot = cartOrgTotal(cart);
    const saved  = orgTot - cartTotal();
    footer.innerHTML = `
      ${cartNoteFieldHtml()}
      <div class="cart-summary-row"><span>Retail Price (${n} items)</span><span>${CONFIG.CURRENCY} ${formatNum(orgTot)}</span></div>
      ${saved > 0 ? `<div class="cart-summary-row cart-summary-save"><span>Saved${bulkOn ? ' (Bulk)' : ''}</span><span><span class="cart-pct-label">${Math.round(saved / orgTot * 100)}% OFF</span> − ${CONFIG.CURRENCY} ${formatNum(saved)}</span></div>` : ''}
      <div class="cart-summary-row cart-summary-total"><span>Total</span><strong class="cart-total-now">${CONFIG.CURRENCY} ${formatNum(cartTotal())}</strong></div>
      <p class="cart-cod-note">🏦 Payment via bank transfer — details confirmed on WhatsApp</p>
      <a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(buildCartWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn" onclick="setTimeout(()=>location.href='order-sent.html',350)">
        <i class="fab fa-whatsapp"></i> Order via WhatsApp
      </a>
      <a href="cart.html" class="cart-view-full">View Full Cart →</a>`;
  }
}

/* ── CART PAGE (cart.html) — full-page version of the drawer ── */
function renderCartPage() {
  const el = document.getElementById('cartPage');
  if (!el) return;
  const cart = cartGet();
  if (!cart.length) {
    el.innerHTML = `<div class="cart-empty cart-page-empty"><div class="cart-empty-icon">🛒</div>
      <p>Your cart is empty</p>
      <a href="shop.html" class="btn btn-primary" style="margin-top:16px;display:inline-block">Browse Tees</a></div>`;
    return;
  }
  const bulkOn = cartBulkActive(cart);
  const n = cart.reduce((s, i) => s + i.qty, 0);

  /* Bulk banner / nudge — same logic as drawer */
  let bulkHtml = '';
  const singleTot = cartSingleTotal(cart);
  if (bulkOn) {
    const saved = cartOrgTotal(cart) - cartTotal();
    if (saved > 0) {
      const pct = Math.round(saved / cartOrgTotal(cart) * 100);
      bulkHtml = `<div class="cart-bulk-banner">🎉 <strong>Bulk price unlocked!</strong> You're saving ${CONFIG.CURRENCY} ${formatNum(saved)} (${pct}% off) on this order</div>`;
    }
  } else if (n >= 3) {
    const need = BULK_MIN - n;
    const savedIfBulk = cart.reduce((s, i) => {
      const b = bulkPriceOf(i); return s + (b ? (i.price - b) * i.qty : 0);
    }, 0);
    if (savedIfBulk > 0) {
      const pct = Math.round(savedIfBulk / singleTot * 100);
      bulkHtml = `<div class="cart-bulk-nudge">💡 Add <strong>${need} more tee${need > 1 ? 's' : ''}</strong> (any size or design) & <strong>Bulk Price unlocks on ALL ${BULK_MIN}</strong> — that's ~${pct}% off every tee already in your cart!</div>`;
    }
  }

  const rows = cart.map(item => {
    const age    = item.ageGrp === 'adults' ? 'Adults' : 'Kids';
    const design = item.design?.[0] || '';
    const bulk      = bulkOn ? bulkPriceOf(item) : null;
    const eff       = cartEffPrice(item, bulkOn);
    const priceHtml = cartItemPriceHtml(item, bulk);
    return `
    <div class="cart-page-item">
      <a href="product.html?id=${encodeURIComponent(item.id)}">
        <img class="cart-page-img" src="${escHtml(repoImg(item.id, ''))}" alt="${escHtml(item.type)}"
             data-lead="${escHtml(item.lead || '')}" loading="lazy" onerror="ttImgErr(this,'remove')" />
      </a>
      <div class="cart-item-info">
        <div class="cart-item-name"><a href="product.html?id=${encodeURIComponent(item.id)}">${escHtml(item.type)}</a></div>
        <div class="cart-item-meta">${escHtml(age)} · ${escHtml(item.colour)} · ${escHtml(design)} · ${escHtml(item.size)}</div>
        <div class="cart-item-id">ID: ${escHtml(item.id)}</div>
        <div class="cart-item-price">${priceHtml}</div>
      </div>
      <div class="cart-page-right">
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="cartUpdateQty('${escHtml(item.id)}',-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="cartUpdateQty('${escHtml(item.id)}',1)"
            ${item.qty >= item.units ? 'disabled title="Max available"' : ''}>+</button>
        </div>
        <div class="cart-line-total">${CONFIG.CURRENCY} ${formatNum(eff * item.qty)}</div>
        <button class="cart-item-save" onclick="cartSaveForLater('${escHtml(item.id)}')" title="Save for later"><i class="far fa-heart"></i> Save for later</button>
        <button class="cart-item-remove" onclick="cartRemove('${escHtml(item.id)}')" title="Remove">✕ Remove</button>
      </div>
    </div>`;
  }).join('');

  /* Summary anchored on OrgPrice: Items = full original value, savings = Org − payable */
  const orgTot = cartOrgTotal(cart);
  const saved  = orgTot - cartTotal();
  el.innerHTML = `
    ${bulkHtml}
    <div class="cart-page-list">${rows}</div>
    <div id="cartUpsellWrap"></div>
    <div class="cart-page-summary">
      ${cartNoteFieldHtml()}
      <div class="cart-summary-row"><span>Retail Price (${n} items)</span><span>${CONFIG.CURRENCY} ${formatNum(orgTot)}</span></div>
      ${saved > 0 ? `<div class="cart-summary-row cart-summary-save"><span>Saved${bulkOn ? ' (Bulk)' : ''}</span><span><span class="cart-pct-label">${Math.round(saved / orgTot * 100)}% OFF</span> − ${CONFIG.CURRENCY} ${formatNum(saved)}</span></div>` : ''}
      <div class="cart-summary-row cart-summary-total"><span>Total</span><strong class="cart-total-now">${CONFIG.CURRENCY} ${formatNum(cartTotal())}</strong></div>
      <p class="cart-cod-note">🏦 Payment via bank transfer — details confirmed on WhatsApp</p>
      <a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(buildCartWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn" onclick="setTimeout(()=>location.href='order-sent.html',350)">
        <i class="fab fa-whatsapp"></i> Order via WhatsApp
      </a>
      <p class="cart-summary-note">Sending the order opens WhatsApp with your cart pre-filled — nothing is charged until we confirm with you. 😊</p>
    </div>`;

  /* 9.1 Upsell — "You may also like", excludes items already in cart */
  const upsellWrap = document.getElementById('cartUpsellWrap');
  if (upsellWrap && allProducts.length) {
    const inCart = new Set(cart.map(i => i.id));
    const modeAge = (() => {
      const c = {}; cart.forEach(i => c[i.ageGrp] = (c[i.ageGrp] || 0) + i.qty);
      return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    })();
    const upsell = allProducts
      .filter(p => !inCart.has(p.id) && !p.stock.toLowerCase().includes('out'))
      .sort((a, b) => (b.ageGrp === modeAge) - (a.ageGrp === modeAge) || stockPriority(a.stock) - stockPriority(b.stock))
      .slice(0, 4);
    if (upsell.length) {
      upsellWrap.innerHTML = `<div class="strip-head"><h3>You may also like</h3></div><div class="h-strip" id="cartUpsellGrid"></div>`;
      const g = document.getElementById('cartUpsellGrid');
      upsell.forEach(p => g.appendChild(createProductCard(p)));
    }
  }
}

/* ═══ 8.1 LIGHTBOX — simple fullscreen image zoom, no library ═══ */
function openLightbox(src) {
  let lb = document.getElementById('ttLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'ttLightbox'; lb.className = 'tt-lightbox';
    lb.innerHTML = `<img alt="Zoomed product photo" /><span class="tt-lightbox-close">✕</span>`;
    lb.addEventListener('click', () => lb.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('open'); });
    document.body.appendChild(lb);
  }
  lb.querySelector('img').src = src;
  lb.classList.add('open');
}

/* ═══ 8.2 WISHLIST — ❤ save for later, localStorage, WA "order all" ═══
   Stores product snapshots so the wishlist works on every page. */
const WISH_KEY = 'tt_wishlist';
const wishGet  = () => { try { return JSON.parse(localStorage.getItem(WISH_KEY)) || []; } catch { return []; } };
const wishSave = w => { localStorage.setItem(WISH_KEY, JSON.stringify(w)); wishBadgeUpdate(); };
const wishHas  = id => wishGet().some(i => i.id === id);

function wishToggle(id, btn) {
  const w = wishGet();
  const i = w.findIndex(x => x.id === id);
  if (i > -1) w.splice(i, 1);
  else {
    const p = _ttProdMap[id];
    if (!p) return;
    w.push({ id: p.id, name: (p.design?.[0] ? `${p.design[0]} — ` : '') + `${p.type} ${p.category || ''}`.trim() + (p.size ? ` (${p.size})` : ''), price: p.price, lead: p.leadNum || '' });
  }
  wishSave(w);
  if (btn) {
    const ic = btn.querySelector('i');
    if (ic) ic.className = (i > -1 ? 'far' : 'fas') + ' fa-heart';
    btn.classList.toggle('saved', i === -1);
  }
  if (document.getElementById('wishDrawer')?.classList.contains('open')) renderWishDrawer();
}
window.wishToggle = wishToggle;

function wishBadgeUpdate() {
  const b = document.getElementById('wishBadge');
  const n = wishGet().length;
  if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; }
}

function buildWishWAMessage() {
  const lines = wishGet().map((i, n) =>
    `${n + 1}. [${i.id}] ${i.name}${i.price ? ` · ${CONFIG.CURRENCY} ${formatNum(i.price)}` : ''}`);
  return `Hi TeeTales! 💛 I've saved these tees — are they available?\n\n${lines.join('\n')}\n\nPlease let me know! 👕`;
}

function renderWishDrawer() {
  const body = document.getElementById('wishBody');
  const foot = document.getElementById('wishFooter');
  if (!body) return;
  const w = wishGet();
  if (!w.length) {
    body.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">💛</div><p>No saved tees yet</p>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:6px">Tap the ♡ on any tee to save it for later</p></div>`;
    if (foot) foot.style.display = 'none';
    return;
  }
  body.innerHTML = w.map(i => `
    <div class="cart-item">
      <img class="cart-item-img" src="img/products/${(String(i.id).match(/(\d{5})$/) || ['', ''])[1]}.jpg"
           data-lead="${escHtml(i.lead || '')}" loading="lazy" onerror="ttImgErr(this,'remove')" />
      <div class="cart-item-info">
        <div class="cart-item-name"><a href="product.html?id=${encodeURIComponent(i.id)}">${escHtml(i.name)}</a></div>
        <div class="cart-item-price">${i.price ? `${CONFIG.CURRENCY} ${formatNum(i.price)}` : ''}</div>
      </div>
      <button class="cart-item-remove" onclick="wishToggle('${escHtml(i.id)}')">✕</button>
    </div>`).join('');
  if (foot) {
    foot.style.display = 'block';
    foot.innerHTML = `
      <a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(buildWishWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn">
        <i class="fab fa-whatsapp"></i> Ask About All (${w.length})
      </a>`;
  }
}

function openWishlist() {
  let d = document.getElementById('wishDrawer');
  if (!d) {
    const ov = document.createElement('div');
    ov.className = 'cart-overlay'; ov.id = 'wishOverlay';
    ov.onclick = closeWishlist;
    d = document.createElement('div');
    d.className = 'cart-drawer'; d.id = 'wishDrawer';
    d.innerHTML = `<div class="cart-header"><span>💛 Saved Tees</span>
      <button class="cart-close" onclick="closeWishlist()" aria-label="Close">✕</button></div>
      <div class="cart-body" id="wishBody"></div>
      <div class="cart-footer" id="wishFooter" style="display:none"></div>`;
    document.body.appendChild(ov); document.body.appendChild(d);
  }
  renderWishDrawer();
  document.getElementById('wishOverlay').classList.add('open');
  d.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeWishlist() {
  document.getElementById('wishDrawer')?.classList.remove('open');
  document.getElementById('wishOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
window.openWishlist = openWishlist;
window.closeWishlist = closeWishlist;

/* ═══════════════════════════════════════════════════════════════
   BOOT — runs once when the page finishes loading
   Detects which page we're on and calls the right init function:
     index.html  → has #homeAdultsGrid → initHome()
     shop.html   → has #productsGrid   → initShop()
     product.html→ has #pdContent      → initProduct()
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Footer year — automatically keeps the copyright year current
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Cart icon badge — update count on every page load
  cartBadgeUpdate();
  document.getElementById('cartBtn')?.addEventListener('click', openCart);
  wishBadgeUpdate();
  document.getElementById('wishBtn')?.addEventListener('click', openWishlist);

  // Announcement bar — rotating messages + dismiss (remembers for 24h via localStorage)
  const announceBar   = document.getElementById('announceBar');
  const announceClose = document.getElementById('announceClose');
  if (announceBar && announceClose) {
    const dismissed = localStorage.getItem('tt_announce_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 86400000) {
      announceBar.style.display = 'none';  // keep hidden for 24h after user closes it
    } else {
      document.body.classList.add('has-announce');
      // Rotate through messages every 3 seconds
      const msgs = announceBar.querySelectorAll('.announce-msg');
      if (msgs.length > 1) {
        let i = 0;
        setInterval(() => {
          msgs[i].classList.remove('active');
          i = (i + 1) % msgs.length;
          msgs[i].classList.add('active');
        }, 3000);
      }
    }
    announceClose.addEventListener('click', () => {
      announceBar.style.display = 'none';
      document.body.classList.remove('has-announce');
      localStorage.setItem('tt_announce_dismissed', Date.now());
    });
  }

  // Navbar scroll shrink
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Hamburger
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
       hamburger.classList.toggle('open', isOpen);
    });
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
      });
    });
  }


  // Floating WhatsApp button — show after scroll
  const floatWA = document.getElementById('floatWA');
  if (floatWA) {
    window.addEventListener('scroll', () => {
      floatWA.classList.toggle('visible', window.scrollY > 300);
    });
  }

  if (document.getElementById('homeAdultsGrid')) {
    initHome();
  } else if (document.getElementById('productsGrid')) {
    initShop();
  } else if (document.getElementById('pdContent')) {
    initProduct();
  } else if (document.getElementById('cartPage')) {
    // Fetch the catalogue first so the "You may also like" upsell row has data
    fetchProducts().then(products => { allProducts = products; renderCartPage(); }).catch(() => renderCartPage());
  }
});
