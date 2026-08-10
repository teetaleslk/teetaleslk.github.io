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

/** Builds a wa.me link with the message pre-filled and URL-encoded. */
function waHref(msg) {
  return `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

/* ── localStorage helpers — shared shape for every feature that persists
   locally (cart, wishlist, recently viewed, notes, preferences). ── */
function lsGetArray(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function lsSetArray(key, val, onSaved) {
  localStorage.setItem(key, JSON.stringify(val));
  if (onSaved) onSaved();
}
function lsGetString(key, fallback = '') {
  return localStorage.getItem(key) ?? fallback;
}
function lsSetString(key, val) {
  localStorage.setItem(key, val);
}

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
let activePrintSize = 'all';    // Print Size filter (Pocket/A5/A4/A3/A3+Pocket…) — Adults only, Kids are always "NA"
let currentPage   = 1;
let itemsPerPage  = 24;         // 12 | 24 | 48 | 96 — multiples of 12 so 2/3/4-col grids never leave a lone item in the last row
const GRID_VIEW_KEY = 'tt_grid_view';
let gridView      = lsGetString(GRID_VIEW_KEY, 'cols4');  // 'list' | 'cols2' | 'cols3' | 'cols4'

/* ── BUNDLE MODE (Offer Bundle-Picker) ──
   Set from ?bundle=1 URL params (see createOfferCard in the Offers section).
   Locks Age/Size to the offer's rules and lets the shopper pick exact items
   instead of sending a vague WA message. null = normal shopping. */
let bundleMode     = null;      // { title, badge, offerType, discountPercent, price, strike, bundleAge[], bundleSizes[], bundleCount }
let bundleSelected = new Set(); // product IDs currently picked

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

   Sheet columns (A–L, updated 2026-07-21 — Bundle Builder):
     A: Status          "Active" or "Expired"
     B: Badge           e.g. "FREE DELIVERY" / "🔥 HOT DEAL"
     C: Title           e.g. "Kids Bundle Deal"
     D: Description     e.g. "Pick any 3 kids tees — islandwide delivery!"
     E: OfferType        "Fixed" or "Percentage" (blank = Fixed). Fixed = flat total
                         from StrikePrice/DealPrice regardless of what's picked.
                         Percentage = total computed live from whatever's picked,
                         discounted by DiscountPercent — for open/mixed bundles
                         where a flat price wouldn't be fair either direction.
     F: DiscountPercent  e.g. 20  — only used when OfferType = Percentage
     G: StrikePrice      e.g. 3000 (Fixed only; leave blank = no strikethrough)
     H: DealPrice        e.g. 2250 (Fixed only — the flat bundle total)
     I: BundleAge        "Kids", "Adults", or "Kids,Adults" — blank = not a bundle,
                         card just shows the plain WhatsApp "ask us" link as before
     J: BundleSizes      e.g. "S,M,L" — blank = any size counts
     K: BundleCount      e.g. 3 — how many tees must be picked (exact count)
     L: WA Text          pre-filled WhatsApp message for NON-bundle offers only
                         (plain text, not encoded) — bundle offers build their own
                         WA message from the actual items picked
═══════════════════════════════════════════════════════════════ */
const OFFER_COL = {
  STATUS:      0,  // A
  BADGE:       1,  // B
  TITLE:       2,  // C
  DESC:        3,  // D
  OFFER_TYPE:  4,  // E
  DISCOUNT_PCT:5,  // F
  STRIKE:      6,  // G
  PRICE:       7,  // H
  BUNDLE_AGE:  8,  // I
  BUNDLE_SIZES:9,  // J
  BUNDLE_COUNT:10, // K
  WA_TEXT:     11, // L
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
      const splitList = (s) => s ? s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) : [];
      const offerType = (v(OFFER_COL.OFFER_TYPE).toLowerCase() === 'percentage') ? 'percentage' : 'fixed';
      const bundleAge   = splitList(v(OFFER_COL.BUNDLE_AGE));
      const bundleSizes = splitList(v(OFFER_COL.BUNDLE_SIZES));
      const bundleCount = n(OFFER_COL.BUNDLE_COUNT);
      return {
        badge:  v(OFFER_COL.BADGE),
        title,
        desc:   v(OFFER_COL.DESC),
        offerType,
        discountPercent: n(OFFER_COL.DISCOUNT_PCT),
        strike: n(OFFER_COL.STRIKE),
        price:  n(OFFER_COL.PRICE),
        bundleAge,
        bundleSizes,
        bundleCount,
        isBundle: bundleAge.length > 0 && !!bundleCount,
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

  let priceHtml = '';
  if (offer.isBundle && offer.offerType === 'percentage') {
    // Percentage bundles don't have a fixed total to show — total is computed
    // live from whatever the shopper picks, so show the discount instead.
    priceHtml = offer.discountPercent
      ? `<div class="offer-price-row"><span class="offer-price">${offer.discountPercent}% OFF</span></div>`
      : '';
  } else if (offer.price) {
    priceHtml = `<div class="offer-price-row">
        ${strikeHtml}
        <span class="offer-price">${CONFIG.CURRENCY} ${formatNum(offer.price)}</span>
        ${offer.strike ? `<span class="offer-save">💰 Save ${CONFIG.CURRENCY} ${formatNum(offer.strike - offer.price)}</span>` : ''}
       </div>`;
  }

  let ctaHtml;
  if (offer.isBundle) {
    // Send them to the shop in bundle-picker mode instead of a plain WA chat —
    // filters lock to this offer's age/size rules and they pick exact items.
    const params = new URLSearchParams();
    params.set('bundle', '1');
    params.set('bTitle', offer.title);
    if (offer.badge) params.set('bBadge', offer.badge);
    params.set('bType', offer.offerType);
    if (offer.discountPercent) params.set('bPct', offer.discountPercent);
    if (offer.price) params.set('bPrice', offer.price);
    if (offer.strike) params.set('bStrike', offer.strike);
    params.set('bAge', offer.bundleAge.join(','));
    if (offer.bundleSizes.length) params.set('bSizes', offer.bundleSizes.join(','));
    params.set('bCount', offer.bundleCount);
    ctaHtml = `<a href="shop.html?${params.toString()}" class="offer-wa-btn">
        <i class="fas fa-tshirt"></i> Build This Bundle
      </a>`;
  } else {
    const waMsg = offer.waText || `Hi TeeTales! I'd like to know more about the "${offer.title}" offer. 👕`;
    const waLink = waHref(waMsg);
    ctaHtml = `<a href="${waLink}" target="_blank" rel="noopener" class="offer-wa-btn" data-wa-source="offer" data-item-id="${escHtml(offer.title)}">
        <i class="fab fa-whatsapp"></i> Grab This Deal
      </a>`;
  }

  card.innerHTML = `
    ${offer.badge ? `<div class="offer-badge">${escHtml(offer.badge)}</div>` : ''}
    <div class="offer-body">
      <h3 class="offer-title">${escHtml(offer.title)}</h3>
      ${offer.desc ? `<p class="offer-desc">${escHtml(offer.desc)}</p>` : ''}
      ${priceHtml}
      ${ctaHtml}
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
/* ── SIZE-FAMILY / COLOUR-SIBLING GROUPING (Phase 16, no sheet change) ──
   Both group by Design+Type+Category; the size-family key additionally
   includes Colour (so it groups "same tee, other size"), while the
   colour-sibling key deliberately excludes Colour (so it groups "same
   design, other colour" instead). One key function, one lookup helper,
   parameterized rather than duplicated. */
function groupKeyOf(p, includeColour) {
  const parts = [(p.design[0] || '').trim().toLowerCase()];
  if (includeColour) parts.push((p.colour || '').toLowerCase());
  parts.push((p.type || '').toLowerCase(), (p.category || '').toLowerCase());
  return parts.join('|');
}
const familyKeyOf = p => groupKeyOf(p, true);
const designKeyOf = p => groupKeyOf(p, false);

/** Every product (including p itself) sharing keyFn(p)'s value. */
function productsWithKey(keyFn, key) {
  return Object.values(_ttProdMap).filter(q => q.design?.length && keyFn(q) === key);
}
function familyMembers(p) {
  if (!p.design?.length) return [];
  return productsWithKey(familyKeyOf, familyKeyOf(p));
}

/* 16.4 Colour swatcher — same design+type+category, but grouped ACROSS colours */
function colourSiblings(p) {
  if (!p.design?.length) return [];
  const all = productsWithKey(designKeyOf, designKeyOf(p));
  // one representative per colour group: same size as current if in stock, else first in-stock, else first overall
  const byColour = {};
  all.forEach(q => {
    const c = (q.colour || '').trim();
    if (!c) return;
    if (!byColour[c]) byColour[c] = [];
    byColour[c].push(q);
  });
  return Object.entries(byColour).map(([colour, items]) => {
    const sameSize = items.find(q => (q.size || '') === (p.size || '') && !isOutOfStock(q));
    const inStock  = items.find(q => !isOutOfStock(q));
    const rep = sameSize || inStock || items[0];
    const anyInStock = items.some(q => !isOutOfStock(q));
    return { colour, rep, isCurrent: items.some(q => q.id === p.id), soldOut: !anyInStock };
  });
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

/** Builds the "Design — Type Category/Colour Tee (Size)" display name used
 *  for product card titles, the product page title, cart lines, and wishlist
 *  items. `tee: true` gives the identity-first title style (design tag
 *  required to show the category/"Tee" suffix at all — used on cards/product
 *  page); `tee: false` gives the simpler "always show type" style used in the
 *  cart/wishlist, where the design tag is just an optional prefix. */
function productDisplayName(p, { tee = false, category = false, colour = false } = {}) {
  const design = p.design?.[0];
  const extra = category ? (p.category || '') : colour ? (p.colour || '') : '';
  let base;
  if (tee) {
    base = design ? `${design} — ${p.type} ${extra} Tee`.replace(/\s+/g, ' ') : p.type;
  } else {
    base = `${design ? design + ' — ' : ''}${p.type} ${extra}`.trim();
  }
  return base + (p.size ? ` (${p.size})` : '');
}

/** True when a product's stock text indicates it's sold out (Column H).
 *  Accepts a product object OR a raw stock string, so existing call sites
 *  passing `p`, `q`, `rp`, `item.stock`, etc. all work unchanged. */
function isOutOfStock(pOrStock) {
  const s = typeof pOrStock === 'string' ? pOrStock : (pOrStock?.stock || '');
  return s.toLowerCase().includes('out');
}

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

/* 17.2 Identity-based product descriptions — "who this is for", not spec-sheet copy.
   Picked deterministically per product id so the same tee always shows the same line. */
const IDENTITY_LINES = {
  girls:  ["For the girl who runs the room.", "For the girl with big ideas.", "For the one who never blends in."],
  boys:   ["For the kid who can't sit still.", "For the one always mid-adventure.", "For the boy with a plan for everything."],
  kids:   ["For the kid who can't sit still.", "For little legends in the making.", "For the one who never stops moving."],
  ladies: ["For the woman who sets her own pace.", "For the one who shows up as herself.", "For days you want to feel like you."],
  gents:  ["For the guy who shows up.", "For easy days and good company.", "For the one who keeps it simple."],
  adults: ["For everyday, done your way.", "For the days that call for comfort.", "For whoever you're being today."],
};
function identityLineFor(p) {
  const age    = (p.ageGrp   || '').toLowerCase();
  const suit   = (p.suitable || '').toLowerCase();
  const isKids = age !== 'adults';
  let bucket = isKids
    ? (suit === 'ladies' ? 'girls' : suit === 'gents' ? 'boys' : 'kids')
    : (suit === 'ladies' ? 'ladies' : suit === 'gents' ? 'gents' : 'adults');
  const lines = IDENTITY_LINES[bucket] || IDENTITY_LINES.adults;
  let hash = 0;
  for (const ch of String(p.id || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return lines[hash % lines.length];
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
function renderProducts(products, page) {
  grid.querySelectorAll('.product-card').forEach(el => el.remove());

  if (products.length === 0) {
    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
    if (resultsBar) resultsBar.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  loadingState.style.display = 'none';

  const count = products.length;
  if (resultsBar) {
    if (page && page.total) {
      resultsBar.textContent = `Showing ${page.start + 1}–${page.start + count} of ${page.total} result${page.total !== 1 ? 's' : ''}`;
    } else {
      resultsBar.textContent = `Showing ${count} item${count !== 1 ? 's' : ''}`;
    }
  }

  const frag = document.createDocumentFragment();
  products.forEach(p => frag.appendChild(createProductCard(p)));
  grid.appendChild(frag);
}

function createProductCard(p) {
  const outOfStock = isOutOfStock(p);
  const inCartQty = cartQtyOf(p.id);
  const card = document.createElement('div');
  card.dataset.id = p.id;
  card.className = 'product-card'
    + (bundleMode && bundleSelected.has(p.id) ? ' bundle-selected' : '')
    + (outOfStock ? ' card-out-of-stock' : '')
    + (inCartQty > 0 ? ' in-cart' : '');

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

  /* ── Add to Cart button (or Bundle select toggle, in bundle mode) ── */
  const isBundlePicked = bundleMode && bundleSelected.has(p.id);
  const bundleFull = bundleMode && bundleSelected.size >= bundleMode.bundleCount && !isBundlePicked;
  const cartBtn = bundleMode
    ? (outOfStock
        ? `<button class="card-cart-btn" disabled>✕ Sold Out</button>`
        : `<button class="card-cart-btn${isBundlePicked ? ' selected' : ''}"
             onclick="bundleToggle('${escHtml(p.id)}')" ${bundleFull ? 'disabled' : ''}>
             <i class="fas ${isBundlePicked ? 'fa-check-circle' : 'fa-plus-circle'}"></i>
             ${isBundlePicked ? 'Selected' : (bundleFull ? 'Bundle Full' : 'Select for Bundle')}
           </button>`)
    : (outOfStock
        ? `<button class="card-cart-btn" disabled>✕ Sold Out</button>`
        : `<button class="card-cart-btn" data-cart-btn="1" onclick="cartAddFromCard('${escHtml(p.id)}')">
             ${inCartQty > 0
               ? `<i class="fas fa-check"></i> In Cart (${inCartQty}) · Add More`
               : `<i class="fas fa-shopping-bag"></i> Add to Cart`}
           </button>`);

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

  /* ── List-view detail block (hidden in grid views via CSS) ──
     Mirrors the product page's key info so customers can decide without
     clicking in — Style/Print Size/Material grid, a real Add to Cart button,
     and the same delivery trust strip shown on product.html. */
  const listMetaItems = [
    p.category ? `<div><dt>Style</dt><dd>${escHtml(p.category)}</dd></div>` : '',
    (p.printSize && p.printSize.toLowerCase() !== 'na' && (p.type || '').toLowerCase() !== 'kids')
      ? `<div><dt>Print Size</dt><dd>${escHtml(p.printSize)}</dd></div>` : '',
    p.material ? `<div><dt>Material</dt><dd>${escHtml(p.material)}</dd></div>` : '',
    `<div><dt>Item ID</dt><dd>${escHtml(p.id)}</dd></div>`,
  ].filter(Boolean).join('');
  const listExtraHtml = `
    <div class="card-list-extra">
      <dl class="card-list-meta">${listMetaItems}</dl>
      ${cartBtn}
      <div class="card-list-trust">
        <span><i class="fas fa-truck"></i> Islandwide Delivery</span>
        <span><i class="fas fa-shield-alt"></i> Quality Guaranteed</span>
      </div>
    </div>`;

  /* ── Colour swatch + size bar (always visible) ── */
  const swatchColor = getSwatchColor(p.colour);
  const swatchDot   = p.colour
    ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}" title="${escHtml(p.colour)}"></span>`
    : '';
  const colourLabel = p.colour ? `<span class="card-meta-colour">${escHtml(p.colour)}</span>` : '';
  const ageIsRange  = p.ageGrp && p.ageGrp !== 'adults';
  const ageLabel    = ageIsRange ? `<span class="card-meta-age">🎂 ${escHtml(p.ageGrp)}</span>` : '';
  const moreSizes   = familyMembers(p).filter(q => q.id !== p.id && !isOutOfStock(q)).length;
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
      ${inCartQty > 0 ? `<span class="card-in-cart-badge">✓ In Cart (${inCartQty})</span>` : ''}
      <button class="card-wish${wishHas(p.id) ? ' saved' : ''}" aria-label="Save for later"
        onclick="event.stopPropagation(); wishToggle('${escHtml(p.id)}', this)">
        <i class="${wishHas(p.id) ? 'fas' : 'far'} fa-heart"></i>
      </button>
      <div class="card-wa-hover">${cartBtn}</div>
    </div>
    <div class="card-info">
      <div class="card-info-main">
        <div class="card-type">${escHtml(productDisplayName(p, { tee: true, category: true }))}</div>
        ${stockBadge ? `<div class="card-stock-row">${stockBadge}</div>` : ''}
        ${priceHtml}
        ${metaBar}
        ${tagsHtml}
      </div>
      ${listExtraHtml}
    </div>`;

  /* 12.5 Image hover swap — Image1 → Image2 (the "A" suffix file, same convention
     as the product-page extra-views thumbnail strip). Silently does nothing when
     a product only has one photo — no broken/empty state either way. */
  if (imgUrl) {
    probeFam(p, 'A', url => {
      const link = card.querySelector('.card-img-link');
      if (!link || link.querySelector('.card-img-alt')) return;
      const alt = document.createElement('img');
      alt.src = url;
      alt.alt = `${p.type} — alternate view`;
      alt.className = 'card-img-alt';
      alt.loading = 'lazy';
      link.appendChild(alt);
    });
  }

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
   BUNDLE MODE — pick exact items for an Offer instead of a vague WA chat
═══════════════════════════════════════════════════════════════ */
function bundleToggle(id) {
  if (!bundleMode) return;
  if (bundleSelected.has(id)) {
    bundleSelected.delete(id);
  } else {
    if (bundleSelected.size >= bundleMode.bundleCount) return; // full — exact count only
    bundleSelected.add(id);
  }
  applyFilters(true);   // re-render cards with updated selection state
  renderBundleBar();
}

function bundleSelectedProducts() {
  return [...bundleSelected].map(id => _ttProdMap[id]).filter(Boolean);
}

function bundleTotal() {
  const items = bundleSelectedProducts();
  if (bundleMode.offerType === 'percentage') {
    const raw = items.reduce((sum, p) => sum + (p.price || 0), 0);
    return Math.round(raw * (1 - (bundleMode.discountPercent || 0) / 100));
  }
  return bundleMode.price || 0;
}

function buildBundleWAMessage() {
  const items = bundleSelectedProducts();
  const lines = items.map(p => `• ${p.type}${p.colour ? ' — ' + p.colour : ''} (Size ${p.size}) — ${p.id}`);
  const total = bundleTotal();
  return `Hi TeeTales! I'd like to order the "${bundleMode.title}" bundle:\n${lines.join('\n')}\n\nTotal: ${CONFIG.CURRENCY} ${formatNum(total)}`;
}

function renderBundleBar() {
  const bar = document.getElementById('bundleBar');
  if (!bar || !bundleMode) return;
  const count = bundleSelected.size;
  const need  = bundleMode.bundleCount;
  const ready = count === need;
  const total = bundleTotal();
  const totalHtml = bundleMode.offerType === 'percentage'
    ? (count ? `${CONFIG.CURRENCY} ${formatNum(total)} <small>(${bundleMode.discountPercent}% off)</small>` : '—')
    : `${CONFIG.CURRENCY} ${formatNum(bundleMode.price)}`;
  bar.innerHTML = `
    <div class="bundle-bar-inner">
      <div class="bundle-bar-info">
        <strong>${escHtml(bundleMode.title)}</strong>
        <span>${count} of ${need} selected — Total: ${totalHtml}</span>
      </div>
      <a href="#" class="bundle-exit" onclick="event.preventDefault(); window.location.href='shop.html';">✕ Exit Bundle</a>
      <a href="${ready ? waHref(buildBundleWAMessage()) : '#'}"
         target="${ready ? '_blank' : ''}" rel="noopener"
         class="bundle-wa-btn${ready ? '' : ' disabled'}" data-wa-source="bundle_order" data-item-id="${escHtml(bundleMode.title)}"
         onclick="${ready ? '' : 'event.preventDefault();'}">
        <i class="fab fa-whatsapp"></i> ${ready ? 'Order This Bundle' : `Pick ${need - count} more`}
      </a>
    </div>`;
}

function initBundleMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('bundle') !== '1') return;
  const splitList = (s) => s ? s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) : [];
  bundleMode = {
    title: params.get('bTitle') || 'Bundle Deal',
    badge: params.get('bBadge') || '',
    offerType: params.get('bType') === 'percentage' ? 'percentage' : 'fixed',
    discountPercent: parseFloat(params.get('bPct')) || 0,
    price: parseFloat(params.get('bPrice')) || 0,
    strike: parseFloat(params.get('bStrike')) || 0,
    bundleAge: splitList(params.get('bAge')),
    bundleSizes: splitList(params.get('bSizes')),
    bundleCount: parseInt(params.get('bCount'), 10) || 1,
  };
  bundleSelected = new Set();

  // Lock/hide the Age + Size filter groups — they're fixed by the offer.
  document.getElementById('ageFilter')?.closest('.filter-group')?.style.setProperty('display', 'none');
  document.getElementById('sizeFilter')?.closest('.filter-group')?.style.setProperty('display', 'none');

  // Inject the sticky progress bar once, above the products grid.
  if (!document.getElementById('bundleBar')) {
    const bar = document.createElement('div');
    bar.id = 'bundleBar';
    bar.className = 'bundle-bar';
    (document.querySelector('.filters-bar') || grid)?.insertAdjacentElement('beforebegin', bar);
  }
  renderBundleBar();
}


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
  if (bundleMode) {
    // Bundle mode: hard lock to the offer's eligible pool (age + size are
    // fixed by the offer, not user-togglable) — everything else (gender,
    // colour, design, print size, search) still narrows normally below.
    if (bundleMode.bundleAge.length && !(bundleMode.bundleAge.includes('kids') && bundleMode.bundleAge.includes('adults'))) {
      f = bundleMode.bundleAge.includes('adults')
        ? f.filter(p => p.ageGrp === 'adults')
        : f.filter(p => p.ageGrp !== 'adults');
    }
    if (bundleMode.bundleSizes.length) {
      f = f.filter(p => bundleMode.bundleSizes.includes((p.size || '').toLowerCase()));
    }
  } else if (except !== 'age') {
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
  if (except !== 'printSize' && activePrintSize !== 'all')
    f = f.filter(p => (p.printSize || '').toLowerCase() === activePrintSize.toLowerCase());
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

let lastFiltered = [];  // full filtered+sorted list, before pagination slicing

function applyFilters(keepPage) {
  /* Rebuild every option group from its own "all others" context */
  updateStaticPillAvailability();
  buildTagFilter(contextFor('tag'));
  buildColourFilter(contextFor('colour'));
  buildSizeFilter(contextFor('size'));
  buildPrintSizeFilter(contextFor('printSize'));

  /* Final result = all filters applied */
  let f = contextFor(null);

  // Sort (5.4): price sorts override; otherwise stock priority
  if      (activeSort === 'price-asc')  f = [...f].sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (activeSort === 'price-desc') f = [...f].sort((a, b) => (b.price || 0) - (a.price || 0));
  else {
    if (activeSort === 'newest') f = [...f].reverse();
    f.sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock));
  }

  lastFiltered = f;
  if (!keepPage) currentPage = 1;  // any filter/search/sort/per-page change jumps back to page 1

  const total = f.length;
  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = f.slice(start, start + itemsPerPage);

  renderProducts(pageItems, { start, total });
  renderPagination(total, totalPages);
  updateFilterSummary();
}

/* Jump to a specific page (from pagination controls) — keeps all filters as-is */
function goToPage(n) {
  currentPage = n;
  applyFilters(true);
  document.querySelector('.filters-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Prev/Next + numbered page buttons, with ellipsis for long ranges */
function renderPagination(total, totalPages) {
  const bar = document.getElementById('paginationBar');
  if (!bar) return;
  if (totalPages <= 1) { bar.innerHTML = ''; return; }

  const pageBtn = (n, label, extraClass = '') =>
    `<button class="page-btn ${extraClass}" data-page="${n}" ${n === currentPage ? 'aria-current="page"' : ''}>${label}</button>`;

  let nums = [];
  const add = n => { if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n); };
  add(1); add(totalPages);
  for (let n = currentPage - 1; n <= currentPage + 1; n++) add(n);
  nums.sort((a, b) => a - b);

  let html = pageBtn(currentPage - 1, '‹ Prev', currentPage === 1 ? 'disabled' : '');
  let prev = 0;
  nums.forEach(n => {
    if (prev && n - prev > 1) html += `<span class="page-ellipsis">…</span>`;
    html += pageBtn(n, n, n === currentPage ? 'active' : '');
    prev = n;
  });
  html += pageBtn(currentPage + 1, 'Next ›', currentPage === totalPages ? 'disabled' : '');

  bar.innerHTML = html;
  bar.onclick = (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.classList.contains('disabled')) return;
    const n = parseInt(btn.dataset.page, 10);
    if (n >= 1 && n <= totalPages && n !== currentPage) goToPage(n);
  };
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
  if (activePrintSize !== 'all') tags.push(chip('printSize', 'fa-image', escHtml(activePrintSize)));
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
  if (key === 'printSize' || key === 'all') activePrintSize = 'all';
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

  if (!document.getElementById('printSizeFilterGroup')) {
    const psGroup = document.createElement('div');
    psGroup.className = 'filter-group';
    psGroup.id = 'printSizeFilterGroup';
    psGroup.style.display = 'none';
    psGroup.innerHTML = `
      <span class="filter-label"><i class="fas fa-image"></i> Print Size</span>
      <div class="filter-pills printsize-pills" id="printSizeFilter"></div>`;
    bar.appendChild(psGroup);
  }
}

/* Print Size filter — Pocket/A5/A4/A3/A3+Pocket… (Adults only; Kids are always "NA" so
   this group naturally hides itself when the current context has no real print sizes).
   Icons: img/printsize/<exact PrintSize text from the sheet>.<ext> — same probeImg
   cascade as everything else. No icon file yet → pill still works, just shows text only. */
const PRINT_SIZE_LADDER = ['pocket', 'a5', 'a4', 'a3', 'a3+pocket'];
function buildPrintSizeFilter(base) {
  const group = document.getElementById('printSizeFilterGroup');
  const pills = document.getElementById('printSizeFilter');
  if (!group || !pills) return;

  // Distinct real print sizes present (skip blank/NA — that's Kids or unset)
  const present = new Map();  // lowercase → original-cased label
  base.forEach(p => {
    const raw = (p.printSize || '').trim();
    if (!raw || raw.toLowerCase() === 'na') return;
    if (!present.has(raw.toLowerCase())) present.set(raw.toLowerCase(), raw);
  });

  if (!present.size) { group.style.display = 'none'; activePrintSize = 'all'; return; }
  if (activePrintSize !== 'all' && !present.has(activePrintSize.toLowerCase())) activePrintSize = 'all';

  // Known ladder first (Pocket→A5→A4→A3→A3+Pocket), anything unrecognised appended after
  const ordered = [...PRINT_SIZE_LADDER.filter(k => present.has(k)),
                   ...[...present.keys()].filter(k => !PRINT_SIZE_LADDER.includes(k))];

  pills.innerHTML = `<button class="pill printsize-pill${activePrintSize === 'all' ? ' active' : ''}" data-ps="all">All</button>` +
    ordered.map(k => {
      const label = present.get(k);
      return `<button class="pill printsize-pill${activePrintSize.toLowerCase() === k ? ' active' : ''}" data-ps="${escHtml(label)}">
        <span class="printsize-icon" id="psIcon-${escHtml(k.replace(/[^a-z0-9]/g, ''))}"></span>${escHtml(label)}
      </button>`;
    }).join('');
  group.style.display = 'flex';

  // Try to load an icon per print size — silently no-ops if the file isn't there yet
  ordered.forEach(k => {
    const label = present.get(k);
    const iconEl = document.getElementById(`psIcon-${k.replace(/[^a-z0-9]/g, '')}`);
    if (!iconEl) return;
    probeImg(`img/printsize/${encodeURIComponent(label)}`, url => {
      iconEl.innerHTML = `<img src="${url}" alt="" />`;
    });
  });

  pills.onclick = (e) => {
    const pill = e.target.closest('.printsize-pill');
    if (!pill) return;
    activePrintSize = pill.dataset.ps;
    applyFilters();
  };
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
    const inStock = products.filter(p => !isOutOfStock(p));
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

  // ?q=TEXT — from the 12.6 mobile search overlay's "See all results" / Enter key
  const qParam = (params.get('q') || '').trim();
  if (qParam) {
    searchQuery = qParam;
    if (searchInput) searchInput.value = qParam;
    if (searchClear) searchClear.style.display = 'flex';
  }

  // ?boost=new|hot — navbar "New In" / "Hot Deals" deep links (4.2 / 5.2)
  const boostParam = (params.get('boost') || '').toLowerCase();
  if (['new', 'hot', 'gifts'].includes(boostParam)) activeBoost = boostParam;

  // Sort dropdown (5.4)
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    applyFilters();
  });

  // Per-page selector (12/24/48/96 — multiples of 12 so 2/3/4-col grids never strand a lone item)
  const perPageSelect = document.getElementById('perPageSelect');
  if (perPageSelect) {
    perPageSelect.value = String(itemsPerPage);
    perPageSelect.addEventListener('change', () => {
      itemsPerPage = parseInt(perPageSelect.value, 10);
      applyFilters();
    });
  }

  // Grid density toggle (list / 2 / 3 / 4 per row) — remembered via localStorage
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    const setView = (v) => {
      gridView = v;
      lsSetString(GRID_VIEW_KEY, v);
      grid.classList.remove('view-list', 'view-cols2', 'view-cols3', 'view-cols4');
      grid.classList.add(`view-${v}`);
      viewToggle.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    };
    setView(gridView);
    viewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.view-btn');
      if (btn) setView(btn.dataset.view);
    });
  }

  injectExtraFilters();
  initBundleMode();

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
    const pdTitleText = productDisplayName(p, { tee: true, category: true });
    document.getElementById('pdTitle').textContent = pdTitleText;
    const identEl = document.getElementById('pdIdentity');
    if (identEl) identEl.textContent = identityLineFor(p);

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
        availability: isOutOfStock(p)
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

    /* 17.7 Value framing — reframe price as value-per-wear, not cost */
    const sellPrice = p.price ?? p.strike;
    const valueEl = document.getElementById('pdValueLine');
    if (valueEl) {
      valueEl.textContent = sellPrice
        ? `Works out to ${CONFIG.CURRENCY} ${formatNum(Math.round(sellPrice / 30))}/day if you wear it for a month 👕`
        : '';
    }
    const zeroRiskEl = document.getElementById('pdZeroRisk');
    if (zeroRiskEl) zeroRiskEl.textContent = '🔄 Not happy with the fit? Message us within 3 days of delivery — we\'ll sort it.';

    // Bulk promo banner (TBOS spec) — full-width line above image + details
    const pdBulk = (p.bulkPrice && p.price && p.bulkPrice < p.price) ? p.bulkPrice : null;
    const bulkBannerEl = document.getElementById('pdBulkBanner');
    if (bulkBannerEl) bulkBannerEl.innerHTML =
      `<div class="pd-bulk-note pd-bulk-banner">👨‍👩‍👧‍👦 Buying for a family or group? <strong>5+ tees switch to bulk prices automatically</strong>${pdBulk ? ` — this tee just <strong>${CONFIG.CURRENCY} ${formatNum(pdBulk)}</strong> each` : ''}. Mix any sizes & designs!</div>`;

    /* Meta list */
    const swatchColor = getSwatchColor(p.colour);
    const swatchDot   = p.colour
      ? `<span class="card-swatch-dot-sm" style="background:${swatchColor || '#ccc'}"></span>` : '';
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

    /* Colour swatcher — same design+type+category, other colours (16.4) */
    const colourSibs = colourSiblings(p);
    const colourRowEl = document.getElementById('pdColourRow');
    if (colourRowEl && colourSibs.length > 1) {
      colourRowEl.innerHTML = `
        <div class="pd-colourrow">
          <span class="pd-colourrow-label">Colour: <strong>${escHtml(p.colour || '')}</strong></span>
          <div class="pd-colourrow-swatches">${colourSibs.map(s => {
            const hex = getSwatchColor(s.colour) || '#ccc';
            const title = s.soldOut ? `${escHtml(s.colour)} (Sold out)` : escHtml(s.colour);
            if (s.isCurrent) return `<span class="pd-colour-swatch current" style="background:${hex}" title="${title}"></span>`;
            if (s.soldOut) return `<span class="pd-colour-swatch out" style="background:${hex}" title="${title}"></span>`;
            return `<a class="pd-colour-swatch" style="background:${hex}" href="product.html?id=${encodeURIComponent(s.rep.id)}" title="${title}"></a>`;
          }).join('')}</div>
        </div>`;
    }

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
            if (isOutOfStock(q)) return `<span class="pd-size-opt out" title="Sold out">${label}</span>`;
            return `<a class="pd-size-opt" href="product.html?id=${encodeURIComponent(q.id)}" title="View ${label}">${label}</a>`;
          }).join('')}</div>
          <span class="pd-sizerow-hint">Tap a size to switch</span>
        </div>`;
    }

    /* Add to Cart — qty selector + button */
    const isOut = isOutOfStock(p);
    if (isOut) {
      document.getElementById('pdOrderBtn').innerHTML =
        `<button class="pd-add-cart-btn" disabled>✕ Sold Out</button>
         <p class="cart-summary-note" style="margin-top:6px">Similar styles are in stock — <a href="shop.html?age=${p.ageGrp === 'adults' ? 'adults' : 'kids'}${p.suitable ? `&suitable=${encodeURIComponent(p.suitable)}` : ''}">browse them here</a></p>
         <p class="pd-qty-itemid" style="margin-top:6px">Item ID: ${p.id}</p>`;
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
      .filter(q => q.id !== p.id && !isOutOfStock(q))
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

    /* 12.1 Recently Viewed — show what was viewed BEFORE this item, then log this one */
    const recentWrap = document.getElementById('pdRecentWrap');
    const recentIds = recentViewedGet().filter(rid => rid !== p.id);
    if (recentWrap && recentIds.length) {
      const recentGrid = document.getElementById('pdRecentGrid');
      const recentProducts = recentIds
        .map(rid => products.find(q => q.id === rid))
        .filter(rp => rp && !isOutOfStock(rp))
        .slice(0, 4);
      if (recentProducts.length) {
        recentProducts.forEach(rp => recentGrid.appendChild(createProductCard(rp)));
        recentWrap.style.display = 'block';
      }
    }
    recentViewedAdd(p.id);

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
const cartGet  = () => lsGetArray(CART_KEY);
const cartSave = c  => lsSetArray(CART_KEY, c, () => { cartBadgeUpdate(); syncCardCartState(); });
const cartQtyOf = id => cartGet().find(i => i.id === id)?.qty || 0;

/* Keep every visible product card's "in cart" badge/button in sync with the
   cart, without a full grid re-render — called any time the cart changes. */
function syncCardCartState() {
  document.querySelectorAll('.product-card[data-id]').forEach(card => {
    const qty = cartQtyOf(card.dataset.id);
    card.classList.toggle('in-cart', qty > 0);
    const badge = card.querySelector('.card-in-cart-badge');
    if (badge) badge.textContent = `✓ In Cart (${qty})`;
    const btn = card.querySelector('.card-cart-btn:not([disabled])');
    if (btn && btn.dataset.cartBtn === '1') {
      btn.innerHTML = qty > 0
        ? `<i class="fas fa-check"></i> In Cart (${qty}) · Add More`
        : `<i class="fas fa-shopping-bag"></i> Add to Cart`;
    }
  });
}

/* 12.1 Recently Viewed — last 4 product IDs viewed, newest first */
const RECENT_KEY = 'tt_recently_viewed';
function recentViewedGet() {
  return lsGetArray(RECENT_KEY);
}
function recentViewedAdd(id) {
  const list = recentViewedGet().filter(rid => rid !== id);
  list.unshift(id);
  lsSetArray(RECENT_KEY, list.slice(0, 4));
}

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
  // 14.4 Cart abandonment insight — compared against the cart's WA-order click (source: cart_order)
  if (typeof gtag === 'function') gtag('event', 'cart_add', { item_id: p.id });
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
const cartNoteGet  = () => lsGetString(CART_NOTE_KEY);
const cartNoteSave = v  => lsSetString(CART_NOTE_KEY, v);
window.cartNoteSave = cartNoteSave;
function cartNoteFieldHtml() {
  return `<div class="cart-note-field">
    <label for="cartNoteInput">📝 Delivery note / occasion (optional)</label>
    <input type="text" id="cartNoteInput" maxlength="120" placeholder="e.g. Need by Friday — birthday gift"
           value="${escHtml(cartNoteGet())}" oninput="cartNoteSave(this.value)" />
  </div>`;
}

/* ── 13.5 Gift wrapping / gift note toggle — appended to WA order message ── */
const CART_GIFT_KEY      = 'tt_cart_gift';
const CART_GIFT_NOTE_KEY = 'tt_cart_gift_note';
const cartGiftGet      = () => lsGetString(CART_GIFT_KEY) === '1';
const cartGiftSave     = v  => lsSetString(CART_GIFT_KEY, v ? '1' : '');
const cartGiftNoteGet  = () => lsGetString(CART_GIFT_NOTE_KEY);
const cartGiftNoteSave = v  => lsSetString(CART_GIFT_NOTE_KEY, v);
function cartGiftToggle(checked) {
  cartGiftSave(checked);
  const wrap = document.getElementById('cartGiftNoteWrap');
  if (wrap) wrap.style.display = checked ? 'block' : 'none';
}
window.cartGiftToggle    = cartGiftToggle;
window.cartGiftNoteSave  = cartGiftNoteSave;
function cartGiftFieldHtml() {
  const isGift = cartGiftGet();
  return `<div class="cart-gift-field">
    <label class="cart-gift-toggle">
      <input type="checkbox" id="cartGiftCheck" ${isGift ? 'checked' : ''} onchange="cartGiftToggle(this.checked)" />
      <span>🎁 This is a gift</span>
    </label>
    <div class="cart-gift-note" id="cartGiftNoteWrap" style="display:${isGift ? 'block' : 'none'}">
      <input type="text" id="cartGiftNoteInput" maxlength="120" placeholder="Add a gift note (optional) — e.g. 'Happy Birthday Nimal!'"
             value="${escHtml(cartGiftNoteGet())}" oninput="cartGiftNoteSave(this.value)" />
    </div>
  </div>`;
}

/* ── Cart → Wishlist: "Save for later" adds the item to Wishlist, then asks
   whether to also keep it in the cart or remove it — the customer's call,
   since they may be buying it now AND saving it, or just saving it for later. */
function cartSaveForLater(id, btn) {
  const cart = cartGet();
  const item = cart.find(i => i.id === id);
  if (!item) return;

  // Already saved — second click just un-saves, cart is untouched.
  if (wishHas(id)) {
    const w = wishGet().filter(x => x.id !== id);
    wishSave(w);
    if (btn) {
      const ic = btn.querySelector('i');
      if (ic) ic.className = 'far fa-heart';
      btn.classList.remove('saved');
      btn.title = 'Save for later';
    }
    return;
  }

  const w = wishGet();
  const name = productDisplayName(item, { colour: true });
  w.push({ id: item.id, name, price: item.price, lead: item.lead || '' });
  wishSave(w);
  if (btn) {
    const ic = btn.querySelector('i');
    if (ic) ic.className = 'fas fa-heart';
    btn.classList.add('saved');
    btn.title = 'Saved for later';
  }
  cartSaveConfirm(id);
}
window.cartSaveForLater = cartSaveForLater;

/* Small confirm popup after saving — ask whether to also remove it from the cart */
function cartSaveConfirm(id) {
  let m = document.getElementById('ttCartSaveModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'ttCartSaveModal';
    m.className = 'tt-modal-overlay';
    m.innerHTML = `
      <div class="tt-modal">
        <div class="tt-modal-icon">💚</div>
        <p class="tt-modal-title">Saved to your Wishlist</p>
        <p class="tt-modal-sub">Keep it in your cart too, or remove it since it's saved for later?</p>
        <div class="tt-modal-actions">
          <button class="btn btn-outline" id="ttCsmRemove">Remove from Cart</button>
          <button class="btn btn-primary" id="ttCsmKeep">Keep in Cart</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  }
  document.getElementById('ttCsmKeep').onclick = () => m.classList.remove('open');
  document.getElementById('ttCsmRemove').onclick = () => { cartRemove(id); m.classList.remove('open'); };
  m.classList.add('open');
}

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
  if (!p || isOutOfStock(p)) return;
  cartAdd(p, 1);
  openCart();
}
window.cartAddFromCard = cartAddFromCard;

/* 17.11 Cart abandonment nudge — pulse the WA button if the drawer sits open 30s with no click */
let _ttCartPulseTimer = null;
function cartPulseArm() {
  clearTimeout(_ttCartPulseTimer);
  document.querySelectorAll('.cart-wa-btn').forEach(b => b.classList.remove('pulse'));
  _ttCartPulseTimer = setTimeout(() => {
    document.querySelectorAll('.cart-wa-btn').forEach(b => b.classList.add('pulse'));
  }, 30000);
}
function cartPulseDisarm() {
  clearTimeout(_ttCartPulseTimer);
  document.querySelectorAll('.cart-wa-btn').forEach(b => b.classList.remove('pulse'));
}
function openCart()  {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (cartGet().length) cartPulseArm();
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  cartPulseDisarm();
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
  const isGift = cartGiftGet();
  const giftNote = cartGiftNoteGet().trim();
  const giftLine = isGift ? `\n🎁 This is a gift!${giftNote ? ' Note: ' + giftNote : ''}\n` : '';
  return `Hi TeeTales! 👋 I'd like to order:\n\n${lines.join('\n')}\n${bulkNote}${noteLine}${giftLine}\nTotal: ${CONFIG.CURRENCY} ${formatNum(cartTotal())}\n\nPlease confirm availability! 👕`;
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
        <button class="cart-item-save${wishHas(item.id) ? ' saved' : ''}" onclick="cartSaveForLater('${escHtml(item.id)}', this)" title="${wishHas(item.id) ? 'Saved for later' : 'Save for later'}"><i class="${wishHas(item.id) ? 'fas' : 'far'} fa-heart"></i></button>
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
    /* 13.5 note/gift fields removed from the drawer (2026-08-09) — they were
       pushing the item list out of view. Still available on the full cart page. */
    footer.innerHTML = `
      <div class="cart-summary-row"><span>Retail Price (${n} items)</span><span>${CONFIG.CURRENCY} ${formatNum(orgTot)}</span></div>
      ${saved > 0 ? `<div class="cart-summary-row cart-summary-save"><span>Saved${bulkOn ? ' (Bulk)' : ''}</span><span><span class="cart-pct-label">${Math.round(saved / orgTot * 100)}% OFF</span> − ${CONFIG.CURRENCY} ${formatNum(saved)}</span></div>` : ''}
      <div class="cart-summary-row cart-summary-total"><span>Total</span><strong class="cart-total-now">${CONFIG.CURRENCY} ${formatNum(cartTotal())}</strong></div>
      <p class="cart-cod-note">🏦 Bank transfer · confirmed on WhatsApp</p>
      <a href="${waHref(buildCartWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn" data-wa-source="cart_order" onclick="setTimeout(()=>location.href='order-sent.html',350)">
        <i class="fab fa-whatsapp"></i> Order via WhatsApp
      </a>
      <p class="wa-response-note wa-response-note-sm">💬 We reply in minutes · 9am–9pm</p>
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
        <button class="cart-item-save${wishHas(item.id) ? ' saved' : ''}" onclick="cartSaveForLater('${escHtml(item.id)}', this)" title="${wishHas(item.id) ? 'Saved for later' : 'Save for later'}"><i class="${wishHas(item.id) ? 'fas' : 'far'} fa-heart"></i> ${wishHas(item.id) ? 'Saved' : 'Save for later'}</button>
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
      ${cartGiftFieldHtml()}
      <div class="cart-summary-row"><span>Retail Price (${n} items)</span><span>${CONFIG.CURRENCY} ${formatNum(orgTot)}</span></div>
      ${saved > 0 ? `<div class="cart-summary-row cart-summary-save"><span>Saved${bulkOn ? ' (Bulk)' : ''}</span><span><span class="cart-pct-label">${Math.round(saved / orgTot * 100)}% OFF</span> − ${CONFIG.CURRENCY} ${formatNum(saved)}</span></div>` : ''}
      <div class="cart-summary-row cart-summary-total"><span>Total</span><strong class="cart-total-now">${CONFIG.CURRENCY} ${formatNum(cartTotal())}</strong></div>
      <p class="cart-cod-note">🏦 Payment via bank transfer — details confirmed on WhatsApp</p>
      <a href="${waHref(buildCartWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn" data-wa-source="cart_order" onclick="setTimeout(()=>location.href='order-sent.html',350)">
        <i class="fab fa-whatsapp"></i> Order via WhatsApp
      </a>
      <p class="wa-response-note">💬 We reply in minutes · 9am–9pm daily</p>
      <p class="cart-summary-note">Your cart is saved — take your time 😊</p>
      <p class="cart-summary-note">🔄 Wrong size? Message us within 3 days of delivery — we'll sort it.</p>
      <p class="cart-summary-note">Sending the order opens WhatsApp with your cart pre-filled — nothing is charged until we confirm with you.</p>
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
      .filter(p => !inCart.has(p.id) && !isOutOfStock(p))
      .sort((a, b) => (b.ageGrp === modeAge) - (a.ageGrp === modeAge) || stockPriority(a.stock) - stockPriority(b.stock))
      .slice(0, 4);
    if (upsell.length) {
      upsellWrap.innerHTML = `<div class="strip-head"><h3>You may also like</h3></div><div class="h-strip" id="cartUpsellGrid"></div>`;
      const g = document.getElementById('cartUpsellGrid');
      upsell.forEach(p => g.appendChild(createProductCard(p)));
    }
  }

  cartPulseArm();
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
const wishGet  = () => lsGetArray(WISH_KEY);
const wishSave = w => lsSetArray(WISH_KEY, w, wishBadgeUpdate);
const wishHas  = id => wishGet().some(i => i.id === id);

function wishToggle(id, btn) {
  const w = wishGet();
  const i = w.findIndex(x => x.id === id);
  if (i > -1) w.splice(i, 1);
  else {
    const p = _ttProdMap[id];
    if (!p) return;
    w.push({ id: p.id, name: productDisplayName(p, { category: true }), price: p.price, lead: p.leadNum || '' });
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
      <a href="${waHref(buildWishWAMessage())}"
         target="_blank" rel="noopener" class="btn btn-wa cart-wa-btn" data-wa-source="wishlist_ask">
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
   12.6 SEARCH OVERLAY — mobile header search icon → full-screen
   search with live suggestions (top 5), works on every page.
   Product list is fetched lazily on first open, then cached in
   allProducts for the rest of the session (shop.html overwrites it
   with its own fresher fetch when that page loads).
═══════════════════════════════════════════════════════════════ */
function initSearchOverlay() {
  const btn = document.getElementById('navSearchBtn');
  if (!btn) return;

  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-overlay-bar">
      <input type="text" id="searchOverlayInput" placeholder="Search tees…" autocomplete="off" />
      <span class="search-overlay-close" id="searchOverlayClose"><i class="fas fa-times"></i></span>
    </div>
    <div class="search-overlay-results" id="searchOverlayResults"></div>`;
  document.body.appendChild(overlay);

  const input   = overlay.querySelector('#searchOverlayInput');
  const results = overlay.querySelector('#searchOverlayResults');
  let overlayProducts = null;

  const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };
  const open  = async () => {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 150);
    if (!overlayProducts) {
      try { overlayProducts = (allProducts && allProducts.length) ? allProducts : await fetchProducts(); }
      catch { overlayProducts = []; }
    }
  };

  btn.addEventListener('click', open);
  overlay.querySelector('#searchOverlayClose').addEventListener('click', close);

  const renderResults = (q) => {
    if (!q) { results.innerHTML = ''; return; }
    const list = (overlayProducts || []).filter(p =>
      !isOutOfStock(p) && (
        p.type.toLowerCase().includes(q) || p.colour.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) || p.design.some(t => t.toLowerCase().includes(q))
      ));
    if (!list.length) {
      results.innerHTML = `<div class="search-overlay-empty">No tees found for "${escHtml(q)}"</div>`;
      return;
    }
    const top = list.slice(0, 5);
    results.innerHTML = top.map(p => {
      const imgUrl = resolveImageUrl(p.image) || repoImg(p.id, '');
      return `<a class="search-suggestion" href="product.html?id=${encodeURIComponent(p.id)}">
        ${imgUrl ? `<img src="${escHtml(imgUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
        <div class="search-suggestion-info">
          <strong>${escHtml(p.type)}${p.size ? ' — ' + escHtml(p.size) : ''}</strong>
          <span>${escHtml(p.colour || '')}${p.price ? ` · ${CONFIG.CURRENCY} ${formatNum(p.price)}` : ''}</span>
        </div>
      </a>`;
    }).join('') + `<a class="search-overlay-viewall" href="shop.html?q=${encodeURIComponent(q)}">See all results for "${escHtml(q)}" →</a>`;
  };

  let debounceT;
  input.addEventListener('input', () => {
    clearTimeout(debounceT);
    const q = input.value.trim().toLowerCase();
    debounceT = setTimeout(() => renderResults(q), 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      window.location.href = `shop.html?q=${encodeURIComponent(input.value.trim())}`;
    } else if (e.key === 'Escape') close();
  });
}

/* ═══════════════════════════════════════════════════════════════
   13.1 CUSTOM ORDER FORM (custom.html)
   No backend — collects design/colour/sizes/contact and builds a
   pre-filled WhatsApp message. Design "upload" is intentionally just
   a text field: WA links can't pre-attach files, so the copy tells
   the shopper to attach their image once the chat opens instead of
   offering a fake upload button.
═══════════════════════════════════════════════════════════════ */
const CUSTOM_KIDS_SIZE_LADDER = ['xs', 's', 'm', 'l', 'xl']; // kids tees rarely go past XL

function buildSizeQtyGrid(gridId, ladder) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = (ladder || SIZE_LADDER).map(sz => `
    <div class="size-qty-item" data-size="${sz}">
      <div class="sq-label">${sz.toUpperCase()}</div>
      <div class="size-qty-stepper">
        <button type="button" class="sq-minus" aria-label="Decrease">−</button>
        <span class="sq-val">0</span>
        <button type="button" class="sq-plus" aria-label="Increase">+</button>
      </div>
    </div>`).join('');
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.size-qty-item');
    if (!item) return;
    const valEl = item.querySelector('.sq-val');
    let val = parseInt(valEl.textContent, 10) || 0;
    if (e.target.classList.contains('sq-plus')) val = Math.min(val + 1, 99);
    else if (e.target.classList.contains('sq-minus')) val = Math.max(val - 1, 0);
    else return;
    valEl.textContent = val;
    item.classList.toggle('has-qty', val > 0);
  });
}

function readSizeQtyGrid(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  return [...grid.querySelectorAll('.size-qty-item')]
    .map(item => ({ size: item.dataset.size.toUpperCase(), qty: parseInt(item.querySelector('.sq-val').textContent, 10) || 0 }))
    .filter(r => r.qty > 0);
}

function initCustomOrder() {
  const form = document.getElementById('customForm');
  if (!form) return;
  buildSizeQtyGrid('cfSizeGridKids', CUSTOM_KIDS_SIZE_LADDER);
  buildSizeQtyGrid('cfSizeGridAdults', SIZE_LADDER);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('cfError');
    const name   = document.getElementById('cfName').value.trim();
    const phone  = document.getElementById('cfPhone').value.trim();
    const design = document.getElementById('cfDesign').value.trim();
    const colour = document.getElementById('cfColour').value.trim();
    const occasion = document.querySelector('input[name="cfOccasion"]:checked')?.value || '';
    const kidsSizes   = readSizeQtyGrid('cfSizeGridKids');
    const adultsSizes = readSizeQtyGrid('cfSizeGridAdults');

    if (!name || !phone) {
      errEl.textContent = 'Please add your name and WhatsApp number so we can reply.';
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errEl.style.display = 'none';

    const lines = [
      `Hi TeeTales! 🎨 I'd like to place a custom order.`,
      ``,
      `Design: ${design || 'Will share details in chat'}`,
      `Colour: ${colour || 'Not sure — please suggest'}`,
    ];
    if (kidsSizes.length)   lines.push(`Kids sizes: ${kidsSizes.map(r => `${r.size} x${r.qty}`).join(', ')}`);
    if (adultsSizes.length) lines.push(`Adult sizes: ${adultsSizes.map(r => `${r.size} x${r.qty}`).join(', ')}`);
    if (!kidsSizes.length && !adultsSizes.length) lines.push(`Sizes: To be confirmed`);
    if (occasion) lines.push(`Occasion: ${occasion}`);
    lines.push(``, `Name: ${name}`, `WhatsApp: ${phone}`);

    const msg = lines.join('\n');
    trackWA('custom_order');
    window.open(waHref(msg), '_blank', 'noopener');
  });
}

/* ═══════════════════════════════════════════════════════════════
   13.2 BULK / CORPORATE ORDER FORM (bulk.html)
   Same no-backend pattern as the custom order form — collects
   requirements and builds a pre-filled WhatsApp enquiry. Tiered
   pricing is never shown on-site (margins stay private); it's
   quoted back on WhatsApp once we see the real requirements.
═══════════════════════════════════════════════════════════════ */
function initBulkOrder() {
  const form = document.getElementById('bulkForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('bfError');
    const name  = document.getElementById('bfName').value.trim();
    const phone = document.getElementById('bfPhone').value.trim();
    const org   = document.getElementById('bfOrg').value.trim();
    const type  = document.getElementById('bfType').value;
    const qty   = document.getElementById('bfQty').value.trim();
    const design = document.getElementById('bfDesign').value;
    const date  = document.getElementById('bfDate').value;
    const notes = document.getElementById('bfNotes').value.trim();

    if (!name || !phone) {
      errEl.textContent = 'Please add your name and WhatsApp number so we can reply.';
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errEl.style.display = 'none';

    const lines = [
      `Hi TeeTales! 👥 I'd like to place a bulk order.`,
      ``,
      `Organisation/Team: ${org || 'Not specified'}`,
      `Type: ${type || 'Not specified'}`,
      `Approx quantity: ${qty || 'To be confirmed'}`,
      `Design: ${design || 'Not specified'}`,
    ];
    if (date) lines.push(`Needed by: ${date}`);
    if (notes) lines.push(`Notes: ${notes}`);
    lines.push(``, `Name: ${name}`, `WhatsApp: ${phone}`);

    const msg = lines.join('\n');
    trackWA('bulk_order');
    window.open(waHref(msg), '_blank', 'noopener');
  });
}

/* ═══════════════════════════════════════════════════════════════
   14.3 WHATSAPP CLICK TRACKING (privacy-safe)
   GA4's automatic "Outbound clicks" is intentionally OFF for wa.me
   links (see WEB IMPROVEMENTS.md 14.1) because it would send the
   full destination URL — including any name/phone a customer just
   typed into a form — straight to Google. This helper sends only
   the button's source label and (optionally) a product ID, never
   the message text, phone number, or name.
   A single delegated click listener catches every WA link site-wide
   (static <a> tags and ones built dynamically by JS) so nothing new
   needs manual wiring later — just add data-wa-source to a new link.
═══════════════════════════════════════════════════════════════ */
function trackWA(source, itemId) {
  if (typeof gtag !== 'function') return;
  const payload = { source: source || 'unknown' };
  if (itemId) payload.item_id = itemId;
  gtag('event', 'whatsapp_click', payload);
}
window.trackWA = trackWA;

function initWAClickTracking() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="wa.me"]');
    if (!link) return;
    const source = link.dataset.waSource
      || link.id
      || (link.className || '').split(' ')[0]
      || 'unlabelled';
    trackWA(source, link.dataset.itemId || undefined);
  });
}

/* 17.11 Cart abandonment nudge — floating bottom bar (mobile) reminding of a
   non-empty cart on any page other than the cart page itself. */
function initCartFloatBar() {
  if (document.getElementById('cartPage') || document.getElementById('cartFloatBar')) return;
  const n = cartCount();
  if (!n) return;
  const bar = document.createElement('a');
  bar.id = 'cartFloatBar';
  bar.href = 'cart.html';
  bar.className = 'cart-float-bar';
  bar.innerHTML = `🛒 You have ${n} item${n > 1 ? 's' : ''} waiting <span>→</span>`;
  document.body.appendChild(bar);
}

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

  // 14.3 WhatsApp click tracking — one delegated listener covers every page
  initWAClickTracking();

  // 15.1 PWA — register the service worker (app shell caching, "Add to Home Screen")
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // Cart icon badge — update count on every page load
  cartBadgeUpdate();
  document.getElementById('cartBtn')?.addEventListener('click', openCart);
  initCartFloatBar();
  wishBadgeUpdate();
  document.getElementById('wishBtn')?.addEventListener('click', openWishlist);

  // Announcement bar — rotating messages + dismiss (remembers for 24h via localStorage)
  const announceBar   = document.getElementById('announceBar');
  const announceClose = document.getElementById('announceClose');
  if (announceBar && announceClose) {
    const dismissed = lsGetString('tt_announce_dismissed', '');
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
      lsSetString('tt_announce_dismissed', Date.now());
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

  initSearchOverlay();

  if (document.getElementById('homeAdultsGrid')) {
    initHome();
  } else if (document.getElementById('productsGrid')) {
    initShop();
  } else if (document.getElementById('pdContent')) {
    initProduct();
  } else if (document.getElementById('cartPage')) {
    // Fetch the catalogue first so the "You may also like" upsell row has data
    fetchProducts().then(products => { allProducts = products; renderCartPage(); }).catch(() => renderCartPage());
  } else if (document.getElementById('customForm')) {
    initCustomOrder();
  } else if (document.getElementById('bulkForm')) {
    initBulkOrder();
  }
});
