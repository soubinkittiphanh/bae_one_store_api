const transactionService = require('../posting/transactionService');
const eodService = require('../eod/eodService');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');
const { testFailAt } = require('../posting/guards');

// Loan transactions and EOD (Phase 4). Posting is refused while SPF LOAN_POSTING_ENABLED is not 'true'.
const withStatus = r => respond(r.body, r.body && r.body.postingStatus === 'PENDING_AUTH' ? 'Pending authorization by a second user' : 'Posted', r.status);

const transactionController = {
  list: handle(req => transactionService.list(req.params.id)),
  create: handle(async req => withStatus(await transactionService.create(req.params.id, req.body || {}, ctxOf(req), req.get('Idempotency-Key'), testFailAt(req)))),
  authorize: handle(async req => withStatus(await transactionService.authorize(req.params.txId, ctxOf(req), testFailAt(req)))),
  reject: handle(async req => withStatus(await transactionService.reject(req.params.txId, ctxOf(req), (req.body || {}).remarks))),
  runEod: handle(async req => respond(await eodService.run(ctxOf(req), { failAt: testFailAt(req) }), 'EOD completed')),
  eodStatus: handle(() => eodService.status())
};

module.exports = transactionController;
