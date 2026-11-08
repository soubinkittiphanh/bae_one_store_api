/**
 * Phase 6 branch scope (plan D5/D6, R2). A branch is a POS location (location.id).
 *
 *  - A user's branches are the distinct terminal.locationId of their UserTerminals rows.
 *  - LN_ALL_BRANCHES (VIEW) widens the scope to every branch. It is a scope flag only: it opens no route by
 *    itself, because every route still runs requirePermission first.
 *  - scoped(kind) is the router middleware that runs right after the permission guard. Its `scope` tag is
 *    what test/loan/routeManifest.js checks, so every route has to declare one:
 *      account      /accounts/:id/...        the account's branchId
 *      transaction  /transactions/:txId/...  the transaction's branchId
 *      application  /applications/:id/...    the application's branchId
 *      document     /documents/:docId/...    the branch of the document's account
 *      sale         a POS sale (params.saleHeaderId, or body.vehicleSaleHeaderId on create): sale.locationId
 *      list         attaches req.branchScope; the service filters on it
 *      all-branches needs LN_ALL_BRANCHES (company-wide actions such as the EOD run)
 *      global       shared master data and company state; no branch check
 *  - Out of scope on a by-id route answers 404 with the same message as a missing record, so it does not
 *    reveal that the record exists. A sale chosen on create answers 403 (R1).
 */
const db = require('../../models');
const { hasPermission } = require('../../security/middleware');
const logger = require('../../api/logger');

const ALL_BRANCHES = 'LN_ALL_BRANCHES';
const KINDS = ['account', 'transaction', 'application', 'document', 'sale', 'list', 'all-branches', 'global'];

const scopeOf = async (userId) => {
  if (await hasPermission(userId, ALL_BRANCHES, 'VIEW')) return { all: true, branches: [] };
  const rows = await db.sequelize.query(
    'SELECT DISTINCT t.locationId AS l FROM UserTerminals ut JOIN terminal t ON t.id = ut.terminalId WHERE ut.userId = ? AND t.locationId IS NOT NULL ORDER BY 1',
    { replacements: [userId], type: db.Sequelize.QueryTypes.SELECT }
  );
  return { all: false, branches: rows.map(r => Number(r.l)) };
};

const inScope = (scope, branchId) => scope.all || (branchId !== null && branchId !== undefined && scope.branches.includes(Number(branchId)));

// Sequelize `where` fragment for list queries (an empty scope matches nothing)
const whereScope = (scope, column = 'branchId') => (!scope || scope.all ? {} : { [column]: scope.branches });

// Each loader returns { found, branchId } for the record a route addresses
const loaders = {
  account: async (req) => {
    const a = await db.lnAccount.findByPk(req.params.id, { attributes: ['id', 'branchId'] });
    return { found: Boolean(a), branchId: a && a.branchId, notFound: `Account ${req.params.id} not found` };
  },
  transaction: async (req) => {
    const t = await db.lnTransaction.findByPk(req.params.txId, { attributes: ['id', 'branchId'] });
    return { found: Boolean(t), branchId: t && t.branchId, notFound: `Transaction ${req.params.txId} not found` };
  },
  application: async (req) => {
    const a = await db.lnApplication.findByPk(req.params.id, { attributes: ['id', 'branchId'] });
    return { found: Boolean(a), branchId: a && a.branchId, notFound: `Application ${req.params.id} not found` };
  },
  document: async (req) => {
    const d = await db.lnAccountDocument.findByPk(req.params.docId, { attributes: ['id', 'loanAccountId'] });
    const a = d && await db.lnAccount.findByPk(d.loanAccountId, { attributes: ['id', 'branchId'] });
    return { found: Boolean(a), branchId: a && a.branchId, notFound: `Document ${req.params.docId} not found` };
  }
};

const deny = (res, code, message) => res.status(code).json({ success: false, status: false, message });

const scoped = (kind) => {
  if (!KINDS.includes(kind)) throw new Error(`Unknown branch scope kind "${kind}"`);
  const middleware = async (req, res, next) => {
    if (kind === 'global') return next();
    try {
      const scope = await scopeOf(req.user.id);
      req.branchScope = scope;
      if (kind === 'list') return next();
      if (kind === 'all-branches') return scope.all ? next() : deny(res, 403, `Forbidden: this action covers every branch and needs ${ALL_BRANCHES}`);
      if (kind === 'sale') {
        const fromParams = req.params.saleHeaderId !== undefined;
        const saleId = fromParams ? req.params.saleHeaderId : req.body && req.body.vehicleSaleHeaderId;
        if (saleId === undefined || saleId === null || saleId === '') return next(); // no sale: the service decides (Stage 2)
        const sale = await db.saleHeader.findByPk(saleId, { attributes: ['id', 'locationId'] });
        if (!sale) return next(); // the service answers for a missing sale as it does today
        if (inScope(scope, sale.locationId)) return next();
        return fromParams ? deny(res, 404, `Sale ${saleId} not found`) : deny(res, 403, `Forbidden: sale ${saleId} belongs to a branch outside yours`);
      }
      const rec = await loaders[kind](req);
      if (!rec.found) return next(); // let the controller give its usual 404
      return inScope(scope, rec.branchId) ? next() : deny(res, 404, rec.notFound);
    } catch (err) {
      logger.error(`branch scope (${kind}) failed: ${err.message}`);
      return deny(res, 500, 'Branch scope check failed');
    }
  };
  middleware.scope = kind;
  return middleware;
};

module.exports = { ALL_BRANCHES, KINDS, scopeOf, inScope, whereScope, scoped };
