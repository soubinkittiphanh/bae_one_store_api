module.exports = (sequelize, DataTypes) => {
  const lnHolidayCalendar = sequelize.define('lnHolidayCalendar', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    calendarCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    branchId: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, { freezeTableName: true, tableName: 'ln_holiday_calendar', timestamps: true });

  const lnHolidayDate = sequelize.define('lnHolidayDate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    calendarId: { type: DataTypes.INTEGER, allowNull: false },
    holidayDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.STRING(100), allowNull: false },
    isWeekend: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  }, { freezeTableName: true, tableName: 'ln_holiday_date', timestamps: true });

  const lnFeeMaster = sequelize.define('lnFeeMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    feeCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    componentId: { type: DataTypes.INTEGER, allowNull: true },
    feeType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PROCESSING' },
    calcMethod: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'FLAT' },
    basisAmountType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'ORIGINAL_SANCTIONED' },
    minAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 100000000.0000 },
    isEirAmortized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    taxApplicable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    triggerEventCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DISB' },
    accountingRoleCode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'FEE_INCOME' },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_fee_master', timestamps: true });

  const lnTaxMaster = sequelize.define('lnTaxMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    taxCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    componentId: { type: DataTypes.INTEGER, allowNull: true },
    taxRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.070000 },
    accountingRoleCode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'TAX_PAYABLE' },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    authStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHORIZED' }
  }, { freezeTableName: true, tableName: 'ln_tax_master', timestamps: true });

  return {
    lnHolidayCalendar,
    lnHolidayDate,
    lnFeeMaster,
    lnTaxMaster
  };
};
