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

// Web paths of every active menu line (pages the menu manages) and of those the group reaches.
// dc_web's route guard (middleware/auths.js) blocks a managed path the group does not reach.
const loadWebPaths = async (groupId) => {
  const clean = rows => [...new Set(rows.map(r => String(r.path || '').trim()).filter(p => p && p !== '/' && p !== '/admin'))].sort();
  const all = await db.sequelize.query(
    "SELECT DISTINCT path FROM menuLine WHERE isActive = 1 AND path IS NOT NULL AND path <> ''",
    { type: db.Sequelize.QueryTypes.SELECT }
  );
  const mine = groupId ? await db.sequelize.query(
    `SELECT DISTINCT ml.path AS path
       FROM GroupMenuHeader gmh
       JOIN menuHeader mh ON mh.id = gmh.menuHeaderId AND mh.isActive = 1
       JOIN MenuHeaderLines mhl ON mhl.menuHeaderId = mh.id
       JOIN menuLine ml ON ml.id = mhl.menuLineId AND ml.isActive = 1
      WHERE gmh.userGroupId = ?`,
    { replacements: [groupId], type: db.Sequelize.QueryTypes.SELECT }
  ) : [];
  return { menuPaths: clean(all), webPaths: clean(mine) };
};

// dc_pos screen keys reachable through the group's active menu headers and lines; null if the
// menuLine.mobileKey column does not exist yet (POS migration 20261128_mobile_menu_grants not applied).
const loadMobileKeys = async (groupId) => {
  try {
    const rows = await db.sequelize.query(
      `SELECT DISTINCT ml.mobileKey AS mobileKey
         FROM GroupMenuHeader gmh
         JOIN menuHeader mh ON mh.id = gmh.menuHeaderId AND mh.isActive = 1
         JOIN MenuHeaderLines mhl ON mhl.menuHeaderId = mh.id
         JOIN menuLine ml ON ml.id = mhl.menuLineId AND ml.isActive = 1
        WHERE gmh.userGroupId = ? AND ml.mobileKey IS NOT NULL AND ml.mobileKey <> ''`,
      { replacements: [groupId], type: db.Sequelize.QueryTypes.SELECT }
    );
    const keys = new Set();
    for (const r of rows) String(r.mobileKey).split(',').map(k => k.trim()).filter(Boolean).forEach(k => keys.add(k));
    return [...keys].sort();
  } catch (err) {
    if (/Unknown column/i.test(err.message)) return null;
    throw err;
  }
};

const securityController = {
  // For the current user:
  //   { groupId, groupCode,
  //     permissions: { FUNCTION_CODE: ['VIEW', ...] },   granted actions
  //     functions:   ['FUNCTION_CODE', ...],              every active function (a UI enforces only these)
  //     mobileKeys:  ['inventory.products', ...],        dc_pos screens the group's menu lines open
  //     webPaths:    ['/admin/cafeTable', ...],           dc_web pages the group's menu lines open
  //     menuPaths:   [...] }                              every page some active menu line opens
  // mobileKeys is null for a user without a group (legacy full access) and is left out when the
  // menuLine.mobileKey column is missing, so dc_pos falls back to its older rules.
  async myPermissions(req, res) {
    try {
      const user = await loadUser(req.user.id);
      const functions = await db.secFunction.findAll({ where: { isActive: true }, attributes: ['functionCode', 'applicableActions'] });
      const functionCodes = functions.map(f => f.functionCode);
      if (!user || user.isActive === false || !user.groupId) {
        return ok(res, { groupId: null, groupCode: null, permissions: {}, functions: functionCodes, mobileKeys: null, webPaths: null, menuPaths: [] });
      }
      const [group, grants, mobileKeys, paths] = await Promise.all([
        db.group.findByPk(user.groupId, { attributes: ['id', 'code', 'homePage'] }),
        db.secGroupGrant.findAll({ where: { userGroupId: user.groupId }, attributes: ['functionCode', 'actionCode'] }),
        loadMobileKeys(user.groupId),
        loadWebPaths(user.groupId)
      ]);
      const applicable = Object.fromEntries(functions.map(f => [f.functionCode, f.applicableActions.split(',')]));
      const permissions = {};
      for (const g of grants) {
        if (!applicable[g.functionCode] || !applicable[g.functionCode].includes(g.actionCode)) continue;
        (permissions[g.functionCode] = permissions[g.functionCode] || []).push(g.actionCode);
      }
      const data = {
        groupId: user.groupId,
        groupCode: group ? group.code : null,
        homePage: group ? group.homePage || null : null,
        permissions,
        functions: functionCodes,
        webPaths: paths.webPaths,
        menuPaths: paths.menuPaths
      };
      if (mobileKeys) data.mobileKeys = mobileKeys;
      return ok(res, data);
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
      // The group forms show this right as userGroup.ticketCancel: keep it equal to the grant
      if (functionCode === 'POS_TICKET' && actionCode === 'VOID') {
        await db.group.update({ ticketCancel: granted }, { where: { id: group.id } });
      }
      logger.info(`[security] user ${req.user.id} ${granted ? 'granted' : 'revoked'} ${functionCode}.${actionCode} for group ${group.code}`);
      return ok(res, where, granted ? 'Granted' : 'Revoked');
    } catch (err) {
      logger.error(`[security] setGrant failed: ${err.message}`);
      return fail(res, 500, 'Could not update the grant');
    }
  }
};

module.exports = securityController;
