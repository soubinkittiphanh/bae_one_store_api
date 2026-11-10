/**
 * Loan end-of-day batch (Phase 4) for the current loan business date (ln_system_date).
 *   EOD_ACCRUAL                interest recognition per interestRecognitionCode (DUE_DATE: due today or earlier;
 *                              DAILY: month-end pro rata plus the remainder on the due date; CASH: none) and
 *                              customer advances auto-applied for AUTO_FUTURE_INSTALLMENTS products
 *   EOD_PENALTY_CALC           memo penalty on overdue installments (no GL under MEMO_ONLY)
 *   EOD_STATUS_CLASSIFICATION  DPD, STCH / STCH_CURE, interest moved between BOOKED and SUSPENDED
 *   EOD_PROVISION_CALC         month-end only (decision D6): PROVISION / PROV_WB
 * Each account and job runs in its own DB transaction, keyed in ln_idempotency (EOD:<job>, account,
 * date), so a re-run skips finished work and a crash resumes from the next account. Legs are written
 * to ln_journal_posting under one ln_gl_batch per (date, branch, currency, job); a final step posts
 * the summarized GL pairs per batch. Refuses to run past the POS business date (decision D8).
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const loanCtx = require('../services/loanContext');
const { toUnits, fromUnits } = require('../accounting/journal');
const { findAllExact } = require('../db/exact');
const AccountingPostingService = require('../../GL/accountingPostingService');
const G = require('../posting/guards');
const S = require('../posting/accountState');
const { makeResolver } = require('../posting/glResolver');
const { postJournal } = require('../posting/journalWriter');
const { pairLegs } = require('../posting/pairing');
const { recognizeDue, updatePenalties, applyAllocations, setStatus, latestReserve } = require('../posting/handlers');
const { nextNumber } = require('../services/numberingService');
const FX = require('../accounting/fx');
const { fxFor } = require('../posting/fxContext');
const fxRates = require('../services/fxRateService');

const LOCK_NAME = 'LOAN_EOD';
const LOCK_HOURS = 2;
const TERMINAL = ['WRITTEN_OFF', 'REPOSSESSED', 'CLOSED'];
const N = E.num;

const isMonthEnd = date => { const p = E.dates.parts(date); return p.d === E.dates.daysInMonth(p.y, p.m); };
const batchNumber = (date, job, branchId, currencyId) => `EOD-${date.replace(/-/g, '')}-${job}-B${branchId}-C${currencyId}`;

const acquireLock = async (who) => {
  const now = new Date();
  const expires = new Date(now.getTime() + LOCK_HOURS * 3600000);
  return db.sequelize.transaction(async (transaction) => {
    const lock = await db.lnBatchLock.findByPk(LOCK_NAME, { transaction, lock: transaction.LOCK.UPDATE });
    if (lock && new Date(lock.expiresAt) > now) throw new LoanError(409, `Loan EOD is already running (started ${new Date(lock.acquiredAt).toISOString()} by ${lock.acquiredBy}); wait for it to finish`);
    if (lock) await lock.update({ acquiredAt: now, acquiredBy: who, expiresAt: expires }, { transaction });
    else await db.lnBatchLock.create({ lockName: LOCK_NAME, acquiredAt: now, acquiredBy: who, expiresAt: expires }, { transaction });
  });
};
const releaseLock = () => db.lnBatchLock.destroy({ where: { lockName: LOCK_NAME } });

// One account, one job, one DB transaction
const runAccountJob = async ({ job, accountId, date, ctxUser, hook }) => db.sequelize.transaction(async (transaction) => {
  const claim = await G.claimIdempotency({ endpoint: `EOD:${job}`, accountId, key: `EOD-${date}`, hash: G.requestHash({ job, date }), transaction });
  if (claim.replay) return { skipped: true };
  hook(`EOD_ACCOUNT_${accountId}`);
  const ctx = await S.loadAccount(accountId, transaction);
  ctx.live = await loanCtx.classification(date);
  // Phase 5: foreign-currency accounts post at the EOD date's rate (fx = null for base-currency accounts)
  const { fx } = await fxFor({ account: ctx.account, bookingDate: date, transaction });
  let extraLines = [];
  const effects = new S.Effects(transaction);
  const qualifier = (ctx.live.statusMaster[ctx.account.status] || {}).glQualifier;
  let events = [];
  let sched = await S.loadSchedule(ctx, transaction);
  const txn = await db.lnTransaction.create({
    txNo: await nextNumber('LOAN_TRANSACTION', date, transaction, ctx.account.branchId), branchId: ctx.account.branchId, loanAccountId: ctx.account.id, eventCode: job,
    valueDate: date, postingDate: date, bookingDate: date, amount: 0, baseAmount: 0, currencyId: ctx.account.currencyId, exchangeRate: fx ? fx.rate : '1',
    ...(fx ? { exchangeRateDate: fx.rateDate, fxWarning: fx.warnings.join(' | ').slice(0, 255) || null } : {}),
    paymentMethod: 'NONE', postingStatus: 'POSTED', authStatus: 'AUTHORIZED', makerId: ctxUser.userId, source: 'EOD'
  }, { transaction });

  if (job === 'EOD_ACCRUAL') {
    events = await recognizeDue(ctx, sched, date, effects);
    const treatment = (ctx.live.statusMaster[ctx.account.status] || {}).interestTreatment;
    if (ctx.product.interestRecognitionCode === 'DAILY' && isMonthEnd(date) && treatment !== 'STOP_ACCRUAL') {
      const current = sched.schedules.find(s => String(s.originalDueDate) > date);
      if (current) {
        const prev = sched.schedules.filter(s => String(s.originalDueDate) <= date).pop();
        const c = sched.comps.find(x => x.scheduleId === current.id && x.componentId === ctx.idOf.INTEREST);
        const toDate = E.interest.accruedToDate({ installment: { interest: fromUnits(S.net(c)), originalDueDate: String(current.originalDueDate) }, periodStart: prev ? String(prev.originalDueDate) : String(ctx.account.valueDate), date, dayCount: ctx.snapshot.dayCount, rounder: ctx.rounder });
        const delta = toUnits(toDate) - toUnits(c.amountRecognized);
        if (delta > 0n) {
          events.push({ event: treatment === 'SUSPEND_ACCRUAL' ? 'ACCR_SUSP' : 'ACCR', tags: { INT_ACCR: fromUnits(delta) } });
          await effects.delta('lnScheduleComponent', c, 'amountRecognized', delta);
        }
      }
    }
    if (ctx.product.overpaymentTreatment === 'AUTO_FUTURE_INSTALLMENTS' && toUnits(ctx.account.advanceBalance) > 0n) {
      sched = await S.loadSchedule(ctx, transaction);
      const result = E.allocation.allocatePayment({ state: S.engineState(ctx, sched), amount: '0', useAdvance: true, date, waterfall: loanCtx.waterfallFor(ctx.snapshot.waterfall, ctx.account.status), oldestInstallmentFirst: ctx.product.oldestInstallmentFirst !== false, overpaymentTreatment: 'CUSTOMER_ADVANCE', rounder: ctx.rounder });
      await applyAllocations(ctx, sched, result.allocations, txn.id, effects);
      await effects.delta('lnAccount', ctx.account, 'advanceBalance', -toUnits(result.advanceUsed));
      events.push(...result.events);
    }
  } else if (job === 'EOD_PENALTY_CALC') {
    await updatePenalties(ctx, sched, date, effects);
    const grace = Number(loanCtx.udeValue(ctx.snapshot.udes, 'GRACE_DAYS') || 0);
    const lateBeyondGrace = sched.schedules.some(s => E.dates.daysBetween(String(s.dueDate), date) > grace
      && sched.comps.filter(c => c.scheduleId === s.id && c.componentId !== ctx.idOf.PENALTY).some(c => S.outstanding(c) > 0n));
    if (lateBeyondGrace && Number(ctx.account.onTimeStreak) !== 0) await effects.set('lnAccount', ctx.account, 'onTimeStreak', 0);
  } else if (job === 'EOD_STATUS_CLASSIFICATION') {
    const state = S.engineState(ctx, sched);
    const dpd = E.state.dpd(state, date);
    if (Number(ctx.account.currentDpd) !== dpd) await effects.set('lnAccount', ctx.account, 'currentDpd', dpd);
    const open = pred => fromUnits(sched.comps.filter(pred).reduce((s, c) => s + S.outstanding(c), 0n));
    const interestBy = bucket => c => c.componentId === ctx.idOf.INTEREST && c.bucket === bucket;
    const monthsInStatus = ctx.account.statusSince ? Math.max(0, (E.dates.parts(date).y - E.dates.parts(String(ctx.account.statusSince)).y) * 12 + E.dates.parts(date).m - E.dates.parts(String(ctx.account.statusSince)).m) : 0;
    const st = E.status.evaluateStatus({
      currentStatus: ctx.account.status, dpd, movementRules: ctx.live.movementRules, cureRules: ctx.live.cureRules, statusMaster: ctx.live.statusMaster,
      onTimeStreak: Number(ctx.account.onTimeStreak), monthsInStatus,
      outstandingPrincipal: open(c => c.componentId === ctx.idOf.PRINCIPAL), bookedUnpaidInterest: open(interestBy('BOOKED')), suspendedInterest: open(interestBy('SUSPENDED')), rounder: ctx.rounder
    });
    if (st.changed) {
      const ev = st.events[0];
      if (ev.tags.UNCOL_INT) for (const c of sched.comps.filter(interestBy('BOOKED'))) if (S.outstanding(c) > 0n) await effects.set('lnScheduleComponent', c, 'bucket', 'SUSPENDED');
      if (ev.tags.SUSP_REV) for (const c of sched.comps.filter(interestBy('SUSPENDED'))) if (S.outstanding(c) > 0n) await effects.set('lnScheduleComponent', c, 'bucket', 'BOOKED');
      await setStatus(ctx, st.newStatus, date, st.reason, effects);
      events = st.events;
    }
  } else if (job === 'EOD_PROVISION_CALC' && isMonthEnd(date)) {
    const classCode = (ctx.live.statusMaster[ctx.account.status] || {}).regulatoryClassCode;
    const rule = classCode ? await loanCtx.provisionRuleFor(classCode, ctx.product, date) : null;
    if (rule) {
      const collateral = await findAllExact(db.lnLoanCollateral, { where: { loanAccountId: ctx.account.id }, transaction });
      const principal = fromUnits(sched.comps.filter(c => c.componentId === ctx.idOf.PRINCIPAL).reduce((s, c) => s + S.outstanding(c), 0n));
      const booked = await latestReserve(ctx, transaction);
      const prov = E.provision.calculateProvision({ outstandingPrincipal: principal, collateralValue: N.sum(collateral.map(c => c.allocatedValue)), rule, booked, rounder: ctx.rounder });
      await effects.create('lnProvisionLedger', { loanAccountId: ctx.account.id, evaluationDate: date, outstandingPrincipal: principal, eligibleCollateralValue: N.toDecimal(N.sum(collateral.map(c => c.allocatedValue)), 4), netExposure: prov.netExposure, provisionRate: prov.provisionRate, requiredProvision: prov.required, bookedProvision: prov.required, deltaProvision: prov.delta, glBatchId: batchNumber(date, job, ctx.account.branchId, ctx.account.currencyId), status: 'POSTED' });
      events = prov.events;
    }
  } else if (job === 'EOD_FX_REVAL' && fx && isMonthEnd(date) && (await fxRates.spfValue('LOAN_FX_REVAL_ENABLED', 'false', transaction)) === 'true') {
    // Month-end revaluation, carry forward (addendum §8.7): base-only legs move each bucket to balance x rate
    const history = await findAllExact(db.lnJournalPosting, { where: { loanAccountId: ctx.account.id, roleCode: Object.keys(FX.BUCKETS) }, transaction });
    extraLines = FX.revaluationLines({ buckets: FX.bucketsFromLegs(history), rate: fx.rate, baseDecimals: fx.baseDecimals, loanCurrencyId: ctx.account.currencyId });
  }

  let journal = null;
  if (events.length || extraLines.length) {
    const glBatchId = batchNumber(date, job, ctx.account.branchId, ctx.account.currencyId);
    const [batch] = await db.lnGlBatch.findOrCreate({ where: { batchNumber: glBatchId }, defaults: { batchNumber: glBatchId, businessDate: date, batchType: 'EOD', jobCode: job, totalDebit: 0, totalCredit: 0, currencyId: ctx.account.currencyId, branchId: ctx.account.branchId, status: 'OPEN' }, transaction });
    if (batch.status !== 'OPEN') throw new LoanError(409, `GL batch ${glBatchId} is already ${batch.status}`);
    const resolver = await makeResolver({ date, transaction });
    journal = await postJournal(events.map(e => ({ ...e, qualifiers: e.qualifiers || { CURRENT: qualifier } })), {
      product: ctx.product, account: ctx.account, currencyId: ctx.account.currencyId, valueDate: date, bookingDate: date,
      transactionId: txn.id, glBatchId, postingReference: txn.txNo, description: `Loan EOD ${job} ${ctx.account.accountNo}`, deferGl: true, resolver, hook: () => {},
      fx: fx || undefined, extraLines
    }, transaction);
  }
  if (!events.length && !extraLines.length && !effects.list.length) {
    await txn.destroy({ transaction });
  } else {
    await txn.update({ eventsJson: JSON.stringify(events.length ? events : (extraLines.length ? [{ event: job, revaluationLegs: extraLines.length }] : [])), effectsJson: JSON.stringify(effects.list) }, { transaction });
  }
  const posted = events.length + (extraLines.length ? 1 : 0);
  await claim.row.update({ status: 200, responseBody: JSON.stringify({ events: posted }), transactionId: posted || effects.list.length ? txn.id : null }, { transaction });
  return { skipped: false, events: posted, legs: journal ? journal.lines.length : 0 };
});

// Phase 5: a foreign-currency batch sums contract and base per account, side and currency (base-only legs
// separately) and writes rows with their local amounts; FX and corrections are base-only rows
const summarizeForeign = async ({ batch, legs, locked, date, baseCurrencyId, transaction }) => {
  const baseDecimals = Number((await loanCtx.currencyRule(baseCurrencyId, date, false)).decimalPlaces);
  const keyOf = l => `${l.chartAccountId}|${l.drCr}|${l.currencyId || batch.currencyId}|${l.isBaseOnly ? 1 : 0}`;
  const sums = new Map();
  for (const l of legs) {
    const k = keyOf(l);
    const s = sums.get(k) || { amount: 0n, base: 0n };
    s.amount += toUnits(l.amount);
    s.base += toUnits(l.baseAmount);
    sums.set(k, s);
  }
  const keys = [...sums.keys()].sort();
  const agg = keys.map((k) => {
    const [chartAccountId, drCr, currencyId, baseOnly] = k.split('|');
    return { eventCode: batch.jobCode, amountTag: 'SUMMARY', drCr, chartAccountId: Number(chartAccountId), currencyId: Number(currencyId), amount: fromUnits(sums.get(k).amount), baseAmount: fromUnits(sums.get(k).base), isBaseOnly: baseOnly === '1' };
  });
  const step = 10n ** BigInt(4 - baseDecimals);
  const { glRows, toGlAmount } = require('../posting/pairing');
  const { rows, legRow } = glRows(agg, { baseStep: step < 100n ? 100n : step, rowCurrencyId: batch.currencyId });
  const toWrite = rows.filter(r => !r.sameAccount);
  const written = await AccountingPostingService.postJournalPairs(toWrite.map(r => ({ drAccountId: r.drAccountId, crAccountId: r.crAccountId, amount: r.amount, localAmount: r.localAmount, currencyId: r.currencyId, rate: r.rate, description: `Loan EOD ${batch.jobCode} ${date} (summary${r.baseOnly ? ', base' : ''})` })),
    { bookingDate: date, postingReference: batch.batchNumber, description: `Loan EOD ${batch.jobCode} ${date}` }, transaction);
  const rowOf = new Map(toWrite.map((r, i) => [r, written[i]]));
  for (const l of legs) {
    const i = keys.indexOf(keyOf(l));
    const row = legRow[i] === null ? null : rowOf.get(rows[legRow[i]]);
    if (row) await db.lnJournalPosting.update({ glRecordId: row.id }, { where: { id: l.id }, transaction });
  }
  const total = fromUnits(agg.filter(a => a.drCr === 'DR' && !a.isBaseOnly).reduce((s, a) => s + toUnits(a.amount), 0n));
  await locked.update({ status: 'POSTED', totalDebit: total, totalCredit: total }, { transaction });
  return { batchNumber: batch.batchNumber, legs: legs.length, glRows: written.length, total, baseTotal: toGlAmount(agg.filter(a => a.drCr === 'DR').reduce((s, a) => s + toUnits(a.baseAmount), 0n)) };
};

// Summarized GL per OPEN batch: legs summed per account and side, then paired; legs linked to their GL row
const summarizeBatches = async (date) => {
  const batches = await db.lnGlBatch.findAll({ where: { businessDate: date, batchType: 'EOD', status: 'OPEN' } });
  const out = [];
  for (const batch of batches) {
    await db.sequelize.transaction(async (transaction) => {
      const locked = await db.lnGlBatch.findByPk(batch.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (locked.status !== 'OPEN') return;
      const legs = await findAllExact(db.lnJournalPosting, { where: { glBatchId: batch.batchNumber, glRecordId: null }, transaction });
      const base = await fxRates.baseCurrency(transaction);
      if (Number(batch.currencyId) !== Number(base.id)) {
        out.push(await summarizeForeign({ batch, legs, locked, date, baseCurrencyId: base.id, transaction }));
        return;
      }
      const sums = {};
      for (const l of legs) {
        const key = `${l.chartAccountId}|${l.drCr}`;
        sums[key] = (sums[key] || 0n) + toUnits(l.amount);
      }
      const agg = Object.entries(sums).map(([key, units]) => {
        const [chartAccountId, drCr] = key.split('|');
        return { eventCode: batch.jobCode, amountTag: 'SUMMARY', drCr, chartAccountId: Number(chartAccountId), amount: fromUnits(units), currencyId: batch.currencyId };
      }).sort((a, b) => (a.drCr + a.chartAccountId).localeCompare(b.drCr + b.chartAccountId));
      const { pairs } = pairLegs(agg);
      const toWrite = pairs.filter(p => !p.sameAccount);
      const rows = await AccountingPostingService.postJournalPairs(toWrite.map(p => ({ drAccountId: p.drAccountId, crAccountId: p.crAccountId, amount: p.amount, localAmount: p.amount, currencyId: batch.currencyId, rate: 1, description: `Loan EOD ${batch.jobCode} ${date} (summary)` })),
        { bookingDate: date, postingReference: batch.batchNumber, description: `Loan EOD ${batch.jobCode} ${date}` }, transaction);
      for (const l of legs) {
        const row = rows.find((r, i) => (l.drCr === 'DR' ? toWrite[i].drAccountId : toWrite[i].crAccountId) === Number(l.chartAccountId));
        if (row) await db.lnJournalPosting.update({ glRecordId: row.id }, { where: { id: l.id }, transaction });
      }
      const total = fromUnits(Object.entries(sums).filter(([k]) => k.endsWith('|DR')).reduce((s, [, u]) => s + u, 0n));
      await locked.update({ status: 'POSTED', totalDebit: total, totalCredit: total }, { transaction });
      out.push({ batchNumber: batch.batchNumber, legs: legs.length, glRows: rows.length, total });
    });
  }
  return out;
};

const eodService = {
  async run(ctxUser, { failAt, today } = {}) {
    await G.assertPostingEnabled();
    const sd = await G.systemDate();
    const date = String(sd.currentBusinessDate);
    // Phase 5 (D7, D8): the POS USE_BUSINESS_DATE switch decides whether day `date` is over
    const cob = await G.cobCheck(date, { today });
    if (!cob.canRun) throw new LoanError(409, cob.reason);
    const hook = G.makeTestHook(failAt);
    await acquireLock(`user ${ctxUser.userId}`);
    try {
      // Only enabled AND authorized jobs run (the Phase 5 EOD_FX_REVAL job is seeded PENDING and disabled)
      const jobs = await db.lnBatchJob.findAll({ where: { isEnabled: true, authStatus: 'AUTHORIZED' }, order: [['executionOrder', 'ASC']] });
      const accounts = await db.lnAccount.findAll({ where: { accountStage: 'DISBURSED' }, attributes: ['id', 'status'], order: [['id', 'ASC']] });
      const live = accounts.filter(a => !TERMINAL.includes(a.status));
      const report = [];
      for (const job of jobs) {
        const started = Date.now();
        let processed = 0; let skipped = 0; let posted = 0;
        for (const a of live) {
          const r = await runAccountJob({ job: job.jobCode, accountId: a.id, date, ctxUser, hook });
          if (r.skipped) skipped++; else { processed++; posted += r.events; }
        }
        await db.lnBatchLog.create({ businessDate: date, jobCode: job.jobCode, status: 'SUCCESS', recordsProcessed: processed, recordsFailed: 0, logMessage: `${posted} event(s); ${skipped} account(s) already done`, executionTimeMs: Date.now() - started });
        await job.update({ lastRunDate: date, lastStatus: 'SUCCESS' });
        report.push({ job: job.jobCode, processed, skipped, events: posted });
      }
      const batches = await summarizeBatches(date);
      // Roll the loan business date to the next working day of the loan calendar
      const { calendar } = await loanCtx.calendarFor(null);
      let next = E.dates.addDays(date, 1);
      while (!calendar.isBusinessDay(next)) next = E.dates.addDays(next, 1);
      let after = E.dates.addDays(next, 1);
      while (!calendar.isBusinessDay(after)) after = E.dates.addDays(after, 1);
      await sd.update({ prevBusinessDate: date, currentBusinessDate: next, nextBusinessDate: after });
      await db.lnAccount.update({ lastEodDate: date }, { where: { id: live.map(a => a.id) } });
      return { businessDate: date, nextBusinessDate: next, jobs: report, batches };
    } finally {
      await releaseLock();
    }
  },

  async status({ today } = {}) {
    const sd = await G.systemDate();
    const [logs, lock, pos] = await Promise.all([
      db.lnBatchLog.findAll({ order: [['id', 'DESC']], limit: 20 }),
      db.lnBatchLock.findByPk(LOCK_NAME),
      G.posBusinessDate()
    ]);
    const cob = await G.cobCheck(String(sd.currentBusinessDate), { today });
    return {
      loanBusinessDate: String(sd.currentBusinessDate), posBusinessDate: pos, running: Boolean(lock && new Date(lock.expiresAt) > new Date()), recent: logs,
      cob: { ...cob, warning: 'The microfinance module EOD also moves the POS business date; loan EOD never moves it.' }
    };
  }
};

module.exports = eodService;
