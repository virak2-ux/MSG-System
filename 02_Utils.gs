/**
 * UTILS.GS
 * Generic helpers so every module (Members, Loans, Savings, ...) reads
 * and writes sheets the same safe way — by header name, never by
 * hardcoded column letter, so a future column reorder can't silently
 * corrupt data.
 */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Sheet not found: ' + name);
  return s;
}

function getHeaders_(sheetName) {
  const s = sheet_(sheetName);
  const lastCol = s.getLastColumn();
  return s.getRange(1, 1, 1, lastCol).getValues()[0];
}

/**
 * Returns every non-blank data row as an array of objects keyed by
 * header name. Adds a hidden _row property (the real sheet row number)
 * so callers can write back to the exact row later.
 */
function sheetToObjects(sheetName) {
  const s = sheet_(sheetName);
  const lastRow = s.getLastRow();
  const headers = getHeaders_(sheetName);
  if (lastRow < 2) return [];
  const data = s.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const out = [];
  data.forEach((row, i) => {
    const blank = row.every(v => v === '' || v === null || v === undefined);
    if (blank) return;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    obj._row = i + 2;
    out.push(obj);
  });
  return out;
}

function findByField_(sheetName, field, value) {
  return sheetToObjects(sheetName).find(o => String(o[field]) === String(value)) || null;
}

function filterByField_(sheetName, field, value) {
  return sheetToObjects(sheetName).filter(o => String(o[field]) === String(value));
}

/** Appends one object as a new row, mapping by header name. Returns the new row number. */
function appendObject_(sheetName, obj) {
  const s = sheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  s.appendRow(row);
  return s.getLastRow();
}

/** Patches only the supplied fields of an existing row, leaving everything else untouched. */
function updateRow_(sheetName, rowNum, patch) {
  const s = sheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const range = s.getRange(rowNum, 1, 1, headers.length);
  const existing = range.getValues()[0];
  headers.forEach((h, idx) => {
    if (patch[h] !== undefined) existing[idx] = patch[h];
  });
  range.setValues([existing]);
}

/**
 * Generates the next sequential ID for a sheet, e.g. SAV-032, LN-010.
 * Looks at the numeric suffix of every existing ID in idField and
 * increments the highest one. Zero-padded to 3 digits.
 */
function nextId_(prefix, sheetName, idField) {
  const rows = sheetToObjects(sheetName);
  let max = 0;
  rows.forEach(r => {
    const id = String(r[idField] || '');
    const m = id.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  const next = max + 1;
  return prefix + '-' + ('000' + next).slice(-3);
}

/** Simple field validator — throws with a clear message the UI can show. */
function requireFields_(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw new Error('Missing required field(s): ' + missing.join(', '));
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Phnom_Penh', 'yyyy-MM-dd');
}
