const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');
const { requirePermission } = require('../security/middleware');
const { getEntity } = require('./services/paramRegistry');
const paramService = require('./services/paramService');

const taxProfileController = require('./controllers/taxProfileController');
const checklistController = require('./controllers/checklistController');
const productController = require('./controllers/productController');
const masterController = require('./controllers/masterController');
const { paramController } = require('./controllers/paramController');

// All loan endpoints require a valid token and a sec_group_grant for the function/action
router.use(validateToken);

const can = requirePermission;
const entityFunction = (req) => {
  const def = getEntity(req.params.entity);
  return def ? def.functionCode : null;
};
const changeFunction = (req) => paramService.changeFunctionCode(req.params.id);

// --- Banner state for every loan screen (any logged-in user; no parameter details) ---
router.get('/status', taxProfileController.getStatus);

// --- Go-Live Checklist ---
router.get('/checklist', can('LN_CHECKLIST', 'VIEW'), checklistController.getChecklist);
router.post('/checklist/:itemKey/confirm', can('LN_CHECKLIST', 'AUTHORIZE'), checklistController.confirmItem);

// --- Tax Profile & VAT ---
router.get('/tax-profile', can('LN_TAX_PROFILE', 'VIEW'), taxProfileController.getTaxProfile);
router.put('/tax-profile', can('LN_TAX_PROFILE', 'EDIT'), taxProfileController.updateTaxProfile);
router.post('/tax-profile/confirm', can('LN_TAX_PROFILE', 'AUTHORIZE'), taxProfileController.confirmTaxProfile);
router.put('/components/:id/tax', can('LN_COMPONENT', 'EDIT'), masterController.updateComponentTax);
router.get('/reports/vat', can('LN_VAT_REPORT', 'VIEW'), taxProfileController.getVatReport);

// --- Product Factory ---
router.get('/products', can('LN_PRODUCT', 'VIEW'), productController.getProducts);
router.get('/products/:id', can('LN_PRODUCT', 'VIEW'), productController.getProductById);
router.post('/products', can('LN_PRODUCT', 'CREATE'), productController.createProduct);
router.put('/products/:id', can('LN_PRODUCT', 'EDIT'), productController.updateProduct);
router.post('/products/:id/clone', can('LN_PRODUCT', 'CREATE'), productController.cloneProduct);
router.get('/products/:id/accounting-check', can('LN_ENTRY_RULE', 'VIEW'), productController.accountingCheck);

// --- Master data, lookups & rules ---
router.get('/lookups', can('LN_LOOKUP', 'VIEW'), masterController.getLookups);
router.get('/udes', can('LN_UDE', 'VIEW'), masterController.getUdes);
router.get('/components', can('LN_COMPONENT', 'VIEW'), masterController.getComponents);
router.get('/provision-rules', can('LN_PROVISION', 'VIEW'), masterController.getProvisionRules);
router.put('/provision-rules/:id', can('LN_PROVISION', 'EDIT'), masterController.updateProvisionRule);
router.get('/status-rules', can('LN_STATUS_RULE', 'VIEW'), masterController.getStatusRules);
router.get('/accounting-metadata', can('LN_ACCOUNTING_SETUP', 'VIEW'), masterController.getAccountingMetadata);
router.get('/sequences', can('LN_SEQUENCE', 'VIEW'), masterController.getSequences);
router.get('/holiday-calendars', can('LN_HOLIDAY', 'VIEW'), masterController.getHolidayCalendars);

// --- Generic parameter maker-checker (entity names: see services/paramRegistry.js) ---
router.get('/params/:entity', can(entityFunction, 'VIEW'), paramController.list);
router.post('/params/:entity', can(entityFunction, 'CREATE'), paramController.create);
router.get('/params/:entity/:key', can(entityFunction, 'VIEW'), paramController.get);
router.put('/params/:entity/:key', can(entityFunction, 'EDIT'), paramController.update);
router.delete('/params/:entity/:key', can(entityFunction, 'DELETE'), paramController.remove);
router.post('/params/:entity/:key/authorize', can(entityFunction, 'AUTHORIZE'), paramController.authorize);
router.post('/params/:entity/:key/reject', can(entityFunction, 'AUTHORIZE'), paramController.reject);

// --- Unauthorized records across entities (filtered by the caller's VIEW grants) ---
router.get('/pending', paramController.listPending);

// --- Pending changes to authorized records ---
router.get('/changes', can('LN_AUDIT_LOG', 'VIEW'), paramController.listChanges);
router.post('/changes/:id/authorize', can(changeFunction, 'AUTHORIZE'), paramController.authorizeChange);
router.post('/changes/:id/reject', can(changeFunction, 'AUTHORIZE'), paramController.rejectChange);

// --- Audit trail ---
router.get('/audit-log', can('LN_AUDIT_LOG', 'VIEW'), paramController.auditLog);

module.exports = router;
