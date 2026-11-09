const applicationService = require('../services/applicationService');
const accountService = require('../services/accountService');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');

// Applications follow single-level maker-checker; booking creates the account (no GL posting).
const applicationController = {
  list: handle(req => applicationService.list(req.query, req.branchScope)),
  get: handle(req => applicationService.get(req.params.id)),
  create: handle(async req => respond(await applicationService.create(req.body, ctxOf(req)), 'Application created (DRAFT)', 201)),
  update: handle(async req => respond(await applicationService.update(req.params.id, req.body, ctxOf(req)), 'Application updated')),
  submit: handle(async req => respond(await applicationService.submit(req.params.id, ctxOf(req)), 'Application submitted')),
  approve: handle(async req => respond(await applicationService.approve(req.params.id, ctxOf(req)), 'Application approved')),
  reject: handle(async req => respond(await applicationService.reject(req.params.id, ctxOf(req), (req.body || {}).remarks), 'Application rejected')),
  book: handle(async req => respond(await accountService.book(req.params.id, ctxOf(req)), 'Account booked (no GL posting)', 201))
};

module.exports = applicationController;
