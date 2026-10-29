/**
 * Generic, module-neutral RBAC (FLEXCUBE-style). userGroup acts as the role.
 * Tables are created by 20261029_loan_phase2a_corrections.sql.
 */
module.exports = (sequelize, DataTypes) => {
  const secAction = sequelize.define('secAction', {
    actionCode: { type: DataTypes.STRING(20), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { freezeTableName: true, tableName: 'sec_action', timestamps: true });

  const secFunction = sequelize.define('secFunction', {
    functionCode: { type: DataTypes.STRING(50), primaryKey: true },
    moduleCode: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    llname: { type: DataTypes.STRING(150), allowNull: true },
    applicableActions: { type: DataTypes.STRING(255), allowNull: false, comment: 'Comma-separated sec_action codes' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { freezeTableName: true, tableName: 'sec_function', timestamps: true,
    indexes: [
      { name: 'idx_sec_function_module', fields: ['moduleCode'] }
    ] });

  const secGroupGrant = sequelize.define('secGroupGrant', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userGroupId: { type: DataTypes.INTEGER, allowNull: false, comment: 'userGroup.id (no FK)' },
    functionCode: { type: DataTypes.STRING(50), allowNull: false },
    actionCode: { type: DataTypes.STRING(20), allowNull: false },
    grantedBy: { type: DataTypes.INTEGER, allowNull: true }
  }, { freezeTableName: true, tableName: 'sec_group_grant', timestamps: true,
    indexes: [
      { name: 'uk_sec_group_grant', unique: true, fields: ['userGroupId', 'functionCode', 'actionCode'] },
      { name: 'idx_sec_grant_function', fields: ['functionCode'] }
    ] });

  // One row per change to sec_group_grant; before/after are JSON ({ granted: true|false })
  const secAuditLog = sequelize.define('secAuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityName: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'sec_group_grant' },
    actionType: { type: DataTypes.STRING(20), allowNull: false, comment: 'GRANT | REVOKE' },
    userId: { type: DataTypes.INTEGER, allowNull: true, comment: 'NULL when written by a seed' },
    userGroupId: { type: DataTypes.INTEGER, allowNull: false },
    groupCode: { type: DataTypes.STRING(50), allowNull: true },
    functionCode: { type: DataTypes.STRING(50), allowNull: false },
    actionCode: { type: DataTypes.STRING(20), allowNull: false },
    beforeValue: { type: DataTypes.TEXT, allowNull: true, comment: 'JSON' },
    afterValue: { type: DataTypes.TEXT, allowNull: true, comment: 'JSON' },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'API', comment: 'API | SEED' },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true }
  }, { freezeTableName: true, tableName: 'sec_audit_log', timestamps: true, updatedAt: false,
    indexes: [
      { name: 'idx_sec_audit_group', fields: ['userGroupId', 'functionCode'] },
      { name: 'idx_sec_audit_created', fields: ['createdAt'] }
    ] });

  return { secAction, secFunction, secGroupGrant, secAuditLog };
};
