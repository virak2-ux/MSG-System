/**
 * AUDIT_LOG.GS
 * Every write action anywhere in the app calls logAction() so
 * Audit_Log gives a full trail: who did what, to which record, when.
 * Matches columns: Timestamp | User | Action | Entity | Reference | Details
 */
function logAction(action, entity, reference, details) {
  try {
    appendObject_(SHEETS.AUDIT_LOG, {
      'Timestamp': new Date(),
      'User': currentUser(),
      'Action': action,
      'Entity': entity,
      'Reference': reference,
      'Details': details || ''
    });
  } catch (e) {
    // Never let audit logging break the primary action.
    Logger.log('Audit log failed: ' + e);
  }
}
