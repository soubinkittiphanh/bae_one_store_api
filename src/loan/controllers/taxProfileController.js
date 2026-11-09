const taxProfileService = require('../services/taxProfileService');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');

const taxProfileController = {
  getTaxProfile: handle(() => taxProfileService.getTaxProfile()),
  getStatus: handle(() => taxProfileService.getStatus()),
  // confirmationStatus in the body is ignored; use POST /tax-profile/confirm
  updateTaxProfile: handle(async req => respond(await taxProfileService.updateTaxProfile(req.body, ctxOf(req)), 'Tax profile updated; confirmation required')),
  confirmTaxProfile: handle(async req => respond(await taxProfileService.confirmTaxProfile(ctxOf(req)), 'Tax profile confirmed')),
  getVatReport: handle(req => taxProfileService.getVatReport(req.query, req.branchScope))
};

module.exports = taxProfileController;
