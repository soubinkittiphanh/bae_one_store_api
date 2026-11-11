/**
 * Phase 5 Part B1: read-only views for the loan screens (no posting, no changes).
 *   accounts / account summary / schedule / history / statement   per account, in the contract currency
 *   pending transactions                                           the checker queue
 *   eod logs, overdue (collection), portfolio, aging, npl, provisions, gl-tieout
 * Phase 6: every list takes the caller's branch scope (req.branchScope from scoped('list')) and shows only
 * records of those branches; an empty scope (no terminal) shows nothing. Per-record views are guarded by
 * the router (scoped('account') and friends).
 * Wherever an amount is converted, the view gives the contract amount, the base amount, the rate, the rate
 * date and the rate-age warning (fx block). Stored transactions show the rate they were posted at; open
 * balances show the latest authorized rate for the business date (indicative, from ln_exchange_rate).
 */
const { Op } = require('sequelize');
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const FX = require('../accounting/fx');
const { toUnits, fromUnits } = require('../accounting/journal');
const { findAllExact, findOneExact } = require('../db/exact');
const fxRates = require('./fxRateService');
const ctx = require('./loanContext');
const { PRINT_PLACEHOLDERS } = require('./paramRegistry');
const { whereScope } = require('./branchScope');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGING = [[0, 0, 'CURRENT'], [1, 30, '1-30'], [31, 60, '31-60'], [61, 90, '61-90'], [91, 180, '91-180'], [181, Infinity, '181+']];

// Signed decimal string <-> 4-decimal units
const su = (v) => { const s = String(v === null || v === undefined ? 0 : v); return s.startsWith('-') ? -toUnits(s.slice(1)) : toUnits(Number.isFinite(Number(s)) && /e/i.test(s) ? Number(s).toFixed(4) : s); };
const str = u => fromUnits(u);
const dateArg = (v, label) => { if (v && !DATE_RE.test(String(v))) throw new LoanError(400, `${label} must be YYYY-MM-DD`); return v ? String(v) : null; };

// ------------------------------------------------------------------ currency / fx helpers
const currencyMap = async () => Object.fromEntries((await db.currency.findAll({ attributes: ['id', 'code', 'isLocalCCY'] })).map(c => [c.id, c]));

// The latest authorized rate for the date with its warning; never throws (a missing rate is a warning)
const indicativeFx = async (currencyId, date, cache = new Map()) => {
  const key = `${currencyId}|${date}`;
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    const r = await fxRates.rateFor(currencyId, date);
    out = r.isBase ? null : { rate: r.rate, rateDate: r.rateDate, ageDays: r.ageDays, warning: r.warning };
  } catch (err) {
    if (!(err instanceof LoanError)) throw err;
    out = { rate: null, rateDate: null, ageDays: null, warning: err.message };
  }
  cache.set(key, out);
  return out;
};

const makeConverter = async (date) => {
  const base = await fxRates.baseCurrency();
  const decimals = await fxRates.baseDecimals(date);
  return {
    base,
    decimals,
    // units in the contract currency -> base units at the fx block's rate (null when there is no rate)
    toBase: (units, fx) => (fx === null ? units : (fx.rate ? FX.toBase(units, FX.rateUnits(fx.rate), decimals) : null))
  };
};

const fxBlock = (fx, conv) => (fx === null ? null : { rate: fx.rate, rateDate: fx.rateDate, ageDays: fx.ageDays, warning: fx.warning, baseCurrency: conv.base.code, indicative: true });
const money = (units, fx, conv) => {
  const baseU = conv.toBase(units, fx);
  return { amount: str(units), baseAmount: baseU === null ? null : str(baseU) };
};

// ------------------------------------------------------------------ account state from the stored schedule
const scheduleState = async (accountId, date) => {
  const [schedules, components] = await Promise.all([
    db.lnSchedule.findAll({ where: { loanAccountId: accountId }, order: [['installmentNo', 'ASC']] }),
    db.lnComponent.findAll({ attributes: ['id', 'componentCode'] })
  ]);
  const codeOf = Object.fromEntries(components.map(c => [c.id, c.componentCode]));
  const comps = schedules.length ? await findAllExact(db.lnScheduleComponent, { where: { scheduleId: schedules.map(s => s.id) } }) : [];
  const totals = { outstanding: {}, overdue: {} };
  let oldestOverdue = null;
  let nextDue = null;
  const rows = schedules.map((s) => {
    const mine = comps.filter(c => c.scheduleId === s.id);
    const parts = {};
    let open = 0n;
    for (const c of mine) {
      const code = codeOf[c.componentId] || String(c.componentId);
      const o = su(c.amountDue) - su(c.amountWaived) - su(c.amountPaid);
      parts[code] = { due: String(c.amountDue), paid: String(c.amountPaid), waived: String(c.amountWaived), outstanding: str(o), bucket: c.bucket || null };
      open += o;
      totals.outstanding[code] = (totals.outstanding[code] || 0n) + o;
      if (String(s.dueDate) <= date && o > 0n) totals.overdue[code] = (totals.overdue[code] || 0n) + o;
    }
    if (open > 0n && String(s.dueDate) <= date && !oldestOverdue) oldestOverdue = String(s.dueDate);
    if (open > 0n && String(s.dueDate) > date && !nextDue) nextDue = { installmentNo: s.installmentNo, dueDate: String(s.dueDate), amount: str(open) };
    return { installmentNo: s.installmentNo, dueDate: String(s.dueDate), originalDueDate: String(s.originalDueDate), status: s.status, components: parts, outstanding: str(open) };
  });
  const sum = m => Object.values(m).reduce((a, b) => a + b, 0n);
  return {
    rows,
    outstandingUnits: sum(totals.outstanding),
    overdueUnits: sum(totals.overdue),
    byComponent: totals,
    dpd: oldestOverdue ? E.dates.daysBetween(oldestOverdue, date) : 0,
    oldestOverdue,
    nextDue
  };
};

const bucketOf = dpd => AGING.find(([lo, hi]) => dpd >= lo && dpd <= hi)[2];

// Carrying base of the portfolio (signed journal legs of LOAN_PORTFOLIO, Dr positive)
const carrying = async (accountId, role = 'LOAN_PORTFOLIO') => {
  const legs = await findAllExact(db.lnJournalPosting, { where: { loanAccountId: accountId, roleCode: role }, attributes: ['drCr', 'amount', 'baseAmount'] });
  let amount = 0n;
  let base = 0n;
  for (const l of legs) { const s = l.drCr === 'DR' ? 1n : -1n; amount += s * su(l.amount); base += s * su(l.baseAmount); }
  return { amount: str(amount), baseAmount: str(base) };
};

const clientOf = async (id) => {
  const c = await db.client.findByPk(id, { attributes: ['id', 'name', 'telephone'] });
  return c ? { id: c.id, name: c.name, telephone: c.telephone } : { id, name: null, telephone: null };
};

const loadAccountRow = async (id) => {
  const account = await findOneExact(db.lnAccount, { where: { id } });
  if (!account) throw new LoanError(404, `Account ${id} not found`);
  return account;
};

// ------------------------------------------------------------------ service
const reportService = {
  indicativeFx,

  async accounts(query = {}, scope) {
    const where = { ...whereScope(scope) };
    if (query.status) where.status = String(query.status).split(',');
    if (query.stage) where.accountStage = String(query.stage).split(',');
    if (query.currencyId) where.currencyId = Number(query.currencyId);
    if (query.search) {
      const s = `%${String(query.search).slice(0, 50)}%`;
      const clients = await db.client.findAll({ where: { [Op.or]: [{ name: { [Op.like]: s } }, { telephone: { [Op.like]: s } }] }, attributes: ['id'], limit: 200 });
      where[Op.or] = [{ accountNo: { [Op.like]: s } }, { customerId: clients.map(c => c.id) }];
    }
    const limit = Math.min(Number(query.limit) || 100, 500);
    const rows = await findAllExact(db.lnAccount, { where, order: [['id', 'DESC']], limit });
    const [ccy, clients, products] = await Promise.all([
      currencyMap(),
      db.client.findAll({ where: { id: [...new Set(rows.map(r => r.customerId))] }, attributes: ['id', 'name', 'telephone'] }),
      db.lnProduct.findAll({ where: { id: [...new Set(rows.map(r => r.productId))] }, attributes: ['id', 'productCode', 'name'] })
    ]);
    const cl = Object.fromEntries(clients.map(c => [c.id, c]));
    const pr = Object.fromEntries(products.map(p => [p.id, p]));
    return rows.map(a => ({
      id: a.id, accountNo: a.accountNo, branchId: a.branchId, status: a.status, accountStage: a.accountStage, currentDpd: a.currentDpd, regulatoryClass: a.regulatoryClass,
      currencyId: a.currencyId, currency: ccy[a.currencyId] ? ccy[a.currencyId].code : null, sanctionedAmount: String(a.sanctionedAmount), disbursedAmount: String(a.disbursedAmount),
      valueDate: String(a.valueDate), maturityDate: String(a.maturityDate),
      customer: cl[a.customerId] ? { id: a.customerId, name: cl[a.customerId].name, telephone: cl[a.customerId].telephone } : { id: a.customerId },
      product: pr[a.productId] ? { id: a.productId, productCode: pr[a.productId].productCode, name: pr[a.productId].name } : { id: a.productId }
    }));
  },

  async accountSummary(id) {
    const account = await loadAccountRow(id);
    const date = await ctx.businessDate();
    const [ccy, state, customer, product, conv, port] = await Promise.all([
      currencyMap(), scheduleState(account.id, date), clientOf(account.customerId),
      db.lnProduct.findByPk(account.productId, { attributes: ['id', 'productCode', 'name', 'version'] }), makeConverter(date), carrying(account.id)
    ]);
    const fx = await indicativeFx(account.currencyId, date);
    const lastPayment = await findOneExact(db.lnTransaction, { where: { loanAccountId: account.id, eventCode: ['REPAYMENT', 'PREPAY', 'RECOVERY'], postingStatus: 'POSTED', isReversed: false }, order: [['id', 'DESC']] });
    const byComp = Object.fromEntries(Object.entries(state.byComponent.outstanding).map(([k, v]) => [k, money(v, fx, conv)]));
    return {
      account: { ...account.get({ plain: true }), valueDate: String(account.valueDate), firstDueDate: String(account.firstDueDate), maturityDate: String(account.maturityDate), sanctionedAmount: String(account.sanctionedAmount), disbursedAmount: String(account.disbursedAmount), advanceBalance: String(account.advanceBalance) },
      currency: ccy[account.currencyId] ? ccy[account.currencyId].code : null,
      baseCurrency: conv.base.code,
      customer,
      product,
      businessDate: date,
      fx: fxBlock(fx, conv),
      outstanding: money(state.outstandingUnits, fx, conv),
      overdue: money(state.overdueUnits, fx, conv),
      outstandingByComponent: byComp,
      advance: money(su(account.advanceBalance), fx, conv),
      dpd: state.dpd,
      agingBucket: bucketOf(state.dpd),
      nextDue: state.nextDue ? { ...state.nextDue, ...money(su(state.nextDue.amount), fx, conv) } : null,
      // The portfolio as booked: contract amount and its carrying base from the journal (rates actually posted)
      portfolioCarrying: port,
      lastPayment: lastPayment ? { txNo: lastPayment.txNo, valueDate: String(lastPayment.valueDate), amount: String(lastPayment.amount), baseAmount: String(lastPayment.baseAmount), exchangeRate: String(lastPayment.exchangeRate) } : null
    };
  },

  async schedule(id) {
    const account = await loadAccountRow(id);
    const date = await ctx.businessDate();
    const state = await scheduleState(account.id, date);
    return { accountNo: account.accountNo, businessDate: date, rows: state.rows, outstanding: str(state.outstandingUnits), overdue: str(state.overdueUnits) };
  },

  async history(id) {
    const account = await loadAccountRow(id);
    const [statuses, amendments, audits] = await Promise.all([
      db.lnStatusHistory.findAll({ where: { loanAccountId: account.id }, order: [['id', 'ASC']] }),
      db.lnAmendmentHistory.findAll({ where: { loanAccountId: account.id }, order: [['id', 'ASC']] }),
      db.lnAuditLog.findAll({ where: { entityName: 'account', entityId: account.id }, order: [['id', 'ASC']] })
    ]);
    return {
      accountNo: account.accountNo,
      statusHistory: statuses.map(s => ({ effectiveDate: String(s.effectiveDate), oldStatus: s.oldStatus, newStatus: s.newStatus, triggeredBy: s.triggeredBy, changeReason: s.changeReason, approvalUserId: s.approvalUserId })),
      amendments: amendments.map(a => ({ effectiveDate: String(a.effectiveDate), amendmentType: a.amendmentType, source: a.source, transactionId: a.transactionId, makerId: a.makerId, approvedBy: a.approvedBy, oldValues: JSON.parse(a.oldValuesJson || '{}'), newValues: JSON.parse(a.newValuesJson || '{}') })),
      audit: audits.map(a => ({ actionType: a.actionType, userId: a.userId, timestamp: a.timestamp }))
    };
  },

  // Customer statement in the contract currency: opening principal, every posted movement with its own
  // posting rate and base amount, closing principal. The principal column follows LOAN_PORTFOLIO legs.
  async statement(id, query = {}) {
    const account = await loadAccountRow(id);
    const date = await ctx.businessDate();
    const from = dateArg(query.from, 'from') || String(account.valueDate);
    const to = dateArg(query.to, 'to') || date;
    if (to < from) throw new LoanError(400, 'to is before from');
    const ccy = await currencyMap();
    const txns = await findAllExact(db.lnTransaction, { where: { loanAccountId: account.id, postingStatus: 'POSTED' }, order: [['id', 'ASC']] });
    const legs = txns.length ? await findAllExact(db.lnJournalPosting, { where: { transactionId: txns.map(t => t.id), roleCode: 'LOAN_PORTFOLIO' }, attributes: ['transactionId', 'drCr', 'amount', 'baseAmount'] }) : [];
    const principalOf = (txId) => {
      let a = 0n;
      for (const l of legs.filter(x => x.transactionId === txId)) a += (l.drCr === 'DR' ? 1n : -1n) * su(l.amount);
      return a;
    };
    const dateOf = t => String(t.bookingDate || t.postingDate);
    let opening = 0n;
    for (const t of txns.filter(x => dateOf(x) < from)) opening += principalOf(t.id);
    let running = opening;
    const movements = [];
    for (const t of txns.filter(x => dateOf(x) >= from && dateOf(x) <= to)) {
      const change = principalOf(t.id);
      running += change;
      const foreign = !(ccy[t.currencyId] && ccy[t.currencyId].isLocalCCY);
      movements.push({
        txNo: t.txNo, eventCode: t.eventCode, bookingDate: dateOf(t), valueDate: String(t.valueDate), source: t.source,
        amount: String(t.amount), principalChange: str(change), principalBalance: str(running),
        ...(foreign ? { baseAmount: String(t.baseAmount), exchangeRate: String(t.exchangeRate), exchangeRateDate: t.exchangeRateDate ? String(t.exchangeRateDate) : null, rateWarning: t.fxWarning || null } : {}),
        reversed: Boolean(t.isReversed), reversalOf: t.reversalOfTxId || null
      });
    }
    const conv = await makeConverter(to);
    const fx = await indicativeFx(account.currencyId, to);
    return {
      accountNo: account.accountNo, currency: ccy[account.currencyId] ? ccy[account.currencyId].code : null, baseCurrency: conv.base.code,
      customer: await clientOf(account.customerId), from, to,
      opening: str(opening), movements, closing: money(running, fx, conv), fx: fxBlock(fx, conv)
    };
  },

  async pendingTransactions(query = {}, scope) {
    const where = { ...whereScope(scope), postingStatus: 'PENDING_AUTH' };
    if (query.kind) where.eventCode = String(query.kind).split(',');
    const rows = await findAllExact(db.lnTransaction, { where, order: [['id', 'ASC']], limit: 500 });
    const [ccy, accounts, users] = await Promise.all([
      currencyMap(),
      db.lnAccount.findAll({ where: { id: [...new Set(rows.map(r => r.loanAccountId))] }, attributes: ['id', 'accountNo', 'customerId', 'currencyId'] }),
      db.user ? db.user.findAll({ where: { id: [...new Set(rows.map(r => r.makerId).filter(Boolean))] }, attributes: ['id', 'cus_name'] }).catch(() => []) : []
    ]);
    const acc = Object.fromEntries(accounts.map(a => [a.id, a]));
    const clients = Object.fromEntries((await db.client.findAll({ where: { id: [...new Set(accounts.map(a => a.customerId))] }, attributes: ['id', 'name'] })).map(c => [c.id, c.name]));
    const names = Object.fromEntries(users.map(u => [u.id, u.cus_name]));
    const cache = new Map();
    const out = [];
    for (const t of rows) {
      const a = acc[t.loanAccountId] || {};
      const date = String(t.bookingDate || t.postingDate);
      const fx = await indicativeFx(t.currencyId, date, cache);
      const conv = await makeConverter(date);
      out.push({
        transactionId: t.id, txNo: t.txNo, eventCode: t.eventCode, accountId: t.loanAccountId, accountNo: a.accountNo, customer: clients[a.customerId] || null,
        currency: ccy[t.currencyId] ? ccy[t.currencyId].code : null, valueDate: String(t.valueDate), bookingDate: date,
        ...money(su(t.amount), fx, conv), fx: fxBlock(fx, conv),
        makerId: t.makerId, makerName: names[t.makerId] || null, createdAt: t.createdAt, remarks: t.remarks,
        request: JSON.parse(t.requestJson || '{}')
      });
    }
    return out;
  },

  async eodLogs(query = {}) {
    const limit = Math.min(Number(query.limit) || 50, 500);
    const [logs, batches, jobs] = await Promise.all([
      db.lnBatchLog.findAll({ order: [['id', 'DESC']], limit }),
      db.lnGlBatch.findAll({ where: { batchType: 'EOD' }, order: [['id', 'DESC']], limit }),
      db.lnBatchJob.findAll({ order: [['executionOrder', 'ASC']] })
    ]);
    const ccy = await currencyMap();
    // Rate each foreign currency with open accounts would use at the next EOD (the loan business date)
    const date = await ctx.businessDate();
    const open = await db.lnAccount.findAll({ where: { accountStage: 'DISBURSED' }, attributes: ['currencyId'], group: ['currencyId'] });
    const rates = [];
    for (const { currencyId } of open) {
      if (ccy[currencyId] && ccy[currencyId].isLocalCCY) continue;
      const fx = await indicativeFx(currencyId, date);
      rates.push({ currency: ccy[currencyId] ? ccy[currencyId].code : String(currencyId), date, rate: fx ? fx.rate : null, rateDate: fx ? fx.rateDate : null, warning: fx ? fx.warning : null });
    }
    return {
      businessDate: date,
      rates,
      jobs: jobs.map(j => ({ jobCode: j.jobCode, name: j.name, executionOrder: j.executionOrder, isEnabled: j.isEnabled, authStatus: j.authStatus, lastRunDate: j.lastRunDate, lastStatus: j.lastStatus })),
      logs,
      batches: batches.map(b => ({ batchNumber: b.batchNumber, businessDate: String(b.businessDate), jobCode: b.jobCode, currency: ccy[b.currencyId] ? ccy[b.currencyId].code : null, status: b.status, totalDebit: String(b.totalDebit), totalCredit: String(b.totalCredit) }))
    };
  },

  // Collection list: every disbursed, open account with an overdue amount as of the business date
  async overdue(query = {}, scope) {
    const date = dateArg(query.date, 'date') || await ctx.businessDate();
    const accounts = await findAllExact(db.lnAccount, { where: { ...whereScope(scope), accountStage: 'DISBURSED' }, order: [['id', 'ASC']] });
    const ccy = await currencyMap();
    const conv = await makeConverter(date);
    const cache = new Map();
    const rows = [];
    for (const a of accounts) {
      const st = await scheduleState(a.id, date);
      if (st.overdueUnits <= 0n) continue;
      const fx = await indicativeFx(a.currencyId, date, cache);
      const last = await findOneExact(db.lnTransaction, { where: { loanAccountId: a.id, eventCode: ['REPAYMENT', 'PREPAY', 'RECOVERY'], postingStatus: 'POSTED', isReversed: false }, order: [['id', 'DESC']] });
      const customer = await clientOf(a.customerId);
      rows.push({
        accountId: a.id, accountNo: a.accountNo, status: a.status, currency: ccy[a.currencyId] ? ccy[a.currencyId].code : null,
        customer: customer.name, telephone: customer.telephone, dpd: st.dpd, bucket: bucketOf(st.dpd), oldestDueDate: st.oldestOverdue,
        overdue: money(st.overdueUnits, fx, conv),
        overdueByComponent: Object.fromEntries(Object.entries(st.byComponent.overdue).map(([k, v]) => [k, str(v)])),
        outstanding: money(st.outstandingUnits, fx, conv), fx: fxBlock(fx, conv),
        lastPayment: last ? { date: String(last.valueDate), amount: String(last.amount) } : null
      });
    }
    rows.sort((x, y) => y.dpd - x.dpd);
    return { date, baseCurrency: conv.base.code, rows };
  },

  // Portfolio / aging / NPL: open disbursed accounts grouped, per currency with the indicative base total
  async portfolio(query = {}, groupBy = 'product', scope) {
    const date = dateArg(query.date, 'date') || await ctx.businessDate();
    const accounts = await findAllExact(db.lnAccount, { where: { ...whereScope(scope), accountStage: 'DISBURSED' }, order: [['id', 'ASC']] });
    const [ccy, products, classes] = await Promise.all([currencyMap(), db.lnProduct.findAll({ attributes: ['id', 'productCode'] }), db.lnRegulatoryClass.findAll()]);
    const pcode = Object.fromEntries(products.map(p => [p.id, p.productCode]));
    const qualifier = Object.fromEntries(classes.map(c => [c.classCode, c.glQualifier]));
    const conv = await makeConverter(date);
    const cache = new Map();
    const groups = new Map();
    let baseTotal = 0n;
    let baseMissing = false;
    for (const a of accounts) {
      const st = await scheduleState(a.id, date);
      const npl = ['SUBSTANDARD', 'DOUBTFUL', 'LOSS'].includes(qualifier[a.regulatoryClass]);
      if (groupBy === 'npl' && !npl) continue;
      const g = groupBy === 'aging' ? bucketOf(st.dpd) : groupBy === 'npl' ? a.regulatoryClass : groupBy === 'branch' ? String(a.branchId) : pcode[a.productId] || String(a.productId);
      const code = ccy[a.currencyId] ? ccy[a.currencyId].code : String(a.currencyId);
      const key = `${g}|${code}`;
      const fx = await indicativeFx(a.currencyId, date, cache);
      const baseU = conv.toBase(st.outstandingUnits, fx);
      if (baseU === null) baseMissing = true; else baseTotal += baseU;
      const row = groups.get(key) || { group: g, currency: code, accounts: 0, outstandingU: 0n, overdueU: 0n, baseU: 0n, baseMissing: false, fx: fxBlock(fx, conv) };
      row.accounts += 1;
      row.outstandingU += st.outstandingUnits;
      row.overdueU += st.overdueUnits;
      if (baseU === null) row.baseMissing = true; else row.baseU += baseU;
      groups.set(key, row);
    }
    const rows = [...groups.values()].map(r => ({ group: r.group, currency: r.currency, accounts: r.accounts, outstanding: str(r.outstandingU), overdue: str(r.overdueU), outstandingBase: r.baseMissing ? null : str(r.baseU), fx: r.fx }));
    rows.sort((x, y) => (x.group === y.group ? x.currency.localeCompare(y.currency) : (groupBy === 'aging' ? AGING.findIndex(b => b[2] === x.group) - AGING.findIndex(b => b[2] === y.group) : String(x.group).localeCompare(String(y.group)))));
    return { date, groupBy, baseCurrency: conv.base.code, rows, totalBase: baseMissing ? null : str(baseTotal), totalBaseIncomplete: baseMissing };
  },

  async provisions(query = {}, scope) {
    const date = dateArg(query.date, 'date') || await ctx.businessDate();
    const within = whereScope(scope);
    const ledger = await findAllExact(db.lnProvisionLedger, { where: { evaluationDate: { [Op.lte]: date } }, order: [['loanAccountId', 'ASC'], ['evaluationDate', 'DESC'], ['id', 'DESC']] });
    const latest = new Map();
    for (const l of ledger) if (!latest.has(l.loanAccountId)) latest.set(l.loanAccountId, l);
    const accounts = latest.size ? await db.lnAccount.findAll({ where: { ...within, id: [...latest.keys()] }, attributes: ['id', 'accountNo', 'currencyId', 'regulatoryClass'] }) : [];
    const ccy = await currencyMap();
    const conv = await makeConverter(date);
    const cache = new Map();
    const rows = [];
    for (const a of accounts) {
      const l = latest.get(a.id);
      const fx = await indicativeFx(a.currencyId, date, cache);
      rows.push({
        accountId: a.id, accountNo: a.accountNo, currency: ccy[a.currencyId] ? ccy[a.currencyId].code : null, regulatoryClass: a.regulatoryClass,
        evaluationDate: String(l.evaluationDate), outstandingPrincipal: String(l.outstandingPrincipal), netExposure: String(l.netExposure), provisionRate: String(l.provisionRate),
        ...money(su(l.bookedProvision), fx, conv), fx: fxBlock(fx, conv)
      });
    }
    return { date, baseCurrency: conv.base.code, rows };
  },

  // The AUTHORIZED print template effective on the business date (D11); printing is blocked without one
  async printTemplate(code) {
    const date = await ctx.businessDate();
    const rows = (await db.lnPrintTemplate.findAll({ where: { templateCode: String(code), authStatus: 'AUTHORIZED' } })).map(r => r.get({ plain: true }));
    const t = ctx.effectiveOn(rows, date)[0];
    if (!t) throw new LoanError(404, `No authorized ${code} template effective on ${date}; a checker must authorize one (Parameter Studio, print templates)`);
    return { templateCode: t.templateCode, title: t.title, body: t.body, effectiveFrom: String(t.effectiveFrom), placeholders: PRINT_PLACEHOLDERS };
  },

  // GL tie-out: per chart account (and role), the loan journal against the POS general_ledger rows the loan
  // wrote (rows its legs point to, and rows a loan transaction linked in ln_pos_link, e.g. a REVERSAL's
  // mirrored rows), in the transaction currency and in base. A leg is unlinked when it has no GL row and its
  // transaction linked none either.
  // Phase 6: a branch-limited caller sees the legs of accounts in their branches and only the GL rows those
  // legs and their transactions point to (legs without an account are company-wide and left out). Legs are
  // matched through their account, not ln_journal_posting.branchId, until journal tagging (Stage 2).
  async glTieout(scope) {
    const within = whereScope(scope);
    const accountIds = scope.all ? null : (await db.lnAccount.findAll({ where: within, attributes: ['id'] })).map(a => a.id);
    const legWhere = accountIds ? { loanAccountId: accountIds.length ? accountIds : [-1] } : {};
    const legs = await findAllExact(db.lnJournalPosting, { where: legWhere, attributes: ['transactionId', 'roleCode', 'amountTag', 'chartAccountId', 'drCr', 'currencyId', 'amount', 'baseAmount', 'glRecordId'] });
    const linkWhere = { posTable: 'general_ledger', ...(accountIds ? { transactionId: [...new Set(legs.map(l => l.transactionId).filter(Boolean))].concat([-1]) } : {}) };
    const links = await db.lnPosLink.findAll({ where: linkWhere, attributes: ['transactionId', 'posId'] });
    const txWithGl = new Set(links.map(l => l.transactionId));
    const glIds = [...new Set([...legs.map(l => l.glRecordId).filter(Boolean), ...links.map(l => l.posId)])];
    const glRows = glIds.length ? (await db.sequelize.query(
      'SELECT id, drAccountId, crAccountId, currencyId, CAST(debit AS CHAR) debit, CAST(localDebit AS CHAR) localDebit FROM general_ledger WHERE id IN (:ids)',
      { replacements: { ids: glIds }, type: db.Sequelize.QueryTypes.SELECT })) : [];
    const charts = await db.chartAccount.findAll({ where: { id: [...new Set(legs.map(l => l.chartAccountId))] }, attributes: ['id', 'accountNumber', 'accountName'] });
    const chart = Object.fromEntries(charts.map(c => [c.id, c]));
    const ccy = await currencyMap();
    const acc = new Map();
    const row = (chartId, currencyId) => {
      const key = `${chartId}|${currencyId}`;
      if (!acc.has(key)) acc.set(key, { chartAccountId: chartId, currencyId, roles: new Set(), jAmt: 0n, jBase: 0n, gAmt: 0n, gBase: 0n, unlinked: 0 });
      return acc.get(key);
    };
    for (const l of legs) {
      const r = row(l.chartAccountId, l.currencyId);
      const s = l.drCr === 'DR' ? 1n : -1n;
      r.roles.add(l.roleCode);
      r.jAmt += s * su(l.amount);
      r.jBase += s * su(l.baseAmount);
      // Phase 6 Stage 4: BRANCH_TRANSFER memo legs (and their REVERSAL mirrors, same tag) have no GL row by
      // design and net to zero per chart account company-wide: they are not "unlinked"
      if (!l.glRecordId && !txWithGl.has(l.transactionId) && l.amountTag !== 'BRANCH_TRANSFER') r.unlinked += 1;
    }
    // Each GL row counts once per side; base-only rows (debit 0) add base only
    for (const g of glRows) {
      for (const [side, chartId] of [[1n, g.drAccountId], [-1n, g.crAccountId]]) {
        const r = row(chartId, g.currencyId);
        r.gAmt += side * su(g.debit);
        r.gBase += side * su(g.localDebit);
      }
    }
    const rows = [...acc.values()].filter(r => r.roles.size || r.gAmt || r.gBase).map(r => ({
      accountNumber: chart[r.chartAccountId] ? String(chart[r.chartAccountId].accountNumber) : null, accountName: chart[r.chartAccountId] ? chart[r.chartAccountId].accountName : null,
      currency: ccy[r.currencyId] ? ccy[r.currencyId].code : null, roles: [...r.roles].sort(),
      journal: { amount: str(r.jAmt), baseAmount: str(r.jBase) }, gl: { amount: str(r.gAmt), baseAmount: str(r.gBase) },
      difference: { amount: str(r.jAmt - r.gAmt), baseAmount: str(r.jBase - r.gBase) }, unlinkedLegs: r.unlinked
    }));
    rows.sort((x, y) => String(x.accountNumber).localeCompare(String(y.accountNumber)) || String(x.currency).localeCompare(String(y.currency)));
    // Unlinked legs are information only: a status change between classes mapped to the same chart account
    // nets to nothing and writes no GL row. The tie-out is the difference per account.
    return { rows, balanced: rows.every(r => r.difference.amount === '0.0000' && r.difference.baseAmount === '0.0000') };
  }
};

module.exports = reportService;
