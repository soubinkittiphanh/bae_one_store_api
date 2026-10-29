const accountService = require('../services/accountService');
const simulationService = require('../services/simulationService');
const { handle } = require('../errors');

// Read-only: account details, engine previews and the product simulation. Nothing is posted.
const accountController = {
  list: handle(() => accountService.list()),
  get: handle(req => accountService.get(req.params.id)),
  preview: handle(req => accountService.preview(req.params.id, req.params.kind, req.body || {})),
  simulate: handle(req => simulationService.simulate(req.params.id, req.body || {}))
};

module.exports = accountController;
