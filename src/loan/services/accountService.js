/**
 * Loan accounts: booking from an APPROVED application (snapshot frozen, schedule stored) and
 * read-only engine previews. No GL posting, no payments persisted (Phase 4).
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const ctx = require('./loanContext');
const { productTerms } = require('./simulationService');
const { checkProductRow, previewJournal } = require('./accountingService');
const { nextNumber } = require('./numberingService');
const { assertApplicationBranch } = require('./branchRules');
const { applyCurrencyAmounts, assertNoMissing } = require('./currencyAmounts');

const N = E.num;
// Phase 5 B3: the rate a payment on this date would use (indicative; posting re-reads it), its warning and the base amounts
const previewFx = async (account, date, amount, cashRequired) => {
  const { indicativeFx } = require('./reportService');
  const fxRates = require('./fxRateService');
  const FX = require('../accounting/fx');
  const { toUnits, fromUnits } = require('../accounting/journal');
  const fx = await indicativeFx(account.currencyId, date);
  if (fx === null) return null;
  const decimals = await fxRates.baseDecimals(date);
  const base = v => (v && fx.rate ? fromUnits(FX.toBase(toUnits(String(v)), FX.rateUnits(fx.rate), decimals)) : null);
  return { ...fx, baseCurrency: (await fxRates.baseCurrency()).code, baseAmount: base(amount), cashRequiredBase: base(cashRequired) };
};
const currencyCode = async (id, transaction) => { const c = await db.currency.findByPk(id, { transaction }); return c ? c.code : `currency ${id}`; };
const PREVIEWS = ['due-date', 'payment', 'prepayment', 'status'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const audit = (entityName, row, key, actionType, ctxUser, newValues, transaction) => db.lnAuditLog.create({
  entityName, entityId: row.id, entityKey: key, actionType,
  newValuesJson: newValues ? JSON.stringify(newValues) : null,
  userId: ctxUser.userId, ipAddress: ctxUser.ip || null, timestamp: new Date()
}, { transaction });

const loadAccount = async (id) => {
  const account = await db.lnAccount.findByPk(id);
  if (!account) throw new LoanError(404, `Account ${id} not found`);
  const snapRow = await db.lnAccountParamSnapshot.findOne({ where: { loanAccountId: account.id } });
  const snapshot = snapRow ? JSON.parse(snapRow.snapshotJson) : null;
  if (!snapshot) throw new LoanError(409, `Account ${account.accountNo} has no parameter snapshot`);
  return { account, snapshot };
};

// Engine state from the stored schedule. Interest is held per the current status and the frozen
// recognition setting (nothing is posted in Phase 3, so no advance and no payments exist yet).
const buildState = async (account, snapshot, statusMaster, date, rounder) => {
  const schedules = await db.lnSchedule.findAll({ where: { loanAccountId: account.id }, order: [['installmentNo', 'ASC']] });
  const parts = await db.lnScheduleComponent.findAll({ where: { scheduleId: schedules.map(s => s.id) } });
  const codeOf = Object.fromEntries(snapshot.components.map(c => [c.componentId, c.componentCode]));
  const treatment = (statusMaster[account.status] || {}).interestTreatment;
  const recognition = snapshot.product.interestRecognitionCode;
  const bucket = recognition === 'CASH' ? 'UNBOOKED' : ({ CONTINUE_ACCRUAL: 'BOOKED', SUSPEND_ACCRUAL: 'SUSPENDED', STOP_ACCRUAL: 'UNBOOKED' }[treatment] || 'BOOKED');
  const ude = code => ctx.udeValue(snapshot.udes, code);
  const installments = schedules.map((s) => {
    const components = {};
    for (const p of parts.filter(x => x.scheduleId === s.id)) components[codeOf[p.componentId]] = { due: String(p.amountDue), paid: String(p.amountPaid) };
    components.PENALTY = components.PENALTY || { due: '0', paid: '0' };
    return { no: s.installmentNo, dueDate: String(s.dueDate), originalDueDate: String(s.originalDueDate), components, interestBucket: bucket };
  });
  // Memo penalty on overdue installments as of the date (decision D9)
  const daysInYear = snapshot.dayCount.daysInYear;
  for (const inst of installments) {
    const late = E.dates.daysBetween(inst.dueDate, date);
    const open = E.state.installmentOutstanding(inst);
    if (late > 0 && N.cmp(open, 0) > 0 && ude('PENALTY_RATE')) {
      inst.components.PENALTY = { due: E.interest.memoPenalty({ overdueAmount: open, daysLate: late, penaltyRate: ude('PENALTY_RATE'), capPct: ude('PENALTY_CAP_PCT'), graceDays: ude('GRACE_DAYS') || 0, daysInYear, rounder }), paid: '0' };
    }
  }
  return { installments, advanceBalance: '0' };
};

const productOf = snapshot => ({ ...snapshot.product, id: snapshot.product.id, categoryId: snapshot.product.categoryId });

const accountService = {
  async book(applicationId, ctxUser) {
    return db.sequelize.transaction(async (transaction) => {
      const app = await db.lnApplication.findByPk(applicationId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!app) throw new LoanError(404, `Application ${applicationId} not found`);
      if (app.status !== 'APPROVED') throw new LoanError(409, `Only APPROVED applications can be booked (this one is ${app.status})`);
      await assertApplicationBranch(app, 'booked', transaction); // Phase 6 R1 re-check
      const product = await db.lnProduct.findByPk(app.productId, { transaction });
      if (!product || product.authStatus !== 'AUTHORIZED') throw new LoanError(409, 'The application product is not AUTHORIZED');
      const check = await checkProductRow(product, { transaction });
      if (!check.ok) throw new LoanError(409, `${product.productCode} has incomplete accounting entry rules or currency amounts`, check.errors);

      const valueDate = app.valueDate ? String(app.valueDate) : await ctx.businessDate();
      const rule = await ctx.currencyRule(app.currencyId, valueDate, false);
      const rounder = E.rounding.makeRounder(rule);
      const look = await ctx.lookups(product);
      const { calendar } = await ctx.calendarFor(app.branchId);
      const children = await applyCurrencyAmounts(await ctx.productChildren(product.id), product.id, app.currencyId);
      assertNoMissing(children, await currencyCode(app.currencyId, transaction));
      const terms = productTerms(product, look, {
        principal: String(app.requestedAmount), interestRate: String(app.interestRate), tenorMonths: app.tenorMonths,
        firstDueDate: app.firstDueDate ? String(app.firstDueDate) : undefined, graceType: app.graceType, gracePeriods: app.gracePeriods,
        balloonAmount: String(app.balloonAmount)
      }, valueDate);
      const schedule = E.schedule.generateSchedule(terms, calendar, rounder);
      const { classification } = ctx;
      const live = await classification(valueDate);
      const normal = live.statusMaster.NORMAL;

      const accountNo = await nextNumber('LOAN_ACCOUNT', valueDate, transaction, app.branchId);
      const account = await db.lnAccount.create({
        accountNo, branchId: app.branchId, applicationId: app.id, customerId: app.customerId, productId: product.id, productVersion: product.version,
        currencyId: app.currencyId, saleHeaderId: app.vehicleSaleHeaderId, sanctionedAmount: app.requestedAmount, disbursedAmount: 0,
        downPaymentAmount: app.downPaymentAmount, interestRate: app.interestRate, spread: 0, effectiveInterestRate: app.interestRate,
        balloonAmount: app.balloonAmount, tenorMonths: app.tenorMonths, repaymentMethodCode: product.repaymentMethodCode,
        graceType: app.graceType, gracePeriods: app.gracePeriods, firstDueDate: schedule.firstDueDate, valueDate, maturityDate: schedule.maturityDate,
        disbursementTarget: product.disbursementTargetCode, status: 'NORMAL', accountStage: 'BOOKED',
        regulatoryClass: normal ? normal.regulatoryClassCode : 'CLASS_A'
      }, { transaction });

      const snapshot = E.snapshot.buildSnapshot({
        product: product.get({ plain: true }), components: children.components, udes: children.udes, waterfall: children.waterfall,
        rateTiers: children.rateTiers, dayCount: look.dayCount, frequency: look.frequency, currencyRule: rule, terms, schedule, frozenAt: new Date().toISOString()
      });
      await db.lnAccountParamSnapshot.create({ loanAccountId: account.id, productVersion: product.version, snapshotJson: JSON.stringify(snapshot) }, { transaction });

      const principalId = children.componentIdOf('PRINCIPAL');
      const interestId = children.componentIdOf('INTEREST');
      if (!principalId || !interestId) throw new LoanError(409, 'PRINCIPAL and INTEREST components must exist');
      for (const r of schedule.rows) {
        const s = await db.lnSchedule.create({ loanAccountId: account.id, installmentNo: r.no, dueDate: r.dueDate, originalDueDate: r.originalDueDate, status: 'UNPAID' }, { transaction });
        await db.lnScheduleComponent.bulkCreate([
          { scheduleId: s.id, componentId: principalId, amountDue: r.principal, amountPaid: 0, amountWaived: 0, status: 'UNPAID' },
          { scheduleId: s.id, componentId: interestId, amountDue: r.interest, amountPaid: 0, amountWaived: 0, status: 'UNPAID' }
        ], { transaction });
      }
      await db.lnAccountBalance.bulkCreate([principalId, interestId].map(componentId => ({ loanAccountId: account.id, componentId, outstandingAmount: 0, totalAccrued: 0, totalBilled: 0, totalPaid: 0, totalWaived: 0 })), { transaction });
      await app.update({ status: 'BOOKED' }, { transaction });
      await audit('account', account, accountNo, 'BOOK', ctxUser, { applicationId: app.id, installments: schedule.rows.length }, transaction);
      return { account, schedule };
    });
  },

  async list() {
    return db.lnAccount.findAll({ order: [['id', 'DESC']], limit: 200 });
  },

  async get(id) {
    const { account, snapshot } = await loadAccount(id);
    const schedules = await db.lnSchedule.findAll({ where: { loanAccountId: account.id }, order: [['installmentNo', 'ASC']] });
    return { account, schedule: snapshot.schedule, storedInstallments: schedules.length, snapshot };
  },

  // Read-only engine previews: tags + journal lines from the AUTHORIZED rules + validator results
  async preview(id, kind, body = {}) {
    if (!PREVIEWS.includes(kind)) throw new LoanError(404, `Unknown preview ${kind}`);
    const { account, snapshot } = await loadAccount(id);
    const date = body.date || await ctx.businessDate();
    if (!DATE_RE.test(date)) throw new LoanError(400, 'date must be YYYY-MM-DD');
    const rounder = E.rounding.makeRounder(snapshot.currencyRule);
    const live = await ctx.classification(date);
    const state = await buildState(account, snapshot, live.statusMaster, date, rounder);
    const product = productOf(snapshot);
    const qualifier = (live.statusMaster[account.status] || {}).glQualifier;
    let result;

    if (kind === 'due-date') {
      const due = snapshot.schedule.rows.filter(r => r.dueDate === date);
      const events = due.flatMap(r => E.interest.dueDateProcessing({ installment: r, recognition: product.interestRecognitionCode, interestTreatment: live.statusMaster[account.status].interestTreatment, rounder }));
      result = { events, details: { installments: due.map(r => r.no) } };
    } else if (kind === 'payment') {
      if (!/^\d{1,16}(\.\d{1,4})?$/.test(String(body.amount || ''))) throw new LoanError(400, 'amount must be a decimal');
      const r = E.allocation.allocatePayment({
        state, amount: String(body.amount), date, useAdvance: Boolean(body.useAdvance),
        waterfall: ctx.waterfallFor(snapshot.waterfall, account.status), oldestInstallmentFirst: product.oldestInstallmentFirst !== false,
        overpaymentTreatment: product.overpaymentTreatment, rounder
      });
      result = { events: r.events.map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })), details: { allocations: r.allocations, partialPrepayment: r.partialPrepayment, advanceRemaining: r.advanceRemaining } };
    } else if (kind === 'prepayment') {
      const fee = snapshot.components.find(c => c.componentCode === 'PREPAYMENT_PENALTY');
      const q = E.prepayment.prepaymentQuote({
        schedule: snapshot.schedule, state, date, rebateMethod: product.earlySettlementRebateMethod, annualRate: String(account.interestRate),
        dayCount: snapshot.dayCount, valueDate: String(account.valueDate), earlyFeeRate: fee ? String(fee.defaultValue) : '0', rounder
      });
      result = { events: q.events.map(e => ({ ...e, qualifiers: { CURRENT: qualifier } })), details: { cashRequired: q.cashRequired, breakdown: q.breakdown } };
    } else {
      const dpd = E.state.dpd(state, date);
      const st = E.status.evaluateStatus({
        currentStatus: account.status, dpd, movementRules: live.movementRules, cureRules: live.cureRules, statusMaster: live.statusMaster,
        onTimeStreak: 0, monthsInStatus: 0, outstandingPrincipal: E.state.componentTotal(state, 'PRINCIPAL'),
        bookedUnpaidInterest: E.state.interestByBucket(state, date, 'BOOKED'), suspendedInterest: E.state.interestByBucket(state, date, 'SUSPENDED'), rounder
      });
      const classCode = (live.statusMaster[st.newStatus] || {}).regulatoryClassCode;
      const rule = classCode ? await ctx.provisionRuleFor(classCode, product, date) : null;
      const collateral = await db.lnLoanCollateral.findAll({ where: { loanAccountId: account.id } });
      const lastProvision = await db.lnProvisionLedger.findOne({ where: { loanAccountId: account.id }, order: [['evaluationDate', 'DESC'], ['id', 'DESC']] });
      const provision = rule ? E.provision.calculateProvision({
        outstandingPrincipal: E.state.componentTotal(state, 'PRINCIPAL'), collateralValue: N.sum(collateral.map(c => String(c.allocatedValue))),
        rule, booked: lastProvision ? String(lastProvision.bookedProvision) : '0', rounder
      }) : null;
      result = { events: [...st.events, ...(provision ? provision.events : [])], details: { status: st, provision } };
    }
    const journal = await previewJournal(product, result.events, { currency: account.currencyId, asOfDate: date });
    return { kind, date, accountNo: account.accountNo, ...result, journal, fx: await previewFx(account, date, kind === 'payment' ? body.amount : null, result.details && result.details.cashRequired) };
  }
};

module.exports = accountService;
