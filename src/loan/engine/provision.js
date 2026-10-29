/**
 * Provision calculation (pure). required = provisionRate x base, where
 *   NET_EXPOSURE          max(0, principal - collateral x (1 - haircut))
 *   OUTSTANDING_PRINCIPAL principal
 * The difference with the booked provision gives PROVISION (PROV_EXP) or PROV_WB (PROV_WB).
 */
const N = require('./num');
const { clean } = require('./prepayment');
const { LoanError } = require('../errors');

const calculateProvision = ({ outstandingPrincipal, collateralValue = '0', rule, booked = '0', rounder }) => {
  if (!rule) throw new LoanError(409, 'No authorized provision rule for this class');
  let base;
  if (rule.provisionBase === 'NET_EXPOSURE') {
    const eligible = N.mul(collateralValue, N.sub(1, rule.collateralHaircutPct || 0));
    base = N.max(N.ZERO, N.sub(outstandingPrincipal, eligible));
  } else if (rule.provisionBase === 'OUTSTANDING_PRINCIPAL') {
    base = N.of(outstandingPrincipal);
  } else {
    throw new LoanError(400, `Unsupported provision base ${rule.provisionBase}`);
  }
  const required = N.of(rounder.round(N.mul(base, rule.provisionRate)));
  const delta = N.sub(required, booked);
  const events = [];
  if (N.cmp(delta, 0) > 0) events.push({ event: 'PROVISION', tags: clean({ PROV_EXP: delta }, rounder) });
  if (N.isNeg(delta)) events.push({ event: 'PROV_WB', tags: clean({ PROV_WB: N.neg(delta) }, rounder) });
  return {
    netExposure: rounder.round(base),
    provisionRate: String(rule.provisionRate),
    required: rounder.round(required),
    booked: rounder.round(booked),
    delta: rounder.round(delta),
    events
  };
};

module.exports = { calculateProvision };
