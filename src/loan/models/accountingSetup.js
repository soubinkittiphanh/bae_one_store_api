module.exports = (sequelize, DataTypes) => {
  const lnAccountingRole = sequelize.define('lnAccountingRole', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    roleCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    expectedType: { type: DataTypes.STRING(30), allowNull: false },
    resolverType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'MAPPING_TABLE' },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_accounting_role', timestamps: true });

  const lnAmountTag = sequelize.define('lnAmountTag', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tagCode: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false }
  }, { freezeTableName: true, tableName: 'ln_amount_tag', timestamps: true });

  const lnEventMaster = sequelize.define('lnEventMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_event_master', timestamps: true });

  const lnAccountingEntryRule = sequelize.define('lnAccountingEntryRule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    categoryId: { type: DataTypes.INTEGER, allowNull: true },
    eventCode: { type: DataTypes.STRING(30), allowNull: false },
    amountTag: { type: DataTypes.STRING(50), allowNull: false },
    drCr: { type: DataTypes.STRING(10), allowNull: false },
    roleCode: { type: DataTypes.STRING(50), allowNull: false },
    qualifierSource: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CURRENT' },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_accounting_entry_rule', timestamps: true });

  const lnRoleGlMapping = sequelize.define('lnRoleGlMapping', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    categoryId: { type: DataTypes.INTEGER, allowNull: true },
    branchId: { type: DataTypes.INTEGER, allowNull: true },
    currencyId: { type: DataTypes.INTEGER, allowNull: true },
    statusQualifier: { type: DataTypes.STRING(30), allowNull: true },
    roleCode: { type: DataTypes.STRING(50), allowNull: false },
    chartAccountId: { type: DataTypes.INTEGER, allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    isSeedDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' },
    makerId: { type: DataTypes.INTEGER, allowNull: true },
    checkerId: { type: DataTypes.INTEGER, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_role_gl_mapping', timestamps: true });

  const lnGlBatch = sequelize.define('lnGlBatch', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batchNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    businessDate: { type: DataTypes.DATEONLY, allowNull: false },
    batchType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'EOD_ACCRUAL' },
    totalDebit: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    totalCredit: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    currencyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    branchId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'POSTED' }
  }, { freezeTableName: true, tableName: 'ln_gl_batch', timestamps: true });

  return {
    lnAccountingRole,
    lnAmountTag,
    lnEventMaster,
    lnAccountingEntryRule,
    lnRoleGlMapping,
    lnGlBatch
  };
};
