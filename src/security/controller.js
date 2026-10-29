/**
 * Generic RBAC endpoints: the caller's own permissions (for UIs to hide actions; the server
 * still enforces every call) and the group-by-function grant matrix (SEC_GRANT).
 */
const db = require('../models');
const logger = require('../api/logger');
const { applyGrant } = require('./grantService');

const fail = (res, status, message) => res.status(status).json({ success: false, status: false, message });
const ok = (res, data, message) => res.status(200).json({ success: true, status: true, message, data });

const loadUser = (id) => db.user.findByPk(id, { attributes: ['id', 'groupId', 'isActive'] });

const securityController = {
  // { groupId, groupCode, permissions: { FUNCTION_CODE: ['VIEW', ...] } } for the current user
  async myPermissions(req, res) {
    try {
      const user = await loadUser(req.user.id);
      if (!user || user.isActive === false || !user.groupId) return ok(res, { groupId: null, groupCode: null, permissions: {} });
      const [group, grants, functions] = await Promise.all([
        db.group.findByPk(user.groupId, { attributes: ['id', 'code'] }),
        db.secGroupGrant.findAll({ where: { userGroupId: user.groupId }, attributes: ['functionCode', 'actionCode'] }),
        db.secFunction.findAll({ where: { isActive: true }, attributes: ['functionCode', 'applicableActions'] })
      ]);
      const applicable = Object.fromEntries(functions.map(f => [f.functionCode, f.applicableActions.split(',')]));
      const permissions = {};
      for (const g of grants) {
        if (!applicable[g.functionCode] || !applicable[g.functionCode].includes(g.actionCode)) continue;
        (permissions[g.functionCode] = permissions[g.functionCode] || []).push(g.actionCode);
      }
      return ok(res, { groupId: user.groupId, groupCode: group ? group.code : null, permissions });
    } catch (err) {
      logger.error(`[security] myPermissions failed: ${err.message}`);
      return fail(res, 500, 'Could not load permissions');
    }
  },

  async matrix(req, res) {
    try {
      const where = req.query.moduleCode ? { moduleCode: req.query.moduleCode } : {};
      const [actions, functions, groups, grants] = await Promise.all([
        db.secAction.findAll({ where: { isActive: true }, order: [['sortOrder', 'ASC']] }),
        db.secFunction.findAll({ where: { ...where, isActive: true }, order: [['moduleCode', 'ASC'], ['functionCode', 'ASC']] }),
        db.group.findAll({ attributes: ['id', 'name', 'code', 'isActive'], order: [['id', 'ASC']] }),
        db.secGroupGrant.findAll({ attributes: ['userGroupId', 'functionCode', 'actionCode'] })
      ]);
      return ok(res, { actions, functions, groups, grants });
    } catch (err) {
      logger.error(`[security] matrix failed: ${err.message}`);
      return fail(res, 500, 'Could not load the grant matrix');
    }
  },

  // body: { userGroupId, functionCode, actionCode, granted: true|false }
  async setGrant(req, res) {
    try {
      const { userGroupId, functionCode, actionCode, granted } = req.body || {};
      if (!/^\d+$/.test(String(userGroupId)) || typeof functionCode !== 'string' || typeof actionCode !== 'string' || typeof granted !== 'boolean') {
        return fail(res, 400, 'userGroupId, functionCode, actionCode and granted (boolean) are required');
      }
      const [group, fn] = await Promise.all([db.group.findByPk(userGroupId), db.secFunction.findByPk(functionCode)]);
      if (!group) return fail(res, 400, `User group ${userGroupId} does not exist`);
      if (!fn || !fn.isActive) return fail(res, 400, `Function ${functionCode} does not exist or is inactive`);
      if (!fn.applicableActions.split(',').includes(actionCode)) return fail(res, 400, `${actionCode} is not applicable to ${functionCode}`);

      const me = await loadUser(req.user.id);
      if (!granted && functionCode === 'SEC_GRANT' && actionCode === 'EDIT' && me && Number(me.groupId) === Number(userGroupId)) {
        return fail(res, 409, 'You cannot remove grant-editing rights from your own user group');
      }

      const where = { userGroupId: Number(userGroupId), functionCode, actionCode };
      const changed = await applyGrant(db, { group, functionCode, actionCode, granted, userId: req.user.id, source: 'API', ipAddress: req.ip });
      if (!changed) return ok(res, where, 'No change');
      logger.info(`[security] user ${req.user.id} ${granted ? 'granted' : 'revoked'} ${functionCode}.${actionCode} for group ${group.code}`);
      return ok(res, where, granted ? 'Granted' : 'Revoked');
    } catch (err) {
      logger.error(`[security] setGrant failed: ${err.message}`);
      return fail(res, 500, 'Could not update the grant');
    }
  }
};

module.exports = securityController;
