const db = require('../../models');
const { LoanError } = require('../errors');
const { resolveRuleSet } = require('../accounting/journal');
const { validateProductRuleSet } = require('../accounting/validators');

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });

// Checks a product row's resolved entry-rule set against its fee mode, presentation and target.
// Only AUTHORIZED rules count unless includePending (used to preview before go-live).
const checkProductRow = async (product, { includePending = false, asOfDate = today(), transaction } = {}) => {
  const rules = (await db.lnAccountingEntryRule.findAll({ transaction })).map(r => r.get({ plain: true }));
  const active = resolveRuleSet(rules, product, { asOfDate, includePending });
  const withInactive = resolveRuleSet(rules, product, { asOfDate, includePending, includeInactive: true });
  const errors = validateProductRuleSet(product, active, withInactive);
  // Rules still waiting for a checker that would satisfy a failing leg (helps the UI point at them)
  const pendingThatWouldHelp = includePending ? 0 : resolveRuleSet(rules, product, { asOfDate, includePending: true })
    .filter(r => r.authStatus === 'PENDING').length;
  return {
    productId: product.id,
    productCode: product.productCode,
    version: product.version,
    parameters: {
      feeFinancingMode: product.feeFinancingMode,
      deferredFeePresentation: product.deferredFeePresentation,
      disbursementTargetCode: product.disbursementTargetCode,
      interestRecognitionCode: product.interestRecognitionCode
    },
    asOfDate,
    includePending,
    activeRules: active.length,
    pendingRules: pendingThatWouldHelp,
    ok: errors.length === 0,
    errors
  };
};

const accountingService = {
  checkProductRow,

  async checkProduct(productId, query = {}) {
    const product = await db.lnProduct.findByPk(productId);
    if (!product) throw new LoanError(404, `Product ${productId} not found`);
    const asOfDate = query.asOfDate || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new LoanError(400, 'asOfDate must be YYYY-MM-DD');
    return checkProductRow(product, { includePending: query.includePending === '1', asOfDate });
  }
};

module.exports = accountingService;
