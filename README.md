# 👕 TeeTales Website

A live, dynamic t-shirt shop website that reads your products directly from Google Sheets.
Update the sheet → the website updates instantly.

---

## 🚀 Quick Start

### Step 1 — Make your Google Sheet public

1. Open your sheet: [TeeTalesWebStockMgt](https://docs.google.com/spreadsheets/d/1rHyu237K7jfq8WMMZgMkrU-ves5PNYUkvrS3qWQqZho)
2. Click **Share** → **Anyone with the link** → set to **Viewer**
3. Click **Done**

That's it. The website will now pull your products automatically.

---

### Step 2 — Add your social media links

Open `js/main.js` and find the `CONFIG` block at the top. Replace the placeholders:

```js
SOCIAL: {
  facebook:  'https://facebook.com/YOUR_PAGE',   // ← replace with your FB page URL
  instagram: 'https://instagram.com/YOUR_HANDLE', // ← your Instagram handle
  tiktok:    'https://tiktok.com/@YOUR_HANDLE',   // ← your TikTok handle
}
```

Also search for `YOUR_PAGE` and `YOUR_HANDLE` in `index.html` and replace them there too.

---

### Step 3 — Deploy to GitHub Pages (Free hosting)

1. Create a free account at [github.com](https://github.com)
2. Create a new repository (e.g. `teeTales-web`) — set it to **Public**
3. Upload all the files (maintain the folder structure):
   ```
   index.html
   css/style.css
   js/main.js
   README.md
   ```
4. Go to **Settings → Pages**
5. Under "Branch", select **main** → **/ (root)** → click **Save**
6. After ~1 minute, your site will be live at:
   `https://YOUR_USERNAME.github.io/teeTales-web/`

---

## 📊 Google Sheet — Column Guide

Your sheet must have these columns **in order** (A through L):

| Column | Header              | Example Value         | Notes                                  |
|--------|---------------------|-----------------------|----------------------------------------|
| A      | ItemID              | TT-001                | Unique ID for each item                |
| B      | Type                | Polo Shirt            | Product name / style                   |
| C      | Size                | M / L / XL            | Can list multiple: "S, M, L"           |
| D      | Colour              | Navy Blue             | Used for colour swatch filter          |
| E      | Strikethrough Price | 1500                  | Original price — shown crossed out     |
| F      | Discounted Price    | 999                   | Sale price — **use 999 not 1000** ✓    |
| G      | Age Grp             | Adults / Kids         | Used for category filter               |
| H      | Suitable for        | Male / Female / Unisex| Gender filter                          |
| I      | Image               | (Google Drive URL)    | See image upload guide below           |
| J      | Tags                | flowers,butterfly,pink| Comma-separated theme tags             |
| K      | Stock Status        | In Stock              | See stock status options below         |
| L      | Material            | 100% Cotton           | Shown on product card                  |

### Stock Status Values
| Value          | Badge shown on site           |
|----------------|-------------------------------|
| `In Stock`     | (no badge — default)          |
| `Low Stock`    | ⚡ Last Few!                  |
| `New`          | ✨ New Arrival                |
| `Trending`     | 🔥 Trending                   |
| `Hot`          | 🌟 Hot Pick                   |
| `Out of Stock` | Out of Stock (button greyed)  |

### Suggested Tags (Column J)
Use these consistently across your products for best filtering:

**Designs:** `flowers`, `butterfly`, `nature`, `superhero`, `quotes`, `abstract`, `geometric`,
`stripes`, `logo`, `minimal`, `animal`, `cartoon`, `sports`, `music`, `vintage`, `flag`

**Occasion:** `birthday`, `gift`, `casual`, `formal`, `party`, `school`

**Style:** `classic`, `oversized`, `fitted`, `printed`, `embroidered`, `custom`

Example: `flowers,butterfly,nature`

---

## 🖼️ How to Add Product Images

1. Upload your t-shirt photo to Google Drive (Photos folder)
2. Right-click the image → **Share** → **Anyone with the link → Viewer**
3. Click **Copy link** — it looks like:
   `https://drive.google.com/file/d/FILEID123/view?usp=sharing`
4. Paste the full link into Column I (Image) of your sheet
5. The website converts it automatically to a direct image URL

---

## 💡 Google Sheet Improvements (Recommended)

Based on your sales playbook, here are additional sheet improvements:

### Pricing (Tactic 4 — Left-Digit Effect)
- **Never use round numbers.** Use `999` instead of `1000`, `1499` instead of `1500`
- This triggers a psychological "cheaper" perception in buyers

### Colour Entry (for swatch filter)
- Use consistent colour names: `Navy Blue`, `Sky Blue`, `Rose Pink`
- Avoid abbreviations like `NB` — use full names for accurate swatches

### Tags (for searchability)
- Add at least 2–3 tags per item
- Think: "What words would a customer type to find this?"
- Example for a butterfly print: `butterfly,flowers,nature,colourful`

### Bundle Tracking
Add a `Bundle Eligible` column (Yes/No) to track which items are included in bundle deals.

### Analytics
Add an `Added Date` column to track when items were added — helps you identify new arrivals automatically.

---

## 🔧 Customisation

### Change WhatsApp number
In `js/main.js`, find:
```js
WA_NUMBER: '94774407066',
```
Replace with your number (country code + number, no spaces or +).

### Change currency
```js
CURRENCY: 'Rs.',
```

### Auto-refresh interval
```js
REFRESH_MIN: 5,  // refreshes every 5 minutes; set to 0 to disable
```

---

## 📱 Social Media Integration

Add your profile links in two places:

1. **`js/main.js`** — `CONFIG.SOCIAL` object
2. **`index.html`** — search for `YOUR_PAGE` and `YOUR_HANDLE` and replace all 8 instances

When you have your pages ready, the website will automatically link to them in:
- Navbar social icons
- Mobile menu
- Footer social buttons

---

## 📁 File Structure

```
teeTales-web/
├── index.html          ← Main website page
├── css/
│   └── style.css       ← All styles (responsive, mobile-first)
├── js/
│   └── main.js         ← Google Sheets integration + filters
└── README.md           ← This guide
```

---

## 🎯 Marketing Features Implemented

Based on "The Tee Tales Playbook: Weaving Psychology into Sales":

| Tactic | Implementation |
|--------|---------------|
| Emotional Engineering | Identity-first hero: "Not Just a Shirt. It's Who You Are." |
| Strike-through Pricing | Shown on every product card with % saved |
| Decoy Pricing Matrix | 3-tier Bundle section (Starter / Standard / Bundle ⭐) |
| Proxy Targeting | Dedicated "Gift Ideas" section for gifters |
| Urgency / Scarcity | Stock Status badges (Last Few!, Trending, Hot Pick) |
| Social Proof | Trust strip with customer count + WhatsApp response time |
| Parasite Placement | WhatsApp order messages pre-filled (easy to add upsell) |
| Tag Search | Filter by design theme (flowers, superhero, quotes…) |
| Colour Filter | Visual swatch buttons for colour browsing |
| Social Channels | Facebook, Instagram, TikTok links + footer |

---

*Built for TeeTales · Powered by Google Sheets · Deployed on GitHub Pages*
