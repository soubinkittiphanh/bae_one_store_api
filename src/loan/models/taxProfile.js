module.exports = (sequelize, DataTypes) => {
  const lnTaxProfile = sequelize.define('lnTaxProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyVatRegistered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // VAT rate is read from this POS tax row (effective-dated); the VAT payable account is a Phase 2B system parameter
    posTaxId: { type: DataTypes.INTEGER, allowNull: true, comment: 'tax.id (no FK)' },
    confirmationStatus: { type: DataTypes.ENUM('UNCONFIRMED', 'CONFIRMED'), allowNull: false, defaultValue: 'UNCONFIRMED' },
    confirmedBy: { type: DataTypes.INTEGER, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    lastModifiedBy: { type: DataTypes.INTEGER, allowNull: true },
    warningBannerActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    freezeTableName: true,
    tableName: 'ln_tax_profile',
    timestamps: true
  });

  return { lnTaxProfile };
};
