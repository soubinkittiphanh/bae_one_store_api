/**
 * Multi-leg journal -> the POS general_ledger's Dr/Cr pairs (pure, deterministic, no floats).
 * Per currency: legs of a self-balanced tag (equal Dr and Cr leg counts) are paired with each other;
 * the remaining one-sided legs are matched largest first. A pair whose two legs hit the same account
 * (e.g. STCH between statuses mapped to one account) nets to zero and is not written to the GL.
 */
const { toUnits, fromUnits } = require('../accounting/journal');
const { LoanError } = require('../errors');

const GL_SCALE_CHECK = 100n; // units are 4 decimals; the POS GL stores 2

const toGlAmount = (units) => {
  if (units % GL_SCALE_CHECK !== 0n) throw new LoanError(409, `Amount ${fromUnits(units)} has more than 2 decimals; round it per the rounding policy before posting`);
  return fromUnits(units).slice(0, -2);
};

// legs: [{ eventCode, amountTag, drCr, chartAccountId, amount, currencyId }] -> { pairs, legPair }
const pairLegs = (legs) => {
  const pairs = [];
  const legPair = new Array(legs.length).fill(null);
  const currencies = [...new Set(legs.map(l => l.currencyId))];
  for (const currency of currencies) {
    const idx = legs.map((l, i) => i).filter(i => legs[i].currencyId === currency);
    const units = Object.fromEntries(idx.map(i => [i, toUnits(legs[i].amount)]));
    const used = new Set();
    const add = (d, c, amount) => {
      pairs.push({ drIndex: d, crIndex: c, drAccountId: legs[d].chartAccountId, crAccountId: legs[c].chartAccountId, units: amount, currencyId: currency });
      if (legPair[d] === null) legPair[d] = pairs.length - 1;
      if (legPair[c] === null) legPair[c] = pairs.length - 1;
    };
    // 1. self-balanced tags: i-th debit with i-th credit
    const groups = {};
    for (const i of idx) (groups[`${legs[i].eventCode}|${legs[i].amountTag}`] = groups[`${legs[i].eventCode}|${legs[i].amountTag}`] || []).push(i);
    for (const members of Object.values(groups)) {
      const dr = members.filter(i => legs[i].drCr === 'DR');
      const cr = members.filter(i => legs[i].drCr === 'CR');
      if (!dr.length || dr.length !== cr.length) continue;
      if (dr.some((d, k) => units[d] !== units[cr[k]])) continue;
      dr.forEach((d, k) => { add(d, cr[k], units[d]); used.add(d); used.add(cr[k]); });
    }
    // 2. remaining legs: largest first
    const open = side => idx.filter(i => !used.has(i) && legs[i].drCr === side).map(i => ({ i, left: units[i] }))
      .sort((a, b) => (a.left === b.left ? a.i - b.i : (a.left > b.left ? -1 : 1)));
    const debits = open('DR');
    const credits = open('CR');
    while (debits.length && credits.length) {
      const d = debits[0];
      const c = credits[0];
      const amount = d.left < c.left ? d.left : c.left;
      add(d.i, c.i, amount);
      d.left -= amount;
      c.left -= amount;
      if (d.left === 0n) debits.shift();
      if (c.left === 0n) credits.shift();
    }
    if (debits.length || credits.length) throw new LoanError(409, `Journal does not balance in currency ${currency}; nothing was posted`);
  }
  return {
    pairs: pairs.map(p => ({ ...p, amount: toGlAmount(p.units), sameAccount: p.drAccountId === p.crAccountId })),
    legPair
  };
};

/**
 * Phase 5: POS general_ledger rows when legs carry base amounts (each row has ONE local amount).
 * legs: [{ drCr, chartAccountId, currencyId, amount, baseAmount, isBaseOnly }]
 * 1. Contract legs are paired per currency as above; each piece takes its share of the DEBIT leg's base
 *    (the last piece of a leg takes the remainder), so every debit leg receives exactly its base.
 * 2. A credit leg's base minus what its pieces carried, and every base-only leg (FX_DIFF, FX_REVAL,
 *    ROUND_DIFF), are paired in base as rows with debit = credit = 0 (the POS revaluation pattern).
 * With base = amount (base-currency loans) step 2 is empty and the rows equal pairLegs' rows exactly.
 * Returns { rows: [{ drIndex, crIndex, drAccountId, crAccountId, amount, localAmount, rate, currencyId, baseOnly, sameAccount }], legRow }
 */
const RATE_ONE = 10n ** 6n;
const rateOf = (local, amount) => {
  if (amount === 0n) return '1.000000';
  const r = (local * RATE_ONE * 2n + amount) / (amount * 2n);
  return `${r / RATE_ONE}.${(r % RATE_ONE).toString().padStart(6, '0')}`;
};
const glRows = (legs, { baseStep = 100n, rowCurrencyId = null } = {}) => {
  const contractIdx = legs.map((l, i) => i).filter(i => !legs[i].isBaseOnly && toUnits(legs[i].amount) > 0n);
  const contract = contractIdx.map(i => legs[i]);
  const { pairs } = pairLegs(contract);
  const base = legs.map(l => toUnits(l.baseAmount === undefined ? l.amount : l.baseAmount));
  const amountLeft = contract.map(l => toUnits(l.amount));
  const baseLeft = contractIdx.map(i => base[i]);
  const received = new Array(legs.length).fill(0n);
  const rows = [];
  const legRow = new Array(legs.length).fill(null);
  const note = (legIndex, rowIndex) => { if (legRow[legIndex] === null) legRow[legIndex] = rowIndex; };
  for (const p of pairs) {
    const d = p.drIndex;
    let share;
    if (p.units === amountLeft[d]) share = baseLeft[d];
    else {
      const raw = (p.units * baseLeft[d]) / amountLeft[d];
      share = ((raw + baseStep / 2n) / baseStep) * baseStep;
    }
    amountLeft[d] -= p.units;
    baseLeft[d] -= share;
    const dLeg = contractIdx[d];
    const cLeg = contractIdx[p.crIndex];
    received[dLeg] += share;
    received[cLeg] += share;
    rows.push({ drIndex: dLeg, crIndex: cLeg, drAccountId: p.drAccountId, crAccountId: p.crAccountId, amount: p.amount, localAmount: toGlAmount(share), rate: rateOf(share, p.units), currencyId: p.currencyId, baseOnly: false, sameAccount: p.sameAccount });
    note(dLeg, rows.length - 1);
    note(cLeg, rows.length - 1);
  }
  // Base corrections: what each contract leg still needs, plus the base-only legs
  const pool = [];
  legs.forEach((l, i) => {
    if (l.isBaseOnly) { if (base[i] > 0n) pool.push({ i, side: l.drCr, left: base[i] }); return; }
    const delta = base[i] - received[i];
    if (delta === 0n) return;
    const side = delta > 0n ? l.drCr : (l.drCr === 'DR' ? 'CR' : 'DR');
    pool.push({ i, side, left: delta > 0n ? delta : -delta });
  });
  const order = side => pool.filter(x => x.side === side).sort((a, b) => (a.left === b.left ? a.i - b.i : (a.left > b.left ? -1 : 1)));
  const debits = order('DR');
  const credits = order('CR');
  while (debits.length && credits.length) {
    const dr = debits[0];
    const cr = credits[0];
    const amount = dr.left < cr.left ? dr.left : cr.left;
    const drAccountId = legs[dr.i].chartAccountId;
    const crAccountId = legs[cr.i].chartAccountId;
    rows.push({ drIndex: dr.i, crIndex: cr.i, drAccountId, crAccountId, amount: '0.00', localAmount: toGlAmount(amount), rate: '1.000000', currencyId: rowCurrencyId, baseOnly: true, sameAccount: drAccountId === crAccountId });
    note(dr.i, rows.length - 1);
    note(cr.i, rows.length - 1);
    dr.left -= amount;
    cr.left -= amount;
    if (dr.left === 0n) debits.shift();
    if (cr.left === 0n) credits.shift();
  }
  if (debits.length || credits.length) throw new LoanError(409, 'Journal does not balance in base; nothing was posted');
  return { rows, legRow };
};

module.exports = { pairLegs, toGlAmount, glRows };
