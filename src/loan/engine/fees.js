/**
 * Upfront fees and disbursement events (pure) -> FEE_COLLECT / DISB tags per feeFinancingMode.
 * Fee formulas (ln_product_component.formulaCode, timing UPFRONT_COLLECTED):
 *   UPFRONT_PCT         defaultValue x loan amount
 *   FIXED_CONTRACT_FEE  defaultValue (the contract currency's value from ln_product_amount, Phase 5 B0)
 */
const N = require('./num');
const { clean } = require('./prepayment');
const { LoanError } = require('../errors');

const UPFRONT_TIMING = 'UPFRONT_COLLECTED';

const upfrontFees = ({ loanAmount, components = [], rounder }) => {
  const lines = [];
  for (const c of components.filter(x => x.timing === UPFRONT_TIMING)) {
    let amount;
    if (c.formulaCode === 'UPFRONT_PCT') amount = rounder.round(N.mul(loanAmount, c.defaultValue));
    else if (c.formulaCode === 'FIXED_CONTRACT_FEE') {
      // Phase 5 B0: the value is the contract currency's (ln_product_amount); none means the product is incomplete
      if (c.currencyMissing || c.defaultValue === null || c.defaultValue === undefined) throw new LoanError(409, `${c.componentCode} has no fixed amount in the contract currency`);
      amount = rounder.round(c.defaultValue);
    }
    else throw new LoanError(400, `Unsupported upfront fee formula ${c.formulaCode} (${c.componentCode})`);
    lines.push({ componentCode: c.componentCode, formulaCode: c.formulaCode, amount });
  }
  return { lines, total: rounder.round(N.sum(lines.map(l => l.amount))) };
};

/**
 * input: { feeFinancingMode, loanAmount, fees (total), insurancePremium, vat?: { rate, inclusive }, rounder }
 * UPFRONT: the loan amount finances the invoice; fees, insurance and VAT are collected in cash first.
 * CAPITALIZED: the loan amount includes fees and insurance; PRINCIPAL = loan amount - fees - insurance.
 * DEDUCTED: fees and insurance are kept from the payout; PRINCIPAL = loan amount.
 */
const disbursementEvents = ({ feeFinancingMode, loanAmount, fees = '0', insurancePremium = '0', vat, rounder }) => {
  let fee = N.of(fees);
  let vatAmount = N.ZERO;
  if (vat && !N.isZero(fee)) {
    if (feeFinancingMode !== 'UPFRONT') throw new LoanError(400, 'VAT on capitalized or deducted fees is not defined yet (addendum open question)');
    const rate = N.of(vat.rate);
    if (vat.inclusive) { vatAmount = N.of(rounder.round(N.div(N.mul(fee, rate), N.add(1, rate)))); fee = N.sub(fee, vatAmount); } else vatAmount = N.of(rounder.round(N.mul(fee, rate)));
  }
  const ins = N.of(insurancePremium);
  if (feeFinancingMode === 'UPFRONT') {
    const collect = { TOTAL_PAID: N.sum([fee, ins, vatAmount]), FEE_DOC: fee, INS_PREM: ins, VAT_OUT: vatAmount };
    return [
      ...(N.isZero(collect.TOTAL_PAID) ? [] : [{ event: 'FEE_COLLECT', tags: clean(collect, rounder) }]),
      { event: 'DISB', tags: clean({ PRINCIPAL: loanAmount }, rounder), qualifiers: { CURRENT: 'NORMAL' } }
    ];
  }
  if (feeFinancingMode === 'CAPITALIZED') {
    const principal = N.sub(N.sub(loanAmount, fee), ins);
    if (N.cmp(principal, 0) <= 0) throw new LoanError(400, 'Capitalized fees and insurance exceed the loan amount');
    return [{ event: 'DISB', tags: clean({ PRINCIPAL: principal, FEE_DOC: fee, INS_PREM: ins }, rounder), qualifiers: { CURRENT: 'NORMAL' } }];
  }
  if (feeFinancingMode === 'DEDUCTED') {
    return [{ event: 'DISB', tags: clean({ PRINCIPAL: loanAmount, FEE_DOC: fee, INS_PREM: ins }, rounder), qualifiers: { CURRENT: 'NORMAL' } }];
  }
  throw new LoanError(400, `Unknown fee financing mode ${feeFinancingMode}`);
};

module.exports = { upfrontFees, disbursementEvents };
