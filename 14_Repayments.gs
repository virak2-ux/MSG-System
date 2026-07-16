/**
 * REPAYMENTS.GS
 * Columns: Transaction ID | Date | Meeting ID | Loan ID | Member ID |
 * Installment No. | Principal Paid USD | Interest Paid USD | Penalty
 * Paid USD | Total Paid USD | Currency | FX to USD | Payment Account |
 * Receipt No. | Approval Status | Approved By | Posted? | Posted At |
 * Posted By | Notes
 */

function listRepayments(loanId) {
  const rows = sheetToObjects(SHEETS.REPAYMENTS);
  return loanId ? rows.filter(r => r['Loan ID'] === loanId) : rows;
}

function addRepayment(data) {
  requireFields_(data, ['Meeting ID', 'Loan ID', 'Member ID']);
  const settings = getSettings();
  const loan = getLoan(data['Loan ID']);
  if (!loan) throw new Error('Unknown Loan ID: ' + data['Loan ID']);

  const id = nextId_(settings['Repayment Prefix'] || 'REP', SHEETS.REPAYMENTS, 'Transaction ID');
  const principal = round2_(data['Principal Paid USD'] || 0);
  const interest = round2_(data['Interest Paid USD'] || 0);
  const penalty = round2_(data['Penalty Paid USD'] || 0);

  const record = Object.assign({}, data, {
    'Transaction ID': id,
    'Date': data['Date'] || todayStr_(),
    'Currency': data['Currency'] || settings['Base Currency'] || 'USD',
    'FX to USD': data['FX to USD'] || 1,
    'Principal Paid USD': principal,
    'Interest Paid USD': interest,
    'Penalty Paid USD': penalty,
    'Total Paid USD': round2_(principal + interest + penalty),
    'Approval Status': 'Pending',
    'Posted?': 'No'
  });
  appendObject_(SHEETS.REPAYMENTS, record);
  logAction('Create', 'Repayment', id, 'Loan ' + data['Loan ID'] + ' total ' + record['Total Paid USD']);
  return id;
}

function approveRepayment(transactionId, approverName) {
  const row = findByField_(SHEETS.REPAYMENTS, 'Transaction ID', transactionId);
  if (!row) throw new Error('Repayment not found: ' + transactionId);
  updateRow_(SHEETS.REPAYMENTS, row._row, {
    'Approval Status': 'Approved',
    'Approved By': approverName || currentUser()
  });
  logAction('Approve', 'Repayment', transactionId, 'by ' + (approverName || currentUser()));
  return true;
}

function rejectRepayment(transactionId, reason) {
  const row = findByField_(SHEETS.REPAYMENTS, 'Transaction ID', transactionId);
  if (!row) throw new Error('Repayment not found: ' + transactionId);
  updateRow_(SHEETS.REPAYMENTS, row._row, { 'Approval Status': 'Rejected' });
  logAction('Reject', 'Repayment', transactionId, reason || '');
  return true;
}
