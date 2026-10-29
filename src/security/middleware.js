/**
 * requirePermission(functionCode, actionCode)
 * Reusable by any module. Use after validateToken. The user's group is read from the
 * database (not the token) and must hold a sec_group_grant row for the function/action.
 * functionCode may be a string or a (possibly async) function (req) => string for generic routes.
 */
const db = require('../models');
const logger = require('../api/logger');

const deny = (res, code, message) => res.status(code).json({ success: false, status: false, message });

const hasPermission = async (userId, functionCode, actionCode) => {
  const user = await db.user.findByPk(userId, { attributes: ['id', 'groupId', 'isActive'] });
  if (!user || user.isActive === false || !user.groupId) return false;

  const fn = await db.secFunction.findOne({ where: { functionCode, isActive: true } });
  if (!fn) return false;
  const applicable = fn.applicableActions.split(',').map(a => a.trim());
  if (!applicable.includes(actionCode)) return false;

  const grant = await db.secGroupGrant.findOne({
    where: { userGroupId: user.groupId, functionCode, actionCode },
    attributes: ['id']
  });
  return Boolean(grant);
};

const requirePermission = (functionCode, actionCode) => async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return deny(res, 401, 'Authentication required');
    const code = typeof functionCode === 'function' ? await functionCode(req) : functionCode;
    if (!code) return deny(res, 404, 'Unknown function');
    if (await hasPermission(req.user.id, code, actionCode)) return next();
    return deny(res, 403, `Forbidden: ${actionCode} on ${code} is not granted to your user group`);
  } catch (err) {
    logger.error(`requirePermission failed: ${err.message}`);
    return deny(res, 500, 'Permission check failed');
  }
};

module.exports = { requirePermission, hasPermission };
