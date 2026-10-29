/**
 * Phase 2B accounting validators (docs/loan/rev5-accounting-addendum.md §0 and §7).
 * Pure functions: each returns a list of error strings (empty = valid).
 *
 *   validateJournal      balance per currency, on- and off-balance separately
 *   validateTagAmounts   total-cash tag (and every one-sided tag) equals the sum of its parts
 *   validateRuleStructure qualifiers, self-balancing tags, duplicates
 *   validateProductRuleSet product rule set matches fee mode / presentation / disbursement target
 */
const { toUnits, fromUnits } = require('./journal');
const { TOTAL_CASH_TAGS, PRESENTATION_ROLE } = require('./catalog');

const STATUS_CHANGE_EVENTS = ['STCH', 'STCH_CURE'];
const legKey = r => `${r.eventCode} ${r.amountTag} ${r.drCr} ${r.roleCode}`;

// roleTypes: { ROLE_CODE: expectedType } from ln_accounting_role
const validateJournal = (lines, roleTypes) => {
  const errors = [];
  const sums = {};
  for (const l of lines) {
    const type = roleTypes[l.roleCode];
    if (!type) { errors.push(`Unknown accounting role ${l.roleCode}`); continue; }
    if (!['DR', 'CR'].includes(l.drCr)) { errors.push(`${l.roleCode}: drCr must be DR or CR`); continue; }
    let units;
    try { units = toUnits(l.amount); } catch (e) { errors.push(e.message); continue; }
    if (units === 0n) { errors.push(`${l.eventCode} ${l.amountTag} ${l.roleCode}: zero amount line`); continue; }
    const section = type === 'Off-Balance' ? 'off-balance' : 'on-balance';
    const key = `${l.currency || '-'}|${section}`;
    sums[key] = sums[key] || { DR: 0n, CR: 0n };
    sums[key][l.drCr] += units;
  }
  for (const [key, s] of Object.entries(sums)) {
    if (s.DR !== s.CR) {
      const [currency, section] = key.split('|');
      errors.push(`Unbalanced ${section} lines in ${currency}: debits ${fromUnits(s.DR)} != credits ${fromUnits(s.CR)}`);
    }
  }
  return errors;
};

// Side of each tag in an event's rule set: 'DR', 'CR' or 'BOTH'
const tagSides = (rules, eventCode) => {
  const sides = {};
  for (const r of rules.filter(x => x.eventCode === eventCode)) {
    sides[r.amountTag] = sides[r.amountTag] && sides[r.amountTag] !== r.drCr ? 'BOTH' : r.drCr;
  }
  return sides;
};

// One-sided tags must balance against each other; this is the total-cash check
// (e.g. LIQD TOTAL_PAID + ADV_APPLIED = PEN_CASH + INT_PAID + PRIN_PAID + ...).
const validateTagAmounts = (eventCode, tags, rules) => {
  const sides = tagSides(rules, eventCode);
  const sum = { DR: 0n, CR: 0n };
  const parts = { DR: [], CR: [] };
  for (const [tag, amount] of Object.entries(tags)) {
    const side = sides[tag];
    if (!side || side === 'BOTH') continue;
    const units = toUnits(amount);
    if (units === 0n) continue;
    sum[side] += units;
    parts[side].push(tag);
  }
  if (sum.DR === sum.CR) return [];
  const total = [...parts.DR, ...parts.CR].find(t => TOTAL_CASH_TAGS.includes(t));
  const label = total ? `total-cash tag ${total}` : 'one-sided tags';
  return [`${eventCode}: ${label} does not equal the sum of its parts (${parts.DR.join(' + ') || '0'} = ${fromUnits(sum.DR)}; ${parts.CR.join(' + ') || '0'} = ${fromUnits(sum.CR)})`];
};

const validateRuleStructure = (rules) => {
  const errors = [];
  const seen = new Set();
  for (const r of rules) {
    const key = `${legKey(r)} ${r.qualifierSource}`;
    if (seen.has(key)) errors.push(`Duplicate leg ${key}`);
    seen.add(key);
    if (r.roleCode === 'LOAN_PORTFOLIO') {
      const allowed = STATUS_CHANGE_EVENTS.includes(r.eventCode) ? ['NEW', 'PREVIOUS'] : ['CURRENT'];
      if (!allowed.includes(r.qualifierSource)) errors.push(`${legKey(r)}: LOAN_PORTFOLIO needs qualifierSource ${allowed.join(' or ')}`);
    } else if (r.qualifierSource !== 'NONE') {
      errors.push(`${legKey(r)}: only LOAN_PORTFOLIO is status-qualified (use NONE)`);
    }
  }
  const events = [...new Set(rules.map(r => r.eventCode))];
  for (const ev of events) {
    const evRules = rules.filter(r => r.eventCode === ev);
    const oneSided = { DR: 0, CR: 0 };
    for (const tag of new Set(evRules.map(r => r.amountTag))) {
      const dr = evRules.filter(r => r.amountTag === tag && r.drCr === 'DR').length;
      const cr = evRules.filter(r => r.amountTag === tag && r.drCr === 'CR').length;
      if (dr && cr && dr !== cr) errors.push(`${ev} ${tag}: ${dr} debit leg(s) vs ${cr} credit leg(s); a two-sided tag must balance by itself`);
      if (!dr || !cr) oneSided[dr ? 'DR' : 'CR']++;
    }
    if ((oneSided.DR > 0) !== (oneSided.CR > 0)) errors.push(`${ev}: one-sided tags exist only on the ${oneSided.DR ? 'debit' : 'credit'} side, so the event can never balance`);
  }
  return errors;
};

const L = (eventCode, amountTag, drCr, roleCode) => ({ eventCode, amountTag, drCr, roleCode });
const PAIR = (eventCode, tag, dr, cr) => [L(eventCode, tag, 'DR', dr), L(eventCode, tag, 'CR', cr)];

const TARGET_ROLE = { SALE_INVOICE_SETTLEMENT: 'SALE_RECEIVABLE', CASH_BANK: 'CASH_BANK' };
const FEE_DR_ROLE = { CAPITALIZED: 'LOAN_PORTFOLIO', DEDUCTED: 'CASH_BANK' };

// Legs every product needs, plus the ones its parameters require (addendum §2)
const requiredLegs = (p) => {
  const presRole = PRESENTATION_ROLE[p.deferredFeePresentation];
  const legs = [
    L('DISB', 'PRINCIPAL', 'DR', 'LOAN_PORTFOLIO'),
    L('DISB', 'PRINCIPAL', 'CR', TARGET_ROLE[p.disbursementTargetCode]),
    ...PAIR('ACCR', 'INT_ACCR', 'INTEREST_RECEIVABLE', 'INTEREST_INCOME'),
    ...PAIR('ACCR_SUSP', 'INT_ACCR', 'INTEREST_RECEIVABLE', 'SUSPENDED_INTEREST'),
    L('LIQD', 'TOTAL_PAID', 'DR', 'CASH_BANK'),
    L('LIQD', 'PEN_CASH', 'CR', 'PENALTY_INCOME'),
    L('LIQD', 'INT_PAID', 'CR', 'INTEREST_RECEIVABLE'),
    L('LIQD', 'PRIN_PAID', 'CR', 'LOAN_PORTFOLIO'),
    ...PAIR('LIQD_SUSP', 'SUSP_PAID', 'CASH_BANK', 'INTEREST_RECEIVABLE'),
    ...PAIR('LIQD_SUSP', 'SUSP_PAID', 'SUSPENDED_INTEREST', 'INTEREST_INCOME'),
    ...PAIR('OVERPAY', 'OVERPAY', 'CASH_BANK', 'CUSTOMER_ADVANCE_LIAB'),
    ...PAIR('STCH', 'OUT_PRIN', 'LOAN_PORTFOLIO', 'LOAN_PORTFOLIO'),
    ...PAIR('STCH', 'UNCOL_INT', 'INTEREST_INCOME', 'SUSPENDED_INTEREST'),
    ...PAIR('STCH_CURE', 'OUT_PRIN', 'LOAN_PORTFOLIO', 'LOAN_PORTFOLIO'),
    ...PAIR('STCH_CURE', 'SUSP_REV', 'SUSPENDED_INTEREST', 'INTEREST_INCOME'),
    ...PAIR('PROVISION', 'PROV_EXP', 'PROVISION_EXPENSE', 'PROVISION_RESERVE'),
    ...PAIR('PROV_WB', 'PROV_WB', 'PROVISION_RESERVE', 'PROVISION_EXPENSE'),
    ...PAIR('WRITE_OFF', 'PRIN_WO', 'PROVISION_RESERVE', 'LOAN_PORTFOLIO'),
    ...PAIR('WRITE_OFF', 'SHORTFALL', 'LOAN_LOSS_SHORTFALL', 'LOAN_PORTFOLIO'),
    ...PAIR('WRITE_OFF', 'SUSP_CLR', 'SUSPENDED_INTEREST', 'INTEREST_RECEIVABLE'),
    ...PAIR('WRITE_OFF', 'MEMO_WO', 'WRITTEN_OFF_MEMO_DR', 'WRITTEN_OFF_MEMO_CR'),
    ...PAIR('RECOVERY', 'REC_AMT', 'CASH_BANK', 'BAD_DEBT_RECOVERY'),
    L('PREPAY', 'PAYOFF_CASH', 'DR', 'CASH_BANK'),
    L('PREPAY', 'OUT_PRIN', 'CR', 'LOAN_PORTFOLIO'),
    L('PREPAY', 'EARNED_INT', 'CR', 'INTEREST_RECEIVABLE'),
    L('REPOSSESS', 'APPRAISED', 'DR', 'REPOSSESSED_VEHICLE_ASSET'),
    L('REPOSSESS', 'OUT_PRIN', 'CR', 'LOAN_PORTFOLIO'),
    L('VEH_DISPOSE', 'SALE_PRICE', 'DR', 'CASH_BANK'),
    L('VEH_DISPOSE', 'CARRYING', 'CR', 'REPOSSESSED_VEHICLE_ASSET')
  ];
  if (p.feeFinancingMode === 'UPFRONT') {
    legs.push(L('FEE_COLLECT', 'TOTAL_PAID', 'DR', 'CASH_BANK'), L('FEE_COLLECT', 'FEE_DOC', 'CR', presRole), L('FEE_COLLECT', 'INS_PREM', 'CR', 'INSURANCE_PAYABLE'));
    legs.push(L('FEE_REFUND', 'FEE_DOC', 'DR', presRole), L('FEE_REFUND', 'INS_PREM', 'DR', 'INSURANCE_PAYABLE'), L('FEE_REFUND', 'REFUND_AMT', 'CR', 'CASH_BANK'));
  } else {
    const drRole = FEE_DR_ROLE[p.feeFinancingMode];
    legs.push(L('DISB', 'FEE_DOC', 'DR', drRole), L('DISB', 'FEE_DOC', 'CR', presRole), L('DISB', 'INS_PREM', 'DR', drRole), L('DISB', 'INS_PREM', 'CR', 'INSURANCE_PAYABLE'));
  }
  if (p.deferredFeePresentation !== 'IMMEDIATE') legs.push(...PAIR('EIR_AMORT', 'EIR_AMORT', presRole, 'FEE_INCOME'));
  return legs;
};

// Active legs that contradict the product's parameters
const forbiddenReason = (r, p) => {
  const presRole = PRESENTATION_ROLE[p.deferredFeePresentation];
  const otherPresRoles = Object.values(PRESENTATION_ROLE).filter(x => x !== 'FEE_INCOME' && x !== presRole);
  if (otherPresRoles.includes(r.roleCode)) return `uses ${r.roleCode}, but presentation is ${p.deferredFeePresentation}`;
  if (p.deferredFeePresentation === 'IMMEDIATE' && ['EIR_AMORT', 'FEE_REL', 'UNAMORT'].includes(r.amountTag)) return 'fee amortization leg, but presentation is IMMEDIATE';
  if (p.deferredFeePresentation !== 'IMMEDIATE' && ['FEE_COLLECT', 'DISB', 'FEE_REFUND'].includes(r.eventCode) && r.amountTag === 'FEE_DOC' && r.roleCode === 'FEE_INCOME') {
    return `fee goes straight to FEE_INCOME, but presentation is ${p.deferredFeePresentation}`;
  }
  if (r.eventCode === 'DISB' && r.amountTag === 'PRINCIPAL' && r.drCr === 'CR' && r.roleCode !== TARGET_ROLE[p.disbursementTargetCode]) {
    return `credits ${r.roleCode}, but the disbursement target is ${p.disbursementTargetCode}`;
  }
  if (r.eventCode === 'DISB' && ['FEE_DOC', 'INS_PREM'].includes(r.amountTag)) {
    if (p.feeFinancingMode === 'UPFRONT') return 'fee/insurance leg in DISB, but fees are paid UPFRONT (FEE_COLLECT)';
    if (r.drCr === 'DR' && r.roleCode !== FEE_DR_ROLE[p.feeFinancingMode]) return `debits ${r.roleCode}, but fee mode is ${p.feeFinancingMode}`;
  }
  if (['FEE_COLLECT', 'FEE_REFUND'].includes(r.eventCode) && p.feeFinancingMode !== 'UPFRONT') return `${r.eventCode} leg, but fee mode is ${p.feeFinancingMode}`;
  return null;
};

/**
 * activeRules: the product's resolved active rule set; inactiveRules: the same resolution with
 * inactive rules included (to tell "missing" from "present but inactive").
 */
const validateProductRuleSet = (product, activeRules, inactiveRules = []) => {
  const errors = [];
  if (product.feeFinancingMode === 'DEDUCTED' && product.disbursementTargetCode === 'SALE_INVOICE_SETTLEMENT') {
    errors.push('DEDUCTED fee mode cannot be combined with SALE_INVOICE_SETTLEMENT (the invoice would stay partly unpaid)');
  }
  if (!TARGET_ROLE[product.disbursementTargetCode]) {
    errors.push(`Disbursement target ${product.disbursementTargetCode} has no accounting role (addendum Q21)`);
  }
  if (!PRESENTATION_ROLE[product.deferredFeePresentation]) errors.push(`Unknown deferred fee presentation ${product.deferredFeePresentation}`);
  if (!['UPFRONT', 'CAPITALIZED', 'DEDUCTED'].includes(product.feeFinancingMode)) errors.push(`Unknown fee mode ${product.feeFinancingMode}`);
  if (errors.length) return errors;

  const has = (set, l) => set.some(r => legKey(r) === legKey(l));
  for (const l of requiredLegs(product)) {
    if (has(activeRules, l)) continue;
    errors.push(has(inactiveRules, l) ? `Required leg ${legKey(l)} exists but is inactive` : `Missing required leg ${legKey(l)}`);
  }
  for (const r of activeRules) {
    const reason = forbiddenReason(r, product);
    if (reason) errors.push(`Leg ${legKey(r)} does not fit the product: ${reason}`);
  }
  return [...errors, ...validateRuleStructure(activeRules)];
};

module.exports = { validateJournal, validateTagAmounts, validateRuleStructure, validateProductRuleSet, requiredLegs };
