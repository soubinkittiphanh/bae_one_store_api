/**
 * Approval by amount (owner decision 2026-11-13, docs/loan/open-decisions.md item 5, option B).
 *
 * A threshold is an AUTHORIZED ln_approval_matrix row (maker-checker, Parameter Studio 'approval-matrix'):
 *   entityType = the transaction kind (e.g. WRITE_OFF), currencyId = the contract currency,
 *   minAmount = the threshold (in that currency), requiredLevel = 2, approverRoleId = the approver group
 *   (userGroup.id, e.g. LOAN_HO_CHECKER). maxAmount is not used for transaction thresholds.
 * The mechanism is generic over the transaction kinds: adding WAIVE later needs only a row.
 *
 * At authorization, when the kind and currency have a threshold and the basis is at or above it, the
 * transaction posts only if the checker belongs to the approver group, or if a second, different checker
 * approves after a first one. The first approval is logged in ln_approval_log (and ln_audit_log) and the
 * transaction stays PENDING_AUTH. The maker never counts as an approver above the threshold (even with
 * LOAN_ALLOW_SELF_AUTHORIZE on), the same person cannot approve twice, and any rejection ends it.
 * No threshold for the kind and currency: one checker posts, as before.
 *
 * Basis, always in the contract currency:
 *   WRITE_OFF  the total amount written off: principal + interest (booked and suspended) + fee and penalty
 *              receivables, i.e. the off-balance memo (tag MEMO_WO)
 *   REPOSSESS  the account's outstanding exposure: the same balances (tags OUT_PRIN, SUSP_CLR, UNCOL_INT,
 *              FEE_WO, PEN_WO), never the appraised value
 *   any other  the transaction amount
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const { toUnits, fromUnits } = require('../accounting/journal');
const { findAllExact } = require('../db/exact');

const ENTITY = 'LOAN_TRANSACTION';
// Kinds a threshold row may name (Parameter Studio entityType)
const { THRESHOLD_KINDS } = require('./paramRegistry');
// Kinds that must have a threshold for every active currency before go-live (loan_deploy_check.js C15)
const REQUIRED_KINDS = ['WRITE_OFF', 'REPOSSESS'];

const units = v => (v === undefined || v === null || v === '' ? 0n : toUnits(String(v)));
const tagSum = (events, eventCode, tags) => {
  const e = (events || []).find(x => x.event === eventCode);
  if (!e) throw new LoanError(500, `No ${eventCode} event to take the approval basis from`);
  return fromUnits(tags.reduce((s, t) => s + units((e.tags || {})[t]), 0n));
};
const BASIS = {
  WRITE_OFF: events => tagSum(events, 'WRITE_OFF', ['MEMO_WO']),
  REPOSSESS: events => tagSum(events, 'REPOSSESS', ['OUT_PRIN', 'SUSP_CLR', 'UNCOL_INT', 'FEE_WO', 'PEN_WO'])
};
// result: anything with { events, amount } (a posting summary, a preview, or a stored transaction)
const basisOf = (kind, result) => (BASIS[kind] ? BASIS[kind](result.events) : fromUnits(units(result.amount)));

// The one AUTHORIZED threshold of a kind and currency, or null. More than one is a setup error: refuse.
const ruleFor = async (kind, currencyId, transaction) => {
  if (!THRESHOLD_KINDS.includes(kind) || currencyId === null || currencyId === undefined) return null;
  const rows = await findAllExact(db.lnApprovalMatrix, { where: { entityType: kind, currencyId: Number(currencyId), authStatus: 'AUTHORIZED' }, order: [['id', 'ASC']], transaction });
  const live = rows.filter(r => Number(r.requiredLevel) >= 2);
  if (live.length > 1) throw new LoanError(409, `${live.length} AUTHORIZED approval thresholds for ${kind} in currency ${currencyId} (rows ${live.map(r => r.id).join(', ')}): keep one; nothing was posted`);
  if (!live.length) return null;
  const r = live[0];
  return { id: r.id, kind, currencyId: Number(currencyId), threshold: fromUnits(units(r.minAmount)), groupId: Number(r.approverRoleId) };
};

const atOrAbove = (basis, rule) => units(basis) >= units(rule.threshold);

const approvalsOf = (txnId, transaction) => db.lnApprovalLog.findAll({ where: { entityType: ENTITY, entityId: txnId, action: 'APPROVE' }, order: [['id', 'ASC']], transaction });

const inGroup = async (userId, groupId, transaction) => {
  const u = await db.user.findByPk(userId, { attributes: ['id', 'groupId', 'isActive'], transaction });
  return Boolean(u && u.isActive !== false && Number(u.groupId) === Number(groupId));
};

const groupName = async (groupId, transaction) => {
  const g = await db.group.findByPk(groupId, { attributes: ['id', 'code'], transaction });
  return g ? g.code : `group ${groupId}`;
};

// For previews, the pending queue and responses
const describe = async ({ rule, basis, approvals = [], transaction }) => {
  if (!rule) return null;
  const required = atOrAbove(basis, rule);
  const first = approvals[0] || null;
  return {
    thresholdId: rule.id, threshold: rule.threshold, basis, currencyId: rule.currencyId,
    approverGroupId: rule.groupId, approverGroup: await groupName(rule.groupId, transaction),
    requiresSecondApproval: required,
    approvals: required ? Math.min(approvals.length, 1) : 0, approvalsNeeded: required ? 2 : 1,
    firstApproverId: first ? Number(first.approverUserId) : null, firstApprovedAt: first ? first.timestamp : null,
    label: required ? (approvals.length ? '1 of 2 approvals' : 'requires second approval') : null
  };
};

/**
 * The checker's authorization of a pending transaction whose recomputed basis is `basis`.
 * Returns { outcome: 'POST' | 'FIRST', level, by } or throws (nothing is written then).
 */
const decide = async ({ rule, basis, txn, ctxUser, transaction }) => {
  if (!rule || !atOrAbove(basis, rule)) return { outcome: 'POST', level: 1, by: 'ONE_CHECKER' };
  const userId = Number(ctxUser.userId);
  if (Number(txn.makerId) === userId) throw new LoanError(403, `${txn.txNo}: ${txn.eventCode} of ${basis} is at or above the approval threshold of ${rule.threshold}; the maker never counts as an approver`);
  const approvals = await approvalsOf(txn.id, transaction);
  if (approvals.some(a => Number(a.approverUserId) === userId)) throw new LoanError(409, `${txn.txNo}: you already gave the first approval; a second, different checker is needed`);
  if (await inGroup(userId, rule.groupId, transaction)) return { outcome: 'POST', level: 2, by: 'APPROVER_GROUP' };
  const others = approvals.filter(a => Number(a.approverUserId) !== Number(txn.makerId));
  if (others.length) return { outcome: 'POST', level: 2, by: 'SECOND_CHECKER' };
  return { outcome: 'FIRST', level: 1, by: 'FIRST_CHECKER' };
};

const record = (txn, ctxUser, level, action, comments, transaction) => db.lnApprovalLog.create({
  entityType: ENTITY, entityId: txn.id, approvalLevel: level, approverUserId: ctxUser.userId, action, comments: comments || null, timestamp: new Date()
}, { transaction });

module.exports = { ENTITY, THRESHOLD_KINDS, REQUIRED_KINDS, basisOf, ruleFor, atOrAbove, approvalsOf, describe, decide, record };
