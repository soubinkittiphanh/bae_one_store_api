const masterService = require('../services/masterService');
const { describeScope, transferBranches } = require('../services/branchScope');
const paramService = require('../services/paramService');
const { handle } = require('../errors');
const { ctxOf } = require('./paramController');

const PROVISION_FIELDS = ['provisionRate', 'collateralHaircutPct', 'provisionBase', 'policyNote', 'effectiveFrom', 'effectiveTo'];
const COMPONENT_TAX_FIELDS = ['isTaxable', 'taxCode', 'taxInclusive', 'taxPointEvent'];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));

const masterController = {
  // Phase 6 Stage 3: plus the caller's branch scope (header chip, branch selector). Here, behind LN_LOOKUP VIEW,
  // because the token-only /status must carry no data.
  getLookups: handle(async req => ({ ...(await masterService.getLookups(req.query)), branchScope: await describeScope(req.user.id), transferBranches: await transferBranches() })),
  getUdes: handle(req => masterService.getUdes(req.query)),
  getComponents: handle(req => masterService.getComponents(req.query)),
  // Component taxability is edited through maker-checker like any other parameter
  updateComponentTax: handle(req => paramService.update('component', req.params.id, pick(req.body, COMPONENT_TAX_FIELDS), ctxOf(req))),
  getProvisionRules: handle(req => masterService.getProvisionRules(req.query)),
  // Provision rates are edited through maker-checker: an authorized rule gets a pending change
  updateProvisionRule: handle(req => paramService.update('provision-rule', req.params.id, pick(req.body, PROVISION_FIELDS), ctxOf(req))),
  getStatusRules: handle(req => masterService.getStatusRules(req.query)),
  getAccountingMetadata: handle(() => masterService.getAccountingMetadata()),
  getSequences: handle(() => masterService.getSequences()),
  getHolidayCalendars: handle(() => masterService.getHolidayCalendars())
};

module.exports = masterController;
