const db = require('../../models');
const { LoanError } = require('../errors');
const { resolveRuleSet } = require('../accounting/journal');
const { validateProductRuleSet } = require('../accounting/validators');

// Checks a product's resolved entry-rule set against its fee mode, presentation and target.
// includePending=1 validates the pending (not yet authorized) rule set, e.g. before go-live.
const accountingService = {
  async checkProduct(productId, query = {}) {
    const product = await db.lnProduct.findByPk(productId);
    if (!product) throw new LoanError(404, `Product ${productId} not found`);
    const includePending = query.includePending === '1';
    const asOfDate = query.asOfDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new LoanError(400, 'asOfDate must be YYYY-MM-DD');
    const rules = (await db.lnAccountingEntryRule.findAll()).map(r => r.get({ plain: true }));
    const active = resolveRuleSet(rules, product, { asOfDate, includePending });
    const withInactive = resolveRuleSet(rules, product, { asOfDate, includePending, includeInactive: true });
    const errors = validateProductRuleSet(product, active, withInactive);
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
      ok: errors.length === 0,
      errors
    };
  }
};

module.exports = accountingService;
