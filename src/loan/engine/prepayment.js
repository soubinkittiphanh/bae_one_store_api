/**
 * Full early settlement quote (pure) -> PREPAY tags (+ LIQD_SUSP for suspended interest).
 * Earned interest not yet billed, per earlySettlementRebateMethod:
 *   ACTUARIAL_PRO_RATA  outstanding principal x rate x elapsed fraction of the current period
 *   RULE_OF_78          sum-of-digits share of total scheduled interest (current period pro rata),
 *                       minus interest already billed; never negative (billed interest is not refunded)
 *   NONE                all remaining scheduled interest
 * TRUE_UP / TRUE_UP_REV = interest to recognize now - interest already recognized for unbilled periods.
 */
const N = require('./num');
const D = require('./dates');
const S = require('./state');
const { yearFraction } = require('./dayCount');
const { LoanError } = require('../errors');

const FEE_EXCLUDED = ['PRINCIPAL', 'INTEREST', 'PENALTY'];

const earnedUnbilled = ({ schedule, state, date, rebateMethod, annualRate, dayCount, valueDate }) => {
  const rows = schedule.rows;
  const billed = rows.filter(r => D.compare(r.originalDueDate, date) <= 0);
  const next = rows.find(r => D.compare(r.originalDueDate, date) > 0);
  if (!next) return N.ZERO;
  const periodStart = billed.length ? billed[billed.length - 1].originalDueDate : valueDate;
  if (rebateMethod === 'ACTUARIAL_PRO_RATA') {
    const outstanding = S.componentTotal(state, 'PRINCIPAL');
    return N.mul(N.mul(outstanding, annualRate), yearFraction(periodStart, date, dayCount));
  }
  if (rebateMethod === 'NONE') return N.sum(rows.filter(r => D.compare(r.originalDueDate, date) > 0).map(r => r.interest));
  if (rebateMethod === 'RULE_OF_78') {
    const n = BigInt(rows.length);
    const k = BigInt(billed.length);
    const digitsTotal = (n * (n + 1n)) / 2n;
    let digits = N.make(k * n - (k * (k - 1n)) / 2n);
    const elapsed = yearFraction(periodStart, date, dayCount);
    const full = yearFraction(periodStart, next.originalDueDate, dayCount);
    if (!N.isZero(full)) digits = N.add(digits, N.mul(N.make(n - k), N.div(elapsed, full)));
    const totalInterest = N.sum(rows.map(r => r.interest));
    const earned = N.div(N.mul(totalInterest, digits), N.make(digitsTotal));
    return N.max(N.ZERO, N.sub(earned, N.sum(billed.map(r => r.interest))));
  }
  throw new LoanError(400, `Unsupported rebate method ${rebateMethod}`);
};

/**
 * input: { schedule, state, date, rebateMethod, annualRate, dayCount, valueDate, recognition,
 *          recognizedUnbilled?, earlyFeeRate?, earlyFeeVat?: { rate, inclusive }, penaltyBooked?, rounder }
 */
const prepaymentQuote = (input) => {
  const { state, date, rounder } = input;
  const r = v => N.of(rounder.round(v));
  const outPrin = r(S.componentTotal(state, 'PRINCIPAL'));
  const booked = r(S.interestByBucket(state, date, 'BOOKED'));
  const suspended = r(S.interestByBucket(state, date, 'SUSPENDED'));
  const unbookedDue = r(S.interestByBucket(state, date, 'UNBOOKED'));
  const penalty = r(S.componentTotal(state, 'PENALTY'));
  const fees = r(N.sum(state.installments.flatMap(i => Object.entries(i.components)
    .filter(([code]) => !FEE_EXCLUDED.includes(code)).map(([, c]) => S.outstandingOf(c)))));

  const toRecognize = N.add(r(earnedUnbilled(input)), unbookedDue);
  const trueUp = N.sub(toRecognize, input.recognizedUnbilled || 0);
  const earnedInt = N.add(N.add(booked, N.of(input.recognizedUnbilled || 0)), trueUp);

  let earlyFee = r(N.mul(outPrin, input.earlyFeeRate || 0));
  let vat = N.ZERO;
  if (input.earlyFeeVat && !N.isZero(earlyFee)) {
    const rate = N.of(input.earlyFeeVat.rate);
    if (input.earlyFeeVat.inclusive) {
      vat = r(N.div(N.mul(earlyFee, rate), N.add(1, rate)));
      earlyFee = N.sub(earlyFee, vat);
    } else {
      vat = r(N.mul(earlyFee, rate));
    }
  }

  const due = N.sum([outPrin, earnedInt, penalty, fees, earlyFee, vat]);
  const advance = N.min(N.of(state.advanceBalance || 0), due);
  const tags = {
    PAYOFF_CASH: N.sub(due, advance),
    ADV_APPLIED: advance,
    OUT_PRIN: outPrin,
    EARNED_INT: earnedInt,
    [input.penaltyBooked ? 'PENALTY' : 'PEN_CASH']: penalty,
    FEES: fees,
    EARLY_FEE: earlyFee,
    VAT_OUT: vat
  };
  if (N.isNeg(trueUp)) tags.TRUE_UP_REV = N.neg(trueUp);
  else tags.TRUE_UP = trueUp;

  const events = [{ event: 'PREPAY', tags: clean(tags, rounder) }];
  if (!N.isZero(suspended)) events.push({ event: 'LIQD_SUSP', tags: clean({ SUSP_PAID: suspended }, rounder) });
  return {
    events,
    cashRequired: rounder.round(N.add(tags.PAYOFF_CASH, suspended)),
    breakdown: {
      outstandingPrincipal: rounder.round(outPrin),
      bookedInterest: rounder.round(booked),
      suspendedInterest: rounder.round(suspended),
      interestToRecognize: rounder.round(toRecognize),
      memoPenalty: rounder.round(penalty),
      fees: rounder.round(fees),
      earlySettlementFee: rounder.round(earlyFee),
      vat: rounder.round(vat),
      advanceApplied: rounder.round(advance)
    }
  };
};

// Drop zero tags; format the rest at the currency's decimals
const clean = (tags, rounder) => Object.fromEntries(Object.entries(tags)
  .filter(([, v]) => !N.isZero(v))
  .map(([k, v]) => [k, N.toDecimal(N.of(v), rounder.decimals)]));

module.exports = { prepaymentQuote, earnedUnbilled, clean };
