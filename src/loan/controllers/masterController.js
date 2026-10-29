const masterService = require('../services/masterService');
const paramService = require('../services/paramService');
const { handle } = require('../errors');
const { ctxOf } = require('./paramController');

const PROVISION_FIELDS = ['provisionRate', 'collateralHaircutPct', 'provisionBase', 'policyNote', 'effectiveFrom', 'effectiveTo'];
const COMPONENT_TAX_FIELDS = ['isTaxable', 'taxCode', 'taxInclusive', 'taxPointEvent'];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));

const masterController = {
  getLookups: handle(req => masterService.getLookups(req.query)),
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
