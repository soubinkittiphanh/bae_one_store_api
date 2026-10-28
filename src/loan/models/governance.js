module.exports = (sequelize, DataTypes) => {
  const lnApprovalMatrix = sequelize.define('lnApprovalMatrix', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'APPLICATION' },
    minAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 1000000000.0000 },
    requiredLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    approverRoleId: { type: DataTypes.INTEGER, allowNull: false },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
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
  }, { freezeTableName: true, tableName: 'ln_approval_log', timestamps: false });

  const lnDocumentChecklist = sequelize.define('lnDocumentChecklist', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    documentTypeCode: { type: DataTypes.STRING(50), allowNull: false },
    documentName: { type: DataTypes.STRING(100), allowNull: false },
    isMandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
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
    entityId: { type: DataTypes.INTEGER, allowNull: false },
    actionType: { type: DataTypes.STRING(30), allowNull: false },
    oldValuesJson: { type: DataTypes.TEXT('long'), allowNull: true },
    newValuesJson: { type: DataTypes.TEXT('long'), allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    ipAddress: { type: DataTypes.STRING(50), allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { freezeTableName: true, tableName: 'ln_audit_log', timestamps: false });

  return {
    lnApprovalMatrix,
    lnApprovalLog,
    lnDocumentChecklist,
    lnApplicationDocument,
    lnAuditLog
  };
};
