/**
 * Phase 4 guard rails: master switch, tax-profile gate, value / booking dates (period lock and
 * backdating), idempotency claims and the test-only failure hook.
 */
const crypto = require('crypto');
const db = require('../../models');
const { LoanError } = require('../errors');
const D = require('../engine/dates');

const spfValue = async (code, transaction) => {
  const row = await db.spf.findOne({ where: { code }, transaction });
  return row && row.value != null ? String(row.value).trim() : null;
};

const assertPostingEnabled = async (transaction) => {
  if ((await spfValue('LOAN_POSTING_ENABLED', transaction)) !== 'true') {
    throw new LoanError(409, 'Loan posting is switched off (SPF LOAN_POSTING_ENABLED is not \'true\'). Calculations, simulations and previews still work.');
  }
};

// Production disbursement and fee billing need a CONFIRMED tax profile (rev5-decisions §4)
const TAX_GATED = ['DISB', 'FEE_COLLECT'];
const assertTaxProfile = async (kind, transaction) => {
  if (!TAX_GATED.includes(kind)) return;
  const profile = await db.lnTaxProfile.findOne({ transaction });
  if (!profile || profile.confirmationStatus !== 'CONFIRMED') {
    throw new LoanError(409, `${kind} is blocked while the tax profile is UNCONFIRMED. Confirm it on the Go-live checklist first.`);
  }
};

const systemDate = async (transaction) => {
  const sd = await db.lnSystemDate.findOne({ order: [['id', 'ASC']], transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
  if (!sd) throw new LoanError(409, 'ln_system_date is not set up');
  return sd;
};

const posBusinessDate = async (transaction) => {
  const bd = await db.businessDate.findOne({ order: [['id', 'DESC']], transaction });
  return bd ? String(bd.currentDate) : null;
};

/**
 * Value date rules (spec §4.2): no future dates; backdating at most LOAN_MAX_BACKDATE_DAYS (DISB on a
 * product that allows backdated disbursement is exempt); a value date before the period lock is
 * calculated at its value date but booked on the current business date.
 */
const resolveDates = async ({ kind, valueDate, product, transaction }) => {
  const sd = await systemDate(transaction);
  const business = String(sd.currentBusinessDate);
  const value = valueDate || business;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new LoanError(400, 'valueDate must be YYYY-MM-DD');
  if (D.compare(value, business) > 0) throw new LoanError(400, `Value date ${value} is after the business date ${business}`);
  const maxBack = Number(await spfValue('LOAN_MAX_BACKDATE_DAYS', transaction) || 0);
  const back = D.daysBetween(value, business);
  const exempt = kind === 'DISB' && product && product.allowBackdatedDisbursement;
  if (back > maxBack && !exempt) throw new LoanError(400, `Value date ${value} is ${back} day(s) before the business date; at most ${maxBack} allowed (SPF LOAN_MAX_BACKDATE_DAYS)`);
  const lock = sd.periodLockDate ? String(sd.periodLockDate) : null;
  const adjusted = Boolean(lock && D.compare(value, lock) < 0);
  return { businessDate: business, valueDate: value, bookingDate: adjusted ? business : value, valueDatedAdjustment: adjusted };
};

const requestHash = body => crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');

/**
 * Claims an idempotency key inside the caller's transaction (insert first). A concurrent request with
 * the same key waits on the unique index and then sees the committed row.
 * Returns { row } for a fresh claim, or { replay } when the same request already completed.
 */
const claimIdempotency = async ({ endpoint, accountId, key, hash, transaction }) => {
  if (!key || !/^[\w.:-]{8,100}$/.test(key)) throw new LoanError(400, 'Idempotency-Key header is required (8-100 characters: letters, digits, . : _ -)');
  const existing = await db.lnIdempotency.findOne({ where: { endpoint, accountId, idempotencyKey: key }, transaction });
  if (existing) {
    if (existing.requestHash !== hash) throw new LoanError(409, 'This Idempotency-Key was already used for a different request');
    return { replay: { status: existing.status, body: existing.responseBody ? JSON.parse(existing.responseBody) : null } };
  }
  const row = await db.lnIdempotency.create({ endpoint, accountId, idempotencyKey: key, requestHash: hash, status: 102 }, { transaction });
  return { row };
};

const isTestDatabase = () => /_test$/.test(String(require('../../config/env').db.database || ''));

// Test-only: throw at a named step. Active only when LOAN_TEST_HOOKS=1 and the database ends in _test.
const makeTestHook = (failAt) => {
  if (!failAt || process.env.LOAN_TEST_HOOKS !== '1' || !isTestDatabase()) return () => {};
  return (step) => {
    if (step === failAt) throw new LoanError(500, `TEST_FAIL_AT ${step}`);
  };
};
const testFailAt = req => (process.env.LOAN_TEST_HOOKS === '1' && isTestDatabase() ? req.get('X-Loan-Test-Fail-At') || null : null);

module.exports = { spfValue, assertPostingEnabled, assertTaxProfile, systemDate, posBusinessDate, resolveDates, requestHash, claimIdempotency, makeTestHook, testFailAt, TAX_GATED };
