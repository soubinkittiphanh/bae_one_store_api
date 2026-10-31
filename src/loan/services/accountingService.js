const db = require('../../models');
const { LoanError } = require('../errors');
const { resolveRuleSet, buildJournal } = require('../accounting/journal');
const { validateProductRuleSet, validateJournal, validateTagAmounts } = require('../accounting/validators');
const { currencyProblems } = require('./currencyAmounts');

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });

// Checks a product row's resolved entry-rule set against its fee mode, presentation and target.
// Only AUTHORIZED rules count unless includePending (used to preview before go-live).
// Phase 5 B0: also every offered currency needs its amount limits and fixed amounts (currencyErrors);
// posting on existing accounts passes currencies: false (their amounts are frozen in the snapshot).
const checkProductRow = async (product, { includePending = false, asOfDate = today(), transaction, currencies = true } = {}) => {
  const rules = (await db.lnAccountingEntryRule.findAll({ transaction })).map(r => r.get({ plain: true }));
  const active = resolveRuleSet(rules, product, { asOfDate, includePending });
  const withInactive = resolveRuleSet(rules, product, { asOfDate, includePending, includeInactive: true });
  const ruleErrors = validateProductRuleSet(product, active, withInactive);
  const currencyErrors = currencies ? await currencyProblems(product, { transaction }) : [];
  const errors = [...ruleErrors, ...currencyErrors];
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
    ruleErrors,
    currencyErrors,
    errors
  };
};

// Engine events -> journal lines with the product's rule set -> 2B validators. Nothing is posted.
// Uses AUTHORIZED rules; includePending previews with pending rules (flagged in the result).
const previewJournal = async (product, events, { includePending = false, currency = null, asOfDate = today() } = {}) => {
  const [rules, roles] = await Promise.all([db.lnAccountingEntryRule.findAll(), db.lnAccountingRole.findAll()]);
  const plainRules = rules.map(r => r.get({ plain: true }));
  const roleTypes = Object.fromEntries(roles.map(r => [r.roleCode, r.expectedType]));
  const set = resolveRuleSet(plainRules, product, { asOfDate, includePending });
  const lines = [];
  const errors = [];
  for (const ev of events) {
    try {
      const built = buildJournal({ rules: set, eventCode: ev.event, tags: ev.tags, qualifiers: ev.qualifiers || {}, currency });
      errors.push(...validateTagAmounts(ev.event, ev.tags, set));
      lines.push(...built);
    } catch (err) {
      if (!(err instanceof LoanError)) throw err;
      errors.push(err.message);
    }
  }
  errors.push(...validateJournal(lines, roleTypes));
  return { rules: includePending ? 'AUTHORIZED+PENDING' : 'AUTHORIZED', lines, balanced: errors.length === 0, errors };
};

const accountingService = {
  checkProductRow,
  previewJournal,

  async checkProduct(productId, query = {}) {
    const product = await db.lnProduct.findByPk(productId);
    if (!product) throw new LoanError(404, `Product ${productId} not found`);
    const asOfDate = query.asOfDate || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new LoanError(400, 'asOfDate must be YYYY-MM-DD');
    return checkProductRow(product, { includePending: query.includePending === '1', asOfDate });
  }
};

module.exports = accountingService;
