/**
 * Document numbers from ln_numbering_sequence ({PREFIX}-{YEAR}{MONTH}-{NUMBER}), taken under a row
 * lock inside the caller's transaction so two bookings never get the same number.
 *
 * Phase 6: a pattern may hold {BRANCH}, filled from the AUTHORIZED, active ln_branch_profile.branchCode of
 * the record's branch (location.id). The counter stays one per sequence for the whole company, so numbers
 * are unique across branches but not contiguous per branch. A pattern with {BRANCH} and no branch, or a
 * branch without an authorized profile, is an error (no default code).
 */
const db = require('../../models');
const { LoanError } = require('../errors');

const branchCode = async (branchId, sequenceCode, transaction) => {
  if (branchId === null || branchId === undefined) throw new LoanError(409, `Numbering sequence ${sequenceCode} uses {BRANCH} but the record has no branch`);
  const profile = await db.lnBranchProfile.findOne({ where: { locationId: branchId, authStatus: 'AUTHORIZED', isActive: true }, transaction });
  if (!profile) throw new LoanError(409, `Numbering sequence ${sequenceCode} uses {BRANCH}: location ${branchId} has no AUTHORIZED, active branch profile (Parameter Studio, branch-profile)`);
  return profile.branchCode;
};

const nextNumber = async (sequenceCode, date, transaction, branchId) => {
  const seq = await db.lnNumberingSequence.findOne({ where: { sequenceCode }, transaction, lock: transaction.LOCK.UPDATE });
  if (!seq) throw new LoanError(409, `Numbering sequence ${sequenceCode} not found`);
  const [y, m] = String(date).split('-');
  const number = String(seq.nextNumber).padStart(seq.paddingLength || 1, '0');
  const pattern = seq.formatPattern || '{PREFIX}-{NUMBER}';
  const value = pattern
    .replace('{PREFIX}', seq.prefix || '')
    .replace('{BRANCH}', pattern.includes('{BRANCH}') ? await branchCode(branchId, sequenceCode, transaction) : '')
    .replace('{YEAR}', y)
    .replace('{MONTH}', m)
    .replace('{NUMBER}', number);
  await seq.update({ nextNumber: seq.nextNumber + 1 }, { transaction });
  return value;
};

module.exports = { nextNumber };
