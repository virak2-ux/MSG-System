/**
 * CONFIG.GS
 * Central place for sheet-tab names (must match the workbook exactly)
 * and Settings lookups. Nothing here should need editing when you
 * add data — only if you rename a tab.
 */

const SHEETS = {
  DASHBOARD: 'Dashboard',
  MEETINGS: 'Meetings',
  MEMBERS: 'Members',
  SAVINGS: 'Savings',
  LOANS: 'Loans',
  REPAYMENTS: 'Repayments',
  CASHBOOK: 'Cashbook',
  SETTINGS: 'Settings',
  LOAN_SCHEDULE: 'Loan_Schedule',
  OTHER_TX: 'Other_Transactions',
  MEMBER_LEDGER: 'Member_Ledger',
  CHART_OF_ACCOUNTS: 'Chart_of_Accounts',
  JOURNAL: 'Journal',
  AUDIT_LOG: 'Audit_Log',
  README: 'README'
};

/**
 * Reads the Settings sheet (SETTING | VALUE | DESCRIPTION) into a
 * plain object keyed by the SETTING label, e.g. settings()['Cash Account'].
 * Cached for the duration of one script execution.
 */
function getSettings() {
  if (getSettings._cache) return getSettings._cache;
  const rows = sheetToObjects(SHEETS.SETTINGS);
  const map = {};
  rows.forEach(r => { map[r['SETTING']] = r['VALUE']; });
  getSettings._cache = map;
  return map;
}

/** Chart of Accounts as { 'Cash on Hand': '1000', ... } and by code. */
function getAccounts() {
  const rows = sheetToObjects(SHEETS.CHART_OF_ACCOUNTS);
  const byCode = {};
  rows.forEach(r => { byCode[String(r['ACCOUNT CODE'])] = r; });
  return byCode;
}

/** Current effective user, falls back to 'system' when run as a trigger. */
function currentUser() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || 'system';
  } catch (e) {
    return 'system';
  }
}
