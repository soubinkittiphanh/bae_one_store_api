/**
 * Phase 5 B0: amounts per currency. A product offers currencies (ln_product_currency); every amount it
 * defines is either a percentage/rate (currency-free) or a fixed amount, which needs a value per offered
 * currency:
 *   amount limits          ln_product_currency.minAmount / maxAmount
 *   fixed-amount formulas  ln_product_amount (itemType COMPONENT, itemCode = componentCode)
 *   UDEs of dataType AMOUNT ln_product_amount (itemType UDE, itemCode = udeCode)
 *   AMOUNT-basis rate tiers ln_rate_tier.currencyId
 * The product-level minAmount/maxAmount and the component/UDE values are no longer read for limits or fees.
 * Insurance premiums, repossession expenses and sale proceeds are entered per contract or transaction in the
 * contract currency; the penalty is a rate with a percentage cap (no fixed floor).
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const { compareDecimal } = require('../decimal');
const { findOneExact, findAllExact } = require('../db/exact');

// Every formula code is classified; an unclassified one blocks authorization (it could hide a fixed amount)
const FIXED_FORMULAS = ['FIXED_CONTRACT_FEE'];
const PERCENT_FORMULAS = ['UPFRONT_PCT', 'STANDARD_ANNUITY_INTEREST', 'LATE_OVERDUE_DAILY', 'STANDARD_PRINCIPAL'];

const str = v => (v === null || v === undefined ? null : String(v));
const childStatuses = { authStatus: ['AUTHORIZED', 'PENDING'] };

const codeOf = async (transaction) => {
  const [components, udes, currencies] = await Promise.all([
    db.lnComponent.findAll({ attributes: ['id', 'componentCode'], transaction }),
    db.lnUde.findAll({ attributes: ['udeCode', 'dataType'], transaction }),
    db.currency.findAll({ attributes: ['id', 'code'], transaction })
  ]);
  return {
    component: Object.fromEntries(components.map(c => [c.id, c.componentCode])),
    udeType: Object.fromEntries(udes.map(u => [u.udeCode, u.dataType])),
    currency: Object.fromEntries(currencies.map(c => [c.id, c.code]))
  };
};

// Problems that block authorizing (and booking from) a product version; the version's own children are
// read whether PENDING or AUTHORIZED, because they are authorized together with it
const currencyProblems = async (product, { transaction } = {}) => {
  const where = { productId: product.id, ...childStatuses };
  const [currencies, components, udes, amounts, codes] = await Promise.all([
    findAllExact(db.lnProductCurrency, { where, transaction }),
    db.lnProductComponent.findAll({ where, transaction }),
    db.lnProductUde.findAll({ where, transaction }),
    findAllExact(db.lnProductAmount, { where, transaction }),
    codeOf(transaction)
  ]);
  const tiers = components.length ? await db.lnRateTier.findAll({ where: { productComponentId: components.map(c => c.id), ...childStatuses }, transaction }) : [];
  const out = [];
  if (!currencies.length) out.push('The product offers no currency');
  const offered = currencies.map(c => Number(c.currencyId));
  const ccy = id => codes.currency[id] || `currency ${id}`;
  const amountFor = (currencyId, itemType, itemCode) => amounts.find(a => Number(a.currencyId) === currencyId && a.itemType === itemType && a.itemCode === itemCode);
  for (const pc of currencies) {
    const c = Number(pc.currencyId);
    if (pc.minAmount === null || pc.maxAmount === null) out.push(`${ccy(c)}: amount limits (minAmount, maxAmount) are not set`);
    else if (compareDecimal(str(pc.minAmount), str(pc.maxAmount)) > 0) out.push(`${ccy(c)}: minAmount cannot exceed maxAmount`);
  }
  for (const pcm of components) {
    const code = codes.component[pcm.componentId] || `component ${pcm.componentId}`;
    if (FIXED_FORMULAS.includes(pcm.formulaCode)) {
      for (const c of offered) if (!amountFor(c, 'COMPONENT', code)) out.push(`${ccy(c)}: ${code} (${pcm.formulaCode}) has no fixed amount in this currency`);
    } else if (!PERCENT_FORMULAS.includes(pcm.formulaCode)) {
      out.push(`${code}: formula ${pcm.formulaCode} is not classified as a percentage or a fixed amount`);
    }
  }
  for (const pu of udes) {
    if (codes.udeType[pu.udeCode] !== 'AMOUNT') continue;
    for (const c of offered) if (!amountFor(c, 'UDE', pu.udeCode)) out.push(`${ccy(c)}: UDE ${pu.udeCode} (AMOUNT) has no value in this currency`);
  }
  for (const t of tiers) {
    if (t.tierBasis !== 'AMOUNT') continue;
    if (!t.currencyId || !offered.includes(Number(t.currencyId))) out.push(`Rate tier ${t.id} (AMOUNT) must name an offered currency`);
  }
  for (const a of amounts) {
    if (!offered.includes(Number(a.currencyId))) out.push(`${ccy(Number(a.currencyId))}: fixed amount ${a.itemType} ${a.itemCode} is set for a currency the product does not offer`);
  }
  return out;
};

const statusesFor = includePending => (includePending ? ['AUTHORIZED', 'PENDING'] : ['AUTHORIZED']);

// The offered currency row with its limits (null when the product does not offer the currency)
const productCurrency = async (productId, currencyId, { includePending = false, transaction } = {}) => findOneExact(db.lnProductCurrency, {
  where: { productId, currencyId, authStatus: statusesFor(includePending) }, transaction
});

// Limits for the simulation (warnings) and applications (errors)
const limitProblemsFor = (pc, principal, code) => {
  if (!pc) return [`Currency ${code} is not offered by the product`];
  if (pc.minAmount === null || pc.maxAmount === null) return [`The product has no amount limits in ${code}`];
  const [min, max] = [str(pc.minAmount), str(pc.maxAmount)];
  return compareDecimal(principal, min) < 0 || compareDecimal(principal, max) > 0 ? [`Amount must be between ${code} ${min} and ${max}`] : [];
};

// Replaces fixed amounts in the product children with the currency's values (engines then need no change).
// A fixed item without a value in the currency keeps no amount: the fee engine refuses it.
const applyCurrencyAmounts = async (children, productId, currencyId, { includePending = false } = {}) => {
  const amounts = await findAllExact(db.lnProductAmount, { where: { productId, currencyId, authStatus: statusesFor(includePending) } });
  const udeTypes = Object.fromEntries((await db.lnUde.findAll({ attributes: ['udeCode', 'dataType'] })).map(u => [u.udeCode, u.dataType]));
  const pick = (itemType, itemCode) => amounts.find(a => a.itemType === itemType && a.itemCode === itemCode);
  const values = a => ({ defaultValue: str(a.defaultValue), minValue: str(a.minValue), maxValue: str(a.maxValue), currencyId: Number(currencyId) });
  const missing = [];
  const components = children.components.map((c) => {
    if (!FIXED_FORMULAS.includes(c.formulaCode)) return c;
    const a = pick('COMPONENT', c.componentCode);
    if (!a) { missing.push(c.componentCode); return { ...c, defaultValue: null, currencyMissing: true }; }
    return { ...c, ...values(a) };
  });
  const udes = children.udes.map((u) => {
    if (udeTypes[u.udeCode] !== 'AMOUNT') return u;
    const a = pick('UDE', u.udeCode);
    if (!a) { missing.push(u.udeCode); return { ...u, defaultValue: null, currencyMissing: true }; }
    return { ...u, ...values(a) };
  });
  return { ...children, components, udes, missingCurrencyAmounts: missing };
};

const assertNoMissing = (children, code) => {
  if (children.missingCurrencyAmounts && children.missingCurrencyAmounts.length) {
    throw new LoanError(409, `The product has no fixed amount in ${code} for ${children.missingCurrencyAmounts.join(', ')}`);
  }
};

module.exports = { FIXED_FORMULAS, PERCENT_FORMULAS, currencyProblems, productCurrency, limitProblemsFor, applyCurrencyAmounts, assertNoMissing };
