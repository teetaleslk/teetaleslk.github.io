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

**WebStock** tab — columns must be in this exact order (A through L):

| Column | Header                      | Example Value            | Notes                                      |
|--------|-----------------------------|--------------------------|--------------------------------------------|
| A      | ItemID                      | ALF0001                  | Unique ID — don't change once set          |
| B      | Type                        | Polo Shirt               | Product name / style shown on card         |
| C      | Size                        | M / L / XL               | Size(s) available                          |
| D      | STPrice                     | 1799                     | Strike-through (original) price            |
| E      | DCPrice                     | 1599                     | Discounted / sale price                    |
| F      | Age Grp                     | Adults / Kids            | Home-page category split                   |
| G      | Suitable for                | Ladies / Gents / Unisex  | Gender filter on shop page                 |
| H      | Stock Status                | In Stock                 | See Stock Status values below              |
| I      | Boost Status                | Hot                      | See Boost Status values below              |
| J      | Colour                      | Pink                     | Colour-swatch filter                       |
| K      | Sticker/Image (Design Name) | Batman, Floral           | Comma-separated design names               |
| L      | Image                       | (Google Drive share URL) | See image upload guide below               |

### Stock Status Values (Column H)
| Value          | Badge shown on site           |
|----------------|-------------------------------|
| `In Stock`     | Green — In Stock              |
| `Low Stock`    | Orange — Low Stock            |
| `Out of Stock` | Red — button disabled         |

### Boost Status Values (Column I)
| Value      | Badge shown on card  |
|------------|----------------------|
| `Hot`      | 🔥 Hot Pick          |
| `New`      | ✨ New Arrival       |
| `Trending` | 📈 Trending          |
| *(blank)*  | No badge             |

### Design Names (Column K)
Comma-separated names matching the sticker/print on the shirt.

Example: `Batman, Superman` or `Floral, Butterfly` or `Labubu`

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
