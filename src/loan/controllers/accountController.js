const accountService = require('../services/accountService');
const simulationService = require('../services/simulationService');
const transactionService = require('../posting/transactionService');
const { ctxOf } = require('./paramController');
const { hasPermission } = require('../../security/middleware');
const { handle, LoanError } = require('../errors');

// Read-only: account details, engine previews and the product simulation. Nothing is posted.
// preview/:kind serves two kinds of preview, both read-only:
//   - the four simulation kinds (due-date, payment, prepayment, status): LN_ACCOUNT VIEW (the route grant);
//   - the 12 transaction kinds (DISB, FEE_COLLECT, ...): the pre-submit journal, which additionally
//     requires LN_TRANSACTION CREATE enforced here, because the route grants only LN_ACCOUNT VIEW and a
//     viewer who cannot create a transaction must not see its dry-run journal. See routeManifest.js.
const accountController = {
  list: handle(() => accountService.list()),
  get: handle(req => accountService.get(req.params.id)),
  preview: handle(async req => {
    const kind = req.params.kind;
    if (transactionService.KINDS[kind]) {
      if (!(await hasPermission(req.user && req.user.id, 'LN_TRANSACTION', 'CREATE'))) {
        throw new LoanError(403, 'Permission denied: previewing this transaction needs LN_TRANSACTION CREATE');
      }
      const r = await transactionService.previewKind(req.params.id, { ...(req.body || {}), kind }, ctxOf(req));
      return r.body;
    }
    return accountService.preview(req.params.id, kind, req.body || {});
  }),
  simulate: handle(req => simulationService.simulate(req.params.id, req.body || {}))
};

module.exports = accountController;
