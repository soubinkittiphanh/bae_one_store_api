/**
 * Phase 3 engine tests (pure: no database). Run alone with `node test/loan/engineTests.js`
 * (from a scratch working directory: the shared logger writes logs.log in the cwd), or from
 * test/loan/run.js. Every engine output is turned into journals with the Phase 2B catalog rules
 * and must pass the 2B validators.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const E = require('../../src/loan/engine');
const { ENTRY_RULES } = require('../../src/loan/accounting/catalog');
const { resolveRuleSet, buildJournal } = require('../../src/loan/accounting/journal');
const V = require('../../src/loan/accounting/validators');
const F = require('./fixtures/engineFixtures');

const N = E.num;
const LAK = E.rounding.makeRounder(F.LAK);
const USD = E.rounding.makeRounder(F.USD);
const NO_HOLIDAYS = E.calendar.makeCalendar({ weekendDays: '' });
const DEFAULT_PRODUCT = { id: -1, categoryId: -1, feeFinancingMode: 'UPFRONT', deferredFeePresentation: 'IMMEDIATE', disbursementTargetCode: 'SALE_INVOICE_SETTLEMENT' };

// Catalog rules as if authorized; role types: memo roles are off-balance, the rest on-balance
const rulesFor = product => resolveRuleSet(ENTRY_RULES.map(r => ({ ...r, productId: null, categoryId: null, authStatus: 'AUTHORIZED', effectiveFrom: '2026-01-01' })), product, {});
const ROLE_TYPES = Object.fromEntries([...new Set(ENTRY_RULES.map(r => r.roleCode))].map(r => [r, r.startsWith('WRITTEN_OFF_MEMO') ? 'Off-Balance' : 'Asset']));

// Every event -> journal lines -> balanced, and one-sided tags equal their total
const assertBalanced = (events, product = DEFAULT_PRODUCT) => {
  const rules = rulesFor(product);
  const all = [];
  for (const ev of events) {
    const lines = buildJournal({ rules, eventCode: ev.event, tags: ev.tags, qualifiers: ev.qualifiers || {}, currency: 'LAK' });
    assert.deepStrictEqual(V.validateJournal(lines, ROLE_TYPES), [], `${ev.event} journal balance`);
    assert.deepStrictEqual(V.validateTagAmounts(ev.event, ev.tags, rules), [], `${ev.event} total-cash check`);
    all.push(...lines);
  }
  return all;
};
const tagsOf = (events, name) => (events.find(e => e.event === name) || {}).tags;
const lineSet = lines => lines.map(l => `${l.amountTag} ${l.drCr} ${l.roleCode}${l.qualifier ? `[${l.qualifier}]` : ''} ${N.roundHalfUp(l.amount, 0)}`).sort();

const run = async (test) => {
  const scheduleA = E.schedule.generateSchedule(F.LOAN_A, NO_HOLIDAYS, LAK);

  await test('engine: no floating-point arithmetic in src/loan/engine (parseFloat, toFixed, Math.round/floor/ceil/pow, **)', async () => {
    const dir = path.join(__dirname, '../../src/loan/engine');
    const offenders = [];
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const re of [/parseFloat\(/, /\.toFixed\(/, /Math\.(round|floor|ceil|pow)\(/]) if (re.test(src)) offenders.push(`${f}: ${re}`);
      // ** is only allowed on BigInt operands (10n ** ..., x.n ** BigInt(k))
      for (const m of src.matchAll(/(\S+)\s\*\*\s(\S+)/g)) if (!/n$|\.n$|\.d$/.test(m[1]) && !/^BigInt/.test(m[2])) offenders.push(`${f}: ${m[0]}`);
    }
    assert.deepStrictEqual(offenders, []);
  });

  await test('engine: decimal rounding half-up and calendar arithmetic', async () => {
    assert.strictEqual(N.roundHalfUp('2.5', 0), '3');
    assert.strictEqual(N.roundHalfUp('-2.5', 0), '-3');
    assert.strictEqual(N.roundHalfUp('1.005', 2), '1.01');
    assert.strictEqual(N.roundHalfUp(N.div(1, 3), 4), '0.3333');
    assert.strictEqual(E.dates.addMonths('2026-01-31', 1), '2026-02-28');
    assert.strictEqual(E.dates.addMonths('2026-01-31', 2, 31), '2026-03-31');
    assert.strictEqual(E.dates.addMonths('2028-01-31', 1), '2028-02-29');
    assert.strictEqual(E.dates.daysBetween('2027-12-15', '2028-01-15'), 31);
    const cal = E.calendar.makeCalendar({ weekendDays: 'SAT,SUN', holidays: ['2026-03-02'] });
    assert.strictEqual(cal.adjust('2026-02-28', 'NEXT_WORKING_DAY'), '2026-03-03', 'Sat -> Sun -> holiday Mon -> Tue');
    assert.strictEqual(cal.adjust('2026-02-28', 'PREV_WORKING_DAY'), '2026-02-27');
    assert.strictEqual(cal.adjust('2026-02-28', 'EXACT_DATE'), '2026-02-28');
    assert.throws(() => E.rounding.makeRounder({ decimalPlaces: 4 }), /decimalPlaces must be 0..2/);
  });

  await test('day count: 30E/360, actual and ACTUAL_ACTUAL across a leap year (independent value)', async () => {
    assert.deepStrictEqual(E.dayCount.yearFraction('2026-01-31', '2026-02-28', F.DAY_30_360), N.make(28n, 360n));
    assert.deepStrictEqual(E.dayCount.yearFraction('2026-01-15', '2026-02-15', { code: 'ACTUAL_365', daysInYear: 365 }), N.make(31n, 365n));
    const yf = E.dayCount.yearFraction('2027-12-15', '2028-01-15', F.ACT_ACT);
    assert.strictEqual(LAK.round(N.mul(N.mul('100000000', '0.12'), yf)), F.EXPECTED.actActInterest);
  });

  await test('schedule Loan A (equal principal): 20,000,000 + 3,600,000, then 3,300,000; totals exact', async () => {
    const r = scheduleA.rows;
    assert.deepStrictEqual([r[0].principal, r[0].interest, r[0].total], ['20000000', '3600000', '23600000']);
    assert.deepStrictEqual([r[1].principal, r[1].interest], ['20000000', '3300000']);
    assert.strictEqual(scheduleA.totals.principal, '240000000');
    assert.strictEqual(scheduleA.totals.interest, '23400000');
    assert.strictEqual(r[11].closingBalance, '0');
    assert.strictEqual(r[0].dueDate, '2026-02-15');
  });

  await test('schedule equal installment (annuity), balloon, flat, grace and broken first period match the independent values', async () => {
    const X = F.EXPECTED;
    const ann = E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'EQUAL_INSTALLMENT' }, NO_HOLIDAYS, LAK).rows;
    assert.deepStrictEqual([ann[0].principal, ann[0].interest, ann[0].total], [...X.annuity.row1, X.annuity.payment]);
    assert.deepStrictEqual([ann[1].principal, ann[1].interest], X.annuity.row2);
    assert.deepStrictEqual([ann[11].principal, ann[11].interest, ann[11].total], X.annuity.row12);
    assert.strictEqual(N.toDecimal(N.sum(ann.map(x => x.interest)), 0), X.annuity.interest);

    const bal = E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'EQUAL_INSTALLMENT', balloonAmount: X.balloon.balloon }, NO_HOLIDAYS, LAK).rows;
    assert.deepStrictEqual([bal[0].principal, bal[0].interest, bal[0].total], [...X.balloon.row1, X.balloon.payment]);
    assert.deepStrictEqual([bal[11].principal, bal[11].interest], X.balloon.row12);

    const flat = E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'FLAT', accrualMethod: 'MONTHLY_FLAT' }, NO_HOLIDAYS, LAK);
    assert.ok(flat.rows.every(x => x.interest === X.flatInterestPerInstallment && x.principal === '20000000'));
    assert.throws(() => E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'FLAT' }, NO_HOLIDAYS, LAK), /FLAT repayment needs accrual method/);

    const io = E.schedule.generateSchedule({ ...F.LOAN_A, graceType: 'INTEREST_ONLY', gracePeriods: 2, maxGracePeriods: 3 }, NO_HOLIDAYS, LAK);
    assert.deepStrictEqual([io.rows[0].principal, io.rows[0].interest], X.graceInterestOnly.row1);
    assert.deepStrictEqual([io.rows[2].principal, io.rows[2].interest], X.graceInterestOnly.row3);
    assert.deepStrictEqual([io.rows[11].principal, io.rows[11].interest], X.graceInterestOnly.row12);
    assert.strictEqual(io.totals.interest, X.graceInterestOnly.interest);
    assert.throws(() => E.schedule.generateSchedule({ ...F.LOAN_A, graceType: 'INTEREST_ONLY', gracePeriods: 4, maxGracePeriods: 3 }, NO_HOLIDAYS, LAK), /product maximum/);

    const full = E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'EQUAL_INSTALLMENT', graceType: 'FULL', gracePeriods: 1 }, NO_HOLIDAYS, LAK);
    assert.strictEqual(full.rows[0].capitalizedInterest, X.graceFull.capitalized);
    assert.strictEqual(full.rows[0].total, '0');
    assert.deepStrictEqual([full.rows[1].principal, full.rows[1].interest, full.rows[1].total], [...X.graceFull.row2, X.graceFull.payment]);
    assert.deepStrictEqual([full.rows[11].principal, full.rows[11].interest], X.graceFull.row12);
    assert.strictEqual(full.totals.principal, X.graceFull.principal);

    const broken = E.schedule.generateSchedule({ ...F.LOAN_A, valueDate: '2026-01-10', firstDueDate: '2026-02-25', firstPeriodMinDays: 15, firstPeriodMaxDays: 50 }, NO_HOLIDAYS, LAK);
    assert.strictEqual(broken.rows[0].interest, X.brokenFirstInterest);
    assert.strictEqual(broken.rows[1].dueDate, '2026-03-25');
    assert.throws(() => E.schedule.generateSchedule({ ...F.LOAN_A, valueDate: '2026-01-10', firstDueDate: '2026-02-25', firstPeriodMinDays: 15, firstPeriodMaxDays: 45 }, NO_HOLIDAYS, LAK), /First due date must be 15-45 days/);
  });

  await test('schedule: holiday roll moves only the payment date; interest stays on unadjusted periods', async () => {
    const cal = E.calendar.makeCalendar({ weekendDays: 'SAT,SUN' });
    const s = E.schedule.generateSchedule({ ...F.LOAN_A, valueDate: '2025-12-28', holidayHandling: 'NEXT_WORKING_DAY' }, cal, LAK);
    assert.deepStrictEqual([s.rows[1].originalDueDate, s.rows[1].dueDate], ['2026-02-28', '2026-03-02']);
    assert.deepStrictEqual(s.rows.map(r => r.interest), scheduleA.rows.map(r => r.interest));
  });

  await test('schedule properties: principal sums exactly, last balance 0, amounts at currency decimals (LAK and USD, many term sets)', async () => {
    const cases = [];
    for (const principal of ['1000000', '123456789', '999999999']) {
      for (const tenorMonths of [1, 7, 12, 36, 84]) {
        for (const annualRate of ['0.000000', '0.073500', '0.240000']) {
          for (const repaymentMethod of ['EQUAL_PRINCIPAL', 'EQUAL_INSTALLMENT', 'FLAT']) cases.push({ principal, tenorMonths, annualRate, repaymentMethod });
        }
      }
    }
    for (const c of cases) {
      for (const [rounder, principal] of [[LAK, c.principal], [USD, `${c.principal}.37`]]) {
        const s = E.schedule.generateSchedule({ ...F.LOAN_A, ...c, principal, accrualMethod: c.repaymentMethod === 'FLAT' ? 'MONTHLY_FLAT' : 'DAILY_OUTSTANDING' }, NO_HOLIDAYS, rounder);
        assert.strictEqual(N.cmp(s.totals.principal, principal), 0, `principal ${JSON.stringify(c)}`);
        assert.strictEqual(N.cmp(s.rows[s.rows.length - 1].closingBalance, 0), 0, 'closing balance');
        for (const r of s.rows) for (const k of ['principal', 'interest', 'total']) assert.ok(rounder.isRounded(r[k]) && !N.isNeg(r[k]), `${k} ${r[k]}`);
      }
    }
    const q = E.schedule.generateSchedule({ ...F.LOAN_A, frequency: F.QUARTERLY }, NO_HOLIDAYS, LAK);
    assert.strictEqual(q.rows.length, 4);
    assert.strictEqual(q.rows[0].interest, '10800000');
    assert.throws(() => E.schedule.generateSchedule({ ...F.LOAN_A, frequency: { code: 'WEEKLY', periodsPerYear: '52.000000' } }, NO_HOLIDAYS, LAK), /not month-based/);
  });

  await test('disbursement with fee and insurance -> Example 1 FEE_COLLECT and DISB tags; balanced', async () => {
    const fees = E.fees.upfrontFees({ loanAmount: '240000000', rounder: LAK, components: [
      { componentCode: 'PROCESSING_FEE', formulaCode: 'FIXED_CONTRACT_FEE', defaultValue: '1000000', timing: 'UPFRONT_COLLECTED' },
      { componentCode: 'DOCUMENTATION_FEE', formulaCode: 'FIXED_CONTRACT_FEE', defaultValue: '2000000', timing: 'UPFRONT_COLLECTED' },
      { componentCode: 'INTEREST', formulaCode: 'STANDARD_ANNUITY_INTEREST', defaultValue: '0.12', timing: 'INSTALLMENT' }
    ] });
    assert.strictEqual(fees.total, '3000000');
    const events = E.fees.disbursementEvents({ feeFinancingMode: 'UPFRONT', loanAmount: '240000000', fees: fees.total, insurancePremium: '7000000', rounder: LAK });
    assert.deepStrictEqual(tagsOf(events, 'FEE_COLLECT'), { TOTAL_PAID: '10000000', FEE_DOC: '3000000', INS_PREM: '7000000' });
    assert.deepStrictEqual(tagsOf(events, 'DISB'), { PRINCIPAL: '240000000' });
    assertBalanced(events);
    const pct = E.fees.upfrontFees({ loanAmount: '240000000', rounder: LAK, components: [{ componentCode: 'PROCESSING_FEE', formulaCode: 'UPFRONT_PCT', defaultValue: '0.0100', timing: 'UPFRONT_COLLECTED' }] });
    assert.strictEqual(pct.total, '2400000');
    const cap = E.fees.disbursementEvents({ feeFinancingMode: 'CAPITALIZED', loanAmount: '250000000', fees: '3000000', insurancePremium: '7000000', rounder: LAK });
    assert.deepStrictEqual(tagsOf(cap, 'DISB'), { PRINCIPAL: '240000000', FEE_DOC: '3000000', INS_PREM: '7000000' });
    assertBalanced(cap, { ...DEFAULT_PRODUCT, feeFinancingMode: 'CAPITALIZED' });
  });

  await test('due-date processing: ACCR 3,600,000 (Example 2); ACCR_SUSP when suspended; nothing when stopped or CASH; DAILY pro rata', async () => {
    const inst = scheduleA.rows[0];
    const accr = E.interest.dueDateProcessing({ installment: inst, recognition: 'DUE_DATE', interestTreatment: 'CONTINUE_ACCRUAL', rounder: LAK });
    assert.deepStrictEqual(accr, [{ event: 'ACCR', tags: { INT_ACCR: '3600000' } }]);
    assertBalanced(accr);
    assert.strictEqual(E.interest.dueDateProcessing({ installment: inst, recognition: 'DUE_DATE', interestTreatment: 'SUSPEND_ACCRUAL', rounder: LAK })[0].event, 'ACCR_SUSP');
    assert.deepStrictEqual(E.interest.dueDateProcessing({ installment: inst, recognition: 'DUE_DATE', interestTreatment: 'STOP_ACCRUAL', rounder: LAK }), []);
    assert.deepStrictEqual(E.interest.dueDateProcessing({ installment: inst, recognition: 'CASH', interestTreatment: 'CONTINUE_ACCRUAL', rounder: LAK }), []);
    const monthEnd = E.interest.accruedToDate({ installment: inst, periodStart: '2026-01-15', date: '2026-01-31', dayCount: F.DAY_30_360, rounder: LAK });
    assert.strictEqual(monthEnd, '1800000', '30E/360: 15 Jan -> 31 Jan is 15 of 30 days');
    const rest = E.interest.dueDateProcessing({ installment: inst, recognition: 'DAILY', interestTreatment: 'CONTINUE_ACCRUAL', alreadyRecognized: monthEnd, rounder: LAK });
    assert.strictEqual(N.cmp(N.add(rest[0].tags.INT_ACCR, monthEnd), '3600000'), 0, 'month-end accrual + due-date remainder = billed');
  });

  await test('payment on time -> Example 2 LIQD; 20 days late -> memo penalty 233,000 and Example 3 LIQD; balanced', async () => {
    const st = E.state.fromSchedule(scheduleA);
    const onTime = E.allocation.allocatePayment({ state: st, amount: '23600000', date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(onTime.events, [{ event: 'LIQD', tags: { TOTAL_PAID: '23600000', INT_PAID: '3600000', PRIN_PAID: '20000000' } }]);
    const lines = assertBalanced(onTime.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
    assert.deepStrictEqual(lineSet(lines), ['INT_PAID CR INTEREST_RECEIVABLE 3600000', 'PRIN_PAID CR LOAN_PORTFOLIO[NORMAL] 20000000', 'TOTAL_PAID DR CASH_BANK 23600000']);

    const st2 = E.allocation.applyAllocations(st, onTime.allocations);
    const penalty = E.interest.memoPenalty({ overdueAmount: scheduleA.rows[1].total, daysLate: 20, penaltyRate: '0.18', capPct: '0.20', graceDays: 3, daysInYear: 360, rounder: LAK });
    assert.strictEqual(penalty, '233000');
    assert.strictEqual(E.interest.memoPenalty({ overdueAmount: '23300000', daysLate: 3, penaltyRate: '0.18', capPct: '0.20', graceDays: 3, daysInYear: 360, rounder: LAK }), '0', 'within grace');
    assert.strictEqual(E.interest.memoPenalty({ overdueAmount: '1000', daysLate: 5000, penaltyRate: '0.18', capPct: '0.20', graceDays: 3, daysInYear: 360, rounder: LAK }), '200', 'capped');
    st2.installments[1].components.PENALTY = { due: penalty, paid: '0' };
    assert.strictEqual(E.state.dpd(st2, '2026-04-04'), 20);
    const late = E.allocation.allocatePayment({ state: st2, amount: '23533000', date: '2026-04-04', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(late.events, [{ event: 'LIQD', tags: { TOTAL_PAID: '23533000', PEN_CASH: '233000', INT_PAID: '3300000', PRIN_PAID: '20000000' } }]);
    assertBalanced(late.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
  });

  await test('allocation: partial payment, overpayment to advance, advance applied later, principal prepay option', async () => {
    const st = E.state.fromSchedule(scheduleA);
    const part = E.allocation.allocatePayment({ state: st, amount: '10000000', date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(part.events[0].tags, { TOTAL_PAID: '10000000', INT_PAID: '3600000', PRIN_PAID: '6400000' });
    const over = E.allocation.allocatePayment({ state: st, amount: '30000000', date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(over.events.map(e => e.event), ['LIQD', 'OVERPAY']);
    assert.strictEqual(over.events[1].tags.OVERPAY, '6400000');
    assert.strictEqual(over.advanceRemaining, '6400000');
    assertBalanced(over.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
    const st2 = { ...E.allocation.applyAllocations(st, over.allocations), advanceBalance: over.advanceRemaining };
    const applied = E.allocation.allocatePayment({ state: st2, amount: '0', useAdvance: true, date: '2026-03-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(applied.events, [{ event: 'LIQD', tags: { ADV_APPLIED: '6400000', INT_PAID: '3300000', PRIN_PAID: '3100000' } }]);
    assertBalanced(applied.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
    const prepay = E.allocation.allocatePayment({ state: st, amount: '30000000', date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'PRINCIPAL_PREPAY', rounder: LAK });
    assert.deepStrictEqual(prepay.events, [{ event: 'LIQD', tags: { TOTAL_PAID: '30000000', INT_PAID: '3600000', PRIN_PAID: '26400000' } }]);
    assert.strictEqual(prepay.partialPrepayment, '6400000');
    const notYetDue = E.allocation.allocatePayment({ state: st, amount: '5000000', date: '2026-02-01', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(notYetDue.events, [{ event: 'OVERPAY', tags: { OVERPAY: '5000000' } }], 'paid before the due date -> advance (DUE_DATE recognition)');
  });

  await test('allocation NPL: suspended interest is settled in cash through LIQD_SUSP; unbooked interest via INT_CASH; advance never pays suspended interest', async () => {
    const st = E.state.fromSchedule(scheduleA, { interestBucket: 'SUSPENDED', advanceBalance: '1000000' });
    const res = E.allocation.allocatePayment({ state: st, amount: '23600000', useAdvance: true, date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(tagsOf(res.events, 'LIQD_SUSP'), { SUSP_PAID: '3600000' });
    assert.deepStrictEqual(tagsOf(res.events, 'LIQD'), { TOTAL_PAID: '19000000', ADV_APPLIED: '1000000', PRIN_PAID: '20000000' });
    assert.deepStrictEqual(tagsOf(res.events, 'OVERPAY'), { OVERPAY: '1000000' });
    assertBalanced(res.events.map(e => ({ ...e, qualifiers: { CURRENT: 'SUBSTANDARD' } })));
    const cash = E.allocation.allocatePayment({ state: E.state.fromSchedule(scheduleA, { interestBucket: 'UNBOOKED' }), amount: '23600000', date: '2026-02-15', waterfall: F.WATERFALL, oldestInstallmentFirst: true, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: LAK });
    assert.deepStrictEqual(cash.events[0].tags, { TOTAL_PAID: '23600000', INT_CASH: '3600000', PRIN_PAID: '20000000' });
  });

  const loanDState = () => {
    const sched = E.schedule.generateSchedule(F.LOAN_D, NO_HOLIDAYS, LAK);
    const st = E.state.fromSchedule(sched);
    for (const inst of st.installments.slice(0, 4)) for (const c of ['PRINCIPAL', 'INTEREST']) inst.components[c].paid = inst.components[c].due;
    return { sched, st, date: E.dates.addDays(sched.rows[3].originalDueDate, 15) };
  };

  await test('prepayment Loan D (ACTUARIAL, 2% early fee) -> Example 4 PREPAY tags; VAT variant; balanced', async () => {
    const { sched, st, date } = loanDState();
    const q = E.prepayment.prepaymentQuote({ schedule: sched, state: st, date, rebateMethod: 'ACTUARIAL_PRO_RATA', annualRate: '0.18', dayCount: F.DAY_30_360, valueDate: F.LOAN_D.valueDate, earlyFeeRate: '0.02', rounder: LAK });
    assert.deepStrictEqual(q.events, [{ event: 'PREPAY', tags: { PAYOFF_CASH: '82200000', OUT_PRIN: '80000000', EARNED_INT: '600000', EARLY_FEE: '1600000', TRUE_UP: '600000' } }]);
    assertBalanced(q.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
    const vat = E.prepayment.prepaymentQuote({ schedule: sched, state: st, date, rebateMethod: 'ACTUARIAL_PRO_RATA', annualRate: '0.18', dayCount: F.DAY_30_360, valueDate: F.LOAN_D.valueDate, earlyFeeRate: '0.02', earlyFeeVat: { rate: '0.05', inclusive: false }, rounder: LAK });
    assert.strictEqual(vat.events[0].tags.VAT_OUT, '80000');
    assert.strictEqual(vat.events[0].tags.PAYOFF_CASH, '82280000');
    assertBalanced(vat.events.map(e => ({ ...e, qualifiers: { CURRENT: 'NORMAL' } })));
  });

  await test('prepayment rebate methods: RULE_OF_78 and NONE match the independent values; suspended interest split to LIQD_SUSP', async () => {
    const { sched, st, date } = loanDState();
    const args = { schedule: sched, state: st, date, annualRate: '0.18', dayCount: F.DAY_30_360, valueDate: F.LOAN_D.valueDate, rounder: LAK };
    assert.strictEqual(E.prepayment.prepaymentQuote({ ...args, rebateMethod: 'RULE_OF_78' }).events[0].tags.TRUE_UP, F.EXPECTED.rule78Unbilled);
    assert.strictEqual(E.prepayment.prepaymentQuote({ ...args, rebateMethod: 'NONE' }).events[0].tags.TRUE_UP, F.EXPECTED.noneUnbilled);
    const npl = E.state.fromSchedule(sched, { interestBucket: 'SUSPENDED' });
    const susp = E.prepayment.prepaymentQuote({ ...args, state: npl, date: '2026-03-20', rebateMethod: 'ACTUARIAL_PRO_RATA' });
    assert.ok(tagsOf(susp.events, 'LIQD_SUSP').SUSP_PAID, 'suspended interest settled through LIQD_SUSP');
    assertBalanced(susp.events.map(e => ({ ...e, qualifiers: { CURRENT: 'SUBSTANDARD' } })));
  });

  const statusInput = over => ({ movementRules: F.MOVEMENT_RULES, cureRules: F.CURE_RULES, statusMaster: F.STATUS_MASTER, rounder: LAK, ...over });

  await test('status Loan B: WATCH at DPD 61 -> SUBSTANDARD; STCH OUT_PRIN 150,000,000 + UNCOL_INT 6,000,000 = Example 5 lines', async () => {
    const res = E.status.evaluateStatus(statusInput({ currentStatus: 'WATCH', dpd: 61, outstandingPrincipal: '150000000', bookedUnpaidInterest: '6000000' }));
    assert.strictEqual(res.newStatus, 'SUBSTANDARD');
    assert.deepStrictEqual(res.events[0].tags, { OUT_PRIN: '150000000', UNCOL_INT: '6000000' });
    const lines = assertBalanced(res.events);
    assert.deepStrictEqual(lineSet(lines), [
      'OUT_PRIN CR LOAN_PORTFOLIO[WATCH] 150000000', 'OUT_PRIN DR LOAN_PORTFOLIO[SUBSTANDARD] 150000000',
      'UNCOL_INT CR SUSPENDED_INTEREST 6000000', 'UNCOL_INT DR INTEREST_INCOME 6000000'
    ]);
  });

  await test('status: performing move, NPL to LOSS (Loan C), cure rules, terminal statuses, and no upgrade without a cure rule', async () => {
    const watch = E.status.evaluateStatus(statusInput({ currentStatus: 'NORMAL', dpd: 31, outstandingPrincipal: '1000', bookedUnpaidInterest: '50' }));
    assert.deepStrictEqual([watch.newStatus, Object.keys(watch.events[0].tags)], ['WATCH', ['OUT_PRIN']]);
    const loss = E.status.evaluateStatus(statusInput({ currentStatus: 'DOUBTFUL', dpd: 181, outstandingPrincipal: '80000000' }));
    assert.deepStrictEqual([loss.newStatus, loss.events[0].tags], ['LOSS', { OUT_PRIN: '80000000' }]);
    assertBalanced(loss.events);
    const notYet = E.status.evaluateStatus(statusInput({ currentStatus: 'SUBSTANDARD', dpd: 0, onTimeStreak: 2, outstandingPrincipal: '100' }));
    assert.strictEqual(notYet.changed, false);
    const cured = E.status.evaluateStatus(statusInput({ currentStatus: 'SUBSTANDARD', dpd: 0, onTimeStreak: 3, outstandingPrincipal: '100000', suspendedInterest: '4000' }));
    assert.deepStrictEqual([cured.newStatus, cured.events[0].event, cured.events[0].tags], ['NORMAL', 'STCH_CURE', { OUT_PRIN: '100000', SUSP_REV: '4000' }]);
    assertBalanced(cured.events);
    assert.strictEqual(E.status.evaluateStatus(statusInput({ currentStatus: 'WATCH', dpd: 0, outstandingPrincipal: '10' })).newStatus, 'NORMAL');
    assert.strictEqual(E.status.evaluateStatus(statusInput({ currentStatus: 'WATCH', dpd: 0, cureRules: [], outstandingPrincipal: '10' })).changed, false);
    assert.strictEqual(E.status.evaluateStatus(statusInput({ currentStatus: 'WRITTEN_OFF', dpd: 400 })).changed, false);
  });

  await test('provision: Loan B CLASS_C 20% -> 30,000,000; with collateral and haircut; write-back; Loan C LOSS top-up; balanced', async () => {
    const C = { provisionRate: '0.200000', collateralHaircutPct: '0.300000', provisionBase: 'NET_EXPOSURE' };
    const b = E.provision.calculateProvision({ outstandingPrincipal: '150000000', rule: C, rounder: LAK });
    assert.deepStrictEqual([b.required, b.events], ['30000000', [{ event: 'PROVISION', tags: { PROV_EXP: '30000000' } }]]);
    const coll = E.provision.calculateProvision({ outstandingPrincipal: '150000000', collateralValue: '125000000', rule: C, booked: '30000000', rounder: LAK });
    assert.deepStrictEqual([coll.netExposure, coll.required, coll.events], ['62500000', '12500000', [{ event: 'PROV_WB', tags: { PROV_WB: '17500000' } }]]);
    const lossRule = { provisionRate: '1.000000', collateralHaircutPct: '0.300000', provisionBase: 'NET_EXPOSURE' };
    const c = E.provision.calculateProvision({ outstandingPrincipal: '80000000', rule: lossRule, booked: '60000000', rounder: LAK });
    assert.deepStrictEqual(c.events, [{ event: 'PROVISION', tags: { PROV_EXP: '20000000' } }]);
    assertBalanced([...b.events, ...coll.events, ...c.events]);
  });

  await test('partial prepayment regeneration (REDUCE_INSTALLMENT / REDUCE_TENOR) matches the independent values; FLAT refused', async () => {
    const ann = E.schedule.generateSchedule({ ...F.LOAN_A, repaymentMethod: 'EQUAL_INSTALLMENT' }, NO_HOLIDAYS, LAK);
    const future = ann.rows.slice(2);
    const base = { rows: future, prevDate: ann.rows[1].originalDueDate, outstandingBefore: '202917556', prepaid: '50000000', date: E.dates.addDays(ann.rows[1].originalDueDate, 10),
      annualRate: '0.18', dayCount: F.DAY_30_360, frequency: F.MONTHLY, repaymentMethod: 'EQUAL_INSTALLMENT', holidayHandling: 'EXACT_DATE' };
    const ri = E.schedule.regenerateAfterPrepayment({ ...base, option: 'REDUCE_INSTALLMENT' }, NO_HOLIDAYS, LAK);
    assert.deepStrictEqual([ri.rows.length, ri.rows[0].principal, ri.rows[0].interest, ri.rows[1].total], [10, '14037726', '2543763', '16581489']);
    assert.deepStrictEqual([ri.rows[9].principal, ri.rows[9].interest], ['16618070', '249271']);
    assert.strictEqual(N.toDecimal(N.sum(ri.rows.map(r => r.principal)), 0), '152917556');
    assert.strictEqual(ri.rows[0].no, 3);
    const rt = E.schedule.regenerateAfterPrepayment({ ...base, option: 'REDUCE_TENOR' }, NO_HOLIDAYS, LAK);
    assert.deepStrictEqual([rt.rows.length, rt.removedInstallments, rt.rows[0].principal, rt.rows[7].principal, rt.rows[7].interest], [8, 2, '19459435', '8858841', '132883']);
    assert.strictEqual(rt.rows[7].closingBalance, '0');
    const ep = E.schedule.generateSchedule(F.LOAN_A, NO_HOLIDAYS, LAK);
    const epBase = { ...base, rows: ep.rows.slice(2), prevDate: ep.rows[1].originalDueDate, outstandingBefore: '200000000', repaymentMethod: 'EQUAL_PRINCIPAL' };
    const epRi = E.schedule.regenerateAfterPrepayment({ ...epBase, option: 'REDUCE_INSTALLMENT' }, NO_HOLIDAYS, LAK);
    assert.deepStrictEqual([epRi.rows.length, epRi.rows[0].principal, epRi.rows[0].interest], [10, '15000000', '2500000']);
    const epRt = E.schedule.regenerateAfterPrepayment({ ...epBase, option: 'REDUCE_TENOR' }, NO_HOLIDAYS, LAK);
    assert.deepStrictEqual([epRt.rows.length, epRt.rows[7].principal], [8, '10000000']);
    assert.throws(() => E.schedule.regenerateAfterPrepayment({ ...base, repaymentMethod: 'FLAT', option: 'REDUCE_INSTALLMENT' }, NO_HOLIDAYS, LAK), /FLAT/);
    assert.throws(() => E.schedule.regenerateAfterPrepayment({ ...base, prepaid: '202917556', option: 'REDUCE_INSTALLMENT' }, NO_HOLIDAYS, LAK), /use PREPAY/);
  });

  await test('event builders: write-off (Example 6), repossession and resale (Example 5), fee refund (Example 8), waivers, remittance, advance refund; balanced', async () => {
    const wo = E.events.writeOffEvents({ outstandingPrincipal: '80000000', reserve: '60000000', suspendedInterest: '6000000', rounder: LAK });
    assert.deepStrictEqual(wo, [{ event: 'WRITE_OFF', tags: { PRIN_WO: '60000000', SHORTFALL: '20000000', SUSP_CLR: '6000000', MEMO_WO: '86000000' } }]);
    assertBalanced(wo.map(e => ({ ...e, qualifiers: { CURRENT: 'LOSS' } })));
    assert.deepStrictEqual(E.events.recoveryEvents({ amount: '10000000', memoBalance: '86000000', rounder: LAK }), [{ event: 'RECOVERY', tags: { REC_AMT: '10000000' } }]);
    assert.throws(() => E.events.recoveryEvents({ amount: '90000000', memoBalance: '86000000', rounder: LAK }), /exceeds the written-off memo/);
    const rep = E.events.repossessEvents({ outstandingPrincipal: '150000000', appraised: '125000000', reserve: '30000000', suspendedInterest: '9000000', rounder: LAK });
    assert.deepStrictEqual(rep.events, [
      { event: 'REPOSSESS', tags: { APPRAISED: '125000000', RESERVE_ABS: '25000000', OUT_PRIN: '150000000', SUSP_CLR: '9000000' } },
      { event: 'PROV_WB', tags: { PROV_WB: '5000000' } }
    ]);
    assertBalanced(rep.events.map(e => ({ ...e, qualifiers: { CURRENT: 'SUBSTANDARD' } })));
    const disp = E.events.disposeEvents({ salePrice: '118000000', carrying: rep.carrying, rounder: LAK });
    assert.deepStrictEqual(disp, [{ event: 'VEH_DISPOSE', tags: { SALE_PRICE: '118000000', CARRYING: '125000000', LOSS: '7000000' } }]);
    assertBalanced(disp);
    const gain = E.events.disposeEvents({ salePrice: '130000000', carrying: '125000000', vat: { rate: '0.05', inclusive: true }, rounder: LAK });
    assert.deepStrictEqual(gain[0].tags, { SALE_PRICE: '130000000', CARRYING: '125000000', VAT_OUT: '6190476', LOSS: '1190476' }, 'inclusive 5%: net 123,809,524 below carrying');
    assertBalanced(gain);
    const refund = E.events.feeRefundEvents({ collectTags: { TOTAL_PAID: '10000000', FEE_DOC: '3000000', INS_PREM: '7000000' }, rounder: LAK });
    assert.deepStrictEqual(refund, [{ event: 'FEE_REFUND', tags: { FEE_DOC: '3000000', INS_PREM: '7000000', REFUND_AMT: '10000000' } }]);
    assertBalanced(refund);
    const iw = E.events.waiveEvents({ kind: 'INTEREST', allocations: [{ amount: '1000', bucket: 'BOOKED' }, { amount: '500', bucket: 'SUSPENDED' }, { amount: '200', bucket: 'UNBOOKED' }], rounder: LAK });
    assert.deepStrictEqual(iw, [{ event: 'INT_WAIVE', tags: { INT_WAIVE: '1000', INT_WAIVE_SUSP: '500' } }]);
    assertBalanced(iw);
    assert.deepStrictEqual(E.events.waiveEvents({ kind: 'PENALTY', allocations: [{ amount: '233000' }], rounder: LAK }), [], 'memo penalty waiver posts nothing');
    assertBalanced(E.events.insRemitEvents({ amount: '7000000', payable: '7000000', rounder: LAK }));
    assert.throws(() => E.events.insRemitEvents({ amount: '8000000', payable: '7000000', rounder: LAK }), /exceeds the insurance payable/);
    assertBalanced(E.events.advRefundEvents({ amount: '6400000', advanceBalance: '6400000', rounder: LAK }));
  });

  await test('snapshot freezes product terms and schedule, not the live DPD/provision rules', async () => {
    const snap = E.snapshot.buildSnapshot({
      product: { id: 1, productCode: 'CAR-LOAN-DB', version: 1, feeFinancingMode: 'UPFRONT', earlySettlementRebateMethod: 'RULE_OF_78', dayCountCode: '30_360' },
      components: [], udes: [], waterfall: [], rateTiers: [], dayCount: F.DAY_30_360, frequency: F.MONTHLY, currencyRule: F.LAK,
      terms: F.LOAN_A, schedule: scheduleA, frozenAt: '2026-10-29T00:00:00.000Z'
    });
    assert.strictEqual(snap.product.earlySettlementRebateMethod, 'RULE_OF_78');
    assert.strictEqual(snap.schedule.rows.length, 12);
    assert.ok(!('movementRules' in snap) && !('provisionRules' in snap));
  });

  // ---------------------------------------------------------------- Phase 5 multi-currency (addendum §8.8)
  const FX = require('../../src/loan/accounting/fx');
  const USD_ID = 5;
  const THB_ID = 6;
  const LAK_ID = 1;
  const usdSchedule = E.schedule.generateSchedule({ ...F.LOAN_A, principal: '12000', repaymentMethod: 'EQUAL_INSTALLMENT' }, NO_HOLIDAYS, USD);
  const journalFor = (event, tags, currency, qualifiers = { CURRENT: 'NORMAL' }) => buildJournal({ rules: rulesFor(DEFAULT_PRODUCT), eventCode: event, tags, qualifiers, currency });
  const bucketMap = (entries) => new Map(entries.map(([key, amount, base]) => [key, { amount: toUnits4(amount), base: toUnits4(base) }]));
  const toUnits4 = v => require('../../src/loan/accounting/journal').toUnits(String(v).replace('-', '')) * (String(v).startsWith('-') ? -1n : 1n);
  const fxOpts = (rate, buckets, loanCurrencyId = USD_ID) => ({ rate, loanCurrencyId, baseCurrencyId: LAK_ID, baseDecimals: 0, buckets, maxRoundDiff: 1 });
  const show = lines => lines.map(l => `${l.drCr} ${l.roleCode}${l.qualifier ? `[${l.qualifier}]` : ''} ${l.amountTag} ${l.isBaseOnly ? '-' : N.toDecimal(l.amount, 2)} ${N.roundHalfUp(l.baseAmount, 0)}`).sort();
  const baseBalanced = (lines) => {
    const sum = side => lines.filter(l => l.drCr === side).reduce((s, l) => s + toUnits4(l.baseAmount), 0n);
    assert.strictEqual(sum('DR'), sum('CR'), 'base balances');
  };

  await test('fx: the USD fixtures use the engine schedule (12,000 USD, 18%, 12 months, annuity): 1,100.16 x 11 + 1,100.19; installment 1 = 920.16 + 180.00', async () => {
    const rows = usdSchedule.rows;
    assert.deepStrictEqual([rows[0].principal, rows[0].interest, rows[0].total], ['920.16', '180.00', '1100.16']);
    assert.deepStrictEqual([rows[1].principal, rows[1].interest], ['933.96', '166.20']);
    assert.deepStrictEqual([rows[11].principal, rows[11].interest, rows[11].total], ['1083.93', '16.26', '1100.19']);
    assert.ok(rows.slice(0, 11).every(r => r.total === '1100.16'));
  });

  await test('fx: rate normalization from the POS directions; toBase rounds half-up to the base decimals; implied-rate deviation', async () => {
    assert.strictEqual(FX.rateString(FX.normalizePosRate(21200, 'foreign_to_local')), '21200.00000000');
    assert.strictEqual(FX.rateString(FX.normalizePosRate('0.00004717', 'local_to_foreign')), '21199.91520034');
    assert.strictEqual(FX.toBase(toUnits4('301747.5') / 670n * 0n + toUnits4('450.00'), FX.rateUnits('670.55'), 0), toUnits4('301748'));
    assert.strictEqual(FX.toBase(toUnits4('5250.05'), FX.rateUnits('670.55'), 0), toUnits4('3520421'));
    const implied = FX.impliedRate(toUnits4('252000000'), toUnits4('11500.00'));
    assert.strictEqual(FX.rateString(implied), '21913.04347826');
    assert.strictEqual(FX.pctString(FX.deviationPct(implied, FX.rateUnits('21000'))), '4.3478');
    assert.strictEqual(FX.pctString(FX.deviationPct(FX.rateUnits('21000'), FX.rateUnits('21150'))), '0.7092');
  });

  await test('fx X1/X2: USD 12,000 loan settles the LAK invoice (252,000,000) through CCY_POSITION; table rate not used; no FX at DISB', async () => {
    const lines = journalFor('DISB', { PRINCIPAL: '12000.0000' }, USD_ID);
    const settled = FX.carryOverSettlement(lines, { loanCurrencyId: USD_ID, invoiceCurrencyId: LAK_ID, baseCurrencyId: LAK_ID, carryBaseUnits: toUnits4('252000000') });
    const out = FX.applyBase(settled, fxOpts('21150', new Map()));
    assert.deepStrictEqual(show(out.lines), [
      'CR CCY_POSITION PRINCIPAL 12000.00 252000000',
      'CR SALE_RECEIVABLE PRINCIPAL 252000000.00 252000000',
      'DR CCY_POSITION PRINCIPAL 252000000.00 252000000',
      'DR LOAN_PORTFOLIO[NORMAL] PRINCIPAL 12000.00 252000000'
    ].sort());
    assert.strictEqual(out.fx.length, 0);
    assert.strictEqual(out.roundDiff, 0n);
    baseBalanced(out.lines);
    const pos = out.lines.filter(l => l.roleCode === 'CCY_POSITION').reduce((s, l) => s + (l.drCr === 'DR' ? 1n : -1n) * toUnits4(l.baseAmount), 0n);
    assert.strictEqual(pos, 0n, 'CCY_POSITION nets to zero in base');
    const p = out.buckets.get('LOAN_PORTFOLIO|NORMAL');
    assert.deepStrictEqual([p.amount, p.base], [toUnits4('12000'), toUnits4('252000000')]);
  });

  await test('fx U2: installment 1 (920.16 + 180.00) paid at 21,500 -> realized gains 460,080 (principal) and 9,000 (interest)', async () => {
    const buckets = bucketMap([['LOAN_PORTFOLIO|NORMAL', '12000', '252000000'], ['INTEREST_RECEIVABLE|', '180', '3861000']]);
    const lines = journalFor('LIQD', { TOTAL_PAID: '1100.1600', PRIN_PAID: '920.1600', INT_PAID: '180.0000' }, USD_ID);
    const out = FX.applyBase(lines, fxOpts('21500', buckets));
    assert.deepStrictEqual(show(out.lines), [
      'CR FX_GAIN_REALIZED FX_DIFF - 460080',
      'CR FX_GAIN_REALIZED FX_DIFF - 9000',
      'CR INTEREST_RECEIVABLE INT_PAID 180.00 3861000',
      'CR LOAN_PORTFOLIO[NORMAL] PRIN_PAID 920.16 19323360',
      'DR CASH_BANK TOTAL_PAID 1100.16 23653440'
    ].sort());
    baseBalanced(out.lines);
    const p = out.buckets.get('LOAN_PORTFOLIO|NORMAL');
    assert.deepStrictEqual([p.amount, p.base], [toUnits4('11079.84'), toUnits4('232676640')]);
    assert.deepStrictEqual([out.buckets.get('INTEREST_RECEIVABLE|').amount, out.buckets.get('INTEREST_RECEIVABLE|').base], [0n, 0n], 'closed bucket has no base residue');
  });

  await test('fx U3: partial prepayment 2,000.00 at 20,900 -> realized loss 200,000; bucket 9,079.84 / 190,676,640', async () => {
    const buckets = bucketMap([['LOAN_PORTFOLIO|NORMAL', '11079.84', '232676640']]);
    const out = FX.applyBase(journalFor('LIQD', { TOTAL_PAID: '2000.0000', PRIN_PAID: '2000.0000' }, USD_ID), fxOpts('20900', buckets));
    assert.deepStrictEqual(show(out.lines), ['CR LOAN_PORTFOLIO[NORMAL] PRIN_PAID 2000.00 42000000', 'DR CASH_BANK TOTAL_PAID 2000.00 41800000', 'DR FX_LOSS_REALIZED FX_DIFF - 200000'].sort());
    baseBalanced(out.lines);
    assert.strictEqual(out.buckets.get('LOAN_PORTFOLIO|NORMAL').base, toUnits4('190676640'));
  });

  await test('fx T1: THB fee collect at 670.55 -> 1 kip base residue to ROUND_DIFF; a residue above the cap is refused', async () => {
    const lines = journalFor('FEE_COLLECT', { TOTAL_PAID: '5250.0500', FEE_DOC: '4500.0000', VAT_OUT: '450.0000', INS_PREM: '300.0500' }, THB_ID);
    const out = FX.applyBase(lines, fxOpts('670.55', new Map(), THB_ID));
    assert.deepStrictEqual(show(out.lines), [
      'CR FEE_INCOME FEE_DOC 4500.00 3017475', 'CR INSURANCE_PAYABLE INS_PREM 300.05 201199', 'CR TAX_PAYABLE VAT_OUT 450.00 301748',
      'DR CASH_BANK TOTAL_PAID 5250.05 3520421', 'DR ROUNDING_DIFF ROUND_DIFF - 1'
    ].sort());
    baseBalanced(out.lines);
    assert.throws(() => FX.applyBase(lines, { ...fxOpts('670.55', new Map(), THB_ID), maxRoundDiff: 0 }), /exceeds the cap/);
  });

  await test('fx T2: THB late payment at 671.35 with memo penalty 125.48 (PEN_CASH income, no FX) -> gains 33,750 and 14,175', async () => {
    const buckets = bucketMap([['LOAN_PORTFOLIO|NORMAL', '300000', '201000000'], ['INTEREST_RECEIVABLE|', '4500', '3006900']]);
    const out = FX.applyBase(journalFor('LIQD', { TOTAL_PAID: '29625.4800', PRIN_PAID: '25000.0000', INT_PAID: '4500.0000', PEN_CASH: '125.4800' }, THB_ID), fxOpts('671.35', buckets, THB_ID));
    assert.deepStrictEqual(show(out.lines), [
      'CR FX_GAIN_REALIZED FX_DIFF - 14175', 'CR FX_GAIN_REALIZED FX_DIFF - 33750', 'CR INTEREST_RECEIVABLE INT_PAID 4500.00 3006900',
      'CR LOAN_PORTFOLIO[NORMAL] PRIN_PAID 25000.00 16750000', 'CR PENALTY_INCOME PEN_CASH 125.48 84241', 'DR CASH_BANK TOTAL_PAID 29625.48 19889066'
    ].sort());
    baseBalanced(out.lines);
  });

  await test('fx T3/T4: month-end revaluation at 665.00 (carry forward) then payment at 668.00 -> gain 75,000; without revaluation -> loss 50,000; same total', async () => {
    const buckets = bucketMap([['LOAN_PORTFOLIO|NORMAL', '275000', '184250000']]);
    const reval = FX.revaluationLines({ buckets, rate: '665.00', baseDecimals: 0, loanCurrencyId: THB_ID });
    assert.deepStrictEqual(show(reval), ['CR LOAN_PORTFOLIO[NORMAL] FX_REVAL - 1375000', 'DR FX_LOSS_UNREALIZED FX_REVAL - 1375000'].sort());
    const after = FX.bucketsFromLegs([...[...buckets].map(([k, b]) => ({ roleCode: k.split('|')[0], qualifier: k.split('|')[1], drCr: 'DR', amount: N.toDecimal(require('../../src/loan/accounting/journal').fromUnits(b.amount), 4), baseAmount: require('../../src/loan/accounting/journal').fromUnits(b.base) })), ...reval]);
    assert.strictEqual(after.get('LOAN_PORTFOLIO|NORMAL').base, toUnits4('182875000'));
    const pay = journalFor('LIQD', { TOTAL_PAID: '25000.0000', PRIN_PAID: '25000.0000' }, THB_ID);
    const on = FX.applyBase(pay, fxOpts('668.00', after, THB_ID));
    const off = FX.applyBase(pay, fxOpts('668.00', buckets, THB_ID));
    assert.deepStrictEqual(show(on.lines.filter(l => l.isBaseOnly)), ['CR FX_GAIN_REALIZED FX_DIFF - 75000']);
    assert.deepStrictEqual(show(off.lines.filter(l => l.isBaseOnly)), ['DR FX_LOSS_REALIZED FX_DIFF - 50000']);
    assert.strictEqual(-1375000n * 25000n / 275000n + 75000n, -50000n, 'revaluation changes only when FX is recognized');
  });

  await test('fx: status change moves the carrying base between qualifiers without FX; a relief that empties a bucket leaves no residue', async () => {
    const buckets = bucketMap([['LOAN_PORTFOLIO|NORMAL', '1000.01', '21000213']]);
    const stch = journalFor('STCH', { OUT_PRIN: '1000.0100' }, USD_ID, { NEW: 'SUBSTANDARD', PREVIOUS: 'NORMAL' });
    const out = FX.applyBase(stch, fxOpts('25000', buckets));
    assert.strictEqual(out.fx.length, 0);
    assert.deepStrictEqual([out.buckets.get('LOAN_PORTFOLIO|NORMAL').amount, out.buckets.get('LOAN_PORTFOLIO|NORMAL').base], [0n, 0n]);
    assert.strictEqual(out.buckets.get('LOAN_PORTFOLIO|SUBSTANDARD').base, toUnits4('21000213'));
  });
};

module.exports = { run };

if (require.main === module) {
  const results = [];
  const test = async (name, fn) => {
    try { await fn(); results.push(true); console.log(`  PASS  ${name}`); } catch (err) { results.push(false); console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`); }
  };
  run(test).then(() => {
    const failed = results.filter(r => !r).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
}
