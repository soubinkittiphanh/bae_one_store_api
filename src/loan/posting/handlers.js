/**
 * One handler per loan transaction kind. A handler computes the engine events (amount tags) from the
 * account state and records its subledger changes through `effects` (undone by REVERSAL). The
 * transaction service then validates and posts the journal, the GL pairs and the POS bank / AR rows,
 * all in the same DB transaction.
 *
 * run(ctx, input, effects, tools) -> { eventCode, events, amount, settlesInvoice?, after? }
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const { toUnits, fromUnits } = require('../accounting/journal');
const { findOneExact, findAllExact } = require('../db/exact');
const { getVatRate } = require('../services/taxRateService');
const loanCtx = require('../services/loanContext');
const S = require('./accountState');

const N = E.num;
const fail = (msg, status = 400) => { throw new LoanError(status, msg); };
const money = (v, label) => { if (!/^\d{1,16}(\.\d{1,4})?$/.test(String(v || ''))) fail(`${label} must be a positive decimal`); return String(v); };
const qualifierOf = (ctx, status) => (ctx.live.statusMaster[status] || {}).glQualifier;
const treatmentOf = (ctx, status) => (ctx.live.statusMaster[status] || {}).interestTreatment;
const ude = (ctx, code) => loanCtx.udeValue(ctx.snapshot.udes, code);
const sumBy = (rows, f) => rows.reduce((s, r) => s + f(r), 0n);

const requireStage = (ctx, stages, kind) => {
  if (!stages.includes(ctx.account.accountStage)) fail(`${kind} needs an account in stage ${stages.join(' or ')} (this one is ${ctx.account.accountStage})`, 409);
};
const requireLive = (ctx, kind) => {
  if (['WRITTEN_OFF', 'REPOSSESSED', 'CLOSED'].includes(ctx.account.status)) fail(`${kind} is not possible on a ${ctx.account.status} account`, 409);
};

// Interest due on or before the date that is not recognized yet: ACCR / ACCR_SUSP now, or UNBOOKED
const recognizeDue = async (ctx, sched, date, effects) => {
  const treatment = treatmentOf(ctx, ctx.account.status);
  const recognition = ctx.product.interestRecognitionCode;
  const totals = { ACCR: 0n, ACCR_SUSP: 0n };
  for (const s of sched.schedules.filter(x => String(x.dueDate) <= date)) {
    const c = sched.comps.find(x => x.scheduleId === s.id && x.componentId === ctx.idOf.INTEREST);
    if (!c || c.bucket) continue;
    const toBook = S.net(c) - toUnits(c.amountRecognized);
    if (recognition === 'CASH' || treatment === 'STOP_ACCRUAL') { await effects.set('lnScheduleComponent', c, 'bucket', 'UNBOOKED'); continue; }
    const event = treatment === 'SUSPEND_ACCRUAL' ? 'ACCR_SUSP' : 'ACCR';
    totals[event] += toBook;
    await effects.set('lnScheduleComponent', c, 'bucket', event === 'ACCR' ? 'BOOKED' : 'SUSPENDED');
    await effects.delta('lnScheduleComponent', c, 'amountRecognized', toBook);
  }
  return Object.entries(totals).filter(([, u]) => u > 0n).map(([event, u]) => ({ event, tags: { INT_ACCR: fromUnits(u) } }));
};

// Memo penalty (decision D9) on every overdue installment, as of the date; no GL under MEMO_ONLY
const updatePenalties = async (ctx, sched, date, effects) => {
  if (!ude(ctx, 'PENALTY_RATE')) return;
  for (const s of sched.schedules) {
    const late = E.dates.daysBetween(String(s.dueDate), date);
    if (late <= 0) continue;
    const mine = sched.comps.filter(c => c.scheduleId === s.id && c.componentId !== ctx.idOf.PENALTY);
    const open = sumBy(mine, S.outstanding);
    if (open <= 0n) continue;
    const amount = E.interest.memoPenalty({ overdueAmount: fromUnits(open), daysLate: late, penaltyRate: ude(ctx, 'PENALTY_RATE'), capPct: ude(ctx, 'PENALTY_CAP_PCT'), graceDays: ude(ctx, 'GRACE_DAYS') || 0, daysInYear: ctx.snapshot.dayCount.daysInYear, rounder: ctx.rounder });
    const existing = sched.comps.find(c => c.scheduleId === s.id && c.componentId === ctx.idOf.PENALTY);
    const target = toUnits(amount) + (existing ? toUnits(existing.amountPaid) + toUnits(existing.amountWaived) : 0n);
    if (existing) {
      if (toUnits(existing.amountDue) < target) await effects.set('lnScheduleComponent', existing, 'amountDue', fromUnits(target));
    } else if (toUnits(amount) > 0n) {
      const row = await effects.create('lnScheduleComponent', { scheduleId: s.id, componentId: ctx.idOf.PENALTY, amountDue: amount, amountPaid: 0, amountWaived: 0, status: 'UNPAID', bucket: 'UNBOOKED' });
      sched.comps.push((await findOneExact(db.lnScheduleComponent, { where: { id: row.id }, transaction: effects.transaction })));
    }
  }
};

// Applies engine allocations to the schedule components, writes ln_transaction_allocation, marks paid rows
const applyAllocations = async (ctx, sched, allocations, txnId, effects) => {
  for (const a of allocations) {
    const s = sched.schedules.find(x => x.installmentNo === a.installmentNo);
    const c = sched.comps.find(x => x.scheduleId === s.id && x.componentId === ctx.idOf[a.componentCode]);
    if (!c) fail(`No ${a.componentCode} component on installment ${a.installmentNo}`, 500);
    await effects.delta('lnScheduleComponent', c, 'amountPaid', toUnits(a.amount));
    await effects.create('lnTransactionAllocation', { transactionId: txnId, scheduleComponentId: c.id, componentId: c.componentId, allocatedAmount: a.amount });
  }
  for (const s of sched.schedules) {
    const mine = sched.comps.filter(c => c.scheduleId === s.id);
    const open = sumBy(mine, S.outstanding);
    const status = open === 0n ? 'PAID' : (sumBy(mine, c => toUnits(c.amountPaid)) > 0n ? 'PARTIAL' : 'UNPAID');
    if (status !== s.status) await effects.set('lnSchedule', s, 'status', status);
  }
};

const setStatus = async (ctx, newStatus, date, reason, effects) => {
  const from = ctx.account.status;
  if (from === newStatus) return;
  await effects.set('lnAccount', ctx.account, 'status', newStatus);
  const cls = (ctx.live.statusMaster[newStatus] || {}).regulatoryClassCode;
  if (cls) await effects.set('lnAccount', ctx.account, 'regulatoryClass', cls);
  await effects.set('lnAccount', ctx.account, 'statusSince', date);
  await effects.create('lnStatusHistory', { loanAccountId: ctx.account.id, oldStatus: from, newStatus, changeReason: reason, triggeredBy: 'TRANSACTION', effectiveDate: date });
};

const latestReserve = async (ctx, transaction) => {
  const row = await findOneExact(db.lnProvisionLedger, { where: { loanAccountId: ctx.account.id }, order: [['evaluationDate', 'DESC'], ['id', 'DESC']], transaction });
  return row ? row.bookedProvision : '0';
};

// Open balances for terminal events (write-off, repossession): principal, and recognized interest by bucket
const balances = (ctx, sched) => {
  const open = pred => fromUnits(sumBy(sched.comps.filter(pred), S.outstanding));
  return {
    principal: open(c => c.componentId === ctx.idOf.PRINCIPAL),
    suspended: open(c => c.componentId === ctx.idOf.INTEREST && c.bucket === 'SUSPENDED'),
    booked: open(c => c.componentId === ctx.idOf.INTEREST && c.bucket === 'BOOKED')
  };
};

// Close every open component (written off / repossessed / prepaid) through amountWaived or amountPaid
const closeComponents = async (ctx, sched, field, effects, rowStatus) => {
  for (const c of sched.comps) {
    const open = S.outstanding(c);
    if (open > 0n) await effects.delta('lnScheduleComponent', c, field, open);
  }
  for (const s of sched.schedules) if (s.status !== rowStatus) await effects.set('lnSchedule', s, 'status', rowStatus);
};

const vatFor = async (ctx, componentCode, date, transaction) => {
  const profile = await db.lnTaxProfile.findOne({ transaction });
  const comp = ctx.componentRows.find(c => c.componentCode === componentCode);
  if (!profile || !profile.companyVatRegistered || !comp || !comp.isTaxable) return null;
  const vat = await getVatRate(date, transaction);
  return { rate: vat.rate, inclusive: Boolean(comp.taxInclusive) };
};

const handlers = {
  async FEE_COLLECT(ctx, input, effects, { dates, transaction, txn }) {
    requireStage(ctx, ['BOOKED'], 'FEE_COLLECT');
    if (ctx.product.feeFinancingMode !== 'UPFRONT') fail(`Fees are ${ctx.product.feeFinancingMode}; they are posted with the disbursement`, 409);
    const collected = await db.lnTransaction.count({ where: { loanAccountId: ctx.account.id, eventCode: 'FEE_COLLECT', postingStatus: 'POSTED', isReversed: false, id: { [db.Sequelize.Op.ne]: txn.id } }, transaction });
    if (collected) fail('Fees were already collected for this account', 409);
    const fees = E.fees.upfrontFees({ loanAmount: String(ctx.account.sanctionedAmount), components: ctx.snapshot.components, rounder: ctx.rounder });
    let feeNet = 0n;
    let vat = 0n;
    for (const line of fees.lines) {
      const v = await vatFor(ctx, line.componentCode, dates.valueDate, transaction);
      let amount = toUnits(line.amount);
      if (v) {
        const rate = N.of(v.rate);
        const tax = toUnits(ctx.rounder.round(v.inclusive ? N.div(N.mul(line.amount, rate), N.add(1, rate)) : N.mul(line.amount, rate)));
        if (v.inclusive) amount -= tax;
        vat += tax;
      }
      feeNet += amount;
    }
    const insurance = toUnits(input.insurancePremium ? money(input.insurancePremium, 'insurancePremium') : '0');
    const total = feeNet + vat + insurance;
    if (total === 0n) fail('Nothing to collect: no upfront fees and no insurance premium', 409);
    const tags = E.prepayment.clean({ TOTAL_PAID: fromUnits(total), FEE_DOC: fromUnits(feeNet), INS_PREM: fromUnits(insurance), VAT_OUT: fromUnits(vat) }, ctx.rounder);
    return { eventCode: 'FEE_COLLECT', events: [{ event: 'FEE_COLLECT', tags }], amount: fromUnits(total) };
  },

  async FEE_REFUND(ctx, input, effects, { transaction }) {
    requireStage(ctx, ['BOOKED'], 'FEE_REFUND');
    const collect = await db.lnTransaction.findOne({ where: { loanAccountId: ctx.account.id, eventCode: 'FEE_COLLECT', postingStatus: 'POSTED', isReversed: false }, transaction });
    if (!collect) fail('No posted FEE_COLLECT to refund', 409);
    const collectTags = (JSON.parse(collect.eventsJson).find(e => e.event === 'FEE_COLLECT') || {}).tags;
    const events = E.events.feeRefundEvents({ collectTags, rounder: ctx.rounder });
    if (collectTags.INS_PREM) {
      const payable = await insurancePayable(ctx, transaction);
      if (N.cmp(payable, collectTags.INS_PREM) < 0) fail('The premium was already remitted to the insurer; refund it from the insurer first', 409);
    }
    await effects.set('lnAccount', ctx.account, 'accountStage', 'CANCELLED');
    return { eventCode: 'FEE_REFUND', events, amount: collectTags.TOTAL_PAID };
  },

  async DISB(ctx, input, effects, { dates, transaction, ctxUser }) {
    requireStage(ctx, ['BOOKED'], 'DISB');
    const fees = E.fees.upfrontFees({ loanAmount: String(ctx.account.sanctionedAmount), components: ctx.snapshot.components, rounder: ctx.rounder });
    if (ctx.product.feeFinancingMode === 'UPFRONT' && N.cmp(fees.total, 0) > 0
      && !(await db.lnTransaction.count({ where: { loanAccountId: ctx.account.id, eventCode: 'FEE_COLLECT', postingStatus: 'POSTED', isReversed: false }, transaction }))) {
      fail('Collect the upfront fees (FEE_COLLECT) before disbursing', 409);
    }
    const events = E.fees.disbursementEvents({
      feeFinancingMode: ctx.product.feeFinancingMode, loanAmount: String(ctx.account.sanctionedAmount),
      fees: ctx.product.feeFinancingMode === 'UPFRONT' ? '0' : fees.total,
      insurancePremium: ctx.product.feeFinancingMode === 'UPFRONT' ? '0' : (input.insurancePremium || '0'), rounder: ctx.rounder
    }).map(e => ({ ...e, qualifiers: { CURRENT: qualifierOf(ctx, 'NORMAL') } }));
    // A different disbursement date regenerates the schedule from the frozen terms
    if (dates.valueDate !== String(ctx.account.valueDate)) {
      const terms = { ...ctx.snapshot.terms, valueDate: dates.valueDate, firstDueDate: undefined };
      const { calendar } = await loanCtx.calendarFor(ctx.account.branchId);
      const schedule = E.schedule.generateSchedule(terms, calendar, ctx.rounder);
      const sched = await S.loadSchedule(ctx, transaction);
      await effects.replaceSchedules(sched.schedules, sched.comps, schedule.rows, ctx);
      await effects.set('lnAccount', ctx.account, 'valueDate', dates.valueDate);
      await effects.set('lnAccount', ctx.account, 'firstDueDate', schedule.firstDueDate);
      await effects.set('lnAccount', ctx.account, 'maturityDate', schedule.maturityDate);
      await effects.create('lnAmendmentHistory', { loanAccountId: ctx.account.id, amendmentType: 'DISB_DATE', effectiveDate: dates.valueDate, oldValuesJson: JSON.stringify({ valueDate: String(ctx.snapshot.terms.valueDate) }), newValuesJson: JSON.stringify({ valueDate: dates.valueDate, installments: schedule.rows.length }), approvedBy: ctxUser.userId });
    }
    const disb = events.find(e => e.event === 'DISB').tags;
    await effects.set('lnAccount', ctx.account, 'accountStage', 'DISBURSED');
    const financed = ctx.product.feeFinancingMode === 'CAPITALIZED' ? ['PRINCIPAL', 'FEE_DOC', 'INS_PREM'] : ['PRINCIPAL'];
    await effects.set('lnAccount', ctx.account, 'disbursedAmount', fromUnits(sumBy(financed, t => toUnits(disb[t] || '0'))));
    await effects.set('lnAccount', ctx.account, 'statusSince', dates.valueDate);
    return { eventCode: 'DISB', events, amount: disb.PRINCIPAL, settlesInvoice: ctx.product.disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT' };
  },

  async REPAYMENT(ctx, input, effects, { dates, transaction, txn, ctxUser }) {
    requireStage(ctx, ['DISBURSED'], 'REPAYMENT');
    requireLive(ctx, 'REPAYMENT');
    const amount = money(input.amount, 'amount');
    if (!ctx.rounder.isRounded(amount)) fail(`amount has more than ${ctx.rounder.decimals} decimals`);
    let sched = await S.loadSchedule(ctx, transaction);
    const pre = await recognizeDue(ctx, sched, dates.valueDate, effects);
    await updatePenalties(ctx, sched, dates.valueDate, effects);
    sched = await S.loadSchedule(ctx, transaction);
    const state = S.engineState(ctx, sched);
    const result = E.allocation.allocatePayment({
      state, amount, date: dates.valueDate, useAdvance: Boolean(input.useAdvance),
      waterfall: loanCtx.waterfallFor(ctx.snapshot.waterfall, ctx.account.status),
      oldestInstallmentFirst: ctx.product.oldestInstallmentFirst !== false,
      overpaymentTreatment: input.prepayPrincipal ? 'PRINCIPAL_PREPAY' : ctx.product.overpaymentTreatment, rounder: ctx.rounder
    });
    await applyAllocations(ctx, sched, result.allocations, txn.id, effects);
    const overpay = result.events.find(e => e.event === 'OVERPAY');
    await effects.delta('lnAccount', ctx.account, 'advanceBalance', toUnits(overpay ? overpay.tags.OVERPAY : '0') - toUnits(result.advanceUsed));
    // On-time streak: installments fully paid within grace by this payment
    const grace = Number(ude(ctx, 'GRACE_DAYS') || 0);
    const cleared = [...new Set(result.allocations.map(a => a.installmentNo))].filter((no) => {
      const s = sched.schedules.find(x => x.installmentNo === no);
      return s && sumBy(sched.comps.filter(c => c.scheduleId === s.id), S.outstanding) === 0n && E.dates.daysBetween(String(s.dueDate), dates.valueDate) <= grace;
    }).length;
    if (cleared) await effects.delta('lnAccount', ctx.account, 'onTimeStreak', BigInt(cleared) * 10000n);
    if (N.cmp(result.partialPrepayment, 0) > 0) {
      const future = sched.schedules.filter(s => String(s.originalDueDate) > dates.valueDate && s.status !== 'PAID');
      const futureComps = sched.comps.filter(c => future.some(s => s.id === c.scheduleId));
      const before = sumBy(futureComps.filter(c => c.componentId === ctx.idOf.PRINCIPAL), S.outstanding);
      const prev = sched.schedules.filter(s => String(s.originalDueDate) <= dates.valueDate).pop();
      const { calendar } = await loanCtx.calendarFor(ctx.account.branchId);
      const regen = E.schedule.regenerateAfterPrepayment({
        rows: future.map(s => {
          const p = futureComps.find(c => c.scheduleId === s.id && c.componentId === ctx.idOf.PRINCIPAL);
          const i = futureComps.find(c => c.scheduleId === s.id && c.componentId === ctx.idOf.INTEREST);
          return { no: s.installmentNo, originalDueDate: String(s.originalDueDate), dueDate: String(s.dueDate), principal: fromUnits(S.outstanding(p)), interest: fromUnits(S.outstanding(i)) };
        }),
        prevDate: prev ? String(prev.originalDueDate) : String(ctx.account.valueDate), outstandingBefore: fromUnits(before), prepaid: result.partialPrepayment, date: dates.valueDate,
        annualRate: String(ctx.account.interestRate), dayCount: ctx.snapshot.dayCount, frequency: ctx.snapshot.frequency,
        repaymentMethod: ctx.product.repaymentMethodCode, balloonAmount: String(ctx.account.balloonAmount || '0'),
        option: ctx.product.partialPrepayOption, holidayHandling: ctx.product.holidayHandlingCode
      }, calendar, ctx.rounder);
      await effects.replaceSchedules(future, futureComps, regen.rows, ctx);
      await effects.set('lnAccount', ctx.account, 'maturityDate', regen.rows[regen.rows.length - 1].dueDate);
      await effects.create('lnAmendmentHistory', { loanAccountId: ctx.account.id, amendmentType: 'PARTIAL_PREPAYMENT', effectiveDate: dates.valueDate, oldValuesJson: JSON.stringify({ installments: future.length, outstanding: fromUnits(before) }), newValuesJson: JSON.stringify({ option: ctx.product.partialPrepayOption, installments: regen.rows.length, outstanding: regen.newOutstanding }), approvedBy: ctxUser.userId });
    }
    const qualifier = qualifierOf(ctx, ctx.account.status);
    return {
      eventCode: 'LIQD',
      events: [...pre, ...result.events].map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })),
      amount,
      details: { allocations: result.allocations, partialPrepayment: result.partialPrepayment, advanceRemaining: result.advanceRemaining }
    };
  },

  async PREPAY(ctx, input, effects, { dates, transaction }) {
    requireStage(ctx, ['DISBURSED'], 'PREPAY');
    requireLive(ctx, 'PREPAY');
    if (ctx.product.allowPrepayment === false) fail('The product does not allow prepayment', 409);
    const qualifier = qualifierOf(ctx, ctx.account.status);
    let sched = await S.loadSchedule(ctx, transaction);
    const pre = await recognizeDue(ctx, sched, dates.valueDate, effects);
    await updatePenalties(ctx, sched, dates.valueDate, effects);
    sched = await S.loadSchedule(ctx, transaction);
    const state = S.engineState(ctx, sched);
    const fee = ctx.snapshot.components.find(c => c.componentCode === 'PREPAYMENT_PENALTY');
    const quote = E.prepayment.prepaymentQuote({
      schedule: { rows: sched.schedules.map((s) => {
        const i = sched.comps.find(c => c.scheduleId === s.id && c.componentId === ctx.idOf.INTEREST);
        return { no: s.installmentNo, originalDueDate: String(s.originalDueDate), interest: i ? fromUnits(S.net(i)) : '0' };
      }) },
      state, date: dates.valueDate, rebateMethod: ctx.product.earlySettlementRebateMethod, annualRate: String(ctx.account.interestRate),
      dayCount: ctx.snapshot.dayCount, valueDate: String(ctx.account.valueDate), earlyFeeRate: fee ? String(fee.defaultValue) : '0',
      earlyFeeVat: fee ? await vatFor(ctx, 'PREPAYMENT_PENALTY', dates.valueDate, transaction) : null, rounder: ctx.rounder
    });
    if (input.amount !== undefined && N.cmp(money(input.amount, 'amount'), quote.cashRequired) !== 0) {
      fail(`Payoff amount is ${quote.cashRequired} on ${dates.valueDate}; ${input.amount} was given`, 409);
    }
    // Due amounts and all principal are paid; interest of installments not yet due is not charged (rebated)
    for (const c of sched.comps) {
      const sRow = sched.schedules.find(x => x.id === c.scheduleId);
      const open = S.outstanding(c);
      if (open <= 0n) continue;
      const notDueInterest = c.componentId === ctx.idOf.INTEREST && String(sRow.dueDate) > dates.valueDate;
      await effects.delta('lnScheduleComponent', c, notDueInterest ? 'amountWaived' : 'amountPaid', open);
    }
    for (const sRow of sched.schedules) if (sRow.status !== 'PAID') await effects.set('lnSchedule', sRow, 'status', 'PAID');
    await effects.delta('lnAccount', ctx.account, 'advanceBalance', -toUnits(quote.breakdown.advanceApplied));
    await setStatus(ctx, 'CLOSED', dates.valueDate, 'Early settlement', effects);
    await effects.set('lnAccount', ctx.account, 'accountStage', 'CLOSED');
    await effects.set('lnAccount', ctx.account, 'closedAt', new Date().toISOString().slice(0, 19).replace('T', ' '));
    return { eventCode: 'PREPAY', events: [...pre, ...quote.events].map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })), amount: quote.cashRequired, details: quote.breakdown };
  },

  async WAIVE(ctx, input, effects, { dates, transaction }) {
    requireStage(ctx, ['DISBURSED'], 'WAIVE');
    requireLive(ctx, 'WAIVE');
    const kind = input.component;
    if (!['PENALTY', 'FEE', 'INTEREST'].includes(kind)) fail('component must be PENALTY, FEE or INTEREST');
    let left = toUnits(money(input.amount, 'amount'));
    let sched = await S.loadSchedule(ctx, transaction);
    if (kind === 'INTEREST') await recognizeDue(ctx, sched, dates.valueDate, effects);
    if (kind === 'PENALTY') await updatePenalties(ctx, sched, dates.valueDate, effects);
    sched = await S.loadSchedule(ctx, transaction);
    const feeIds = ctx.componentRows.filter(c => c.componentType === 'FEE').map(c => c.id);
    const allocations = [];
    for (const s of sched.schedules.filter(x => String(x.dueDate) <= dates.valueDate)) {
      for (const c of sched.comps.filter(x => x.scheduleId === s.id)) {
        const match = kind === 'PENALTY' ? c.componentId === ctx.idOf.PENALTY : kind === 'INTEREST' ? c.componentId === ctx.idOf.INTEREST : feeIds.includes(c.componentId);
        const open = S.outstanding(c);
        if (!match || open <= 0n || left === 0n) continue;
        const take = open < left ? open : left;
        allocations.push({ amount: fromUnits(take), bucket: c.bucket || 'BOOKED' });
        await effects.delta('lnScheduleComponent', c, 'amountWaived', take);
        left -= take;
      }
    }
    if (left > 0n) fail(`Only ${fromUnits(toUnits(input.amount) - left)} of ${kind} is due and open on ${dates.valueDate}`, 409);
    const events = E.events.waiveEvents({ kind, allocations, rounder: ctx.rounder });
    return { eventCode: kind === 'INTEREST' ? 'INT_WAIVE' : 'WAIVE', events, amount: input.amount };
  },

  async INS_REMIT(ctx, input, effects, { transaction }) {
    const payable = await insurancePayable(ctx, transaction);
    return { eventCode: 'INS_REMIT', events: E.events.insRemitEvents({ amount: money(input.amount, 'amount'), payable, rounder: ctx.rounder }), amount: input.amount };
  },

  async ADV_REFUND(ctx, input, effects) {
    const events = E.events.advRefundEvents({ amount: money(input.amount, 'amount'), advanceBalance: String(ctx.account.advanceBalance), rounder: ctx.rounder });
    await effects.delta('lnAccount', ctx.account, 'advanceBalance', -toUnits(input.amount));
    return { eventCode: 'ADV_REFUND', events, amount: input.amount };
  },

  async WRITE_OFF(ctx, input, effects, { dates, transaction }) {
    requireStage(ctx, ['DISBURSED'], 'WRITE_OFF');
    requireLive(ctx, 'WRITE_OFF');
    let sched = await S.loadSchedule(ctx, transaction);
    const pre = await recognizeDue(ctx, sched, dates.valueDate, effects);
    sched = await S.loadSchedule(ctx, transaction);
    const b = balances(ctx, sched);
    const reserve = await latestReserve(ctx, transaction);
    const qualifier = qualifierOf(ctx, ctx.account.status);
    const events = E.events.writeOffEvents({ outstandingPrincipal: b.principal, reserve, suspendedInterest: b.suspended, bookedInterest: b.booked, rounder: ctx.rounder });
    const memo = (events.find(e => e.event === 'WRITE_OFF').tags.MEMO_WO) || '0';
    await closeComponents(ctx, sched, 'amountWaived', effects, 'WRITTEN_OFF');
    await effects.delta('lnAccount', ctx.account, 'writtenOffMemo', toUnits(memo));
    await effects.create('lnProvisionLedger', { loanAccountId: ctx.account.id, evaluationDate: dates.valueDate, outstandingPrincipal: 0, eligibleCollateralValue: 0, netExposure: 0, provisionRate: 0, requiredProvision: 0, bookedProvision: 0, deltaProvision: fromUnits(-toUnits(reserve)), status: 'WRITE_OFF' });
    await setStatus(ctx, 'WRITTEN_OFF', dates.valueDate, input.remarks || 'Written off', effects);
    return { eventCode: 'WRITE_OFF', events: [...pre, ...events].map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })), amount: N.toDecimal(b.principal, ctx.rounder.decimals) };
  },

  async RECOVERY(ctx, input, effects) {
    if (ctx.account.status !== 'WRITTEN_OFF') fail('RECOVERY needs a WRITTEN_OFF account', 409);
    const events = E.events.recoveryEvents({ amount: money(input.amount, 'amount'), memoBalance: String(ctx.account.writtenOffMemo), rounder: ctx.rounder });
    await effects.delta('lnAccount', ctx.account, 'writtenOffMemo', -toUnits(input.amount));
    return { eventCode: 'RECOVERY', events, amount: input.amount };
  },

  async REPOSSESS(ctx, input, effects, { dates, transaction }) {
    requireStage(ctx, ['DISBURSED'], 'REPOSSESS');
    requireLive(ctx, 'REPOSSESS');
    let sched = await S.loadSchedule(ctx, transaction);
    const pre = await recognizeDue(ctx, sched, dates.valueDate, effects);
    sched = await S.loadSchedule(ctx, transaction);
    const b = balances(ctx, sched);
    const reserve = await latestReserve(ctx, transaction);
    const qualifier = qualifierOf(ctx, ctx.account.status);
    const rep = E.events.repossessEvents({ outstandingPrincipal: b.principal, appraised: money(input.appraisedValue, 'appraisedValue'), reserve, suspendedInterest: b.suspended, bookedInterest: b.booked, rounder: ctx.rounder });
    await closeComponents(ctx, sched, 'amountWaived', effects, 'REPOSSESSED');
    await effects.delta('lnAccount', ctx.account, 'repossessedCarrying', toUnits(rep.carrying));
    await effects.create('lnProvisionLedger', { loanAccountId: ctx.account.id, evaluationDate: dates.valueDate, outstandingPrincipal: 0, eligibleCollateralValue: 0, netExposure: 0, provisionRate: 0, requiredProvision: 0, bookedProvision: 0, deltaProvision: fromUnits(-toUnits(reserve)), status: 'REPOSSESS' });
    await setStatus(ctx, 'REPOSSESSED', dates.valueDate, input.remarks || 'Vehicle repossessed', effects);
    return { eventCode: 'REPOSSESS', events: [...pre, ...rep.events].map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })), amount: N.toDecimal(b.principal, ctx.rounder.decimals) };
  },

  async VEH_DISPOSE(ctx, input, effects, { dates, transaction }) {
    if (ctx.account.status !== 'REPOSSESSED' || toUnits(ctx.account.repossessedCarrying) === 0n) fail('VEH_DISPOSE needs a REPOSSESSED account with a vehicle carried', 409);
    const vat = await vatFor(ctx, 'REPOSSESSION_SALE', dates.valueDate, transaction);
    const events = E.events.disposeEvents({ salePrice: money(input.salePrice, 'salePrice'), carrying: String(ctx.account.repossessedCarrying), vat, rounder: ctx.rounder });
    await effects.delta('lnAccount', ctx.account, 'repossessedCarrying', -toUnits(ctx.account.repossessedCarrying));
    await effects.set('lnAccount', ctx.account, 'accountStage', 'CLOSED');
    return { eventCode: 'VEH_DISPOSE', events, amount: events[0].tags.SALE_PRICE };
  }
};

// Insurance premium still owed to the insurer for this account (from its own journal legs)
const insurancePayable = async (ctx, transaction) => {
  const legs = await findAllExact(db.lnJournalPosting, { where: { loanAccountId: ctx.account.id, roleCode: 'INSURANCE_PAYABLE' }, transaction });
  const units = legs.reduce((s, l) => s + (l.drCr === 'CR' ? toUnits(l.amount) : -toUnits(l.amount)), 0n);
  return fromUnits(units);
};

module.exports = { handlers, recognizeDue, updatePenalties, insurancePayable, applyAllocations, setStatus, latestReserve };
