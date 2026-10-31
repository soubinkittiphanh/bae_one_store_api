const fxRateService = require('../services/fxRateService');
const { proposalFromSale } = require('../posting/fxContext');
const { businessDate } = require('../services/loanContext');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');

// Phase 5: exchange rates for loan postings (the rows themselves are the 'exchange-rate' Parameter Studio entity)
const fxController = {
  effective: handle(req => fxRateService.rateFor(req.query.currencyId, req.query.date)),
  proposal: handle(async req => proposalFromSale({ saleHeaderId: req.params.saleHeaderId, currencyId: req.query.currencyId, date: req.query.date || await businessDate() })),
  copyPosRate: handle(async req => respond(await fxRateService.copyPosRate(req.body || {}, ctxOf(req)), 'POS rate copied; pending authorization', 201))
};

module.exports = fxController;
