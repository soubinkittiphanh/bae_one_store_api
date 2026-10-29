const checklistService = require('../services/checklistService');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');

const checklistController = {
  getChecklist: handle(() => checklistService.getChecklist()),
  confirmItem: handle(async req => respond(await checklistService.confirmItem(req.params.itemKey, ctxOf(req)), `Checklist item ${req.params.itemKey} confirmed`))
};

module.exports = checklistController;
