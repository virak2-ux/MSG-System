/**
 * SAVINGS.GS
 * Columns: Transaction ID | Date | Meeting ID | Member ID | Member Name |
 * Savings Type | Amount | Currency | FX to USD | Signed Amount USD |
 * Payment Account | Receipt No. | Approval Status | Approved By |
 * Approval Date | Posted? | Posted At | Posted By | Notes
 *
 * Savings are a liability owed to the member (README), so a deposit is
 * a positive Signed Amount USD and a withdrawal is negative — the sign
 * is decided here, not left to manual entry, to prevent errors.
 */

function listSavings(meetingId) {
  const rows = sheetToObjects(SHEETS.SAVINGS);
  return meetingId ? rows.filter(r => r['Meeting ID'] === meetingId) : rows;
}

function addSaving(data) {
  requireFields_(data, ['Meeting ID', 'Member ID', 'Amount', 'Savings Type']);
  const settings = getSettings();
  const member = getMember(data['Member ID']);
  if (!member) throw new Error('Unknown Member ID: ' + data['Member ID']);

  const id = nextId_(settings['Savings Prefix'] || 'SAV', SHEETS.SAVINGS, 'Transaction ID');
  const fx = data['FX to USD'] || 1;
  const currency = data['Currency'] || settings['Base Currency'] || 'USD';
  const amountUsd = round2_(Number(data['Amount']) / fx);
  const signed = data['Savings Type'] === 'Withdrawal' ? -Math.abs(amountUsd) : Math.abs(amountUsd);

  const record = Object.assign({}, data, {
    'Transaction ID': id,
    'Date': data['Date'] || todayStr_(),
    'Member Name': member['Name English'],
    'Currency': currency,
    'FX to USD': fx,
    'Signed Amount USD': signed,
    'Approval Status': 'Pending',
    'Posted?': 'No'
  });
  appendObject_(SHEETS.SAVINGS, record);
  logAction('Create', 'Savings', id, member['Name English'] + ' ' + signed + ' USD');
  return id;
}

function approveSaving(transactionId, approverName) {
  const row = findByField_(SHEETS.SAVINGS, 'Transaction ID', transactionId);
  if (!row) throw new Error('Savings transaction not found: ' + transactionId);
  updateRow_(SHEETS.SAVINGS, row._row, {
    'Approval Status': 'Approved',
    'Approved By': approverName || currentUser(),
    'Approval Date': todayStr_()
  });
  logAction('Approve', 'Savings', transactionId, 'by ' + (approverName || currentUser()));
  return true;
}

function rejectSaving(transactionId, reason) {
  const row = findByField_(SHEETS.SAVINGS, 'Transaction ID', transactionId);
  if (!row) throw new Error('Savings transaction not found: ' + transactionId);
  updateRow_(SHEETS.SAVINGS, row._row, {
    'Approval Status': 'Rejected',
    'Notes': ((row['Notes'] || '') + ' | Rejected: ' + (reason || '')).trim()
  });
  logAction('Reject', 'Savings', transactionId, reason || '');
  return true;
}
