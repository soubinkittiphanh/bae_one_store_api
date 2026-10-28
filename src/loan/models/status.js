module.exports = (sequelize, DataTypes) => {
  const lnRegulatoryClass = sequelize.define('lnRegulatoryClass', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    classCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    glQualifier: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'NORMAL' },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_regulatory_class', timestamps: true });

  const lnStatusMaster = sequelize.define('lnStatusMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    statusCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    regulatoryClassCode: { type: DataTypes.STRING(30), allowNull: false },
    interestTreatment: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CONTINUE_ACCRUAL' },
    penaltyTreatment: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ACCRUE' },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_status_master', timestamps: true });

  const lnStatusMovementRule = sequelize.define('lnStatusMovementRule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fromStatus: { type: DataTypes.STRING(30), allowNull: false },
    toStatus: { type: DataTypes.STRING(30), allowNull: false },
    minDpd: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxDpd: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 99999 },
    conditionFormula: { type: DataTypes.TEXT, allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_status_movement_rule', timestamps: true });

  const lnStatusCureRule = sequelize.define('lnStatusCureRule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fromStatus: { type: DataTypes.STRING(30), allowNull: false },
    toStatus: { type: DataTypes.STRING(30), allowNull: false },
    consecutiveOnTimeInstallmentsRequired: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    observationMonthsRequired: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_status_cure_rule', timestamps: true });

  const lnProvisionRule = sequelize.define('lnProvisionRule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regulatoryClassCode: { type: DataTypes.STRING(30), allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    categoryId: { type: DataTypes.INTEGER, allowNull: true },
    provisionRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.010000 },
    collateralHaircutPct: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.300000 },
    provisionBase: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'NET_EXPOSURE' },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_provision_rule', timestamps: true });

  const lnProvisionLedger = sequelize.define('lnProvisionLedger', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loanAccountId: { type: DataTypes.INTEGER, allowNull: false },
    evaluationDate: { type: DataTypes.DATEONLY, allowNull: false },
    outstandingPrincipal: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    eligibleCollateralValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    netExposure: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    provisionRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    requiredProvision: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    bookedProvision: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    deltaProvision: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    glBatchId: { type: DataTypes.STRING(50), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'POSTED' }
  }, { freezeTableName: true, tableName: 'ln_provision_ledger', timestamps: true });

  return {
    lnRegulatoryClass,
    lnStatusMaster,
    lnStatusMovementRule,
    lnStatusCureRule,
    lnProvisionRule,
    lnProvisionLedger
  };
};
