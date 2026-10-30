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

module.exports = { pairLegs, toGlAmount };
