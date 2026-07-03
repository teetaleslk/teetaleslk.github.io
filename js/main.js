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
  Column index map — matches WebStock sheet headers:
  A(0): ItemID | B(1): Type    | C(2): Size
  D(3): STPrice               | E(4): DCPrice
  F(5): Age Grp               | G(6): Suitable for
  H(7): Stock Status          | I(8): Boost Status
  J(9): Image                 | K(10): Colour | L(11): Tags
*/
const COL = {
  ITEM_ID:  0,
  TYPE:     1,
  SIZE:     2,
  STRIKE:   3,   // D: STPrice  (strikethrough / original price)
  PRICE:    4,   // E: DCPrice  (discounted / sale price)
  AGE_GRP:  5,   // F: Age Grp
  SUITABLE: 6,   // G: Suitable for
  STOCK:    7,   // H: Stock Status  ("In Stock", "Out of Stock", "Low Stock")
  BOOST:    8,   // I: Boost Status  ("New", "Hot", "Trending", "Best Seller"…)
  IMAGE:    9,   // J: Image URL (Google Drive share link)
  COLOUR:   10,  // K: Colour
  TAGS:     11,  // L: Tags (comma-separated, e.g. "flowers,butterfly")
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
async function fetchProducts() {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;

  const res  = await fetch(url);
  const text = await res.text();

  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Unexpected Google Sheets response.');

  const json = JSON.parse(match[1]);
  if (json.status !== 'ok') throw new Error(json.errors?.[0]?.message || 'Sheet error');

  return parseTableData(json.table);
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

      // Parse tags — split by comma, trim, lowercase
      const rawTags = val(COL.TAGS);
      const tags = rawTags
        ? rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : [];

      return {
        id:       itemId || `item-${idx + 1}`,
        type:     type   || 'T-Shirt',
        size:     val(COL.SIZE),
        strike:   numVal(COL.STRIKE),
        price:    numVal(COL.PRICE),
        ageGrp:   val(COL.AGE_GRP).toLowerCase(),
        suitable: val(COL.SUITABLE).toLowerCase(),
        stock:    val(COL.STOCK) || 'In Stock',
        boost:    val(COL.BOOST),   // "New" / "Hot" / "Trending" / "Best Seller"
        image:    val(COL.IMAGE),
        colour:   val(COL.COLOUR),
        tags,
      };
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
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(CONFIG.OFFERS_TAB)}`;
  const res  = await fetch(url);
  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) return [];
  const json = JSON.parse(match[1]);
  if (json.status !== 'ok') return [];

  const rows = json.table.rows || [];
  return rows
    .map(row => {
      const cells = row.c || [];
      const v = (i) => {
        const c = cells[i];
        return (c && c.v !== null && c.v !== undefined) ? String(c.v).trim() : '';
      };
      const n = (i) => {
        const c = cells[i];
        if (!c || c.v === null) return null;
        const num = parseFloat(c.v); return isNaN(num) ? null : num;
      };
      const status = v(OFFER_COL.STATUS).toLowerCase();
      if (status !== 'active') return null;  // skip expired / blank rows
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
  } catch {
    section.style.display = 'none';  // hide on error — don't break the page
  }
}

/* ═══════════════════════════════════════════════════════════════
   DYNAMIC FILTERS — built from live data
═══════════════════════════════════════════════════════════════ */

/** Collect all unique tags from products and render tag pills */
function buildTagFilter(products) {
  const tagSet = new Set();
  products.forEach(p => p.tags.forEach(t => tagSet.add(t)));
  if (tagSet.size === 0) return;

  const container = document.getElementById('tagFilterGroup');
  if (!container) return;

  const pills = document.getElementById('tagFilter');
  if (!pills) return;

  // Clear existing
  pills.innerHTML = `<button class="tag-pill active" data-tag="all">All Themes</button>`;

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
  if (s.includes('out'))  return `<span class="badge badge-out">✕ Out of Stock</span>`;
  if (s.includes('low') || s.includes('few')) return `<span class="badge badge-low">⚡ Few Left</span>`;
  return `<span class="badge badge-in-stock">✓ In Stock</span>`;
}

/** Stock sort priority — Few first, In Stock second, Out of Stock last */
function stockPriority(stock) {
  const s = (stock || '').toLowerCase();
  if (s.includes('low') || s.includes('few')) return 0;
  if (s.includes('out')) return 2;
  return 1;
}

/** Column I — marketing/urgency boost (New, Hot, Trending, Best Seller…) */
function getBoostBadgeHtml(boostStatus) {
  const b = (boostStatus || '').toLowerCase();
  if (!b) return '';
  if (b.includes('new'))         return `<span class="badge badge-new">✨ New</span>`;
  if (b.includes('hot'))         return `<span class="badge badge-hot">🌟 Hot Pick</span>`;
  if (b.includes('trending'))    return `<span class="badge badge-trending">🔥 Trending</span>`;
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
  const stockBadge    = getStockBadgeHtml(p.stock);
  const boostBadge    = getBoostBadgeHtml(p.boost);
  const ageBadgeClass = p.ageGrp === 'kids' ? 'badge-age-kids' : 'badge-age-adults';
  const ageBadgeLabel = p.ageGrp === 'kids' ? 'Kids' : 'Adults';
  const genderLabel   = p.suitable ? capitalize(p.suitable) : '';

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
         <i class="fas fa-times-circle"></i> Out of Stock
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
  const tagsHtml = p.tags.length
    ? `<div class="card-tags">${p.tags.slice(0, 3).map(t => `<span class="card-tag-chip">#${t}</span>`).join('')}</div>`
    : '';

  /* ── Colour swatch + size bar (always visible) ── */
  const swatchColor = getSwatchColor(p.colour);
  const swatchDot   = p.colour
    ? `<span class="card-swatch-dot" style="background:${swatchColor || '#ccc'}" title="${escHtml(p.colour)}"></span>`
    : '';
  const colourLabel = p.colour ? `<span class="card-meta-colour">${escHtml(p.colour)}</span>` : '';
  const sizeLabel   = p.size   ? `<span class="card-meta-size">Size: <strong>${escHtml(p.size)}</strong></span>` : '';

  const metaBar = (colourLabel || sizeLabel)
    ? `<div class="card-meta-bar">${swatchDot}${colourLabel}${colourLabel && sizeLabel ? '<span class="card-meta-sep">·</span>' : ''}${sizeLabel}</div>`
    : '';

  /* ── Assemble ── */
  card.innerHTML = `
    <div class="card-img-area">
      <div class="card-img-link">${imgInner}</div>
      <div class="card-badges">
        ${boostBadge}
        ${saleBadge}
        ${stockBadge}
      </div>
      <div class="card-badge-tr">
        <span class="badge ${ageBadgeClass}">${ageBadgeLabel}</span>
        ${genderLabel ? `<span class="badge" style="background:rgba(255,255,255,.9);color:var(--text);margin-top:3px">${genderLabel}</span>` : ''}
      </div>
      <div class="card-wa-hover">${waBtn}</div>
    </div>
    <div class="card-info">
      <div class="card-type">${escHtml(p.type)}</div>
      ${priceHtml}
      ${metaBar}
      ${tagsHtml}
    </div>`;

  /* ── Open modal on card click (but not on WA button) ── */
  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    openProductModal(p);
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
  const ageBadgeClass = p.ageGrp === 'kids' ? 'badge-age-kids' : 'badge-age-adults';
  const ageBadgeLabel = p.ageGrp === 'kids' ? 'Kids' : 'Adults';
  const genderLabel   = p.suitable ? capitalize(p.suitable) : '';
  document.getElementById('modalBadges').innerHTML =
    `${getBoostBadgeHtml(p.boost)}
     ${getStockBadgeHtml(p.stock)}
     <span class="badge ${ageBadgeClass}">${ageBadgeLabel}</span>
     ${genderLabel ? `<span class="badge" style="background:#eee;color:var(--text)">${genderLabel}</span>` : ''}`;

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
  document.getElementById('modalMeta').innerHTML = `
    <div class="modal-meta-row">${swatchDot}
      ${p.colour ? `<span class="modal-meta-item"><strong>Colour:</strong> ${escHtml(p.colour)}</span>` : ''}
      ${p.size   ? `<span class="modal-meta-item"><strong>Size:</strong> ${escHtml(p.size)}</span>`   : ''}
    </div>
    <div class="modal-item-id">Item ID: ${escHtml(p.id)}</div>`;

  /* Tags */
  document.getElementById('modalTags').innerHTML = p.tags.length
    ? p.tags.map(t => `<span class="card-tag-chip">#${t}</span>`).join('')
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
    ? `<button class="modal-wa-btn out-of-stock" disabled><i class="fas fa-times-circle"></i> Out of Stock</button>`
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
   FILTERING
═══════════════════════════════════════════════════════════════ */
function applyFilters() {
  let f = allProducts;

  if (activeAge     !== 'all') f = f.filter(p => p.ageGrp   === activeAge);
  if (activeGender  !== 'all') f = f.filter(p => p.suitable === activeGender);
  if (activeTag     !== 'all') f = f.filter(p => p.tags.includes(activeTag));
  if (activeColour  !== 'all') f = f.filter(p => p.colour.toLowerCase().includes(activeColour));

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    f = f.filter(p =>
      p.type.toLowerCase().includes(q)   ||
      p.colour.toLowerCase().includes(q) ||
      p.size.toLowerCase().includes(q)   ||
      p.id.toLowerCase().includes(q)     ||
      p.tags.some(t => t.includes(q))
    );
  }

  // Sort: Few Left → In Stock → Out of Stock
  f.sort((a, b) => stockPriority(a.stock) - stockPriority(b.stock));

  renderProducts(f);
  updateFilterSummary();
}

function updateFilterSummary() {
  const tags = [];
  if (activeAge    !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-users"></i> ${capitalize(activeAge)}</span>`);
  if (activeGender !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-filter"></i> ${capitalize(activeGender)}</span>`);
  if (activeTag    !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-tag"></i> ${capitalize(activeTag)}</span>`);
  if (activeColour !== 'all') tags.push(`<span class="filter-tag"><i class="fas fa-palette"></i> ${capitalize(activeColour)}</span>`);
  if (searchQ