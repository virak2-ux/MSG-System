/**
 * POSTING.GS
 * README posting rule: "Only Approved rows post. Posted rows must not
 * be edited; corrections use a new reversing/adjusting transaction."
 *
 * These functions are the ONLY place that writes to Journal, Cashbook,
 * and Member_Ledger. Never edit those three sheets by hand — post a
 * reversing entry instead (see reverseJournalEntry below) so the audit
 * trail stays intact.
 */

// ---------- low-level double-entry writers ----------

function nextJournalId_() {
  const settings = getSettings();
  const rows = sheetToObjects(SHEETS.JOURNAL);
  let max = 0;
  rows.forEach(r => {
    const m = String(r['Journal ID'] || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return (settings['Journal Prefix'] || 'JE') + '-' + ('000' + (max + 1)).slice(-3);
}

/** lines: [{account:'1000', debit:0, credit:0, description:''}, ...] must balance. */
function postJournalEntry_(source, reference, memberId, loanId, meetingId, lines) {
  const totalDebit = round2_(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = round2_(lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error('Journal entry does not balance: debit ' + totalDebit + ' vs credit ' + totalCredit);
  }
  const accounts = getAccounts();
  const jid = nextJournalId_();
  const now = new Date();
  const user = currentUser();
  let lineNo = 1;
  lines.forEach(line => {
    if (!line.debit && !line.credit) return;
    const acct = accounts[String(line.account)];
    appendObject_(SHEETS.JOURNAL, {
      'Journal ID': jid,
      'Date': todayStr_(),
      'Source': source,
      'Reference': reference,
      'Line No.': lineNo++,
      'Account Code': line.account,
      'Account Name': acct ? acct['ACCOUNT NAME'] : '',
      'Debit USD': round2_(line.debit || 0),
      'Credit USD': round2_(line.credit || 0),
      'Member ID': memberId || '',
      'Loan ID': loanId || '',
      'Meeting ID': meetingId || '',
      'Description': line.description || '',
      'Posted By': user,
      'Posted At': now
    });
  });
  return jid;
}

function postCashbookEntry_(source, reference, meetingId, memberId, loanId, account, description, cashIn, cashOut) {
  const rows = sheetToObjects(SHEETS.CASHBOOK);
  const lastBalance = rows.length ? (Number(rows[rows.length - 1]['Running Balance USD']) || 0) : 0;
  const net = round2_((cashIn || 0) - (cashOut || 0));
  const newBalance = round2_(lastBalance + net);
  const id = 'CB-' + ('00000' + (rows.length + 1)).slice(-5);
  appendObject_(SHEETS.CASHBOOK, {
    'Entry ID': id,
    'Date': todayStr_(),
    'Source': source,
    'Reference': reference,
    'Meeting ID': meetingId || '',
    'Member ID': memberId || '',
    'Loan ID': loanId || '',
    'Payment Account': account || '',
    'Description': description || '',
    'Cash In USD': round2_(cashIn || 0),
    'Cash Out USD': round2_(cashOut || 0),
    'Net Movement USD': net,
    'Running Balance USD': newBalance,
    'Posted By': currentUser(),
    'Posted At': new Date()
  });
  return id;
}

function postMemberLedgerEntry_(memberId, source, reference, description, deltas) {
  const member = getMember(memberId);
  const rows = sheetToObjects(SHEETS.MEMBER_LEDGER).filter(r => r['Member ID'] === memberId);
  let savingsBal, loanBal;
  if (rows.length) {
    const last = rows[rows.length - 1];
    savingsBal = Number(last['Savings Balance USD']) || 0;
    loanBal = Number(last['Loan Balance USD']) || 0;
  } else {
    savingsBal = member ? (Number(member['Opening Savings USD']) || 0) : 0;
    loanBal = member ? (Number(member['Opening Loan USD']) || 0) : 0;
  }
  savingsBal = round2_(savingsBal + (deltas.savingsIn || 0) - (deltas.savingsOut || 0));
  loanBal = round2_(loanBal + (deltas.loanDisbursed || 0) - (deltas.principalRepaid || 0));

  appendObject_(SHEETS.MEMBER_LEDGER, {
    'Date': todayStr_(),
    'Member ID': memberId,
    'Member Name': member ? member['Name English'] : '',
    'Source': source,
    'Reference': reference,
    'Description': description || '',
    'Savings In USD': round2_(deltas.savingsIn || 0),
    'Savings Out USD': round2_(deltas.savingsOut || 0),
    'Loan Disbursed USD': round2_(deltas.loanDisbursed || 0),
    'Principal Repaid USD': round2_(deltas.principalRepaid || 0),
    'Interest Paid USD': round2_(deltas.interestPaid || 0),
    'Penalty Paid USD': round2_(deltas.penaltyPaid || 0),
    'Savings Balance USD': savingsBal,
    'Loan Balance USD': loanBal
  });
}

// ---------- batch posting, one per transaction class ----------

function postApprovedSavings() {
  const settings = getSettings();
  const cash = settings['Cash Account'];
  const liability = settings['Member Savings Liability Account'];
  let count = 0;
  sheetToObjects(SHEETS.SAVINGS)
    .filter(r => r['Approval Status'] === 'Approved' && r['Posted?'] !== 'Yes')
    .forEach(r => {
      const amt = Number(r['Signed Amount USD']) || 0;
      const desc = r['Member Name'] + ' ' + r['Savings Type'] + ' (' + r['Transaction ID'] + ')';
      if (amt >= 0) {
        postJournalEntry_('Savings', r['Transaction ID'], r['Member ID'], '', r['Meeting ID'], [
          { account: cash, debit: amt, description: desc },
          { account: liability, credit: amt, description: desc }
        ]);
        postCashbookEntry_('Savings', r['Transaction ID'], r['Meeting ID'], r['Member ID'], '', r['Payment Account'], desc, amt, 0);
        postMemberLedgerEntry_(r['Member ID'], 'Savings', r['Transaction ID'], desc, { savingsIn: amt });
      } else {
        const out = -amt;
        postJournalEntry_('Savings', r['Transaction ID'], r['Member ID'], '', r['Meeting ID'], [
          { account: liability, debit: out, description: desc },
          { account: cash, credit: out, description: desc }
        ]);
        postCashbookEntry_('Savings', r['Transaction ID'], r['Meeting ID'], r['Member ID'], '', r['Payment Account'], desc, 0, out);
        postMemberLedgerEntry_(r['Member ID'], 'Savings', r['Transaction ID'], desc, { savingsOut: out });
      }
      updateRow_(SHEETS.SAVINGS, r._row, { 'Posted?': 'Yes', 'Posted At': new Date(), 'Posted By': currentUser() });
      count++;
    });
  if (count) logAction('Post', 'Savings', 'batch', count + ' transaction(s) posted');
  return count;
}

function postApprovedLoans() {
  const settings = getSettings();
  const cash = settings['Cash Account'];
  const receivable = settings['Loans Receivable Account'];
  let count = 0;
  sheetToObjects(SHEETS.LOANS)
    .filter(r => r['Approval Status'] === 'Approved' && r['Posted?'] !== 'Yes')
    .forEach(r => {
      const principal = Number(r['Principal USD']) || 0;
      const desc = 'Loan disbursement ' + r['Member Name'] + ' (' + r['Loan ID'] + ')';
      postJournalEntry_('Loan Disbursement', r['Loan ID'], r['Member ID'], r['Loan ID'], r['Meeting ID'], [
        { account: receivable, debit: principal, description: desc },
        { account: cash, credit: principal, description: desc }
      ]);
      postCashbookEntry_('Loan Disbursement', r['Loan ID'], r['Meeting ID'], r['Member ID'], r['Loan ID'], r['Disbursement Account'], desc, 0, principal);
      postMemberLedgerEntry_(r['Member ID'], 'Loan Disbursement', r['Loan ID'], desc, { loanDisbursed: principal });
      updateRow_(SHEETS.LOANS, r._row, { 'Posted?': 'Yes', 'Posted At': new Date(), 'Posted By': currentUser() });
      count++;
    });
  if (count) logAction('Post', 'Loans', 'batch', count + ' disbursement(s) posted');
  return count;
}

function postApprovedRepayments() {
  const settings = getSettings();
  const cash = settings['Cash Account'];
  const receivable = settings['Loans Receivable Account'];
  const interestInc = settings['Interest Income Account'];
  const penaltyInc = settings['Penalty Income Account'];
  let count = 0;

  sheetToObjects(SHEETS.REPAYMENTS)
    .filter(r => r['Approval Status'] === 'Approved' && r['Posted?'] !== 'Yes')
    .forEach(r => {
      const principal = Number(r['Principal Paid USD']) || 0;
      const interest = Number(r['Interest Paid USD']) || 0;
      const penalty = Number(r['Penalty Paid USD']) || 0;
      const total = round2_(principal + interest + penalty);
      const desc = 'Repayment loan ' + r['Loan ID'] + ' (' + r['Transaction ID'] + ')';

      const lines = [{ account: cash, debit: total, description: desc }];
      if (principal) lines.push({ account: receivable, credit: principal, description: desc + ' principal' });
      if (interest) lines.push({ account: interestInc, credit: interest, description: desc + ' interest' });
      if (penalty) lines.push({ account: penaltyInc, credit: penalty, description: desc + ' penalty' });
      postJournalEntry_('Repayment', r['Transaction ID'], r['Member ID'], r['Loan ID'], r['Meeting ID'], lines);

      postCashbookEntry_('Repayment', r['Transaction ID'], r['Meeting ID'], r['Member ID'], r['Loan ID'], r['Payment Account'], desc, total, 0);
      postMemberLedgerEntry_(r['Member ID'], 'Repayment', r['Transaction ID'], desc, {
        principalRepaid: principal, interestPaid: interest, penaltyPaid: penalty
      });

      // Roll the loan balance forward.
      const loan = getLoan(r['Loan ID']);
      if (loan) {
        const newOutstanding = round2_((Number(loan['Outstanding Principal USD']) || 0) - principal);
        updateRow_(SHEETS.LOANS, loan._row, {
          'Principal Repaid USD': round2_((Number(loan['Principal Repaid USD']) || 0) + principal),
          'Outstanding Principal USD': newOutstanding,
          'Interest Paid USD': round2_((Number(loan['Interest Paid USD']) || 0) + interest),
          'Loan Status': newOutstanding <= 0.01 ? 'Closed' : loan['Loan Status']
        });
      }

      updateRow_(SHEETS.REPAYMENTS, r._row, { 'Posted?': 'Yes', 'Posted At': new Date(), 'Posted By': currentUser() });
      count++;
    });
  if (count) logAction('Post', 'Repayments', 'batch', count + ' repayment(s) posted');
  return count;
}

function postApprovedOther() {
  const settings = getSettings();
  const cash = settings['Cash Account'];
  const otherInc = settings['Other Income Account'];
  const expense = settings['Operating Expense Account'];
  let count = 0;

  sheetToObjects(SHEETS.OTHER_TX)
    .filter(r => r['Approval Status'] === 'Approved' && r['Posted?'] !== 'Yes')
    .forEach(r => {
      const amt = Number(r['Signed Amount USD']) || 0;
      const desc = r['Category'] + ': ' + (r['Description'] || '') + ' (' + r['Transaction ID'] + ')';
      if (amt >= 0) {
        postJournalEntry_('Other', r['Transaction ID'], '', '', r['Meeting ID'], [
          { account: cash, debit: amt, description: desc },
          { account: otherInc, credit: amt, description: desc }
        ]);
        postCashbookEntry_('Other', r['Transaction ID'], r['Meeting ID'], '', '', r['Payment Account'], desc, amt, 0);
      } else {
        const out = -amt;
        postJournalEntry_('Other', r['Transaction ID'], '', '', r['Meeting ID'], [
          { account: expense, debit: out, description: desc },
          { account: cash, credit: out, description: desc }
        ]);
        postCashbookEntry_('Other', r['Transaction ID'], r['Meeting ID'], '', '', r['Payment Account'], desc, 0, out);
      }
      updateRow_(SHEETS.OTHER_TX, r._row, { 'Posted?': 'Yes', 'Posted At': new Date(), 'Posted By': currentUser() });
      count++;
    });
  if (count) logAction('Post', 'OtherTransactions', 'batch', count + ' transaction(s) posted');
  return count;
}

/**
 * README step 5: "Treasurer uses the Savings Group menu to post each
 * transaction class." This runs all four under one lock so two people
 * clicking Post at the same moment can't double-post a row.
 */
function postAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another posting run is in progress — try again shortly.');
  try {
    return {
      savings: postApprovedSavings(),
      loans: postApprovedLoans(),
      repayments: postApprovedRepayments(),
      other: postApprovedOther()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Corrections per README: never edit a posted row. This posts an
 * equal-and-opposite journal entry (and mirrors it to Cashbook) so the
 * audit trail shows both the error and the fix.
 */
function reverseJournalEntry(journalId, reason) {
  const lines = sheetToObjects(SHEETS.JOURNAL).filter(r => r['Journal ID'] === journalId);
  if (!lines.length) throw new Error('Journal ID not found: ' + journalId);
  const reversed = lines.map(l => ({
    account: l['Account Code'],
    debit: l['Credit USD'],
    credit: l['Debit USD'],
    description: 'Reversal of ' + journalId + ': ' + (reason || '')
  }));
  const newId = postJournalEntry_('Reversal', journalId, lines[0]['Member ID'], lines[0]['Loan ID'], lines[0]['Meeting ID'], reversed);
  logAction('Reverse', 'Journal', journalId, 'Reversed by ' + newId + ' — ' + (reason || ''));
  return newId;
}
