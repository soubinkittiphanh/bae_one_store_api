/**
 * Product simulation (read-only): terms in -> schedule, fees, disbursement tags and the journal
 * preview built from the entry rules. Works on PENDING products and parameters, flagged as preview.
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const ctx = require('./loanContext');
const { previewJournal } = require('./accountingService');

const N = E.num;
const INACTIVE = ['REJECTED', 'CLOSED'];
const INT_RE = /^\d+$/;

const productTerms = (product, look, body, valueDate) => ({
  principal: String(body.principal),
  annualRate: String(body.interestRate),
  tenorMonths: Number(body.tenorMonths),
  repaymentMethod: product.repaymentMethodCode,
  accrualMethod: product.accrualMethodCode,
  frequency: look.frequency,
  dayCount: look.dayCount,
  valueDate,
  firstDueDate: body.firstDueDate || undefined,
  firstPeriodMinDays: product.firstPeriodMinDays,
  firstPeriodMaxDays: product.firstPeriodMaxDays,
  graceType: body.graceType || 'NONE',
  gracePeriods: Number(body.gracePeriods || 0),
  maxGracePeriods: product.maxGracePeriods,
  balloonAmount: body.balloonAmount ? String(body.balloonAmount) : '0',
  holidayHandling: product.holidayHandlingCode
});

// Product limits shared by the simulation (warnings) and applications (errors)
const limitProblems = (productRow, terms) => {
  const product = ctx.dec(productRow.get ? productRow.get({ plain: true }) : productRow);
  const out = [];
  if (N.cmp(terms.principal, product.minAmount) < 0 || N.cmp(terms.principal, product.maxAmount) > 0) out.push(`Amount must be between ${product.minAmount} and ${product.maxAmount}`);
  if (terms.tenorMonths < product.minTenorMonths || terms.tenorMonths > product.maxTenorMonths) out.push(`Tenor must be ${product.minTenorMonths}-${product.maxTenorMonths} months`);
  if (N.cmp(terms.annualRate, product.minInterestRate) < 0 || N.cmp(terms.annualRate, product.maxInterestRate) > 0) out.push(`Interest rate must be between ${product.minInterestRate} and ${product.maxInterestRate}`);
  return out;
};

const validateBody = (body) => {
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(String(body.principal || ''))) throw new LoanError(400, 'principal must be a positive decimal');
  if (!/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/.test(String(body.interestRate || ''))) throw new LoanError(400, 'interestRate must be 0..1 with up to 6 decimals');
  if (!INT_RE.test(String(body.tenorMonths || ''))) throw new LoanError(400, 'tenorMonths must be a whole number');
  for (const f of ['valueDate', 'firstDueDate']) if (body[f] && !/^\d{4}-\d{2}-\d{2}$/.test(body[f])) throw new LoanError(400, `${f} must be YYYY-MM-DD`);
  for (const f of ['insurancePremium', 'balloonAmount']) if (body[f] !== undefined && body[f] !== null && body[f] !== '' && !/^\d{1,16}(\.\d{1,4})?$/.test(String(body[f]))) throw new LoanError(400, `${f} must be a decimal`);
};

const simulationService = {
  productTerms,
  limitProblems,

  async simulate(productId, body = {}) {
    validateBody(body);
    const product = await db.lnProduct.findByPk(productId);
    if (!product || INACTIVE.includes(product.authStatus)) throw new LoanError(404, `Product ${productId} not found`);
    const warnings = [];
    let preview = product.authStatus !== 'AUTHORIZED';
    if (preview) warnings.push(`Product ${product.productCode} v${product.version} is ${product.authStatus}`);

    let currencyId = body.currencyId ? Number(body.currencyId) : null;
    if (!currencyId) {
      const pc = await db.lnProductCurrency.findOne({ where: { productId: product.id }, order: [['isDefault', 'DESC']] });
      if (!pc) throw new LoanError(409, `Product ${product.productCode} has no currency`);
      currencyId = pc.currencyId;
    }
    const valueDate = body.valueDate || await ctx.businessDate();
    let rule;
    try {
      rule = await ctx.currencyRule(currencyId, valueDate, false);
    } catch (err) {
      if (!(err instanceof LoanError)) throw err;
      rule = await ctx.currencyRule(currencyId, valueDate, true);
      preview = true;
      warnings.push(`Rounding rule for currency ${currencyId} is not authorized yet (${rule.decimalPlaces} decimals used for this preview)`);
    }
    const rounder = E.rounding.makeRounder(rule);
    const look = await ctx.lookups(product);
    const { calendar, calendarCode } = await ctx.calendarFor(body.branchId || null);
    const children = await ctx.productChildren(product.id);
    const terms = productTerms(product, look, body, valueDate);
    warnings.push(...limitProblems(product, terms));

    const schedule = E.schedule.generateSchedule(terms, calendar, rounder);
    const fees = E.fees.upfrontFees({ loanAmount: terms.principal, components: children.components, rounder });
    const events = E.fees.disbursementEvents({
      feeFinancingMode: product.feeFinancingMode,
      loanAmount: terms.principal,
      fees: fees.total,
      insurancePremium: body.insurancePremium ? String(body.insurancePremium) : '0',
      rounder
    });
    const journal = await previewJournal(product, events, { includePending: preview, currency: currencyId, asOfDate: valueDate });
    return {
      preview,
      warnings,
      product: { id: product.id, productCode: product.productCode, version: product.version, repaymentMethodCode: product.repaymentMethodCode, accrualMethodCode: product.accrualMethodCode, dayCountCode: product.dayCountCode, feeFinancingMode: product.feeFinancingMode },
      currencyId,
      decimals: rounder.decimals,
      calendarCode,
      schedule,
      fees,
      events,
      journal
    };
  }
};

module.exports = simulationService;
