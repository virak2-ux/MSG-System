/**
 * MEMBERS.GS
 * Columns: Member ID | Join Date | Name Khmer | Name English | Gender |
 * Date of Birth | National ID | Phone | Village | Commune/Sangkat |
 * District/Khan | Province | Group Role | Status | Saving Target USD |
 * Opening Savings USD | Opening Loan USD | Nominee / Family Contact |
 * Exit Date | Notes
 */

function listMembers(activeOnly) {
  const rows = sheetToObjects(SHEETS.MEMBERS);
  return activeOnly ? rows.filter(r => r['Status'] === 'Active') : rows;
}

function getMember(memberId) {
  return findByField_(SHEETS.MEMBERS, 'Member ID', memberId);
}

function addMember(data) {
  requireFields_(data, ['Name English']);
  const settings = getSettings();
  const id = nextId_(settings['Member Prefix'] || 'MEM', SHEETS.MEMBERS, 'Member ID');
  const record = Object.assign({
    'Join Date': todayStr_(),
    'Status': 'Active',
    'Opening Savings USD': 0,
    'Opening Loan USD': 0
  }, data, { 'Member ID': id });
  appendObject_(SHEETS.MEMBERS, record);
  logAction('Create', 'Member', id, 'Added ' + record['Name English']);
  return id;
}

function updateMember(memberId, patch) {
  const m = getMember(memberId);
  if (!m) throw new Error('Member not found: ' + memberId);
  updateRow_(SHEETS.MEMBERS, m._row, patch);
  logAction('Update', 'Member', memberId, JSON.stringify(patch));
  return true;
}

function setMemberStatus(memberId, status, exitDate) {
  const patch = { 'Status': status };
  if (status === 'Exited' || status === 'Inactive') {
    patch['Exit Date'] = exitDate || todayStr_();
  }
  return updateMember(memberId, patch);
}
