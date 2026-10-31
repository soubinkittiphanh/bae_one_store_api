/**
 * Phase 5 posting context for foreign-currency loans (addendum §8). Base-currency loans get fx = null and
 * post exactly as in Phase 4.
 *   fxFor          the rate for the booking date (rate table, age limit, warning) or a checked manual override
 *   settlementFor  DISB with target SALE_INVOICE_SETTLEMENT: the invoice base carried over; for a
 *                  base-currency invoice the implied rate must be within LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT of
 *                  the sale line rate and of the rate table (else refused, or accepted by the checker)
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const FX = require('../accounting/fx');
const { toUnits, fromUnits } = require('../accounting/journal');
const { findAllExact } = require('../db/exact');
const fxRates = require('../services/fxRateService');
const { currencyRule } = require('../services/loanContext');
const { invoiceForSale } = require('./posAdapters');

const group = (s) => { const [i, f] = s.split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${f !== undefined ? `.${f}` : ''}`; };
const rate2 = u => group(FX.rateString(FX.roundDiv(u, 1000000n) * 1000000n).slice(0, -6));
const pct2 = (u) => { const r = FX.roundDiv(u, 100n); return `${r / 100n}.${(r % 100n).toString().padStart(2, '0')}`; };
const money = (units, decimals) => group(fromUnits(units).slice(0, decimals ? -(4 - decimals) : -5));

const fxFor = async ({ account, bookingDate, input = {}, pending, dryRun, transaction }) => {
  const base = await fxRates.baseCurrency(transaction);
  const currency = await db.currency.findByPk(account.currencyId, { transaction });
  if (!currency) throw new LoanError(409, `Currency ${account.currencyId} not found`);
  if (Number(currency.id) === Number(base.id)) {
    if (input.exchangeRate !== undefined) throw new LoanError(400, `${currency.code} is the base currency; no exchange rate applies`);
    return { currency, base, fx: null };
  }
  const baseDecimals = Number((await currencyRule(base.id, bookingDate, false)).decimalPlaces);
  const maxRoundDiff = Number(await fxRates.spfValue('LOAN_FX_MAX_ROUND_DIFF', '1', transaction));
  const table = await fxRates.rateFor(currency.id, bookingDate, transaction);
  let rate = table.rate;
  const warnings = table.warning ? [table.warning] : [];
  if (input.exchangeRate !== undefined) {
    const tol = FX.pctUnits(await fxRates.spfValue('LOAN_FX_OVERRIDE_TOLERANCE_PCT', '0', transaction));
    if (tol === 0n) throw new LoanError(409, 'Manual exchange rates are off (LOAN_FX_OVERRIDE_TOLERANCE_PCT = 0)');
    const overrideU = FX.rateUnits(input.exchangeRate);
    const dev = FX.deviationPct(overrideU, FX.rateUnits(table.rate));
    if (dev > tol) throw new LoanError(409, `Manual rate ${input.exchangeRate} differs from the table rate ${table.rate} by ${FX.pctString(dev)}% (tolerance ${FX.pctString(tol)}%)`);
    if (!pending && !dryRun) throw new LoanError(409, 'A manual exchange rate needs a checker');
    rate = FX.rateString(overrideU);
    warnings.push(`Manual rate ${rate} instead of the table rate ${table.rate} (${FX.pctString(dev)}%)`);
  }
  return {
    currency, base,
    fx: { rate, rateDate: table.rateDate, warnings, baseCurrencyId: base.id, baseCode: base.code, baseDecimals, maxRoundDiff, manual: input.exchangeRate !== undefined }
  };
};

const settlementFor = async ({ ctx, fx, currency, principal, input = {}, pending, ctxUser, transaction }) => {
  if (!ctx.account.saleHeaderId) throw new LoanError(409, 'The account has no vehicle sale to settle');
  const { sale, invoice, openUnits } = await invoiceForSale(ctx.account.saleHeaderId, transaction);
  const principalU = toUnits(principal);
  const loanDecimals = ctx.rounder.decimals;
  if (Number(invoice.currencyId) === Number(currency.id)) {
    // Same currency (an AR-module invoice in the loan currency): the invoice rate is base per 1 unit
    return { settlement: { invoiceCurrencyId: currency.id, carryBaseUnits: FX.toBase(principalU, FX.rateUnits(String(invoice.exchangeRate)), fx.baseDecimals), invoiceRate: String(invoice.exchangeRate) }, warnings: [] };
  }
  if (Number(invoice.currencyId) !== Number(fx.baseCurrencyId)) throw new LoanError(409, `Invoice ${invoice.invoiceNumber} is neither in the loan currency (${currency.code}) nor in the base currency (${fx.baseCode})`);
  // Base-currency invoice: the vehicle's contract price is on the sale lines in the loan currency
  const lines = await findAllExact(db.saleLine, { where: { saleHeaderId: sale.id, currencyId: currency.id, isActive: true }, transaction });
  if (!lines.length) throw new LoanError(409, `The vehicle sale has no line in ${currency.code}; a ${currency.code} loan cannot settle its ${fx.baseCode} invoice`);
  let contract = 0n;
  let lineBase = 0n;
  for (const l of lines) {
    const totalU = toUnits(Number(l.total).toFixed(4).replace('-', ''));
    contract += totalU;
    lineBase += totalU * FX.normalizePosRate(l.exchangeRate, currency.exchangeDirection);
  }
  const lineRate = FX.roundDiv(lineBase, contract);
  const implied = FX.impliedRate(openUnits, principalU);
  const tableRate = FX.rateUnits(fx.rate);
  const devLine = FX.deviationPct(implied, lineRate);
  const devTable = FX.deviationPct(implied, tableRate);
  const tol = FX.pctUnits(await fxRates.spfValue('LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT', '1.00', transaction));
  const step = 10n ** BigInt(4 - loanDecimals);
  const proposed = FX.roundDiv(openUnits * 100000000n, lineRate * step) * step;
  const warnings = [];
  if (devLine > tol || devTable > tol) {
    const msg = `Implied rate ${rate2(implied)} (${fx.baseCode} ${money(openUnits, 0)} / ${currency.code} ${money(principalU, loanDecimals)}) differs from the sale line rate ${rate2(lineRate)} by ${pct2(devLine)}% and from the table rate ${rate2(tableRate)} by ${pct2(devTable)}% (tolerance ${pct2(tol)}%). Check the principal: proposed ${currency.code} ${money(proposed, loanDecimals)}.`;
    const mode = await fxRates.spfValue('LOAN_FX_IMPLIED_RATE_BREACH', 'REFUSE', transaction);
    if (mode !== 'CHECKER_OVERRIDE') throw new LoanError(409, msg);
    if (pending) {
      if (!(ctxUser && ctxUser.acceptRateDeviation === true)) throw new LoanError(409, `${msg} The checker must accept the deviation (acceptRateDeviation: true).`);
    } else if (!String(input.rateDeviationReason || '').trim()) {
      throw new LoanError(409, `${msg} Give rateDeviationReason; a checker must then accept it.`);
    }
    warnings.push(`Accepted rate deviation: ${msg}`);
  } else if (devTable > 0n) {
    warnings.push(`Implied rate ${rate2(implied)} differs from the table rate ${rate2(tableRate)} for ${fx.rateDate} by ${pct2(devTable)}% (tolerance ${pct2(tol)}%)`);
  }
  return {
    settlement: { invoiceCurrencyId: fx.baseCurrencyId, carryBaseUnits: openUnits },
    warnings,
    implied: { rate: FX.rateString(implied), lineRate: FX.rateString(lineRate), tableRate: fx.rate, deviationLinePct: FX.pctString(devLine), deviationTablePct: FX.pctString(devTable), tolerancePct: FX.pctString(tol), proposedPrincipal: fromUnits(proposed) }
  };
};

/**
 * Financing proposal for an application (addendum §8.4): for a vehicle sale and a loan currency, the
 * invoice open balance in base, the sale line rate, the proposed contract principal and, when a rate is
 * authorized for the date, the deviation from the rate table. Read-only.
 */
const proposalFromSale = ({ saleHeaderId, currencyId, date }) => db.sequelize.transaction(async (transaction) => {
  const base = await fxRates.baseCurrency(transaction);
  const currency = await db.currency.findByPk(currencyId);
  if (!currency) throw new LoanError(404, `Currency ${currencyId} not found`);
  const { sale, invoice, openUnits } = await invoiceForSale(saleHeaderId, transaction);
  if (Number(currency.id) === Number(base.id) || Number(invoice.currencyId) === Number(currency.id)) {
    return { saleHeaderId: sale.id, invoiceNumber: invoice.invoiceNumber, invoiceCurrencyId: invoice.currencyId, openBalance: fromUnits(openUnits), proposedPrincipal: fromUnits(openUnits), crossCurrency: false };
  }
  if (Number(invoice.currencyId) !== Number(base.id)) throw new LoanError(409, `Invoice ${invoice.invoiceNumber} is neither in ${currency.code} nor in the base currency`);
  const lines = await findAllExact(db.saleLine, { where: { saleHeaderId: sale.id, currencyId: currency.id, isActive: true }, transaction });
  if (!lines.length) throw new LoanError(409, `The vehicle sale has no line in ${currency.code}`);
  let contract = 0n;
  let lineBase = 0n;
  for (const l of lines) {
    const totalU = toUnits(Number(l.total).toFixed(4).replace('-', ''));
    contract += totalU;
    lineBase += totalU * FX.normalizePosRate(l.exchangeRate, currency.exchangeDirection);
  }
  const lineRate = FX.roundDiv(lineBase, contract);
  const rule = await currencyRule(currency.id, date, false);
  const step = 10n ** BigInt(4 - Number(rule.decimalPlaces));
  const proposed = FX.roundDiv(openUnits * 100000000n, lineRate * step) * step;
  const out = { saleHeaderId: sale.id, invoiceNumber: invoice.invoiceNumber, invoiceCurrencyId: invoice.currencyId, openBalance: fromUnits(openUnits), lineContractTotal: fromUnits(contract), lineRate: FX.rateString(lineRate), proposedPrincipal: fromUnits(proposed), crossCurrency: true };
  try {
    const table = await fxRates.rateFor(currency.id, date, transaction);
    const tol = FX.pctUnits(await fxRates.spfValue('LOAN_FX_IMPLIED_RATE_TOLERANCE_PCT', '1.00', transaction));
    const implied = FX.impliedRate(openUnits, proposed);
    out.tableRate = table.rate;
    out.tableRateDate = table.rateDate;
    out.deviationTablePct = FX.pctString(FX.deviationPct(implied, FX.rateUnits(table.rate)));
    out.withinTolerance = FX.deviationPct(implied, FX.rateUnits(table.rate)) <= tol;
    out.warning = table.warning;
  } catch (err) {
    out.tableRate = null;
    out.warning = err.message;
  }
  return out;
});

module.exports = { fxFor, settlementFor, proposalFromSale };
