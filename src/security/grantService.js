/**
 * Idempotent helpers for module seeds: register functions and grant them to user groups.
 * Groups are always looked up by userGroup.code, never by id.
 */
const registerFunctions = async (db, moduleCode, defs) => {
  for (const d of defs) {
    const values = {
      functionCode: d.functionCode,
      moduleCode,
      name: d.name,
      llname: d.llname || null,
      applicableActions: d.actions.join(','),
      isActive: true
    };
    const [row, created] = await db.secFunction.findOrCreate({ where: { functionCode: d.functionCode }, defaults: values });
    if (!created) await row.update(values);
  }
};

// Every change to sec_group_grant goes through here so it is written together with its audit row.
// Returns false when the grant was already in the requested state (nothing changed, nothing logged).
const applyGrant = async (db, { group, functionCode, actionCode, granted, userId = null, source = 'API', ipAddress = null }) => {
  const where = { userGroupId: group.id, functionCode, actionCode };
  return db.sequelize.transaction(async (transaction) => {
    const existing = await db.secGroupGrant.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    if (Boolean(existing) === granted) return false;
    if (granted) await db.secGroupGrant.create({ ...where, grantedBy: userId }, { transaction });
    else await existing.destroy({ transaction });
    await db.secAuditLog.create({
      actionType: granted ? 'GRANT' : 'REVOKE',
      userId,
      userGroupId: group.id,
      groupCode: group.code,
      functionCode,
      actionCode,
      beforeValue: JSON.stringify(existing ? { granted: true, grantedBy: existing.grantedBy, grantedAt: existing.createdAt } : { granted: false }),
      afterValue: JSON.stringify({ granted }),
      source,
      ipAddress
    }, { transaction });
    return true;
  });
};

const grantToGroupCodes = async (db, groupCodes, functionCodes) => {
  const summary = [];
  for (const groupCode of groupCodes) {
    const group = await db.group.findOne({ where: { code: groupCode } });
    if (!group) {
      console.warn(`[security] user group ${groupCode} not found; grants skipped`);
      continue;
    }
    let granted = 0;
    for (const functionCode of functionCodes) {
      const fn = await db.secFunction.findByPk(functionCode);
      if (!fn) continue;
      for (const actionCode of fn.applicableActions.split(',')) {
        if (await applyGrant(db, { group, functionCode, actionCode, granted: true, source: 'SEED' })) granted++;
      }
    }
    summary.push(`${groupCode}: +${granted}`);
  }
  return summary;
};

// The security module's own function: managing the grant matrix (SUPER_ADMIN only by default)
const ensureSecurityFunctions = async (db) => {
  await registerFunctions(db, 'SEC', [
    { functionCode: 'SEC_GRANT', name: 'User group access rights', llname: 'ສິດການເຂົ້າເຖິງຂອງກຸ່ມຜູ້ໃຊ້', actions: ['VIEW', 'EDIT'] }
  ]);
  return grantToGroupCodes(db, ['SUPER_ADMIN'], ['SEC_GRANT']);
};

module.exports = { registerFunctions, applyGrant, grantToGroupCodes, ensureSecurityFunctions };
