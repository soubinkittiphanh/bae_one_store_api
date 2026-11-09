/**
 * Every route of src/loan/router.js with the permission a security reviewer has accepted (T4).
 * The test fails on any difference, so a new route or a changed permission needs a change here too,
 * and that change is what a reviewer looks at. Paths are relative to /api/loan.
 *
 * [method, path, function, action, scope]
 *   function '{entity}'  the entity's own function from paramRegistry
 *   function '{change}'  the function of the entity the pending change belongs to
 *   function null        token only: must also be listed in TOKEN_ONLY with the reason
 *   scope                the branch scope guard (src/loan/services/branchScope.js) that runs right after the
 *                        permission guard: account | transaction | application | document | sale (by-id:
 *                        outside the user's branches answers 404), list (the service filters to the user's
 *                        branches), all-branches (needs LN_ALL_BRANCHES), global (company data, no branch)
 */
const ROUTES = [
  ['GET', '/status', null, null, 'global'],
  ['GET', '/checklist', 'LN_CHECKLIST', 'VIEW', 'global'],
  ['POST', '/checklist/:itemKey/confirm', 'LN_CHECKLIST', 'AUTHORIZE', 'global'],
  ['GET', '/tax-profile', 'LN_TAX_PROFILE', 'VIEW', 'global'],
  ['PUT', '/tax-profile', 'LN_TAX_PROFILE', 'EDIT', 'global'],
  ['POST', '/tax-profile/confirm', 'LN_TAX_PROFILE', 'AUTHORIZE', 'global'],
  ['PUT', '/components/:id/tax', 'LN_COMPONENT', 'EDIT', 'global'],
  ['GET', '/reports/vat', 'LN_VAT_REPORT', 'VIEW', 'list'],
  ['GET', '/products', 'LN_PRODUCT', 'VIEW', 'global'],
  ['GET', '/products/:id', 'LN_PRODUCT', 'VIEW', 'global'],
  ['POST', '/products', 'LN_PRODUCT', 'CREATE', 'global'],
  ['PUT', '/products/:id', 'LN_PRODUCT', 'EDIT', 'global'],
  ['POST', '/products/:id/clone', 'LN_PRODUCT', 'CREATE', 'global'],
  ['GET', '/products/:id/accounting-check', 'LN_ENTRY_RULE', 'VIEW', 'global'],
  ['POST', '/products/:id/simulate', 'LN_PRODUCT', 'VIEW', 'global'],
  ['GET', '/applications', 'LN_APPLICATION', 'VIEW', 'list'],
  ['POST', '/applications', 'LN_APPLICATION', 'CREATE', 'sale'],
  ['GET', '/applications/:id', 'LN_APPLICATION', 'VIEW', 'application'],
  ['PUT', '/applications/:id', 'LN_APPLICATION', 'EDIT', 'application'],
  ['POST', '/applications/:id/submit', 'LN_APPLICATION', 'EDIT', 'application'],
  ['POST', '/applications/:id/approve', 'LN_APPLICATION', 'AUTHORIZE', 'application'],
  ['POST', '/applications/:id/reject', 'LN_APPLICATION', 'AUTHORIZE', 'application'],
  ['POST', '/applications/:id/book', 'LN_ACCOUNT', 'CREATE', 'application'],
  ['GET', '/accounts', 'LN_ACCOUNT', 'VIEW', 'list'],
  ['GET', '/accounts/:id', 'LN_ACCOUNT', 'VIEW', 'account'],
  // Route grant is LN_ACCOUNT VIEW for the four simulation kinds (due-date/payment/prepayment/status).
  // For the 12 transaction kinds the controller additionally requires LN_TRANSACTION CREATE in-handler
  // (see PREVIEW_WRITE_KIND_EXTRA below); both are read-only and write nothing.
  ['POST', '/accounts/:id/preview/:kind', 'LN_ACCOUNT', 'VIEW', 'account'],
  ['GET', '/accounts/:id/transactions', 'LN_TRANSACTION', 'VIEW', 'account'],
  ['POST', '/accounts/:id/transactions', 'LN_TRANSACTION', 'CREATE', 'account'],
  ['POST', '/transactions/:txId/authorize', 'LN_TRANSACTION', 'AUTHORIZE', 'transaction'],
  ['POST', '/transactions/:txId/reject', 'LN_TRANSACTION', 'AUTHORIZE', 'transaction'],
  ['GET', '/eod/status', 'LN_EOD', 'VIEW', 'global'],
  ['GET', '/exchange-rates/effective', 'LN_EXCHANGE_RATE', 'VIEW', 'global'],
  ['POST', '/exchange-rates/copy-pos', 'LN_EXCHANGE_RATE', 'CREATE', 'global'],
  ['GET', '/sales/:saleHeaderId/financing-proposal', 'LN_APPLICATION', 'VIEW', 'sale'],
  ['POST', '/eod/run', 'LN_EOD', 'CREATE', 'all-branches'],
  ['GET', '/accounts/:id/summary', 'LN_ACCOUNT', 'VIEW', 'account'],
  ['GET', '/accounts/:id/schedule', 'LN_ACCOUNT', 'VIEW', 'account'],
  ['GET', '/accounts/:id/history', 'LN_ACCOUNT', 'VIEW', 'account'],
  ['GET', '/accounts/:id/statement', 'LN_ACCOUNT', 'VIEW', 'account'],
  ['GET', '/accounts/:id/documents', 'LN_DOCUMENT', 'VIEW', 'account'],
  ['POST', '/accounts/:id/documents', 'LN_DOCUMENT', 'CREATE', 'account'],
  ['GET', '/documents/:docId/file', 'LN_DOCUMENT', 'VIEW', 'document'],
  ['GET', '/print-templates/:code', 'LN_ACCOUNT', 'VIEW', 'global'],
  ['GET', '/transactions/pending', 'LN_TRANSACTION', 'VIEW', 'list'],
  ['GET', '/eod/logs', 'LN_EOD', 'VIEW', 'global'],
  ['GET', '/reports/overdue', 'LN_COLLECTION', 'VIEW', 'list'],
  ['GET', '/reports/portfolio', 'LN_REPORT', 'VIEW', 'list'],
  ['GET', '/reports/aging', 'LN_REPORT', 'VIEW', 'list'],
  ['GET', '/reports/npl', 'LN_REPORT', 'VIEW', 'list'],
  ['GET', '/reports/provisions', 'LN_REPORT', 'VIEW', 'list'],
  ['GET', '/reports/gl-tieout', 'LN_REPORT', 'VIEW', 'list'],
  ['GET', '/lookups', 'LN_LOOKUP', 'VIEW', 'global'],
  ['GET', '/udes', 'LN_UDE', 'VIEW', 'global'],
  ['GET', '/components', 'LN_COMPONENT', 'VIEW', 'global'],
  ['GET', '/provision-rules', 'LN_PROVISION', 'VIEW', 'global'],
  ['PUT', '/provision-rules/:id', 'LN_PROVISION', 'EDIT', 'global'],
  ['GET', '/status-rules', 'LN_STATUS_RULE', 'VIEW', 'global'],
  ['GET', '/accounting-metadata', 'LN_ACCOUNTING_SETUP', 'VIEW', 'global'],
  ['GET', '/sequences', 'LN_SEQUENCE', 'VIEW', 'global'],
  ['GET', '/holiday-calendars', 'LN_HOLIDAY', 'VIEW', 'global'],
  ['GET', '/params/:entity', '{entity}', 'VIEW', 'global'],
  ['POST', '/params/:entity', '{entity}', 'CREATE', 'global'],
  ['POST', '/params/:entity/bulk-authorize', '{entity}', 'AUTHORIZE', 'global'],
  ['GET', '/params/:entity/:key', '{entity}', 'VIEW', 'global'],
  ['PUT', '/params/:entity/:key', '{entity}', 'EDIT', 'global'],
  ['DELETE', '/params/:entity/:key', '{entity}', 'DELETE', 'global'],
  ['POST', '/params/:entity/:key/authorize', '{entity}', 'AUTHORIZE', 'global'],
  ['POST', '/params/:entity/:key/reject', '{entity}', 'AUTHORIZE', 'global'],
  ['GET', '/pending', null, null, 'global'],
  ['GET', '/changes', 'LN_AUDIT_LOG', 'VIEW', 'global'],
  ['POST', '/changes/:id/authorize', '{change}', 'AUTHORIZE', 'global'],
  ['POST', '/changes/:id/reject', '{change}', 'AUTHORIZE', 'global'],
  ['GET', '/audit-log', 'LN_AUDIT_LOG', 'VIEW', 'list']
];

// Routes that need a token but no grant, and why that is acceptable
const TOKEN_ONLY = {
  'GET /status': 'banner state for every loan screen: tax confirmation status only, no parameter details',
  'GET /pending': 'unauthorized records, filtered in the controller by the caller\'s own VIEW grants'
};

// POST routes allowed to use VIEW because they compute and write nothing (the test proves it)
const READ_ONLY_POSTS = ['POST /products/:id/simulate', 'POST /accounts/:id/preview/:kind'];

// POST /accounts/:id/preview/:kind, when :kind is one of the 12 transaction kinds, is the read-only
// pre-submit journal for a write transaction. It writes nothing, but it would reveal the computed
// journal of a transaction the caller may not be allowed to make, so the controller requires this
// permission in addition to the route's LN_ACCOUNT VIEW. The four simulation kinds do not.
const PREVIEW_WRITE_KIND_EXTRA = { pathSuffix: '/preview/:kind', function: 'LN_TRANSACTION', action: 'CREATE' };

/**
 * Proposed groups, copied from docs/loan/phase6-uat.md section 1. A change there needs a change here.
 * '*params' means every parameter function (all five actions applicable) that has no row of its own here.
 */
const GROUPS = {
  LOAN_CASHIER: {
    LN_ACCOUNT: ['VIEW'],
    LN_TRANSACTION: ['VIEW', 'CREATE'],
    LN_DOCUMENT: ['VIEW'],
    LN_COLLECTION: ['VIEW'],
    LN_EXCHANGE_RATE: ['VIEW']
  },
  LOAN_MANAGER: {
    LN_ACCOUNT: ['VIEW', 'CREATE'],
    LN_TRANSACTION: ['VIEW', 'CREATE'],
    LN_APPLICATION: ['VIEW', 'CREATE', 'EDIT'],
    LN_DOCUMENT: ['VIEW', 'CREATE'],
    LN_COLLECTION: ['VIEW'],
    LN_REPORT: ['VIEW'],
    LN_EOD: ['VIEW', 'CREATE'],
    LN_EXCHANGE_RATE: ['VIEW', 'CREATE'],
    LN_AUDIT_LOG: ['VIEW'],
    '*params': ['VIEW', 'CREATE', 'EDIT']
  },
  LOAN_CHECKER: {
    LN_ACCOUNT: ['VIEW'],
    LN_TRANSACTION: ['VIEW', 'AUTHORIZE'],
    LN_APPLICATION: ['VIEW', 'AUTHORIZE'],
    LN_DOCUMENT: ['VIEW'],
    LN_COLLECTION: ['VIEW'],
    LN_REPORT: ['VIEW'],
    LN_EOD: ['VIEW'],
    LN_EXCHANGE_RATE: ['VIEW', 'AUTHORIZE'],
    LN_AUDIT_LOG: ['VIEW'],
    '*params': ['VIEW', 'AUTHORIZE']
  },
  // View-only accountant: reports, VAT report, GL tie-out (all under LN_REPORT/LN_VAT_REPORT) and the
  // tax profile (VIEW only). Tax-profile changes, the checklist and accounting setup stay SUPER_ADMIN only.
  LOAN_ACCOUNTANT: {
    LN_ACCOUNT: ['VIEW'],
    LN_COLLECTION: ['VIEW'],
    LN_REPORT: ['VIEW'],
    LN_VAT_REPORT: ['VIEW'],
    LN_TAX_PROFILE: ['VIEW'],
    LN_AUDIT_LOG: ['VIEW']
  }
};

module.exports = { ROUTES, TOKEN_ONLY, READ_ONLY_POSTS, PREVIEW_WRITE_KIND_EXTRA, GROUPS };
