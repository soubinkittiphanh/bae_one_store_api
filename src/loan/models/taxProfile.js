module.exports = (sequelize, DataTypes) => {
  const lnTaxProfile = sequelize.define('lnTaxProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyVatRegistered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    confirmationStatus: { type: DataTypes.ENUM('UNCONFIRMED', 'CONFIRMED'), allowNull: false, defaultValue: 'UNCONFIRMED' },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    defaultVatRate: { type: DataTypes.DECIMAL(9, 6), allowNull: false, defaultValue: 0.070000 },
    taxPayableAccountId: { type: DataTypes.INTEGER, allowNull: true },
    warningBannerActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    freezeTableName: true,
    tableName: 'ln_tax_profile',
    timestamps: true
  });

  return { lnTaxProfile };
};
