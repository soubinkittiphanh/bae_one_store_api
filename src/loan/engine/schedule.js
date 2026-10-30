/**
 * Schedule generator (pure). Repayment methods:
 *   EQUAL_PRINCIPAL    principal / installments; interest on the declining balance
 *   EQUAL_INSTALLMENT  declining-balance annuity (exact rational payment), optional balloon
 *   FLAT               interest = principal x rate x term, spread evenly (MONTHLY_FLAT / UPFRONT_SIMPLE)
 * Interest uses UNADJUSTED period dates and the day-count convention; only the payment date rolls
 * with the holiday handling. Every amount is rounded per rounding-policy.md and the last
 * installment absorbs the residue.
 */
const N = require('./num');
const D = require('./dates');
const { yearFraction } = require('./dayCount');
const { LoanError } = require('../errors');

const DECLINING_ACCRUAL = ['DAILY_OUTSTANDING'];
const FLAT_ACCRUAL = ['MONTHLY_FLAT', 'UPFRONT_SIMPLE'];
const GRACE_TYPES = ['NONE', 'INTEREST_ONLY', 'FULL'];

const fail = msg => { throw new LoanError(400, msg); };

// Months per installment from the frequency lookup (only month-based frequencies are scheduled)
const monthsPerPeriod = (frequency) => {
  const ppy = N.of(frequency.periodsPerYear);
  const months = N.div(12, ppy);
  if (months.d !== 1n || months.n < 1n) fail(`Frequency ${frequency.code} is not month-based; only MONTHLY, QUARTERLY, SEMI_ANNUALLY and ANNUALLY can be scheduled`);
  return Number(months.n);
};

/**
 * terms: {
 *   principal, annualRate, tenorMonths, repaymentMethod, accrualMethod,
 *   frequency: { code, periodsPerYear }, dayCount: { code, daysInYear },
 *   valueDate, firstDueDate?, firstPeriodMinDays?, firstPeriodMaxDays?,
 *   graceType?, gracePeriods?, maxGracePeriods?, balloonAmount?, holidayHandling?
 * }
 * calendar: from makeCalendar(); rounder: from makeRounder()
 */
const generateSchedule = (terms, calendar, rounder) => {
  const principal = N.of(terms.principal);
  const rate = N.of(terms.annualRate);
  if (N.cmp(principal, 0) <= 0) fail('Principal must be positive');
  if (N.isNeg(rate) || N.cmp(rate, 1) > 0) fail('Interest rate must be between 0 and 1');
  if (!rounder.isRounded(terms.principal)) fail(`Principal has more than ${rounder.decimals} decimals`);

  const mpp = monthsPerPeriod(terms.frequency);
  if (!Number.isInteger(terms.tenorMonths) || terms.tenorMonths < 1 || terms.tenorMonths % mpp !== 0) fail(`Tenor must be a whole number of ${mpp}-month periods`);
  const n = terms.tenorMonths / mpp;

  const method = terms.repaymentMethod;
  if (method === 'FLAT') {
    if (!FLAT_ACCRUAL.includes(terms.accrualMethod)) fail(`FLAT repayment needs accrual method ${FLAT_ACCRUAL.join(' or ')}`);
  } else if (['EQUAL_PRINCIPAL', 'EQUAL_INSTALLMENT'].includes(method)) {
    if (!DECLINING_ACCRUAL.includes(terms.accrualMethod)) fail(`${method} needs accrual method DAILY_OUTSTANDING`);
  } else {
    fail(`Unsupported repayment method ${method}`);
  }

  const graceType = terms.graceType || 'NONE';
  const grace = graceType === 'NONE' ? 0 : Number(terms.gracePeriods || 0);
  if (!GRACE_TYPES.includes(graceType)) fail(`Unknown grace type ${graceType}`);
  if (!Number.isInteger(grace) || grace < 0) fail('Grace periods must be a whole number');
  if (graceType !== 'NONE' && grace === 0) fail('Grace type set but no grace periods');
  if (terms.maxGracePeriods !== undefined && grace > Number(terms.maxGracePeriods)) fail(`Grace exceeds the product maximum of ${terms.maxGracePeriods} period(s)`);
  if (grace >= n) fail('Grace must leave at least one repayment period');
  if (method === 'FLAT' && grace) fail('Grace is not supported with FLAT repayment');

  const balloon = N.of(terms.balloonAmount || 0);
  if (!N.isZero(balloon)) {
    if (method !== 'EQUAL_INSTALLMENT') fail('A balloon amount is only supported with EQUAL_INSTALLMENT');
    if (N.cmp(balloon, principal) >= 0) fail('Balloon must be less than the principal');
    if (!rounder.isRounded(terms.balloonAmount)) fail(`Balloon has more than ${rounder.decimals} decimals`);
  }

  // Unadjusted due dates: one period after the value date, or from the chosen first due date
  const valueDate = terms.valueDate;
  let first = terms.firstDueDate;
  if (first) {
    const days = D.daysBetween(valueDate, first);
    const minDays = terms.firstPeriodMinDays !== undefined ? Number(terms.firstPeriodMinDays) : 1;
    const maxDays = terms.firstPeriodMaxDays !== undefined ? Number(terms.firstPeriodMaxDays) : days;
    if (days < minDays || days > maxDays) fail(`First due date must be ${minDays}-${maxDays} days after the value date (got ${days})`);
  } else {
    first = D.addMonths(valueDate, mpp);
  }
  const anchorDay = D.parts(first).d;
  const dates = Array.from({ length: n }, (_, k) => (k === 0 ? first : D.addMonths(first, k * mpp, anchorDay)));

  const periodRate = N.div(rate, terms.frequency.periodsPerYear);
  const rows = [];
  let outstanding = principal;
  let prev = valueDate;

  if (method === 'FLAT') {
    // Flat: total interest on the original principal over the term, evenly per installment
    const totalInterest = N.of(rounder.round(N.mul(N.mul(principal, rate), N.div(terms.tenorMonths, 12))));
    const regularInterest = N.of(rounder.round(N.div(totalInterest, n)));
    const regularPrincipal = N.of(rounder.round(N.div(principal, n)));
    let interestLeft = totalInterest;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      const p = last ? outstanding : regularPrincipal;
      const i = last ? interestLeft : regularInterest;
      rows.push(row(k, dates[k], calendar, terms, outstanding, p, i, N.ZERO, false));
      outstanding = N.sub(outstanding, p);
      interestLeft = N.sub(interestLeft, i);
    }
    return finish(rows, rounder, principal, N.ZERO);
  }

  let capitalized = N.ZERO;
  for (let k = 0; k < grace; k++) {
    const interest = N.of(rounder.round(N.mul(N.mul(outstanding, rate), yearFraction(prev, dates[k], terms.dayCount))));
    if (graceType === 'INTEREST_ONLY') {
      rows.push(row(k, dates[k], calendar, terms, outstanding, N.ZERO, interest, N.ZERO, true));
    } else {
      rows.push(row(k, dates[k], calendar, terms, outstanding, N.ZERO, N.ZERO, interest, true));
      outstanding = N.add(outstanding, interest);
      capitalized = N.add(capitalized, interest);
    }
    prev = dates[k];
  }

  const m = n - grace;
  let regularPrincipal = null;
  let payment = null;
  if (method === 'EQUAL_PRINCIPAL') {
    regularPrincipal = N.of(rounder.round(N.div(outstanding, m)));
  } else if (N.isZero(periodRate)) {
    payment = N.of(rounder.round(N.div(N.sub(outstanding, balloon), m)));
  } else {
    // Exact annuity: A = (P(1+r)^m - B) r / ((1+r)^m - 1), rounded once
    const growth = N.pow(N.add(1, periodRate), m);
    payment = N.of(rounder.round(N.div(N.mul(N.sub(N.mul(outstanding, growth), balloon), periodRate), N.sub(growth, 1))));
  }

  for (let k = grace; k < n; k++) {
    const last = k === n - 1;
    const interest = N.of(rounder.round(N.mul(N.mul(outstanding, rate), yearFraction(prev, dates[k], terms.dayCount))));
    let p;
    if (last) p = outstanding;
    else if (regularPrincipal) p = regularPrincipal;
    else p = N.max(N.ZERO, N.sub(payment, interest));
    if (N.cmp(p, outstanding) > 0) p = outstanding;
    rows.push(row(k, dates[k], calendar, terms, outstanding, p, interest, N.ZERO, false));
    outstanding = N.sub(outstanding, p);
    prev = dates[k];
  }
  return finish(rows, rounder, principal, capitalized);
};

const row = (k, originalDueDate, calendar, terms, opening, principal, interest, capitalizedInterest, isGrace) => ({
  no: k + 1,
  originalDueDate,
  dueDate: calendar.adjust(originalDueDate, terms.holidayHandling),
  opening,
  principal,
  interest,
  capitalizedInterest,
  isGrace
});

const finish = (rows, rounder, principal, capitalized) => {
  const fmt = v => N.toDecimal(v, rounder.decimals);
  const out = rows.map(r => ({
    no: r.no,
    dueDate: r.dueDate,
    originalDueDate: r.originalDueDate,
    openingBalance: fmt(r.opening),
    principal: fmt(r.principal),
    interest: fmt(r.interest),
    total: fmt(N.add(r.principal, r.interest)),
    capitalizedInterest: fmt(r.capitalizedInterest),
    closingBalance: fmt(N.sub(N.add(r.opening, r.capitalizedInterest), r.principal)),
    isGrace: r.isGrace
  }));
  const totalPrincipal = N.sum(rows.map(r => r.principal));
  const totalInterest = N.sum(rows.map(r => r.interest));
  return {
    rows: out,
    totals: {
      installments: out.length,
      principal: fmt(totalPrincipal),
      interest: fmt(totalInterest),
      capitalizedInterest: fmt(capitalized),
      total: fmt(N.add(totalPrincipal, totalInterest))
    },
    principal: fmt(principal),
    maturityDate: out[out.length - 1].dueDate,
    firstDueDate: out[0].dueDate
  };
};

module.exports = { generateSchedule, monthsPerPeriod };

/**
 * Partial principal prepayment (pure): rebuild the unpaid future installments.
 *   REDUCE_INSTALLMENT  same remaining due dates, smaller installments
 *   REDUCE_TENOR        same regular installment (annuity) or principal (equal principal), fewer installments
 * The interest of the current period is split at the prepayment date: the old balance until the
 * date, the new balance after it. FLAT products and REDUCE_TENOR with a balloon are refused.
 *
 * input: { rows (future unpaid installments, in order), prevDate, outstandingBefore, prepaid, date,
 *          annualRate, dayCount, frequency, repaymentMethod, balloonAmount, option, holidayHandling }
 */
const regenerateAfterPrepayment = (input, calendar, rounder) => {
  const { rows, prevDate, date, option } = input;
  if (input.repaymentMethod === 'FLAT') fail('Partial principal prepayment does not regenerate FLAT schedules');
  if (!rows.length) fail('No future installments to regenerate');
  if (!['REDUCE_INSTALLMENT', 'REDUCE_TENOR'].includes(option)) fail(`Unknown partial prepayment option ${option}`);
  const before = N.of(input.outstandingBefore);
  const prepaid = N.of(input.prepaid);
  if (N.cmp(prepaid, 0) <= 0) fail('Prepaid principal must be positive');
  if (N.cmp(prepaid, before) >= 0) fail('Prepayment covers the whole principal; use PREPAY (full settlement)');
  const balloon = N.of(input.balloonAmount || 0);
  if (option === 'REDUCE_TENOR' && !N.isZero(balloon)) fail('REDUCE_TENOR is not supported with a balloon');
  const rate = N.of(input.annualRate);
  const after = N.sub(before, prepaid);
  const r = v => N.of(rounder.round(v));
  const yf = (a, b) => yearFraction(a, b, input.dayCount);

  const firstInterest = r(N.add(N.mul(N.mul(before, rate), yf(prevDate, date)), N.mul(N.mul(after, rate), yf(date, rows[0].originalDueDate))));
  const k = rows.length;
  const periodRate = N.div(rate, input.frequency.periodsPerYear);
  let payment = null;
  let principalPer = null;
  if (input.repaymentMethod === 'EQUAL_PRINCIPAL') {
    principalPer = option === 'REDUCE_INSTALLMENT' ? r(N.div(after, k)) : N.of(rows[0].principal);
  } else if (option === 'REDUCE_INSTALLMENT') {
    payment = N.isZero(periodRate) ? r(N.div(N.sub(after, balloon), k)) : (() => {
      const growth = N.pow(N.add(1, periodRate), k);
      return r(N.div(N.mul(N.sub(N.mul(after, growth), balloon), periodRate), N.sub(growth, 1)));
    })();
  } else {
    payment = N.add(rows[0].principal, rows[0].interest);
  }

  const out = [];
  let outstanding = after;
  let prev = date;
  for (let i = 0; i < k && N.cmp(outstanding, 0) > 0; i++) {
    const due = rows[i].originalDueDate;
    const interest = i === 0 ? firstInterest : r(N.mul(N.mul(outstanding, rate), yf(prev, due)));
    let p = principalPer || N.max(N.ZERO, N.sub(payment, interest));
    if (i === k - 1 || N.cmp(p, outstanding) >= 0) p = outstanding;
    out.push({ no: rows[0].no + i, originalDueDate: due, dueDate: calendar.adjust(due, input.holidayHandling), opening: outstanding, principal: p, interest });
    outstanding = N.sub(outstanding, p);
    prev = due;
  }
  const fmt = v => N.toDecimal(v, rounder.decimals);
  return {
    rows: out.map(x => ({
      no: x.no, dueDate: x.dueDate, originalDueDate: x.originalDueDate, openingBalance: fmt(x.opening),
      principal: fmt(x.principal), interest: fmt(x.interest), total: fmt(N.add(x.principal, x.interest)), closingBalance: fmt(N.sub(x.opening, x.principal))
    })),
    removedInstallments: k - out.length,
    newOutstanding: fmt(after)
  };
};

module.exports.regenerateAfterPrepayment = regenerateAfterPrepayment;
