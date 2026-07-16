/**
 * LOANS.GS
 * Columns: Loan ID | Application Date | Disbursement Date | Member ID |
 * Member Name | Principal | Currency | FX to USD | Principal USD |
 * Interest Method | Annual Interest Rate | Frequency | No. Installments |
 * First Due Date | Purpose | Guarantor Member ID | Approval Status |
 * Approved By | Disbursement Account | Posted? | Posted At | Posted By |
 * Principal Repaid USD | Outstanding Principal USD | Interest Paid USD |
 * Next Due Date | Days Past Due | PAR Status | Loan Status | Notes |
 * Meeting ID
 */

function listLoans(memberId) {
  const rows = sheetToObjects(SHEETS.LOANS);
  return memberId ? rows.filter(r => r['Member ID'] === memberId) : rows;
}

function getLoan(loanId) {
  return findByField_(SHEETS.LOANS, 'Loan ID', loanId);
}

function addLoan(data) {
  requireFields_(data, ['Member ID', 'Principal', 'Meeting ID']);
  const settings = getSettings();
  const member = getMember(data['Member ID']);
  if (!member) throw new Error('Unknown Member ID: ' + data['Member ID']);

  const id = nextId_(settings['Loan Prefix'] || 'LN', SHEETS.LOANS, 'Loan ID');
  const fx = data['FX to USD'] || 1;
  const principalUsd = round2_(Number(data['Principal']) / fx);

  const record = Object.assign({
    'Interest Method': settings['Default Interest Method'] || 'Declining',
    'Annual Interest Rate': settings['Default Annual Interest Rate'] || 0.18,
    'Frequency': settings['Default Repayment Frequency'] || 'Monthly',
    'Application Date': todayStr_(),
    'Approval Status': 'Pending',
    'Posted?': 'No',
    'Principal Repaid USD': 0,
    'Outstanding Principal USD': principalUsd,
    'Interest Paid USD': 0,
    'Loan Status': 'Pending'
  }, data, {
    'Loan ID': id,
    'Member Name': member['Name English'],
    'FX to USD': fx,
    'Principal USD': principalUsd
  });

  appendObject_(SHEETS.LOANS, record);
  logAction('Create', 'Loan', id, member['Name English'] + ' principal ' + principalUsd + ' USD');
  return id;
}

/** README step 3-4: credit committee terms recorded, chairperson approves. */
function approveLoan(loanId, approverName) {
  const loan = getLoan(loanId);
  if (!loan) throw new Error('Loan not found: ' + loanId);
  updateRow_(SHEETS.LOANS, loan._row, {
    'Approval Status': 'Approved',
    'Approved By': approverName || currentUser(),
    'Disbursement Date': todayStr_(),
    'Loan Status': 'Active'
  });
  logAction('Approve', 'Loan', loanId, 'by ' + (approverName || currentUser()));
  return true;
}

function rejectLoan(loanId, reason) {
  const loan = getLoan(loanId);
  if (!loan) throw new Error('Loan not found: ' + loanId);
  updateRow_(SHEETS.LOANS, loan._row, { 'Approval Status': 'Rejected', 'Loan Status': 'Rejected' });
  logAction('Reject', 'Loan', loanId, reason || '');
  return true;
}

/**
 * README step 6. Builds the Loan_Schedule rows for one loan.
 * Supports the two methods named in Settings: Flat (interest charged
 * on the ORIGINAL principal every period) and Declining (interest on
 * the remaining balance, standard amortization).
 * Requires No. Installments and First Due Date to be filled on the
 * loan row — for open-ended revolving loans (no fixed installments,
 * common in this group's flat monthly-interest style) skip this and
 * post interest directly through Repayments instead.
 */
function generateLoanSchedule(loanId) {
  const loan = getLoan(loanId);
  if (!loan) throw new Error('Loan not found: ' + loanId);
  const n = Number(loan['No. Installments']);
  const firstDue = loan['First Due Date'];
  if (!n || !firstDue) {
    throw new Error('Loan needs "No. Installments" and "First Due Date" set before generating a schedule.');
  }

  const principal = Number(loan['Principal USD']);
  const annualRate = Number(loan['Annual Interest Rate']) || 0;
  const periodRate = periodRateFor_(loan['Frequency'], annualRate);
  const method = loan['Interest Method'] || 'Declining';

  // Clear any previous schedule rows for this loan first.
  clearLoanSchedule_(loanId);

  let balance = principal;
  const straightPrincipal = round2_(principal / n);
  let dueDate = new Date(firstDue);

  for (let i = 1; i <= n; i++) {
    let schedPrincipal, schedInterest;
    if (method === 'Flat') {
      schedInterest = round2_(principal * periodRate);
      schedPrincipal = (i === n) ? round2_(balance) : straightPrincipal;
    } else { // Declining
      schedInterest = round2_(balance * periodRate);
      schedPrincipal = (i === n) ? round2_(balance) : straightPrincipal;
    }
    const opening = round2_(balance);
    balance = round2_(balance - schedPrincipal);

    appendObject_(SHEETS.LOAN_SCHEDULE, {
      'Loan ID': loanId,
      'Member ID': loan['Member ID'],
      'Installment No.': i,
      'Due Date': Utilities.formatDate(dueDate, Session.getScriptTimeZone() || 'Asia/Phnom_Penh', 'yyyy-MM-dd'),
      'Opening Principal USD': opening,
      'Scheduled Principal USD': schedPrincipal,
      'Scheduled Interest USD': schedInterest,
      'Scheduled Total USD': round2_(schedPrincipal + schedInterest),
      'Closing Principal USD': balance,
      'Principal Paid USD': 0,
      'Total Paid USD': 0,
      'Payment Status': 'Due',
      'Days Late': 0
    });

    dueDate = advanceDate_(dueDate, loan['Frequency']);
  }

  updateRow_(SHEETS.LOANS, loan._row, { 'Next Due Date': firstDue });
  logAction('GenerateSchedule', 'Loan', loanId, n + ' installments, ' + method);
  return n;
}

function periodRateFor_(frequency, annualRate) {
  switch (frequency) {
    case 'Weekly': return annualRate / 52;
    case 'Biweekly': return annualRate / 26;
    case 'Monthly':
    default: return annualRate / 12;
  }
}

function advanceDate_(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'Weekly': d.setDate(d.getDate() + 7); break;
    case 'Biweekly': d.setDate(d.getDate() + 14); break;
    case 'Monthly':
    default: d.setMonth(d.getMonth() + 1); break;
  }
  return d;
}

function clearLoanSchedule_(loanId) {
  const s = sheet_(SHEETS.LOAN_SCHEDULE);
  const rows = sheetToObjects(SHEETS.LOAN_SCHEDULE).filter(r => r['Loan ID'] === loanId);
  // Delete bottom-up so row numbers stay valid.
  rows.sort((a, b) => b._row - a._row).forEach(r => s.deleteRow(r._row));
}

function getLoanSchedule(loanId) {
  return sheetToObjects(SHEETS.LOAN_SCHEDULE)
    .filter(r => r['Loan ID'] === loanId)
    .sort((a, b) => a['Installment No.'] - b['Installment No.']);
}
