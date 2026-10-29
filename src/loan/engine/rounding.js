/**
 * Rounding per docs/loan/rounding-policy.md. The rule comes from ln_currency_rule
 * (loan-owned; the POS currency table has no decimals field) and is passed in.
 */
const N = require('./num');
const { LoanError } = require('../errors');

// Amounts posted into general_ledger (DECIMAL(15,2)) can carry at most 2 decimals
const MAX_POSTABLE_DECIMALS = 2;

const makeRounder = (rule) => {
  if (!rule || rule.decimalPlaces === undefined || rule.decimalPlaces === null) {
    throw new LoanError(409, 'No rounding rule (ln_currency_rule) for this currency');
  }
  const decimals = Number(rule.decimalPlaces);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_POSTABLE_DECIMALS) {
    throw new LoanError(400, `decimalPlaces must be 0..${MAX_POSTABLE_DECIMALS}`);
  }
  const mode = rule.roundingMode || 'HALF_UP';
  if (mode !== 'HALF_UP') throw new LoanError(400, `Rounding mode ${mode} is not supported yet`);
  const round = value => N.roundHalfUp(value, decimals);
  const isRounded = (value) => {
    const s = String(value);
    const frac = s.includes('.') ? s.split('.')[1].replace(/0+$/, '') : '';
    return frac.length <= decimals;
  };
  return { decimals, mode, round, isRounded, zero: N.toDecimal(N.ZERO, decimals) };
};

module.exports = { makeRounder, MAX_POSTABLE_DECIMALS };
