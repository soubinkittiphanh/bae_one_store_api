/**
 * Every route of src/loan/router.js with the permission a security reviewer has accepted (T4).
 * The test fails on any difference, so a new route or a changed permission needs a change here too,
 * and that change is what a reviewer looks at. Paths are relative to /api/loan.
 *
 * [method, path, function, action]
 *   function '{entity}'  the entity's own function from paramRegistry
 *   function '{change}'  the function of the entity the pending change belongs to
 *   function null        token only: must also be listed in TOKEN_ONLY with the reason
 */
const ROUTES = [
  ['GET', '/status', null, null],
  ['GET', '/checklist', 'LN_CHECKLIST', 'VIEW'],
  ['POST', '/checklist/:itemKey/confirm', 'LN_CHECKLIST', 'AUTHORIZE'],
  ['GET', '/tax-profile', 'LN_TAX_PROFILE', 'VIEW'],
  ['PUT', '/tax-profile', 'LN_TAX_PROFILE', 'EDIT'],
  ['POST', '/tax-profile/confirm', 'LN_TAX_PROFILE', 'AUTHORIZE'],
  ['PUT', '/components/:id/tax', 'LN_COMPONENT', 'EDIT'],
  ['GET', '/reports/vat', 'LN_VAT_REPORT', 'VIEW'],
  ['GET', '/products', 'LN_PRODUCT', 'VIEW'],
  ['GET', '/products/:id', 'LN_PRODUCT', 'VIEW'],
  ['POST', '/products', 'LN_PRODUCT', 'CREATE'],
  ['PUT', '/products/:id', 'LN_PRODUCT', 'EDIT'],
  ['POST', '/products/:id/clone', 'LN_PRODUCT', 'CREATE'],
  ['GET', '/products/:id/accounting-check', 'LN_ENTRY_RULE', 'VIEW'],
  ['POST', '/products/:id/simulate', 'LN_PRODUCT', 'VIEW'],
  ['GET', '/applications', 'LN_APPLICATION', 'VIEW'],
  ['POST', '/applications', 'LN_APPLICATION', 'CREATE'],
  ['GET', '/applications/:id', 'LN_APPLICATION', 'VIEW'],
  ['PUT', '/applications/:id', 'LN_APPLICATION', 'EDIT'],
  ['POST', '/applications/:id/submit', 'LN_APPLICATION', 'EDIT'],
  ['POST', '/applications/:id/approve', 'LN_APPLICATION', 'AUTHORIZE'],
  ['POST', '/applications/:id/reject', 'LN_APPLICATION', 'AUTHORIZE'],
  ['POST', '/applications/:id/book', 'LN_ACCOUNT', 'CREATE'],
  ['GET', '/accounts', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id', 'LN_ACCOUNT', 'VIEW'],
  ['POST', '/accounts/:id/preview/:kind', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id/transactions', 'LN_TRANSACTION', 'VIEW'],
  ['POST', '/accounts/:id/transactions', 'LN_TRANSACTION', 'CREATE'],
  ['POST', '/transactions/:txId/authorize', 'LN_TRANSACTION', 'AUTHORIZE'],
  ['POST', '/transactions/:txId/reject', 'LN_TRANSACTION', 'AUTHORIZE'],
  ['GET', '/eod/status', 'LN_EOD', 'VIEW'],
  ['GET', '/exchange-rates/effective', 'LN_EXCHANGE_RATE', 'VIEW'],
  ['POST', '/exchange-rates/copy-pos', 'LN_EXCHANGE_RATE', 'CREATE'],
  ['GET', '/sales/:saleHeaderId/financing-proposal', 'LN_APPLICATION', 'VIEW'],
  ['POST', '/eod/run', 'LN_EOD', 'CREATE'],
  ['GET', '/accounts/:id/summary', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id/schedule', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id/history', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id/statement', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/accounts/:id/documents', 'LN_DOCUMENT', 'VIEW'],
  ['POST', '/accounts/:id/documents', 'LN_DOCUMENT', 'CREATE'],
  ['GET', '/documents/:docId/file', 'LN_DOCUMENT', 'VIEW'],
  ['GET', '/print-templates/:code', 'LN_ACCOUNT', 'VIEW'],
  ['GET', '/transactions/pending', 'LN_TRANSACTION', 'VIEW'],
  ['GET', '/eod/logs', 'LN_EOD', 'VIEW'],
  ['GET', '/reports/overdue', 'LN_COLLECTION', 'VIEW'],
  ['GET', '/reports/portfolio', 'LN_REPORT', 'VIEW'],
  ['GET', '/reports/aging', 'LN_REPORT', 'VIEW'],
  ['GET', '/reports/npl', 'LN_REPORT', 'VIEW'],
  ['GET', '/reports/provisions', 'LN_REPORT', 'VIEW'],
  ['GET', '/reports/gl-tieout', 'LN_REPORT', 'VIEW'],
  ['GET', '/lookups', 'LN_LOOKUP', 'VIEW'],
  ['GET', '/udes', 'LN_UDE', 'VIEW'],
  ['GET', '/components', 'LN_COMPONENT', 'VIEW'],
  ['GET', '/provision-rules', 'LN_PROVISION', 'VIEW'],
  ['PUT', '/provision-rules/:id', 'LN_PROVISION', 'EDIT'],
  ['GET', '/status-rules', 'LN_STATUS_RULE', 'VIEW'],
  ['GET', '/accounting-metadata', 'LN_ACCOUNTING_SETUP', 'VIEW'],
  ['GET', '/sequences', 'LN_SEQUENCE', 'VIEW'],
  ['GET', '/holiday-calendars', 'LN_HOLIDAY', 'VIEW'],
  ['GET', '/params/:entity', '{entity}', 'VIEW'],
  ['POST', '/params/:entity', '{entity}', 'CREATE'],
  ['POST', '/params/:entity/bulk-authorize', '{entity}', 'AUTHORIZE'],
  ['GET', '/params/:entity/:key', '{entity}', 'VIEW'],
  ['PUT', '/params/:entity/:key', '{entity}', 'EDIT'],
  ['DELETE', '/params/:entity/:key', '{entity}', 'DELETE'],
  ['POST', '/params/:entity/:key/authorize', '{entity}', 'AUTHORIZE'],
  ['POST', '/params/:entity/:key/reject', '{entity}', 'AUTHORIZE'],
  ['GET', '/pending', null, null],
  ['GET', '/changes', 'LN_AUDIT_LOG', 'VIEW'],
  ['POST', '/changes/:id/authorize', '{change}', 'AUTHORIZE'],
  ['POST', '/changes/:id/reject', '{change}', 'AUTHORIZE'],
  ['GET', '/audit-log', 'LN_AUDIT_LOG', 'VIEW']
];

// Routes that need a token but no grant, and why that is acceptable
const TOKEN_ONLY = {
  'GET /status': 'banner state for every loan screen: tax confirmation status only, no parameter details',
  'GET /pending': 'unauthorized records, filtered in the controller by the caller\'s own VIEW grants'
};

// POST routes allowed to use VIEW because they compute and write nothing (the test proves it)
const READ_ONLY_POSTS = ['POST /products/:id/simulate', 'POST /accounts/:id/preview/:kind'];

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

module.exports = { ROUTES, TOKEN_ONLY, READ_ONLY_POSTS, GROUPS };
