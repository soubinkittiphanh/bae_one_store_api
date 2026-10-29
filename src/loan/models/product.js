const { makerChecker } = require('./common');

module.exports = (sequelize, DataTypes) => {
  const lnProductCategory = sequelize.define('lnProductCategory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_product_category', timestamps: true });

  const lnProduct = sequelize.define('lnProduct', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productCode: { type: DataTypes.STRING(30), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    name: { type: DataTypes.STRING(100), allowNull: false },
    categoryId: { type: DataTypes.INTEGER, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    loanTypeCode: { type: DataTypes.STRING(30), allowNull: false },
    minAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 10000000000.0000 },
    minTenorMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    maxTenorMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    minInterestRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    maxInterestRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 1.000000 },
    minDownPaymentPct: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.200000 },
    maxLtvPct: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.800000 },
    disbursementTargetCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SALE_INVOICE_SETTLEMENT' },
    feeFinancingMode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UPFRONT' },
    deferredFeePresentation: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'IMMEDIATE' },
    earlySettlementRebateMethod: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RULE_OF_78' },
    accrualMethodCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DAILY_OUTSTANDING' },
    dayCountCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '30_360' },
    defaultFrequencyCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'MONTHLY' },
    holidayHandlingCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'NEXT_WORKING_DAY' },
    partialPrepayOption: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'REDUCE_INSTALLMENT' },
    overpaymentTreatment: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CUSTOMER_ADVANCE' },
    oldestInstallmentFirst: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allowRateOverride: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allowScheduleOverride: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allowPrepayment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allowTopUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allowReschedule: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allowBackdatedDisbursement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requireCollateral: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    requireGuarantor: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ACTIVE' },
    optLockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_product', timestamps: true,
    indexes: [
      { name: 'uk_product_version', unique: true, fields: ['productCode', 'version'] }
    ] });

  const lnProductCurrency = sequelize.define('lnProductCurrency', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    currencyId: { type: DataTypes.INTEGER, allowNull: false },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_product_currency', timestamps: true,
    indexes: [
      { name: 'uk_product_currency', unique: true, fields: ['productId', 'currencyId'] }
    ] });

  const lnComponent = sequelize.define('lnComponent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    componentCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    componentType: { type: DataTypes.STRING(30), allowNull: false },
    calculationBasis: { type: DataTypes.STRING(50), allowNull: false },
    liquidationMode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTO' },
    allowPrepay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isTaxable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    taxCode: { type: DataTypes.STRING(30), allowNull: true },
    taxInclusive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    taxPointEvent: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DISB' },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_component', timestamps: true });

  const lnProductComponent = sequelize.define('lnProductComponent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    formulaCode: { type: DataTypes.STRING(50), allowNull: false },
    defaultValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    minValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 1000000000.0000 },
    timing: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UPFRONT_COLLECTED' },
    isAmendableAtAccount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isEIRAmortized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_product_component', timestamps: true,
    indexes: [
      { name: 'uk_product_component', unique: true, fields: ['productId', 'componentId'] }
    ] });

  const lnWaterfallRule = sequelize.define('lnWaterfallRule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    accountStatus: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'NORMAL' },
    priorityOrder: { type: DataTypes.INTEGER, allowNull: false },
    componentId: { type: DataTypes.INTEGER, allowNull: false },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_waterfall_rule', timestamps: true,
    indexes: [
      { name: 'uk_product_status_priority', unique: true, fields: ['productId', 'accountStatus', 'priorityOrder'] }
    ] });

  return {
    lnProductCategory,
    lnProduct,
    lnProductCurrency,
    lnComponent,
    lnProductComponent,
    lnWaterfallRule
  };
};
