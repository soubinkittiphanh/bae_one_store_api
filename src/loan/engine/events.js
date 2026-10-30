/**
 * Amount tags for the remaining Phase 4 transaction kinds (pure). Each returns [{ event, tags }].
 * Tags follow docs/loan/rev5-accounting-addendum.md §2; zero tags are dropped.
 */
const N = require('./num');
const { clean } = require('./prepayment');
const { LoanError } = require('../errors');

const fail = msg => { throw new LoanError(400, msg); };
const positive = (v, label) => { if (N.cmp(v, 0) <= 0) fail(`${label} must be positive`); return N.of(v); };

// Waiver allocations: [{ amount, bucket }] taken from the due components. Memo penalty and unbooked
// interest are reduced in the subledger only (no GL).
const waiveEvents = ({ kind, allocations, penaltyBooked = false, rounder }) => {
  const sum = bucket => N.sum(allocations.filter(a => !bucket || a.bucket === bucket).map(a => a.amount));
  if (kind === 'PENALTY') return penaltyBooked ? [{ event: 'WAIVE', tags: clean({ PEN_WAIVE: sum() }, rounder) }].filter(e => Object.keys(e.tags).length) : [];
  if (kind === 'FEE') return [{ event: 'WAIVE', tags: clean({ FEE_WAIVE: sum() }, rounder) }].filter(e => Object.keys(e.tags).length);
  if (kind === 'INTEREST') {
    const tags = clean({ INT_WAIVE: sum('BOOKED'), INT_WAIVE_SUSP: sum('SUSPENDED') }, rounder);
    return Object.keys(tags).length ? [{ event: 'INT_WAIVE', tags }] : [];
  }
  return fail(`Unknown waiver kind ${kind}`);
};

const insRemitEvents = ({ amount, payable, rounder }) => {
  const a = positive(amount, 'Remittance');
  if (N.cmp(a, payable) > 0) fail(`Remittance ${amount} exceeds the insurance payable of ${rounder.round(payable)}`);
  return [{ event: 'INS_REMIT', tags: clean({ REMIT_AMT: a }, rounder) }];
};

const advRefundEvents = ({ amount, advanceBalance, rounder }) => {
  const a = positive(amount, 'Refund');
  if (N.cmp(a, advanceBalance) > 0) fail(`Refund ${amount} exceeds the customer advance of ${rounder.round(advanceBalance)}`);
  return [{ event: 'ADV_REFUND', tags: clean({ REFUND_AMT: a }, rounder) }];
};

// Refund exactly what FEE_COLLECT took (its stored tags)
const feeRefundEvents = ({ collectTags, rounder }) => {
  if (!collectTags || !collectTags.TOTAL_PAID) fail('No posted FEE_COLLECT to refund');
  return [{ event: 'FEE_REFUND', tags: clean({ FEE_DOC: collectTags.FEE_DOC || 0, INS_PREM: collectTags.INS_PREM || 0, VAT_OUT: collectTags.VAT_OUT || 0, REFUND_AMT: collectTags.TOTAL_PAID }, rounder) }];
};

// Write-off: the reserve absorbs principal first, the rest is a shortfall; receivables are cleared;
// the memo holds the whole claim; reserve left over is written back.
const writeOffEvents = ({ outstandingPrincipal, reserve, suspendedInterest = '0', bookedInterest = '0', feeReceivable = '0', penaltyReceivable = '0', rounder }) => {
  const P = N.of(outstandingPrincipal);
  const covered = N.min(P, reserve);
  const events = [{ event: 'WRITE_OFF', tags: clean({
    PRIN_WO: covered, SHORTFALL: N.sub(P, covered), SUSP_CLR: suspendedInterest, UNCOL_INT: bookedInterest,
    FEE_WO: feeReceivable, PEN_WO: penaltyReceivable,
    MEMO_WO: N.sum([P, suspendedInterest, bookedInterest, feeReceivable, penaltyReceivable])
  }, rounder) }];
  const leftover = N.sub(reserve, covered);
  if (N.cmp(leftover, 0) > 0) events.push({ event: 'PROV_WB', tags: clean({ PROV_WB: leftover }, rounder) });
  return events;
};

const recoveryEvents = ({ amount, memoBalance, rounder }) => {
  const a = positive(amount, 'Recovery');
  if (N.cmp(a, memoBalance) > 0) fail(`Recovery ${amount} exceeds the written-off memo balance of ${rounder.round(memoBalance)}`);
  return [{ event: 'RECOVERY', tags: clean({ REC_AMT: a }, rounder) }];
};

// Repossession: the vehicle is carried at its appraised value (capped at the principal); the loss
// is absorbed by the reserve, then a shortfall; receivables cleared; reserve left over written back.
const repossessEvents = ({ outstandingPrincipal, appraised, reserve, suspendedInterest = '0', bookedInterest = '0', feeReceivable = '0', penaltyReceivable = '0', rounder }) => {
  const P = N.of(outstandingPrincipal);
  positive(appraised, 'Appraised value');
  const carried = N.min(appraised, P);
  const absorbed = N.min(reserve, N.sub(P, carried));
  const events = [{ event: 'REPOSSESS', tags: clean({
    APPRAISED: carried, RESERVE_ABS: absorbed, SHORTFALL: N.sub(N.sub(P, carried), absorbed), OUT_PRIN: P,
    SUSP_CLR: suspendedInterest, UNCOL_INT: bookedInterest, FEE_WO: feeReceivable, PEN_WO: penaltyReceivable
  }, rounder) }];
  const leftover = N.sub(reserve, absorbed);
  if (N.cmp(leftover, 0) > 0) events.push({ event: 'PROV_WB', tags: clean({ PROV_WB: leftover }, rounder) });
  return { events, carrying: rounder.round(carried) };
};

const disposeEvents = ({ salePrice, carrying, vat, rounder }) => {
  const gross = positive(salePrice, 'Sale price');
  let vatAmount = N.ZERO;
  if (vat) {
    const rate = N.of(vat.rate);
    vatAmount = N.of(rounder.round(vat.inclusive ? N.div(N.mul(gross, rate), N.add(1, rate)) : N.mul(gross, rate)));
  }
  const cash = vat && !vat.inclusive ? N.add(gross, vatAmount) : gross;
  const net = N.sub(cash, vatAmount);
  const diff = N.sub(net, carrying);
  return [{ event: 'VEH_DISPOSE', tags: clean({
    SALE_PRICE: cash, CARRYING: carrying, VAT_OUT: vatAmount,
    GAIN: N.isNeg(diff) ? 0 : diff, LOSS: N.isNeg(diff) ? N.neg(diff) : 0
  }, rounder) }];
};

module.exports = { waiveEvents, insRemitEvents, advRefundEvents, feeRefundEvents, writeOffEvents, recoveryEvents, repossessEvents, disposeEvents };
