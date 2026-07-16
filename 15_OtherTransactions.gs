/**
 * OTHER_TRANSACTIONS.GS
 * Columns: Transaction ID | Date | Meeting ID | Type | Category |
 * Description | Amount | Currency | Signed Amount USD | Payment Account |
 * Counterparty | Receipt / Voucher No. | Approval Status | Approved By |
 * Posted? | Posted At | Posted By | Notes
 *
 * Use for things like the room fee, bank cheque fee, attendance
 * penalties, and print-contract costs shown in the meeting slides —
 * anything that isn't a member's own savings or loan line.
 * Type = 'Income' or 'Expense' decides the sign.
 */

function listOtherTransactions(meetingId) {
  const rows = sheetToObjects(SHEETS.OTHER_TX);
  return meetingId ? rows.filter(r => r['Meeting ID'] === meetingId) : rows;
}

function addOtherTransaction(data) {
  requireFields_(data, ['Meeting ID', 'Type', 'Category', 'Amount']);
  const settings = getSettings();
  const id = nextId_(settings['Other Transaction Prefix'] || 'OTH', SHEETS.OTHER_TX, 'Transaction ID');
  const amount = Math.abs(Number(data['Amount']));
  const signed = data['Type'] === 'Expense' ? -amount : amount;

  const record = Object.assign({}, data, {
    'Transaction ID': id,
    'Date': data['Date'] || todayStr_(),
    'Currency': data['Currency'] || settings['Base Currency'] || 'USD',
    'Signed Amount USD': round2_(signed),
    'Approval Status': 'Pending',
    'Posted?': 'No'
  });
  appendObject_(SHEETS.OTHER_TX, record);
  logAction('Create', 'OtherTransaction', id, data['Category'] + ' ' + signed + ' USD');
  return id;
}

function approveOtherTransaction(transactionId, approverName) {
  const row = findByField_(SHEETS.OTHER_TX, 'Transaction ID', transactionId);
  if (!row) throw new Error('Transaction not found: ' + transactionId);
  updateRow_(SHEETS.OTHER_TX, row._row, {
    'Approval Status': 'Approved',
    'Approved By': approverName || currentUser()
  });
  logAction('Approve', 'OtherTransaction', transactionId, 'by ' + (approverName || currentUser()));
  return true;
}
