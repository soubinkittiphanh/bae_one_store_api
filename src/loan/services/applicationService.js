/**
 * Loan applications: DRAFT -> SUBMITTED -> APPROVED -> BOOKED (or REJECTED).
 * Single-level maker-checker (decision D8): the approver must differ from the maker unless
 * SPF LOAN_ALLOW_SELF_AUTHORIZE = 'true' (audited as SELF_AUTH). The borrower is a POS client
 * (decision D1). Terms are checked against the product and by generating the schedule.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const ctx = require('./loanContext');
const { productTerms, limitProblems } = require('./simulationService');
const { productCurrency } = require('./currencyAmounts');
const { nextNumber } = require('./numberingService');
const { whereScope } = require('./branchScope');

const N = E.num;
const EDITABLE = ['customerId', 'productId', 'currencyId', 'branchId', 'vehicleSaleHeaderId', 'vehiclePrice', 'downPaymentAmount',
  'requestedAmount', 'tenorMonths', 'interestRate', 'balloonAmount', 'valueDate', 'firstDueDate', 'graceType', 'gracePeriods', 'purposeCode'];
const MONEY = ['vehiclePrice', 'downPaymentAmount', 'requestedAmount', 'balloonAmount'];
const MONEY_RE = /^\d{1,16}(\.\d{1,4})?$/;

const audit = (app, actionType, ctxUser, oldValues, newValues, transaction) => db.lnAuditLog.create({
  entityName: 'application', entityId: app.id, entityKey: app.appNo, actionType,
  oldValuesJson: oldValues ? JSON.stringify(oldValues) : null,
  newValuesJson: newValues ? JSON.stringify(newValues) : null,
  userId: ctxUser.userId, ipAddress: ctxUser.ip || null, timestamp: new Date()
}, { transaction });

const selfAuthorizeAllowed = async (transaction) => {
  const spf = await db.spf.findOne({ where: { code: 'LOAN_ALLOW_SELF_AUTHORIZE' }, transaction });
  return Boolean(spf && String(spf.value).trim().toLowerCase() === 'true');
};

const pickBody = (body) => {
  const unknown = Object.keys(body || {}).filter(k => !EDITABLE.includes(k));
  if (unknown.length) throw new LoanError(400, `Unknown field(s): ${unknown.join(', ')}`);
  for (const f of MONEY) if (body[f] !== undefined && !MONEY_RE.test(String(body[f]))) throw new LoanError(400, `${f} must be a decimal with up to 4 places`);
  return Object.fromEntries(EDITABLE.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
};

// Product, borrower, currency, limits, down payment / LTV and a schedule trial
const validateTerms = async (values) => {
  const product = await db.lnProduct.findByPk(values.productId);
  if (!product || product.authStatus !== 'AUTHORIZED' || product.status !== 'ACTIVE') throw new LoanError(400, 'Product must be an AUTHORIZED, ACTIVE version');
  if (!(await db.client.findByPk(values.customerId))) throw new LoanError(400, `Customer (client) ${values.customerId} not found`);
  const pc = await productCurrency(product.id, values.currencyId);
  const currency = await db.currency.findByPk(values.currencyId);
  if (!pc || !currency) throw new LoanError(400, `Currency ${values.currencyId} is not offered by ${product.productCode}`);
  const valueDate = values.valueDate ? String(values.valueDate) : await ctx.businessDate();
  const look = await ctx.lookups(product);
  const terms = productTerms(product, look, { principal: String(values.requestedAmount), interestRate: String(values.interestRate), tenorMonths: values.tenorMonths,
    firstDueDate: values.firstDueDate ? String(values.firstDueDate) : undefined, graceType: values.graceType, gracePeriods: values.gracePeriods,
    balloonAmount: values.balloonAmount !== undefined && values.balloonAmount !== null ? String(values.balloonAmount) : '0' }, valueDate);
  const problems = limitProblems(product, terms, pc, currency.code);
  const p = ctx.dec(product.get({ plain: true }));
  const price = String(values.vehiclePrice || 0);
  if (N.cmp(price, 0) > 0) {
    if (N.cmp(N.div(String(values.downPaymentAmount || 0), price), p.minDownPaymentPct) < 0) problems.push(`Down payment must be at least ${p.minDownPaymentPct} of the vehicle price`);
    if (N.cmp(N.div(String(values.requestedAmount), price), p.maxLtvPct) > 0) problems.push(`Loan to value cannot exceed ${p.maxLtvPct}`);
  }
  if (problems.length) throw new LoanError(400, `Application does not fit ${product.productCode}: ${problems.join('; ')}`, problems);
  const rule = await ctx.currencyRule(values.currencyId, valueDate, true);
  const { calendar } = await ctx.calendarFor(values.branchId || null);
  E.schedule.generateSchedule(terms, calendar, E.rounding.makeRounder(rule)); // throws 400 on invalid grace / first due date
  return product;
};

const findApp = async (id, transaction) => {
  const app = await db.lnApplication.findByPk(id, { transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
  if (!app) throw new LoanError(404, `Application ${id} not found`);
  return app;
};

const applicationService = {
  // Phase 6: only the caller's branches (scope from scoped('list'); an empty scope lists nothing)
  async list(query = {}, scope) {
    const where = { ...whereScope(scope), ...(query.status ? { status: String(query.status).split(',') } : {}) };
    return db.lnApplication.findAll({ where, order: [['id', 'DESC']], limit: 200 });
  },
  get: id => findApp(id),

  async create(body, ctxUser) {
    const values = { currencyId: undefined, ...pickBody(body) };
    for (const f of ['customerId', 'productId', 'currencyId', 'requestedAmount', 'tenorMonths', 'interestRate']) {
      if (values[f] === undefined || values[f] === null || values[f] === '') throw new LoanError(400, `${f} is required`);
    }
    await validateTerms(values);
    return db.sequelize.transaction(async (transaction) => {
      const appNo = await nextNumber('LOAN_APPLICATION', await ctx.businessDate(), transaction);
      const app = await db.lnApplication.create({ ...values, appNo, status: 'DRAFT', createdBy: ctxUser.userId, makerId: ctxUser.userId }, { transaction });
      await audit(app, 'CREATE', ctxUser, null, app.get({ plain: true }), transaction);
      return app;
    });
  },

  async update(id, body, ctxUser) {
    const values = pickBody(body);
    return db.sequelize.transaction(async (transaction) => {
      const app = await findApp(id, transaction);
      if (app.status !== 'DRAFT') throw new LoanError(409, `Only DRAFT applications can be edited (this one is ${app.status})`);
      if (Number(app.makerId) !== Number(ctxUser.userId)) throw new LoanError(403, 'Only the maker can edit a draft application');
      const merged = { ...app.get({ plain: true }), ...values };
      await validateTerms(merged);
      const old = app.get({ plain: true });
      await app.update(values, { transaction });
      await audit(app, 'EDIT', ctxUser, old, values, transaction);
      return app;
    });
  },

  async submit(id, ctxUser) {
    return db.sequelize.transaction(async (transaction) => {
      const app = await findApp(id, transaction);
      if (app.status !== 'DRAFT') throw new LoanError(409, `Only DRAFT applications can be submitted (this one is ${app.status})`);
      if (Number(app.makerId) !== Number(ctxUser.userId)) throw new LoanError(403, 'Only the maker can submit the application');
      await validateTerms(app.get({ plain: true }));
      await app.update({ status: 'SUBMITTED' }, { transaction });
      await audit(app, 'SUBMIT', ctxUser, null, { status: 'SUBMITTED' }, transaction);
      return app;
    });
  },

  async approve(id, ctxUser) {
    return db.sequelize.transaction(async (transaction) => {
      const app = await findApp(id, transaction);
      if (app.status !== 'SUBMITTED') throw new LoanError(409, `Only SUBMITTED applications can be approved (this one is ${app.status})`);
      const self = Number(app.makerId) === Number(ctxUser.userId);
      if (self && !(await selfAuthorizeAllowed(transaction))) throw new LoanError(403, 'Maker cannot approve their own application (LOAN_ALLOW_SELF_AUTHORIZE is off)');
      await validateTerms(app.get({ plain: true }));
      await app.update({ status: 'APPROVED', approvedBy: ctxUser.userId, checkerId: ctxUser.userId, authorizedAt: new Date() }, { transaction });
      await audit(app, self ? 'SELF_AUTH' : 'AUTH', ctxUser, null, { status: 'APPROVED' }, transaction);
      return app;
    });
  },

  async reject(id, ctxUser, remarks) {
    return db.sequelize.transaction(async (transaction) => {
      const app = await findApp(id, transaction);
      if (!['SUBMITTED', 'DRAFT'].includes(app.status)) throw new LoanError(409, `Application is ${app.status}`);
      if (app.status === 'SUBMITTED' && Number(app.makerId) === Number(ctxUser.userId) && !(await selfAuthorizeAllowed(transaction))) {
        throw new LoanError(403, 'Maker cannot reject their own submitted application');
      }
      await app.update({ status: 'REJECTED', checkerId: ctxUser.userId, remarks: remarks || null }, { transaction });
      await audit(app, 'REJECT', ctxUser, null, { status: 'REJECTED', remarks }, transaction);
      return app;
    });
  }
};

module.exports = applicationService;
