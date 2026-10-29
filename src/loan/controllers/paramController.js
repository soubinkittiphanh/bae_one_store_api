const paramService = require('../services/paramService');
const db = require('../../models');
const { handle, respond } = require('../errors');

const ctxOf = (req) => ({ userId: req.user ? req.user.id : null, ip: req.ip });

const paramController = {
  list: handle(req => paramService.list(req.params.entity, req.query)),
  get: handle(req => paramService.get(req.params.entity, req.params.key)),
  create: handle(async req => respond(await paramService.create(req.params.entity, req.body, ctxOf(req)), 'Created; pending authorization', 201)),
  update: handle(req => paramService.update(req.params.entity, req.params.key, req.body, ctxOf(req))),
  remove: handle(req => paramService.remove(req.params.entity, req.params.key, ctxOf(req))),
  authorize: handle(req => paramService.authorize(req.params.entity, req.params.key, ctxOf(req))),
  reject: handle(req => paramService.reject(req.params.entity, req.params.key, ctxOf(req), req.body && req.body.remarks)),

  listChanges: handle(req => paramService.listChanges(req.query)),
  listPending: handle(req => paramService.listPendingRecords(req.user.id)),
  authorizeChange: handle(req => paramService.authorizeChange(req.params.id, ctxOf(req))),
  rejectChange: handle(req => paramService.rejectChange(req.params.id, ctxOf(req), req.body && req.body.remarks)),

  auditLog: handle(async (req) => {
    const where = {};
    if (req.query.entityName) where.entityName = req.query.entityName;
    if (req.query.entityKey) where.entityKey = req.query.entityKey;
    return db.lnAuditLog.findAll({ where, order: [['id', 'DESC']], limit: Math.min(parseInt(req.query.limit, 10) || 200, 1000) });
  })
};

module.exports = { paramController, ctxOf };
