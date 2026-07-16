/**
 * MEETINGS.GS
 * Columns: Meeting ID | Meeting Date | Meeting Type | Location | Status |
 * Members Present | Members Absent | Savings Collected USD | Principal
 * Collected USD | Interest Collected USD | Penalties Collected USD |
 * Other / Loan Net Cash USD | Expected Cash Movement USD | Actual Cash
 * Count USD | Cash Variance USD | Minutes Link | Chairperson Approval |
 * Closed By | Closed At | Notes
 *
 * Workflow (README steps 1,7,8,9):
 *  1. openMeeting()            -> creates the row, Status = Open
 *  2. recomputeMeetingTotals() -> call any time during the meeting to
 *                                 pull live totals from Approved
 *                                 Savings/Repayments/Loans/Other_Transactions
 *  3. closeMeeting()           -> records the physical cash count,
 *                                 computes variance, sets Status.
 */

function listMeetings() {
  return sheetToObjects(SHEETS.MEETINGS).sort((a, b) => new Date(b['Meeting Date']) - new Date(a['Meeting Date']));
}

function getMeeting(meetingId) {
  return findByField_(SHEETS.MEETINGS, 'Meeting ID', meetingId);
}

function openMeeting(data) {
  requireFields_(data, ['Meeting Date']);
  const settings = getSettings();
  const id = nextId_(settings['Meeting Prefix'] || 'MTG', SHEETS.MEETINGS, 'Meeting ID');
  const record = Object.assign({
    'Meeting Type': 'Regular',
    'Status': 'Open',
    'Members Present': 0,
    'Members Absent': 0
  }, data, { 'Meeting ID': id });
  appendObject_(SHEETS.MEETINGS, record);
  logAction('Create', 'Meeting', id, 'Opened meeting ' + record['Meeting Date']);
  return id;
}

/**
 * Sums Approved rows (regardless of Posted? state) linked to this
 * Meeting ID and writes the four collection columns + Expected Cash
 * Movement. Mirrors exactly what the Dashboard formulas already
 * assume, so recomputing here never fights the sheet's own formulas.
 */
function recomputeMeetingTotals(meetingId) {
  const m = getMeeting(meetingId);
  if (!m) throw new Error('Meeting not found: ' + meetingId);

  const sumApproved = (sheetName, meetingField, amountField) =>
    sheetToObjects(sheetName)
      .filter(r => r[meetingField] === meetingId && r['Approval Status'] === 'Approved')
      .reduce((s, r) => s + (Number(r[amountField]) || 0), 0);

  const savingsCollected = sumApproved(SHEETS.SAVINGS, 'Meeting ID', 'Signed Amount USD');
  const principalCollected = sumApproved(SHEETS.REPAYMENTS, 'Meeting ID', 'Principal Paid USD');
  const interestCollected = sumApproved(SHEETS.REPAYMENTS, 'Meeting ID', 'Interest Paid USD');
  const penaltiesCollected = sumApproved(SHEETS.REPAYMENTS, 'Meeting ID', 'Penalty Paid USD');

  const loanDisbursements = sheetToObjects(SHEETS.LOANS)
    .filter(r => r['Meeting ID'] === meetingId && r['Approval Status'] === 'Approved')
    .reduce((s, r) => s - (Number(r['Principal USD']) || 0), 0); // cash OUT, so negative

  const otherNet = sumApproved(SHEETS.OTHER_TX, 'Meeting ID', 'Signed Amount USD');
  const otherLoanNetCash = round2_(loanDisbursements + otherNet);

  const expectedCashMovement = round2_(
    savingsCollected + principalCollected + interestCollected + penaltiesCollected + otherLoanNetCash
  );

  updateRow_(SHEETS.MEETINGS, m._row, {
    'Savings Collected USD': round2_(savingsCollected),
    'Principal Collected USD': round2_(principalCollected),
    'Interest Collected USD': round2_(interestCollected),
    'Penalties Collected USD': round2_(penaltiesCollected),
    'Other / Loan Net Cash USD': otherLoanNetCash,
    'Expected Cash Movement USD': expectedCashMovement
  });

  logAction('Recompute', 'Meeting', meetingId, 'Expected cash movement ' + expectedCashMovement);
  return expectedCashMovement;
}

/**
 * README step 7-8: count physical cash, compare to expected, and
 * README step 4/10: chairperson approves. Two-person verification is
 * a physical-world control this app can't enforce — it only records
 * who clicked Close.
 */
function closeMeeting(meetingId, actualCashCount, membersPresent, membersAbsent, notes) {
  const expected = recomputeMeetingTotals(meetingId);
  const m = getMeeting(meetingId);
  const variance = round2_(Number(actualCashCount) - expected);

  updateRow_(SHEETS.MEETINGS, m._row, {
    'Actual Cash Count USD': round2_(actualCashCount),
    'Cash Variance USD': variance,
    'Members Present': membersPresent !== undefined ? membersPresent : m['Members Present'],
    'Members Absent': membersAbsent !== undefined ? membersAbsent : m['Members Absent'],
    'Status': variance === 0 ? 'Approved' : 'Variance - Review',
    'Notes': notes || m['Notes'],
    'Closed By': currentUser(),
    'Closed At': new Date()
  });

  logAction('Close', 'Meeting', meetingId, 'Variance ' + variance);
  return { expected: expected, actual: Number(actualCashCount), variance: variance };
}

function approveMeeting(meetingId) {
  const m = getMeeting(meetingId);
  if (!m) throw new Error('Meeting not found: ' + meetingId);
  updateRow_(SHEETS.MEETINGS, m._row, { 'Chairperson Approval': 'Approved', 'Status': 'Approved' });
  logAction('Approve', 'Meeting', meetingId, 'Chairperson approved');
  return true;
}
