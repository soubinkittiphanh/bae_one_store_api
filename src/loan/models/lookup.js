module.exports = (sequelize, DataTypes) => {
  const lnLookupLoanType = sequelize.define('lnLookupLoanType', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_loan_type', timestamps: true });

  const lnLookupFrequency = sequelize.define('lnLookupFrequency', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    daysInterval: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    periodsPerYear: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 12.000000 }
  }, { freezeTableName: true, tableName: 'ln_lookup_frequency', timestamps: true });

  const lnLookupDisbursementTarget = sequelize.define('lnLookupDisbursementTarget', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_disbursement_target', timestamps: true });

  const lnLookupHolidayHandling = sequelize.define('lnLookupHolidayHandling', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_holiday_handling', timestamps: true });

  const lnLookupDayCount = sequelize.define('lnLookupDayCount', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    daysInYear: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 365 },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_day_count', timestamps: true });

  const lnLookupRebateMethod = sequelize.define('lnLookupRebateMethod', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_rebate_method', timestamps: true });

  const lnLookupAccrualMethod = sequelize.define('lnLookupAccrualMethod', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_accrual_method', timestamps: true });

  const lnLookupCollateralType = sequelize.define('lnLookupCollateralType', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_collateral_type', timestamps: true });

  const lnLookupLoanPurpose = sequelize.define('lnLookupLoanPurpose', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_loan_purpose', timestamps: true });

  const lnLookupDeferredFeePresentation = sequelize.define('lnLookupDeferredFeePresentation', {
    code: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_lookup_deferred_fee_presentation', timestamps: true });

  return {
    lnLookupLoanType,
    lnLookupFrequency,
    lnLookupDisbursementTarget,
    lnLookupHolidayHandling,
    lnLookupDayCount,
    lnLookupRebateMethod,
    lnLookupAccrualMethod,
    lnLookupCollateralType,
    lnLookupLoanPurpose,
    lnLookupDeferredFeePresentation
  };
};
