/**
 * Rule resolution and journal building (pure functions, no DB access, no floats).
 * Amounts are decimal strings with up to 4 decimals (DECIMAL(20,4)).
 */
const { LoanError } = require('../errors');

const SCALE = 4;
const AMOUNT_RE = /^\d{1,16}(\.\d{1,4})?$/;

const toUnits = (value) => {
  const s = String(value);
  if (!AMOUNT_RE.test(s)) throw new LoanError(400, `Invalid amount "${s}": expected a non-negative decimal with up to ${SCALE} decimals`);
  const [i, f = ''] = s.split('.');
  return BigInt(i + f.padEnd(SCALE, '0'));
};

const fromUnits = (units) => {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(SCALE + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
};

const matchesFilter = (filter, value) => !filter || filter === 'ANY' || filter === value;

// Rules that apply to a product on a date. A product-scoped rule set for an event replaces the
// category set, which replaces the global set (FLEXCUBE-style override per event).
const resolveRuleSet = (rules, product, { asOfDate, includePending = false, includeInactive = false } = {}) => {
  const usable = rules.filter(r => (
    (includePending ? ['AUTHORIZED', 'PENDING'].includes(r.authStatus) : r.authStatus === 'AUTHORIZED')
    && (includeInactive || r.isActive === true || r.isActive === 1)
    && (!asOfDate || (String(r.effectiveFrom) <= asOfDate && (!r.effectiveTo || String(r.effectiveTo) >= asOfDate)))
    && matchesFilter(r.feeModeFilter, product.feeFinancingMode)
    && matchesFilter(r.presentationFilter, product.deferredFeePresentation)
    && matchesFilter(r.targetFilter, product.disbursementTargetCode)
    && (r.productId == null || Number(r.productId) === Number(product.id))
    && (r.categoryId == null || Number(r.categoryId) === Number(product.categoryId))
  ));
  const scopeOf = r => (r.productId != null ? 2 : (r.categoryId != null ? 1 : 0));
  const bestScope = {};
  for (const r of usable) bestScope[r.eventCode] = Math.max(bestScope[r.eventCode] ?? 0, scopeOf(r));
  return usable.filter(r => scopeOf(r) === bestScope[r.eventCode]);
};

/**
 * Applies an event's rules to its tag amounts.
 *   tags: { TAG: '123.4500', ... }   zero or missing tags post nothing
 *   qualifiers: { CURRENT, NEW, PREVIOUS } GL qualifiers for LOAN_PORTFOLIO
 * Every non-zero tag must have at least one rule, otherwise money would vanish.
 */
const buildJournal = ({ rules, eventCode, tags, qualifiers = {}, currency }) => {
  const eventRules = rules.filter(r => r.eventCode === eventCode);
  const lines = [];
  for (const [tag, amount] of Object.entries(tags)) {
    const units = toUnits(amount);
    if (units === 0n) continue;
    const tagRules = eventRules.filter(r => r.amountTag === tag);
    if (!tagRules.length) throw new LoanError(400, `${eventCode}: amount tag ${tag} is non-zero but has no active entry rule`);
    for (const r of tagRules) {
      let qualifier = null;
      if (r.qualifierSource && r.qualifierSource !== 'NONE') {
        qualifier = qualifiers[r.qualifierSource];
        if (!qualifier) throw new LoanError(400, `${eventCode}: ${r.roleCode} needs the ${r.qualifierSource} status qualifier`);
      }
      lines.push({ eventCode, amountTag: tag, drCr: r.drCr, roleCode: r.roleCode, qualifier, currency, amount: fromUnits(units) });
    }
  }
  return lines;
};

// REVERSAL: mirror every original line (Dr <-> Cr, same amount, same role, qualifier and currency).
// When posting, the original chartAccountId is reused; nothing is re-resolved.
const reverseLines = (lines) => lines.map(l => ({ ...l, eventCode: 'REVERSAL', reversedEventCode: l.eventCode, drCr: l.drCr === 'DR' ? 'CR' : 'DR' }));

module.exports = { SCALE, toUnits, fromUnits, resolveRuleSet, buildJournal, reverseLines };
