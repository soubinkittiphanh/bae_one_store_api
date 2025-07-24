
// 2. MONEY SETTLEMENT MODEL
// models/MoneySettlement.js
module.exports = (sequelize, DataTypes) => {
  const Settlement = sequelize.define('Settlement', {
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank_transfer', 'deduction'),
      allowNull: false
    },
    notes: {
      type: DataTypes.TEXT
    },
  }, {
    sequelize,
    // don't forget to enable timestamps!
    timestamps: true,
    // I don't want createdAt
    createdAt: true,
    // I want updatedAt to actually be called updateTimestamp
    updatedAt: 'updateTimestamp',
    // disable the modification of tablenames; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true,
  });
  Settlement.associate = models => {
    Settlement.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'proceeder',
    });
    Settlement.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });
    Settlement.belongsTo(models.moneyAdvance, {
      foreignKey: 'moneyAdvanceId',
      as: 'moneyAdvance',
    });
    Settlement.belongsTo(models.bankAccount, {
      foreignKey: 'bankAccountId',
      as: 'bankAccount',
    });
    Settlement.belongsTo(models.ministry, {
      foreignKey: 'ministryId',
      as: 'ministry',
    });
    Settlement.belongsTo(models.chartAccount, {
      foreignKey: 'chartAccountId',
      as: 'chartAccount',
    });
  };

  return Settlement;
};