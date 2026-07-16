/**
 * CODE.GS
 * Web app entry point + the in-Sheet "Savings Group" menu.
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app.
 *   Execute as: Me | Who has access: Anyone in your organization
 *   (or "Anyone" only if you accept that risk — see SETUP.md).
 */

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'app';
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Mekong Saving Group — System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Lets Index.html pull in Stylesheet.html and JavaScript.html via <?!= include('X'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Savings Group')
    .addItem('Open Web App Sidebar', 'showSidebar')
    .addSeparator()
    .addItem('Post Approved Savings', 'menuPostSavings_')
    .addItem('Post Approved Loans', 'menuPostLoans_')
    .addItem('Post Approved Repayments', 'menuPostRepayments_')
    .addItem('Post Approved Other Transactions', 'menuPostOther_')
    .addItem('Post Everything Approved', 'menuPostAll_')
    .addSeparator()
    .addItem('Refresh Dashboard (recalculate)', 'menuRefreshDashboard_')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Savings Group').setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function menuAlert_(title, count) {
  SpreadsheetApp.getUi().alert(title + ': ' + count + ' row(s) posted.');
}
function menuPostSavings_() { menuAlert_('Savings posted', postApprovedSavings()); }
function menuPostLoans_() { menuAlert_('Loan disbursements posted', postApprovedLoans()); }
function menuPostRepayments_() { menuAlert_('Repayments posted', postApprovedRepayments()); }
function menuPostOther_() { menuAlert_('Other transactions posted', postApprovedOther()); }
function menuPostAll_() {
  const r = postAll();
  SpreadsheetApp.getUi().alert(
    'Posted — Savings: ' + r.savings + ', Loans: ' + r.loans +
    ', Repayments: ' + r.repayments + ', Other: ' + r.other
  );
}
function menuRefreshDashboard_() {
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Dashboard formulas recalculated.');
}
