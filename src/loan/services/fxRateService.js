/**
 * Exchange rates for loan postings (Phase 5, addendum §8.2). Rates live in ln_exchange_rate, maker-checker
 * (Parameter Studio entity 'exchange-rate'; LOAN_ALLOW_SELF_AUTHORIZE applies as for every parameter).
 *   rateFor     the latest AUTHORIZED rate on or before the booking date, at most LOAN_FX_MAX_RATE_AGE_DAYS
 *               calendar days old; a rate that is not the booking date's own carries a warning
 *   copyPosRate a PENDING row from the POS currency.rate (normalized to base units per 1 unit)
 *   baseCurrency / baseDecimals  the POS isLocalCCY currency and its authorized rounding rule
 */
const { Op } = require('sequelize');
const db = require('../../models');
const { LoanError } = require('../errors');
const E = require('../engine');
const FX = require('../accounting/fx');
const paramService = require('./paramService');
const { currencyRule } = require('./loanContext');

const spfValue = async (code, fallback, transaction) => {
  const row = await db.spf.findOne({ where: { code }, transaction });
  return row && row.value !== null && String(row.value).trim() !== '' ? String(row.value).trim() : fallback;
};

const baseCurrency = async (transaction) => {
  const rows = await db.currency.findAll({ where: { isLocalCCY: true }, transaction });
  if (rows.length !== 1) throw new LoanError(409, `Exactly one POS currency must be the local (base) currency; found ${rows.length}`);
  return rows[0];
};

const baseDecimals = async (date) => {
  const base = await baseCurrency();
  return Number((await currencyRule(base.id, date, false)).decimalPlaces);
};

const rateFor = async (currencyId, bookingDate, transaction) => {
  const base = await baseCurrency(transaction);
  if (Number(currencyId) === Number(base.id)) return { rate: '1.00000000', rateDate: bookingDate, ageDays: 0, warning: null, isBase: true };
  const row = await db.lnExchangeRate.findOne({
    where: { currencyId, authStatus: 'AUTHORIZED', rateDate: { [Op.lte]: bookingDate } },
    order: [['rateDate', 'DESC']], transaction
  });
  const currency = await db.currency.findByPk(currencyId, { transaction });
  const code = currency ? currency.code : `currency ${currencyId}`;
  if (!row) throw new LoanError(409, `No authorized exchange rate for ${code} on or before ${bookingDate}; enter one (Parameter Studio, exchange rates) and have it authorized`);
  const maxAge = Number(await spfValue('LOAN_FX_MAX_RATE_AGE_DAYS', '3', transaction));
  const rateDate = String(row.rateDate);
  const ageDays = E.dates.daysBetween(rateDate, bookingDate);
  if (ageDays > maxAge) throw new LoanError(409, `The latest authorized ${code} rate is of ${rateDate}, ${ageDays} days before the booking date ${bookingDate} (LOAN_FX_MAX_RATE_AGE_DAYS = ${maxAge}); enter today's rate`);
  const rate = FX.rateString(FX.rateUnits(String(row.rate)));
  const warning = ageDays > 0 ? `Rate of ${rateDate} used for booking date ${bookingDate} (${ageDays} day${ageDays === 1 ? '' : 's'} old)` : null;
  return { rate, rateDate, ageDays, warning, isBase: false };
};

const copyPosRate = async ({ currencyId, rateDate }, ctxUser) => {
  if (!currencyId || !/^\d{4}-\d{2}-\d{2}$/.test(String(rateDate || ''))) throw new LoanError(400, 'currencyId and rateDate (YYYY-MM-DD) are required');
  const base = await baseCurrency();
  if (Number(currencyId) === Number(base.id)) throw new LoanError(400, `${base.code} is the base currency; it has no exchange rate`);
  const currency = await db.currency.findByPk(currencyId);
  if (!currency || currency.isActive === false) throw new LoanError(404, `Currency ${currencyId} not found or inactive`);
  const rate = FX.rateString(FX.normalizePosRate(currency.rate, currency.exchangeDirection));
  return paramService.create('exchange-rate', { currencyId: Number(currencyId), rateDate, rate, source: 'POS_COPY', remarks: `POS currency.rate ${currency.rate} (${currency.exchangeDirection})` }, ctxUser);
};

module.exports = { rateFor, copyPosRate, baseCurrency, baseDecimals, spfValue };
