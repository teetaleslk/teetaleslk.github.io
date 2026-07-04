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
const CONFIG = {
  SHEET_ID:    '1rHyu237K7jfq8WMMZgMkrU-ves5PNYUkvrS3qWQqZho',
  SHEET_NAME:  'WebStock',   // ← actual tab name in the sheet
  OFFERS_TAB:  'Offers',     // ← tab name for the Offers sheet
  WA_NUMBER:   '94774407066',
  CURRENCY:    'Rs.',
  REFRESH_MIN: 5,
  // Social media — UPDATE THESE with your actual profile URLs
  SOCIAL: {
    facebook:  'https://facebook.com/teetales',
    instagram: 'https://instagram.com/teetales.tshirt',
    tiktok:    'https://tiktok.com/@tee.tales.tshirt',
  },
};

/*
  Column index map — matches WebStock sheet headers (A–P, 16 cols):
  A(0): ItemID     | B(1): Type       | C(2): TeeCategory
  D(3): Size       | E(4): PrintSize  | F(5): STPrice
  G(6): DCPrice    | H(7): Age Grp    | I(8): Suitable for
  J(9): Stock Status | K(10): Boost Status | L(11): Colour
  M(12): Sticker/Image (Design Name)  | N(13): Material
  O(14): Image1    | P(15): Image2
*/
const COL = {
  ITEM_ID:    0,
  TYPE:       1,
  CATEGORY:   2,  // C: TeeCategory (e.g. "Round Neck", "Polo")
  SIZE:       3,  // D: Size
  PRINT_SIZE: 4,  // E: PrintSize
  STRIKE:     5,  // F: STPrice  (strikethrough / original price)
  PRICE:      6,  // G: DCPrice  (discounted / sale price)
  AGE_GRP:    7,  // H: Age Grp
  SUITABLE:   8,  // I: Suitable for  ("Ladies", "Gents", "Unisex")
  STOCK:      9,  // J: Stock Status  ("In Stock", "Almost Gone", "Sold Out")
  BOOST:     10,  // K: Boost Status  ("New", "Hot", "Trending", "Best Seller"…)
  COLOUR:    11,  // L: Colour
  DESIGN:    12,  // M: Sticker/Image — design name
  MATERIAL:  13,  // N: Material (e.g. "100% Cotton")
  IMAGE:     14,  // O: Image1 — primary product photo (Google Drive share link)
  IMAGE2:    15,  // P: Image2 — second photo (optional)
};

/* ── STATE ──────────────────────────────────────────────────── */
let allProducts   = [];
let activeAge     = 'all';
let activeGender  = 'all';
let activeTag     = 'all';
let activeColour  = 'all';
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
  return parseTableData(table);
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

      const product = {
        id:         itemId || `item-${idx + 1}`,
        type:       type   || 'T-Shirt',
        category:   val(COL.CATEGORY),
        size:       val(COL.SIZE),
        printSize:  val(COL.PRINT_SIZE),
        strike:     numVal(COL.STRIKE),
        price:      numVal(COL.PRICE),
        ageGrp:     val(COL.AGE_GRP).toLowerCase(),
        suitable:   val(COL.SUITABLE).toLowerCase(),
        stock:      val(COL.STOCK) || 'In Stock',
        boost:      val(COL.BOOST),
        material:   val(COL.MATERIAL),
        image:      val(COL.IMAGE),
        image2:     val(COL.IMAGE2),
        colour:     val(COL.COLOUR),
        design,
      };
      return product;
    })
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════
   OFFERS — fetch + render from "Offers" tab
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
        ${offer.strike ? `<span class="offer-save">Save ${CONFIG.CURRENCY} ${formatNum(offer.strike - offer.price)}</span>` : ''}
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
function buildTagFilter(products) {
  const tagSet = new Set();
  products.forEach(p => p.design.forEach(t => tagSet.add(t)));
  if (tagSet.size === 0) return;

  const container = document.getElementById('tagFilterGroup');
  if (!container) return;

  const pills = document.getElementById('tagFilter');
  if (!pills) return;

  // Clear existing
  pills.innerHTML = `<button class="tag-pill active" data-tag="all">All Designs</button>`;

  // Sort tags alphabetically
  [...tagSet].sort().forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill';
    btn.dataset.tag = tag;
    btn.textContent = capitalize(tag);
    pills.appendChild(btn);
  });

  container.style.display = 'flex';

  pills.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    pills.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeTag = pill.dataset.tag;
    applyFilters();
  });
}

/** Collect all unique colours and render colour swatch buttons */
function buildColourFilter(products) {
  const colours = [...new Set(products.map(p => p.colour).filter(Boolean))];
  if (colours.length === 0) return;

  const container = document.getElementById('colourFilterGroup');
  if (!container) return;
  const wrap = document.getElementById('colourFilter');
  if (!wrap) return;

  wrap.innerHTML = `<button class="colour-all-btn active" data-colour="all">All</button>`;

  colours.forEach(colour => {
    const hex = getSwatchColor(colour);
    const btn = document.createElement('button');
    btn.className   = 'colour-btn';
    btn.dataset.colour = colour.toLowerCase();
    btn.title          = colour;
    btn.setAttribute('aria-label', colour);
    btn.style.background = hex || '#ccc';
    if (!hex) btn.style.border = '2px solid #ccc';
    wrap.appendChild(btn);
  });

  container.style.display = 'flex';

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.colour-btn, .colour-all-btn');
    if (!btn) return;
    wrap.querySelectorAll('.colour-btn, .colour-all-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeColour = btn.dataset.colour;
    applyFilters();
  });
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE HELPERS
═══════════════════════════════════════════════════════════════ */
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

/** CSS colour map for swatches */
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
  if (isKids  && suit === 'ladies')  return { label: "Girl's Tee",  emoji: '👧' };
  if (isKids  && suit === 'gents')   return { label: "Boy's Tee",   emoji: '👦' };
  if (isKids  && suit === 'unisex')  return { label: "Kids' Tee",   emoji: '🧒' };
  if (!isKids && suit === 'ladies')  return { label: "Ladies' Tee", emoji: '👩' };
  if (!isKids && suit === 'gents')   return { label: "Gents' Tee",  emoji: '👨' };
  if (!isKids && suit === 'unisex')  return { label: "Unisex Tee",  emoji: '👕' };
  if (isKids)                        return { label: "Kids' Tee",   emoji: '🧒' };
  if (!isKids)                       return { label: 'Adults',      emoji: '🧑' };
  return { label: '', emoji: '' };
}

/** Column I — marketing/urgency boost (New, Hot, Trending, Best Seller…) */
function getBoostBadgeHtml(boostStatus) {
  const b = (boostStatus || '').toLowerCase();
  if (!b) return '';
  if (b.includes('new'))         return `<span class="badge badge-new">🏷️ New In</span>`;
  if (b.includes('hot'))         return `<span class="badge badge-hot">🔥 Hot Pick</span>`;
  if (b.includes('trending'))    return `<span class="badge badge-trending">📈 Trending</span>`;
  if (b.includes('best seller') || b.includes('bestseller'))
                                 return `<span class="badge badge-trending">⭐ Best Seller</span>`;
  if (b.includes('featured'))    return `<span class="badge badge-new">Featured</span>`;
  return '';
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
           onerror="this.parentElement.innerHTML=window.placeholderHtml()" />`
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

  /* ── WhatsApp message ── */
  const displayPrice = p.price !== null
    ? `${CONFIG.CURRENCY} ${formatNum(p.price)}`
    : (p.strike !== null ? `${CONFIG.CURRENCY} ${formatNum(p.strike)}` : 'TBC');

  const waMsg = encodeURIComponent(
    `Hi TeeTales! 👋 I'd like to order:\n\n` +
    `• Item: ${p.type}\n` +
    `• Size: ${p.size || 'TBD'}\n` +
    `• Colour: ${p.colour || 'TBD'}\n` +
    `• Price: ${displayPrice}\n` +
    `• Item ID: ${p.id}\n\n` +
    `Is this available? 👕`
  );

  const waBtn = isOutOfStock
    ? `<button class="wa-quick-btn out-of-stock" disabled>
         <i class="fas fa-times-circle"></i> Sold Out
       </button>`
    : `<a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${waMsg}"
          target="_blank" rel="noopener" class="wa-quick-btn">
         <i class="fab fa-whatsapp"></i> Order on WhatsApp
       </a>`;

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
  const sizeLabel   = p.size   ? `<span class="card-meta-size">Size: <strong>${escHtml(p.size)}</strong></span>` : '';

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
      <div class="card-wa-hover">${waBtn}</div>
    </div>
    <div class="card-info">
      <div class="card-type">${escHtml(p.type)}</div>
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

/* ═══════════════════════════════════════════════════════════════
   PRODUCT MODAL
═══════════════════════════════════════════════════════════════ */
function ensureModal() {
  if (document.getElementById('productModal')) return;
  const el = document.createElement('div');
  el.id = 'productModal';
  el.className = 'product-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <button class="modal-close" aria-label="Close">&times;</button>
      <div class="modal-image-col">
        <div class="modal-img-wrap" id="modalImgWrap"></div>
      </div>
      <div class="modal-detail-col">
        <div class="modal-badges" id="modalBadges"></div>
        <h2 class="modal-title" id="modalTitle"></h2>
        <div class="modal-price" id="modalPrice"></div>
        <div class="modal-meta" id="modalMeta"></div>
        <div class="modal-tags" id="modalTags"></div>
        <div class="modal-actions" id="modalActions"></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  /* Close handlers */
  el.querySelector('.modal-overlay').addEventListener('click', closeProductModal);
  el.querySelector('.modal-close').addEventListener('click', closeProductModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProductModal(); });
}

function openProductModal(p) {
  ensureModal();
  const modal = document.getElementById('productModal');

  /* Image */
  const imgUrl = resolveImageUrl(p.image);
  document.getElementById('modalImgWrap').innerHTML = imgUrl
    ? `<img src="${escHtml(imgUrl)}" alt="${escHtml(p.type)}"
           onerror="this.parentElement.innerHTML='<div class=\\'modal-img-placeholder\\'><span>👕</span><small>Photo coming soon</small></div>'" />`
    : `<div class="modal-img-placeholder"><span>👕</span><small>Photo coming soon</small></div>`;

  /* Badges */
  const modalAudience = getAudienceLabel(p.ageGrp, p.suitable);
  const modalAudienceBadge = modalAudience.label
    ? `<span class="badge badge-audience">${modalAudience.emoji} ${modalAudience.label}</span>`
    : '';
  document.getElementById('modalBadges').innerHTML =
    `${getBoostBadgeHtml(p.boost)}
     ${getStockBadgeHtml(p.stock)}
     ${modalAudienceBadge}`;

  /* Title */
  document.getElementById('modalTitle').textContent = p.type;

  /* Price */
  let priceHtml = '';
  if (p.price !== null && p.strike !== null && p.strike > p.price) {
    const disc = Math.round((1 - p.price / p.strike) * 100);
    priceHtml = `<span class="modal-price-current">${CONFIG.CURRENCY} ${formatNum(p.price)}</span>
                 <span class="modal-price-strike">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span>
                 <span class="price-badge">-${disc}%</span>`;
  } else if (p.price !== null) {
    priceHtml = `<span class="modal-price-current">${CONFIG.CURRENCY} ${formatNum(p.price)}</span>`;
  } else if (p.strike !== null) {
    priceHtml = `<span class="modal-price-current">${CONFIG.CURRENCY} ${formatNum(p.strike)}</span>`;
  } else {
    priceHtml = `<span style="color:var(--text-muted)">Ask for price</span>`;
  }
  document.getElementById('modalPrice').innerHTML = priceHtml;

  /* Colour + Size + ID */
  const swatchColor = getSwatchColor(p.colour);
  const swatchDot = p.colour
    ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}"></span>`
    : '';
  const modalAgeRange = p.ageGrp && p.ageGrp !== 'adults';
  document.getElementById('modalMeta').innerHTML = `
    <div class="modal-meta-row">${swatchDot}
      ${p.colour         ? `<span class="modal-meta-item"><strong>Colour:</strong> ${escHtml(p.colour)}</span>` : ''}
      ${p.size           ? `<span class="modal-meta-item"><strong>Size:</strong> ${escHtml(p.size)}</span>` : ''}
      ${p.category       ? `<span class="modal-meta-item"><strong>Type:</strong> ${escHtml(p.category)}</span>` : ''}
      ${p.printSize      ? `<span class="modal-meta-item"><strong>Print:</strong> ${escHtml(p.printSize)}</span>` : ''}
      ${modalAgeRange    ? `<span class="modal-meta-item"><strong>Age:</strong> ${escHtml(p.ageGrp)}</span>` : ''}
      ${p.material       ? `<span class="modal-meta-item"><strong>Material:</strong> ${escHtml(p.material)}</span>` : ''}
    </div>
    <div class="modal-item-id">Item ID: ${escHtml(p.id)}</div>`;

  /* Tags */
  document.getElementById('modalTags').innerHTML = p.design.length
    ? p.design.map(t => `<span class="card-tag-chip">${t}</span>`).join('')
    : '';

  /* WhatsApp action */
  const displayPrice = p.price !== null
    ? `${CONFIG.CURRENCY} ${formatNum(p.price)}`
    : (p.strike !== null ? `${CONFIG.CURRENCY} ${formatNum(p.strike)}` : 'TBC');
  const isOut = p.stock.toLowerCase().includes('out');
  const waMsg = encodeURIComponent(
    `Hi TeeTales! 👋 I'd like to order:\n\n` +
    `• Item: ${p.type}\n` +
    `• Size: ${p.size || 'TBD'}\n` +
    `• Colour: ${p.colour || 'TBD'}\n` +
    `• Price: ${displayPrice}\n` +
    `• Item ID: ${p.id}\n\n` +
    `Is this available? 👕`
  );
  document.getElementById('modalActions').innerHTML = isOut
    ? `<button class="modal-wa-btn out-of-stock" disabled><i class="fas fa-times-circle"></i> Sold Out</button>`
    : `<a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${waMsg}" target="_blank" rel="noopener" class="modal-wa-btn">
         <i class="fab fa-whatsapp"></i> Order on WhatsApp
       </a>`;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
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
function applyFilters() {
  let f = allProducts;

  if (activeAge === 'adults') f = f.filter(p => p.ageGrp === 'adults');
  else if (activeAge === 'kids') f = f.filter(p => p.ageGrp !== 'adults');
  if (activeGender === 'ladies' || activeGender === 'gents') {
    // Include unisex items alongside the selected gender
    f = f.filter(p => p.suitable === activeGender || p.suitable === 'unisex');
  } else if (activeGender !== 'all') {
    f = f.filter(p => p.suitable === activeGender);
  }
  if (activeTag    !== 'all') f = f.filter(p => p.design.includes(activeTag));
  if (activeColour !== 'all') f = f.filter(p => p.colour.toLowerCase().includes(activeColour));

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    f = f.filter(p =>
      p.type.toLowerCase().includes(q)   ||
      p.colour.toLowerCase().includes(q) ||
      p.size.toLowerCase().includes(q)   ||
      p.id.toLowerCase().includes(q)     ||
      p.design.some(t => t.includes(q))
    );
  }

  // Sort: Almost Gone → In Stock → Sold Out
  f.sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock));

  renderProducts(f);
  updateFilterSummary();
}

function updateFilterSummary() {
  if (!filterSummary) return;
  const tags = [];
  if (activeAge    !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-users"></i> ${capitalize(activeAge)}</span>`);
  if (activeGender !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-filter"></i> ${capitalize(activeGender)}</span>`);
  if (activeTag    !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-tag"></i> ${activeTag}</span>`);
  if (activeColour !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-palette"></i> ${capitalize(activeColour)}</span>`);
  if (searchQuery)             tags.push(`<span class="filter-tag"><i class="fas fa-search"></i> "${escHtml(searchQuery)}"</span>`);
  filterSummary.innerHTML = tags.join('');
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

/* ═══════════════════════════════════════════════════════════════
   HOME PAGE — 4 Adults + 4 Kids preview
═══════════════════════════════════════════════════════════════ */
async function initHome() {
  renderOffers();

  const adultsGrid = document.getElementById('homeAdultsGrid');
  const kidsGrid   = document.getElementById('homeKidsGrid');
  if (!adultsGrid && !kidsGrid) return;

  try {
    const products = await fetchProducts();

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
    buildTagFilter(allProducts);
    buildColourFilter(allProducts);
    applyFilters();
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
    document.title = `TeeTales — ${p.type}`;
    const bcEl = document.getElementById('pdBcName');
    if (bcEl) bcEl.textContent = p.type;

    /* Main image */
    const imgUrl  = resolveImageUrl(p.image);
    const img2Url = resolveImageUrl(p.image2);
    const mainImgEl = document.getElementById('pdMainImg');
    mainImgEl.innerHTML = imgUrl
      ? `<img id="pdMainImgTag" src="${escHtml(imgUrl)}" alt="${escHtml(p.type)}"
             onerror="this.parentElement.innerHTML='<div class=\\'pd-img-placeholder\\'><span>👕</span><small>Photo coming soon</small></div>'" />`
      : `<div class="pd-img-placeholder"><span>👕</span><small>Photo coming soon</small></div>`;

    /* Image 2 thumbnail */
    if (img2Url) {
      const thumbEl = document.getElementById('pdThumbRow');
      const thumb   = document.createElement('img');
      thumb.src       = img2Url;
      thumb.alt       = `${p.type} — view 2`;
      thumb.className = 'pd-thumb';
      thumb.onerror   = () => thumb.remove();
      thumb.addEventListener('click', () => {
        const main = document.getElementById('pdMainImgTag');
        if (main) main.src = img2Url;
      });
      thumbEl.appendChild(thumb);
    }

    /* Badges */
    const audience = getAudienceLabel(p.ageGrp, p.suitable);
    const audBadge = audience.label
      ? `<span class="badge badge-audience">${audience.emoji} ${audience.label}</span>` : '';
    document.getElementById('pdBadges').innerHTML =
      `${getBoostBadgeHtml(p.boost)} ${getStockBadgeHtml(p.stock)} ${audBadge}`;

    /* Title */
    document.getElementById('pdTitle').textContent = p.type;

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

    /* Meta list */
    const swatchColor = getSwatchColor(p.colour);
    const swatchDot   = p.colour
      ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}"></span>` : '';
    const ageIsKids   = p.ageGrp && p.ageGrp !== 'adults';
    const metaItems   = [
      p.colour     ? `<div class="pd-meta-item"><dt>Colour</dt><dd>${swatchDot}${escHtml(p.colour)}</dd></div>` : '',
      p.size       ? `<div class="pd-meta-item"><dt>Size</dt><dd>${escHtml(p.size)}</dd></div>` : '',
      p.category   ? `<div class="pd-meta-item"><dt>Style</dt><dd>${escHtml(p.category)}</dd></div>` : '',
      p.printSize  ? `<div class="pd-meta-item"><dt>Print Size</dt><dd>${escHtml(p.printSize)}</dd></div>` : '',
      ageIsKids    ? `<div class="pd-meta-item"><dt>Age Group</dt><dd>🎂 ${escHtml(p.ageGrp)}</dd></div>` : '',
      p.material   ? `<div class="pd-meta-item"><dt>Material</dt><dd>${escHtml(p.material)}</dd></div>` : '',
      p.design.length
        ? `<div class="pd-meta-item pd-meta-full"><dt>Design</dt><dd>${p.design.map(t => `<span class="card-tag-chip">${escHtml(t)}</span>`).join('')}</dd></div>`
        : '',
    ].filter(Boolean);
    document.getElementById('pdMeta').innerHTML = metaItems.join('');

    /* WhatsApp order button */
    const isOut       = p.stock.toLowerCase().includes('out');
    const displayPrice = p.price !== null
      ? `${CONFIG.CURRENCY} ${formatNum(p.price)}`
      : (p.strike !== null ? `${CONFIG.CURRENCY} ${formatNum(p.strike)}` : 'TBC');
    const waMsg = encodeURIComponent(
      `Hi TeeTales! 👋 I'd like to order:\n\n` +
      `• Item: ${p.type}\n` +
      `• Size: ${p.size || 'TBD'}\n` +
      `• Colour: ${p.colour || 'TBD'}\n` +
      `• Price: ${displayPrice}\n` +
      `• Item ID: ${p.id}\n\n` +
      `Is this available? 👕`
    );
    document.getElementById('pdOrderBtn').innerHTML = isOut
      ? `<button class="pd-wa-btn pd-wa-btn-out" disabled><i class="fas fa-times-circle"></i> Sold Out</button>`
      : `<a href="https://wa.me/${CONFIG.WA_NUMBER}?text=${waMsg}" target="_blank" rel="noopener" class="pd-wa-btn">
           <i class="fab fa-whatsapp"></i> Order on WhatsApp
         </a>`;

    /* Item ID */
    document.getElementById('pdItemId').textContent = `Item ID: ${p.id}`;

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
   BOOT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  if (footerYear) footerYear.textContent = new Date().getFullYear();

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
  }
});
