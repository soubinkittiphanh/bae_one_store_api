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
        const [, created] = await db.secGroupGrant.findOrCreate({
          where: { userGroupId: group.id, functionCode, actionCode },
          defaults: { userGroupId: group.id, functionCode, actionCode }
        });
        if (created) granted++;
      }
    }
    summary.push(`${groupCode}: +${granted}`);
  }
  return summary;
};

module.exports = { registerFunctions, grantToGroupCodes };
