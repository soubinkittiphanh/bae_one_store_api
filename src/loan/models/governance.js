const { makerChecker } = require('./common');

module.exports = (sequelize, DataTypes) => {
  const lnApprovalMatrix = sequelize.define('lnApprovalMatrix', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'APPLICATION' },
    currencyId: { type: DataTypes.INTEGER, allowNull: true, comment: 'currency.id of minAmount/maxAmount; NULL = base' },
    minAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 1000000000.0000 },
    requiredLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    approverRoleId: { type: DataTypes.INTEGER, allowNull: false },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_approval_matrix', timestamps: true });

  const lnApprovalLog = sequelize.define('lnApprovalLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityType: { type: DataTypes.STRING(30), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },
    approvalLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    approverUserId: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(30), allowNull: false },
    comments: { type: DataTypes.TEXT, allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { freezeTableName: true, tableName: 'ln_approval_log', timestamps: false,
    indexes: [
      { name: 'idx_appr_entity', fields: ['entityType', 'entityId'] }
    ] });

  const lnDocumentChecklist = sequelize.define('lnDocumentChecklist', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    documentTypeCode: { type: DataTypes.STRING(50), allowNull: false },
    documentName: { type: DataTypes.STRING(100), allowNull: false },
    isMandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_document_checklist', timestamps: true });

  const lnApplicationDocument = sequelize.define('lnApplicationDocument', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    applicationId: { type: DataTypes.INTEGER, allowNull: false },
    documentTypeCode: { type: DataTypes.STRING(50), allowNull: false },
    fileUrl: { type: DataTypes.STRING(255), allowNull: false },
    fileName: { type: DataTypes.STRING(150), allowNull: false },
    isVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    verifiedBy: { type: DataTypes.INTEGER, allowNull: true },
    verifiedAt: { type: DataTypes.DATE, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_application_document', timestamps: true });

  const lnAuditLog = sequelize.define('lnAuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityName: { type: DataTypes.STRING(50), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: true },
    entityKey: { type: DataTypes.STRING(100), allowNull: true },
    actionType: { type: DataTypes.STRING(30), allowNull: false },
    oldValuesJson: { type: DataTypes.TEXT('long'), allowNull: true },
    newValuesJson: { type: DataTypes.TEXT('long'), allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    ipAddress: { type: DataTypes.STRING(50), allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { freezeTableName: true, tableName: 'ln_audit_log', timestamps: false,
    indexes: [
      { name: 'idx_audit_entity', fields: ['entityName', 'entityId'] },
      { name: 'idx_audit_entity_key', fields: ['entityName', 'entityKey'] }
    ] });

  // Pending edit to an AUTHORIZED parameter row; applied only when a checker authorizes it
  const lnParamChange = sequelize.define('lnParamChange', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityName: { type: DataTypes.STRING(50), allowNull: false },
    entityKey: { type: DataTypes.STRING(100), allowNull: true, comment: 'PK of the target row; NULL for CREATE' },
    action: { type: DataTypes.STRING(10), allowNull: false, comment: 'CREATE / UPDATE / DELETE' },
    payloadJson: { type: DataTypes.TEXT('long'), allowNull: true },
    baseOptLock: { type: DataTypes.INTEGER, allowNull: true, comment: 'optLockVersion of the target row when the change was made' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDING', comment: 'PENDING / AUTHORIZED / REJECTED' },
    makerId: { type: DataTypes.INTEGER, allowNull: false },
    checkerId: { type: DataTypes.INTEGER, allowNull: true },
    authorizedAt: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.STRING(255), allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_param_change', timestamps: true,
    indexes: [
      { name: 'idx_param_change_entity', fields: ['entityName', 'entityKey', 'status'] },
      { name: 'idx_param_change_status', fields: ['status'] }
    ] });

  // Go-live checklist confirmation, one row per item
  const lnChecklistConfirmation = sequelize.define('lnChecklistConfirmation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    itemKey: { type: DataTypes.STRING(50), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UNCONFIRMED', comment: 'UNCONFIRMED / CONFIRMED / HELD' },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    snapshotJson: { type: DataTypes.TEXT('long'), allowNull: true, comment: 'Parameter values that were confirmed' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_checklist_confirmation', timestamps: true,
    indexes: [
      { name: 'uk_checklist_item', unique: true, fields: ['itemKey'] }
    ] });

  return {
    lnApprovalMatrix,
    lnApprovalLog,
    lnDocumentChecklist,
    lnApplicationDocument,
    lnAuditLog,
    lnParamChange,
    lnChecklistConfirmation
  };
};
