
// 2. MONEY SETTLEMENT MODEL
// models/MoneySettlement.js
module.exports = (sequelize, DataTypes) => {
  const Settlement = sequelize.define('Settlement', {
    amount: {
      type: DataTypes.DECIMAL(10, 2),
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
        Settlement.belongsTo(models.moneyAdvance, {
            foreignKey: 'moneyAdvanceId',
            as: 'moneyAdvance',
        });
    };

  return Settlement;
};