const { makerChecker } = require('./common');

module.exports = (sequelize, DataTypes) => {
  const lnUde = sequelize.define('lnUde', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    udeCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    dataType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RATE' },
    description: { type: DataTypes.TEXT, allowNull: true },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_ude', timestamps: true });

  const lnProductUde = sequelize.define('lnProductUde', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    udeCode: { type: DataTypes.STRING(30), allowNull: false },
    defaultValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    minValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    maxValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 1000000000.0000 },
    isAmendableAtAccount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_product_ude', timestamps: true,
    indexes: [
      { name: 'uk_product_ude', unique: true, fields: ['productId', 'udeCode'] }
    ] });

  const lnRateIndex = sequelize.define('lnRateIndex', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rateCode: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    resetFrequencyCode: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'MONTHLY' },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_rate_index', timestamps: true });

  const lnRateIndexValue = sequelize.define('lnRateIndexValue', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rateIndexId: { type: DataTypes.INTEGER, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    baseRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    optLockVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_rate_index_value', timestamps: true,
    indexes: [
      { name: 'uk_rate_index_date', unique: true, fields: ['rateIndexId', 'effectiveDate'] }
    ] });

  const lnRateTier = sequelize.define('lnRateTier', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productComponentId: { type: DataTypes.INTEGER, allowNull: false },
    tierBasis: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AMOUNT' },
    currencyId: { type: DataTypes.INTEGER, allowNull: true, comment: 'currency.id; required for tierBasis AMOUNT' },
    fromValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    toValue: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: 0.0000 },
    tierRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.000000 },
    ...makerChecker(DataTypes)
  }, { freezeTableName: true, tableName: 'ln_rate_tier', timestamps: true });

  return {
    lnUde,
    lnProductUde,
    lnRateIndex,
    lnRateIndexValue,
    lnRateTier
  };
};
