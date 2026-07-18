/**
 * TeeTales — Auto-fill Image1/Image2 links in WebStock from a public Drive folder.
 * (API-key version — needs NO Drive permission, so Google won't block it.)
 *
 * SETUP (once, ~5 min):
 * 1. Folder: share as "Anyone with the link — Viewer". Copy its ID from the URL
 *    (drive.google.com/drive/folders/<THIS PART>) → paste into FOLDER_ID below.
 * 2. API key: go to console.cloud.google.com → create project (any name) →
 *    "APIs & Services" → "Library" → enable "Google Drive API" →
 *    "Credentials" → "+ Create credentials" → "API key" → copy it into API_KEY below.
 *    (The key only reads PUBLIC files — it can't touch your private Drive.)
 * 3. In the sheet: Extensions → Apps Script → paste this file → save.
 * 4. Reload the sheet → "TeeTales" menu → "Update Image Links".
 *    First run asks only for spreadsheet + external-request permission — allow it.
 *    (Optional: clock icon "Triggers" → add time-driven trigger, e.g. every hour.)
 *
 * NAMING RULE:
 *   00001.jpg  → Image1 (col Q) of the row whose ItemID ends with 00001
 *   00001A.jpg → Image2 (col R) of the same row
 */
const FOLDER_ID = 'PASTE_YOUR_FOLDER_ID_HERE';
const API_KEY   = 'PASTE_YOUR_API_KEY_HERE';
const SHEET_NAME = 'WebStock';
const COL_ITEMID = 1;   // A
const COL_IMAGE1 = 17;  // Q
const COL_IMAGE2 = 18;  // R

function updateImageLinks() {
  // 1. List the public folder via Drive API (no Drive OAuth scope needed)
  const map = {};
  let pageToken = '';
  do {
    const url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("'" + FOLDER_ID + "' in parents and trashed=false")
      + '&fields=' + encodeURIComponent('nextPageToken,files(id,name)')
      + '&pageSize=1000&key=' + API_KEY
      + (pageToken ? '&pageToken=' + pageToken : '');
    const res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
    (res.files || []).forEach(f => {
      const base = f.name.replace(/\.[^.]+$/, '').trim().toUpperCase(); // strip .jpg etc
      map[base] = 'https://drive.google.com/file/d/' + f.id + '/view';
    });
    pageToken = res.nextPageToken || '';
  } while (pageToken);

  // 2. Walk WebStock rows, match ItemID suffix
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, COL_ITEMID, last - 1, 1).getValues();
  const out = sh.getRange(2, COL_IMAGE1, last - 1, 2).getValues(); // Q + R
  let updated = 0;

  ids.forEach((row, i) => {
    const id = String(row[0]).trim().toUpperCase();
    if (!id) return;
    for (const base in map) {
      const isSecond = base.endsWith('A');
      const core = isSecond ? base.slice(0, -1) : base;
      if (core && id.endsWith(core)) {
        const col = isSecond ? 1 : 0;
        if (out[i][col] !== map[base]) { out[i][col] = map[base]; updated++; }
      }
    }
  });

  sh.getRange(2, COL_IMAGE1, last - 1, 2).setValues(out);
  SpreadsheetApp.getActive().toast(updated + ' image link(s) updated', 'TeeTales', 5);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TeeTales')
    .addItem('Update Image Links', 'updateImageLinks')
    .addToUi();
}
