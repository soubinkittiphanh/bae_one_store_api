/**
 * Multi-currency journal conversion (Phase 5, docs/loan/rev5-accounting-addendum.md §8). Pure functions,
 * no DB access, no floats: amounts are 4-decimal units (BigInt, see journal.js), rates are 8-decimal units.
 *
 * - Every journal line gets a base amount. Lines that ADD to a carrying bucket are converted at the
 *   transaction rate; lines that RELIEVE a bucket take its weighted-average carrying base, and the
 *   difference to the transaction rate is realized FX (base-only FX_DIFF legs).
 * - Carrying buckets are keyed by role and status qualifier; their balances come from the account's own
 *   journal history (signed: debit positive), so reversals and revaluations are included automatically.
 * - What is left after FX is base rounding: one ROUND_DIFF leg, within the cap, else the journal is refused.
 * - DISB settling an invoice carries the invoice base over (no FX); a foreign loan settling a base-currency
 *   invoice goes through CCY_POSITION, which nets to zero in base.
 * Base-currency (LAK) loans never come here: their journals stay exactly as in Phase 4.
 */
const { LoanError } = require('../errors');
const { toUnits, fromUnits } = require('./journal');

const RATE_SCALE = 8;
const RATE_ONE = 10n ** BigInt(RATE_SCALE);
const AMOUNT_ONE = 10000n; // 4-decimal units

// Monetary balances that keep a carrying base: natural side DR (assets) or CR (liabilities, contra-assets).
// Addendum §8.3 lists principal, receivables and the customer advance; the other loan-owned balances are
// included so that a balance that is zero in the contract currency is also zero in base.
const BUCKETS = {
  LOAN_PORTFOLIO: 'DR',
  INTEREST_RECEIVABLE: 'DR',
  FEE_RECEIVABLE: 'DR',
  INSURANCE_RECEIVABLE: 'DR',
  PENALTY_RECEIVABLE: 'DR',
  REPOSSESSED_VEHICLE_ASSET: 'DR',
  CUSTOMER_ADVANCE_LIAB: 'CR',
  SUSPENDED_INTEREST: 'CR',
  INSURANCE_PAYABLE: 'CR',
  PROVISION_RESERVE: 'CR',
  DEFERRED_FEE: 'CR',
  UNAMORTIZED_FEE_CONTRA: 'CR'
};
// Revalued at month-end when LOAN_FX_REVAL_ENABLED (addendum §8.7)
const REVAL_ROLES = ['LOAN_PORTFOLIO', 'INTEREST_RECEIVABLE', 'FEE_RECEIVABLE', 'INSURANCE_RECEIVABLE', 'PENALTY_RECEIVABLE', 'CUSTOMER_ADVANCE_LIAB'];

const rateUnits = (rate) => {
  const s = String(rate).trim();
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(s)) throw new LoanError(400, `Invalid exchange rate "${s}"`);
  const [i, f = ''] = s.split('.');
  const u = BigInt(i + f.padEnd(RATE_SCALE, '0'));
  if (u === 0n) throw new LoanError(400, 'Exchange rate must be positive');
  return u;
};
const rateString = (u) => `${u / RATE_ONE}.${(u % RATE_ONE).toString().padStart(RATE_SCALE, '0')}`;

// Half-up division away from zero
const roundDiv = (n, d) => {
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = (a + d / 2n) / d;
  return neg ? -q : q;
};

const stepOf = baseDecimals => 10n ** BigInt(4 - baseDecimals);

// POS currency.rate (DOUBLE) and exchangeDirection -> base units per 1 foreign unit, 8 decimals
const normalizePosRate = (rate, direction) => {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) throw new LoanError(409, `Invalid POS rate ${rate}`);
  const raw = rateUnits(n.toFixed(RATE_SCALE));
  if (direction === 'local_to_foreign') return roundDiv(RATE_ONE * RATE_ONE, raw);
  return raw;
};

// amount units (4 dp) x rate units (8 dp) -> base units (4 dp) rounded half-up to the base decimals
const toBase = (amountUnits, rateU, baseDecimals) => {
  const step = stepOf(baseDecimals);
  return roundDiv(amountUnits * rateU, RATE_ONE * step) * step;
};

// Implied rate (8 dp) of base / contract, and its deviation from a reference rate in basis points of 0.0001%
const impliedRate = (baseUnits, contractUnits) => roundDiv(baseUnits * RATE_ONE, contractUnits);
const deviationPct = (rateU, refU) => {
  const diff = rateU > refU ? rateU - refU : refU - rateU;
  return roundDiv(diff * 100n * 10000n, refU); // percent with 4 decimals, as units of 0.0001
};
const pctString = units => `${units / 10000n}.${(units % 10000n).toString().padStart(4, '0')}`;
const pctUnits = (pct) => {
  const s = String(pct).trim();
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) throw new LoanError(409, `Invalid percentage "${s}"`);
  const [i, f = ''] = s.split('.');
  return BigInt(i + f.padEnd(4, '0'));
};

const bucketKey = (roleCode, qualifier) => `${roleCode}|${qualifier || ''}`;

// Signed bucket balances (debit positive) from journal legs [{ roleCode, statusQualifier|qualifier, drCr, amount, baseAmount }]
const bucketsFromLegs = (legs) => {
  const map = new Map();
  for (const l of legs) {
    if (!BUCKETS[l.roleCode]) continue;
    const key = bucketKey(l.roleCode, l.statusQualifier !== undefined ? l.statusQualifier : l.qualifier);
    const b = map.get(key) || { amount: 0n, base: 0n };
    const sign = l.drCr === 'DR' ? 1n : -1n;
    b.amount += sign * toUnits(String(l.amount).replace('-', ''));
    b.base += sign * toUnits(String(l.baseAmount).replace('-', ''));
    map.set(key, b);
  }
  return map;
};

const baseOnlyLine = (eventCode, amountTag, drCr, roleCode, currency, baseUnits, qualifier = null) => ({
  eventCode, amountTag, drCr, roleCode, qualifier, currency, amount: '0.0000', baseAmount: fromUnits(baseUnits), isBaseOnly: true
});

/**
 * DISB with target SALE_INVOICE_SETTLEMENT (addendum §8.4). The PRINCIPAL pair carries the invoice base
 * relieved. For a foreign loan settling a base-currency invoice, the SALE_RECEIVABLE credit becomes
 * Cr CCY_POSITION (loan currency) + Dr CCY_POSITION / Cr SALE_RECEIVABLE (base currency).
 */
const carryOverSettlement = (lines, { loanCurrencyId, invoiceCurrencyId, baseCurrencyId, carryBaseUnits }) => {
  const sr = lines.findIndex(l => l.roleCode === 'SALE_RECEIVABLE' && l.drCr === 'CR' && l.amountTag === 'PRINCIPAL');
  const lp = lines.findIndex(l => l.roleCode === 'LOAN_PORTFOLIO' && l.drCr === 'DR' && l.amountTag === 'PRINCIPAL');
  if (sr < 0 || lp < 0) throw new LoanError(409, 'DISB settlement: the PRINCIPAL pair (LOAN_PORTFOLIO / SALE_RECEIVABLE) is missing');
  const base = fromUnits(carryBaseUnits);
  const out = lines.map(l => ({ ...l }));
  out[lp].presetBase = base;
  if (Number(invoiceCurrencyId) === Number(loanCurrencyId)) {
    out[sr].presetBase = base;
    return out;
  }
  if (Number(invoiceCurrencyId) !== Number(baseCurrencyId)) throw new LoanError(409, 'The invoice must be in the loan currency or in the base currency');
  const l = out[sr];
  out.splice(sr, 1,
    { ...l, roleCode: 'CCY_POSITION', presetBase: base },
    { ...l, drCr: 'DR', roleCode: 'CCY_POSITION', currency: baseCurrencyId, amount: base, presetBase: base },
    { ...l, currency: baseCurrencyId, amount: base, presetBase: base });
  return out;
};

/**
 * lines: journal lines in the loan currency (some may be in base after carryOverSettlement), each
 *   { eventCode, amountTag, drCr, roleCode, qualifier, currency, amount, offBalance?, presetBase? }
 * opts: { rate (string), loanCurrencyId, baseCurrencyId, baseDecimals, buckets (Map from bucketsFromLegs),
 *         maxRoundDiff (base minor units per line) }
 * Returns { lines (with baseAmount and exchangeRate), fx: [...], roundDiff (units) }; added FX and ROUND_DIFF
 * legs are appended to lines. Throws when the rounding residue exceeds the cap.
 */
const applyBase = (input, opts) => {
  const rateU = rateUnits(opts.rate);
  const step = stepOf(opts.baseDecimals);
  const buckets = new Map([...opts.buckets].map(([k, v]) => [k, { ...v }]));
  const lines = input.map(l => ({ ...l }));
  const isBase = l => Number(l.currency) === Number(opts.baseCurrencyId);
  const bucketOf = l => (!l.offBalance && BUCKETS[l.roleCode] ? BUCKETS[l.roleCode] : null);

  // Transfers between two buckets (e.g. STCH OUT_PRIN between statuses): the adding leg takes the relieved base
  const transferOf = new Map();
  const groups = {};
  lines.forEach((l, i) => { (groups[`${l.eventCode}|${l.amountTag}`] = groups[`${l.eventCode}|${l.amountTag}`] || []).push(i); });
  for (const idx of Object.values(groups)) {
    if (idx.length !== 2) continue;
    const [a, b] = idx.map(i => lines[i]);
    if (a.drCr === b.drCr || !bucketOf(a) || !bucketOf(b) || toUnits(a.amount) !== toUnits(b.amount) || a.presetBase || b.presetBase) continue;
    const relieving = idx.find(i => lines[i].drCr !== BUCKETS[lines[i].roleCode]);
    const adding = idx.find(i => lines[i].drCr === BUCKETS[lines[i].roleCode]);
    if (relieving !== undefined && adding !== undefined) transferOf.set(adding, relieving);
  }

  const apply = (l, baseUnits) => {
    const natural = bucketOf(l);
    if (!natural) return;
    const key = bucketKey(l.roleCode, l.qualifier);
    const b = buckets.get(key) || { amount: 0n, base: 0n };
    const sign = l.drCr === 'DR' ? 1n : -1n;
    b.amount += sign * toUnits(l.amount);
    b.base += sign * baseUnits;
    buckets.set(key, b);
  };
  const reliefBase = (l) => {
    const b = buckets.get(bucketKey(l.roleCode, l.qualifier));
    if (!b) return null;
    const sign = BUCKETS[l.roleCode] === 'DR' ? 1n : -1n;
    const balance = sign * b.amount;
    const base = sign * b.base;
    if (balance <= 0n) return null;
    const amount = toUnits(l.amount);
    if (amount >= balance) return base;
    return roundDiv(amount * base, balance * step) * step;
  };

  const done = new Array(lines.length).fill(false);
  const fx = [];
  const process = (i) => {
    if (done[i]) return;
    const l = lines[i];
    const amount = toUnits(l.amount);
    let base;
    if (l.isBaseOnly) base = toUnits(l.baseAmount); // prebuilt base-only legs (revaluation) keep their base
    else if (l.presetBase !== undefined) base = toUnits(l.presetBase);
    else if (isBase(l)) base = amount;
    else if (transferOf.has(i)) { process(transferOf.get(i)); base = toUnits(lines[transferOf.get(i)].baseAmount); }
    else if (bucketOf(l) && l.drCr !== BUCKETS[l.roleCode]) {
      const carry = reliefBase(l);
      const atRate = toBase(amount, rateU, opts.baseDecimals);
      base = carry === null ? atRate : carry;
      const d = atRate - base;
      if (carry !== null && d !== 0n && !transferRelief(i)) {
        const assetSide = BUCKETS[l.roleCode] === 'DR';
        const gain = assetSide ? d > 0n : d < 0n;
        fx.push(baseOnlyLine(l.eventCode, 'FX_DIFF', gain ? 'CR' : 'DR', gain ? 'FX_GAIN_REALIZED' : 'FX_LOSS_REALIZED', opts.loanCurrencyId, d < 0n ? -d : d));
      }
    } else base = toBase(amount, rateU, opts.baseDecimals);
    l.baseAmount = fromUnits(base);
    l.exchangeRate = amount === 0n ? rateString(rateU) : rateString(roundDiv(base * RATE_ONE, amount));
    apply(l, base);
    done[i] = true;
  };
  const transferRelief = i => [...transferOf.values()].includes(i);
  for (let i = 0; i < lines.length; i++) process(i);

  const out = [...lines, ...fx];
  // Base residue per section after FX: on-balance -> ROUND_DIFF within the cap; off-balance must be exact
  const residue = (pred) => out.filter(pred).reduce((s, l) => s + (l.drCr === 'DR' ? 1n : -1n) * toUnits(l.baseAmount), 0n);
  const off = residue(l => l.offBalance);
  if (off !== 0n) throw new LoanError(409, `Off-balance lines do not balance in base by ${fromUnits(off)}`);
  const r = residue(l => !l.offBalance);
  let roundDiff = 0n;
  if (r !== 0n) {
    const onLines = lines.filter(l => !l.offBalance).length;
    const cap = BigInt(opts.maxRoundDiff ?? 1) * step * BigInt(onLines);
    const abs = r < 0n ? -r : r;
    if (abs > cap) throw new LoanError(409, `Base rounding difference ${fromUnits(abs)} exceeds the cap ${fromUnits(cap)} (LOAN_FX_MAX_ROUND_DIFF ${opts.maxRoundDiff ?? 1} per line); nothing was posted`);
    roundDiff = r;
    const last = lines[lines.length - 1];
    out.push(baseOnlyLine(last ? last.eventCode : 'ROUND', 'ROUND_DIFF', r > 0n ? 'CR' : 'DR', 'ROUNDING_DIFF', opts.loanCurrencyId, abs));
  }
  return { lines: out, fx, roundDiff, buckets };
};

/**
 * Month-end revaluation (addendum §8.7, carry forward): each revalued bucket's carrying base moves to
 * contract balance x rate. Returns base-only legs, two per bucket that changes.
 */
const revaluationLines = ({ buckets, rate, baseDecimals, loanCurrencyId, eventCode = 'FX_REVAL' }) => {
  const rateU = rateUnits(rate);
  const lines = [];
  for (const [key, b] of [...buckets].sort(([a], [c]) => a.localeCompare(c))) {
    const [roleCode, qualifier] = key.split('|');
    if (!REVAL_ROLES.includes(roleCode) || b.amount === 0n) continue;
    const target = (b.amount < 0n ? -1n : 1n) * toBase(b.amount < 0n ? -b.amount : b.amount, rateU, baseDecimals);
    const delta = target - b.base;
    if (delta === 0n) continue;
    const abs = delta < 0n ? -delta : delta;
    if (delta > 0n) {
      lines.push(baseOnlyLine(eventCode, 'FX_REVAL', 'DR', roleCode, loanCurrencyId, abs, qualifier || null));
      lines.push(baseOnlyLine(eventCode, 'FX_REVAL', 'CR', 'FX_GAIN_UNREALIZED', loanCurrencyId, abs));
    } else {
      lines.push(baseOnlyLine(eventCode, 'FX_REVAL', 'DR', 'FX_LOSS_UNREALIZED', loanCurrencyId, abs));
      lines.push(baseOnlyLine(eventCode, 'FX_REVAL', 'CR', roleCode, loanCurrencyId, abs, qualifier || null));
    }
  }
  return lines;
};

module.exports = {
  BUCKETS, REVAL_ROLES, RATE_SCALE,
  rateUnits, rateString, normalizePosRate, toBase, impliedRate, deviationPct, pctString, pctUnits,
  bucketKey, bucketsFromLegs, carryOverSettlement, applyBase, revaluationLines, roundDiv, AMOUNT_ONE
};
