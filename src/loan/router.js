const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');
const { requirePermission } = require('../security/middleware');
const { getEntity } = require('./services/paramRegistry');
const { scoped } = require('./services/branchScope');
const paramService = require('./services/paramService');

const taxProfileController = require('./controllers/taxProfileController');
const checklistController = require('./controllers/checklistController');
const productController = require('./controllers/productController');
const masterController = require('./controllers/masterController');
const { paramController } = require('./controllers/paramController');
const applicationController = require('./controllers/applicationController');
const accountController = require('./controllers/accountController');
const transactionController = require('./controllers/transactionController');
const fxController = require('./controllers/fxController');
const { reportController, uploadOne } = require('./controllers/reportController');

// All loan endpoints require a valid token and a sec_group_grant for the function/action. Right after the
// permission guard, scoped(kind) limits the route to the user's branches (Phase 6; see services/branchScope.js).
router.use(validateToken);

const can = requirePermission;
const entityFunction = (req) => {
  const def = getEntity(req.params.entity);
  return def ? def.functionCode : null;
};
const changeFunction = (req) => paramService.changeFunctionCode(req.params.id);

// --- Banner state for every loan screen (any logged-in user; no parameter details) ---
router.get('/status', scoped('global'), taxProfileController.getStatus);

// --- Go-Live Checklist ---
router.get('/checklist', can('LN_CHECKLIST', 'VIEW'), scoped('global'), checklistController.getChecklist);
router.post('/checklist/:itemKey/confirm', can('LN_CHECKLIST', 'AUTHORIZE'), scoped('global'), checklistController.confirmItem);

// --- Tax Profile & VAT ---
router.get('/tax-profile', can('LN_TAX_PROFILE', 'VIEW'), scoped('global'), taxProfileController.getTaxProfile);
router.put('/tax-profile', can('LN_TAX_PROFILE', 'EDIT'), scoped('global'), taxProfileController.updateTaxProfile);
router.post('/tax-profile/confirm', can('LN_TAX_PROFILE', 'AUTHORIZE'), scoped('global'), taxProfileController.confirmTaxProfile);
router.put('/components/:id/tax', can('LN_COMPONENT', 'EDIT'), scoped('global'), masterController.updateComponentTax);
router.get('/reports/vat', can('LN_VAT_REPORT', 'VIEW'), scoped('list'), taxProfileController.getVatReport);

// --- Product Factory ---
router.get('/products', can('LN_PRODUCT', 'VIEW'), scoped('global'), productController.getProducts);
router.get('/products/:id', can('LN_PRODUCT', 'VIEW'), scoped('global'), productController.getProductById);
router.post('/products', can('LN_PRODUCT', 'CREATE'), scoped('global'), productController.createProduct);
router.put('/products/:id', can('LN_PRODUCT', 'EDIT'), scoped('global'), productController.updateProduct);
router.post('/products/:id/clone', can('LN_PRODUCT', 'CREATE'), scoped('global'), productController.cloneProduct);
router.get('/products/:id/accounting-check', can('LN_ENTRY_RULE', 'VIEW'), scoped('global'), productController.accountingCheck);
router.post('/products/:id/simulate', can('LN_PRODUCT', 'VIEW'), scoped('global'), accountController.simulate);

// --- Applications and accounts (Phase 3: calculation only, no GL posting) ---
router.get('/applications', can('LN_APPLICATION', 'VIEW'), scoped('list'), applicationController.list);
router.post('/applications', can('LN_APPLICATION', 'CREATE'), scoped('sale'), applicationController.create);
router.get('/applications/:id', can('LN_APPLICATION', 'VIEW'), scoped('application'), applicationController.get);
router.put('/applications/:id', can('LN_APPLICATION', 'EDIT'), scoped('application'), applicationController.update);
router.post('/applications/:id/submit', can('LN_APPLICATION', 'EDIT'), scoped('application'), applicationController.submit);
router.post('/applications/:id/approve', can('LN_APPLICATION', 'AUTHORIZE'), scoped('application'), applicationController.approve);
router.post('/applications/:id/reject', can('LN_APPLICATION', 'AUTHORIZE'), scoped('application'), applicationController.reject);
router.post('/applications/:id/book', can('LN_ACCOUNT', 'CREATE'), scoped('application'), applicationController.book);
// Phase 5 B1: the list takes filters (search, status, stage, currencyId) and returns customer and product
router.get('/accounts', can('LN_ACCOUNT', 'VIEW'), scoped('list'), reportController.accounts);
router.get('/accounts/:id', can('LN_ACCOUNT', 'VIEW'), scoped('account'), accountController.get);
router.post('/accounts/:id/preview/:kind', can('LN_ACCOUNT', 'VIEW'), scoped('account'), accountController.preview);

// --- Phase 4: transactions (one DB transaction each, Idempotency-Key required) and EOD ---
router.get('/accounts/:id/transactions', can('LN_TRANSACTION', 'VIEW'), scoped('account'), transactionController.list);
router.post('/accounts/:id/transactions', can('LN_TRANSACTION', 'CREATE'), scoped('account'), transactionController.create);
// Phase 6: the bank/cash accounts this account's branch may post to
router.get('/accounts/:id/bank-accounts', can('LN_TRANSACTION', 'VIEW'), scoped('account'), reportController.bankAccounts);
router.post('/transactions/:txId/authorize', can('LN_TRANSACTION', 'AUTHORIZE'), scoped('transaction'), transactionController.authorize);
router.post('/transactions/:txId/reject', can('LN_TRANSACTION', 'AUTHORIZE'), scoped('transaction'), transactionController.reject);
router.get('/eod/status', can('LN_EOD', 'VIEW'), scoped('global'), transactionController.eodStatus);

// --- Phase 5: exchange rates (rows: Parameter Studio entity 'exchange-rate', maker-checker) ---
router.get('/exchange-rates/effective', can('LN_EXCHANGE_RATE', 'VIEW'), scoped('global'), fxController.effective);
router.post('/exchange-rates/copy-pos', can('LN_EXCHANGE_RATE', 'CREATE'), scoped('global'), fxController.copyPosRate);
router.get('/sales/:saleHeaderId/financing-proposal', can('LN_APPLICATION', 'VIEW'), scoped('sale'), fxController.proposal);
router.post('/eod/run', can('LN_EOD', 'CREATE'), scoped('all-branches'), transactionController.runEod);

// --- Phase 5 Part B1: read-only views for the loan screens; account documents (D10); print templates (D11) ---
router.get('/accounts/:id/summary', can('LN_ACCOUNT', 'VIEW'), scoped('account'), reportController.summary);
router.get('/accounts/:id/schedule', can('LN_ACCOUNT', 'VIEW'), scoped('account'), reportController.schedule);
router.get('/accounts/:id/history', can('LN_ACCOUNT', 'VIEW'), scoped('account'), reportController.history);
router.get('/accounts/:id/statement', can('LN_ACCOUNT', 'VIEW'), scoped('account'), reportController.statement);
router.get('/accounts/:id/documents', can('LN_DOCUMENT', 'VIEW'), scoped('account'), reportController.documents);
router.post('/accounts/:id/documents', can('LN_DOCUMENT', 'CREATE'), scoped('account'), uploadOne, reportController.uploadDocument);
router.get('/documents/:docId/file', can('LN_DOCUMENT', 'VIEW'), scoped('document'), reportController.documentFile);
router.get('/print-templates/:code', can('LN_ACCOUNT', 'VIEW'), scoped('global'), reportController.printTemplate);
router.get('/transactions/pending', can('LN_TRANSACTION', 'VIEW'), scoped('list'), reportController.pending);
router.get('/eod/logs', can('LN_EOD', 'VIEW'), scoped('global'), reportController.eodLogs);
router.get('/reports/overdue', can('LN_COLLECTION', 'VIEW'), scoped('list'), reportController.overdue);
router.get('/reports/portfolio', can('LN_REPORT', 'VIEW'), scoped('list'), reportController.portfolio);
router.get('/reports/aging', can('LN_REPORT', 'VIEW'), scoped('list'), reportController.aging);
router.get('/reports/npl', can('LN_REPORT', 'VIEW'), scoped('list'), reportController.npl);
router.get('/reports/provisions', can('LN_REPORT', 'VIEW'), scoped('list'), reportController.provisions);
router.get('/reports/gl-tieout', can('LN_REPORT', 'VIEW'), scoped('list'), reportController.glTieout);

// --- Master data, lookups & rules ---
router.get('/lookups', can('LN_LOOKUP', 'VIEW'), scoped('global'), masterController.getLookups);
router.get('/udes', can('LN_UDE', 'VIEW'), scoped('global'), masterController.getUdes);
router.get('/components', can('LN_COMPONENT', 'VIEW'), scoped('global'), masterController.getComponents);
router.get('/provision-rules', can('LN_PROVISION', 'VIEW'), scoped('global'), masterController.getProvisionRules);
router.put('/provision-rules/:id', can('LN_PROVISION', 'EDIT'), scoped('global'), masterController.updateProvisionRule);
router.get('/status-rules', can('LN_STATUS_RULE', 'VIEW'), scoped('global'), masterController.getStatusRules);
router.get('/accounting-metadata', can('LN_ACCOUNTING_SETUP', 'VIEW'), scoped('global'), masterController.getAccountingMetadata);
router.get('/sequences', can('LN_SEQUENCE', 'VIEW'), scoped('global'), masterController.getSequences);
router.get('/holiday-calendars', can('LN_HOLIDAY', 'VIEW'), scoped('global'), masterController.getHolidayCalendars);

// --- Generic parameter maker-checker (entity names: see services/paramRegistry.js) ---
router.get('/params/:entity', can(entityFunction, 'VIEW'), scoped('global'), paramController.list);
router.post('/params/:entity', can(entityFunction, 'CREATE'), scoped('global'), paramController.create);
router.post('/params/:entity/bulk-authorize', can(entityFunction, 'AUTHORIZE'), scoped('global'), paramController.bulkAuthorize);
router.get('/params/:entity/:key', can(entityFunction, 'VIEW'), scoped('global'), paramController.get);
router.put('/params/:entity/:key', can(entityFunction, 'EDIT'), scoped('global'), paramController.update);
router.delete('/params/:entity/:key', can(entityFunction, 'DELETE'), scoped('global'), paramController.remove);
router.post('/params/:entity/:key/authorize', can(entityFunction, 'AUTHORIZE'), scoped('global'), paramController.authorize);
router.post('/params/:entity/:key/reject', can(entityFunction, 'AUTHORIZE'), scoped('global'), paramController.reject);

// --- Unauthorized records across entities (filtered by the caller's VIEW grants) ---
router.get('/pending', scoped('global'), paramController.listPending);

// --- Pending changes to authorized records ---
router.get('/changes', can('LN_AUDIT_LOG', 'VIEW'), scoped('global'), paramController.listChanges);
router.post('/changes/:id/authorize', can(changeFunction, 'AUTHORIZE'), scoped('global'), paramController.authorizeChange);
router.post('/changes/:id/reject', can(changeFunction, 'AUTHORIZE'), scoped('global'), paramController.rejectChange);

// --- Audit trail ---
router.get('/audit-log', can('LN_AUDIT_LOG', 'VIEW'), scoped('list'), paramController.auditLog);

module.exports = router;
