/**
 * REPORTS.GS
 * The Dashboard tab is already a live formula sheet (COUNTIF/SUMIFS
 * pulling from Members/Savings/Loans/Repayments/Cashbook/Journal), so
 * this just reads the computed cell values rather than recalculating
 * anything — it can never disagree with what a person sees in Sheets.
 */
function getDashboardSnapshot() {
  const s = sheet_(SHEETS.DASHBOARD);
  const indicators = s.getRange('A4:B13').getValues()
    .filter(r => r[0])
    .map(r => ({ label: r[0], value: r[1] }));
  const actions = s.getRange('D4:H9').getValues()
    .filter(r => r[0] && r[0] !== 'Check')
    .map(r => ({ check: r[0], rule: r[1], current: r[2], target: r[3], action: r[4] }));
  return { indicators: indicators, actions: actions, asOf: new Date().toISOString() };
}

function getMemberStatement(memberId) {
  const member = getMember(memberId);
  if (!member) throw new Error('Member not found: ' + memberId);
  const ledger = sheetToObjects(SHEETS.MEMBER_LEDGER)
    .filter(r => r['Member ID'] === memberId)
    .sort((a, b) => new Date(a['Date']) - new Date(b['Date']));
  const loans = listLoans(memberId);
  return { member: member, ledger: ledger, loans: loans };
}

function getCashbook(limit) {
  const rows = sheetToObjects(SHEETS.CASHBOOK);
  return limit ? rows.slice(-limit) : rows;
}

function getJournal(reference) {
  const rows = sheetToObjects(SHEETS.JOURNAL);
  return reference ? rows.filter(r => r['Reference'] === reference || r['Journal ID'] === reference) : rows;
}

function getPendingApprovals() {
  return {
    savings: sheetToObjects(SHEETS.SAVINGS).filter(r => r['Approval Status'] === 'Pending'),
    loans: sheetToObjects(SHEETS.LOANS).filter(r => r['Approval Status'] === 'Pending'),
    repayments: sheetToObjects(SHEETS.REPAYMENTS).filter(r => r['Approval Status'] === 'Pending'),
    other: sheetToObjects(SHEETS.OTHER_TX).filter(r => r['Approval Status'] === 'Pending')
  };
}

function getUnpostedApproved() {
  const approvedNotPosted = (sheetName) =>
    sheetToObjects(sheetName).filter(r => r['Approval Status'] === 'Approved' && r['Posted?'] !== 'Yes');
  return {
    savings: approvedNotPosted(SHEETS.SAVINGS),
    loans: approvedNotPosted(SHEETS.LOANS),
    repayments: approvedNotPosted(SHEETS.REPAYMENTS),
    other: approvedNotPosted(SHEETS.OTHER_TX)
  };
}

function getPAROverview() {
  const settings = getSettings();
  const threshold = Number(settings['PAR Days Threshold']) || 30;
  return sheetToObjects(SHEETS.LOANS)
    .filter(r => r['Loan Status'] === 'Active' && Number(r['Days Past Due']) > 0)
    .map(r => Object.assign({}, r, { overThreshold: Number(r['Days Past Due']) >= threshold }));
}

/**
 * Returns the verified legacy cash-flow archive copied into the bound workbook.
 * These rows are read-only in the web app and are not posted into current-term ledgers.
 */
function getHistoricalData(kind) {
  const isPetty = String(kind || '').toLowerCase() === 'petty';
  const sheetName = isPetty ? 'Petty Cash' : 'Cash Flow';
  const s = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!s) throw new Error('Historical sheet not found: ' + sheetName);

  const width = isPetty ? 8 : 9;
  const lastRow = s.getLastRow();
  if (lastRow < 8) return { kind: kind, label: sheetName, rows: [], categories: [], summary: { count: 0, totalIn: 0, totalOut: 0, balance: 0 } };

  const range = s.getRange(8, 2, lastRow - 7, width);
  const raw = range.getValues();
  const shown = range.getDisplayValues();
  const categories = {};
  let totalIn = 0;
  let totalOut = 0;
  let endingBalance = 0;

  const rows = raw.reduce((out, row, i) => {
    const category = String(row[1] || '').trim();
    const description = String(row[2] || '').trim();
    if (!(row[0] instanceof Date) || isNaN(row[0].getTime()) || !category || (!description && !row[3] && !row[4])) return out;

    const deposited = Number(row[3] || 0);
    const withdrawn = Number(row[4] || 0);
    totalIn += deposited;
    totalOut += withdrawn;
    categories[category] = (categories[category] || 0) + 1;

    if (!isPetty && row[5] !== '' && row[5] !== null) endingBalance = Number(row[5]) || endingBalance;

    out.push({
      date: shown[i][0] || String(row[0]),
      category: category,
      description: description,
      deposited: deposited,
      withdrawn: withdrawn,
      balance: isPetty ? null : Number(row[5] || 0),
      chargedTo: String(row[isPetty ? 5 : 6] || ''),
      receivedBy: String(row[isPetty ? 6 : 7] || ''),
      approvedBy: String(row[isPetty ? 7 : 8] || '')
    });
    return out;
  }, []);

  if (isPetty) endingBalance = totalIn - totalOut;
  const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  return {
    kind: isPetty ? 'petty' : 'cash',
    label: sheetName,
    sourcePeriod: isPetty ? '01 Jan 2024 – 06 May 2026' : '03 May 2024 – 09 Apr 2026',
    rows: rows,
    categories: Object.keys(categories).sort(),
    categoryCounts: categories,
    summary: {
      count: rows.length,
      totalIn: money(totalIn),
      totalOut: money(totalOut),
      balance: money(endingBalance)
    },
    verified: true,
    note: 'Read-only historical archive; excluded from current-term posting.'
  };
}

