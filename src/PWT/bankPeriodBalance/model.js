const logger = require('../../api/logger');

module.exports = (sequelize, DataTypes) => {
  const BankPeriodBalance = sequelize.define('BankPeriodBalance', {
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true // null = Cash Drawer
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    openingBalance: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    totalAdvances: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    totalSettlements: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    closingBalance: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    exchangeRateLak: {
      type: DataTypes.DECIMAL(20, 4),
      allowNull: false,
      defaultValue: 1.0000
    },
    isClosed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['branchId', 'bankAccountId', 'currencyId', 'year', 'month'],
        name: 'unique_bank_period_balance'
      }
    ]
  });

  BankPeriodBalance.associate = (models) => {
    logger.info('Associating table BankPeriodBalance with models');
    BankPeriodBalance.belongsTo(models.bankAccount, {
      foreignKey: 'bankAccountId',
      as: 'bankAccount'
    });
    BankPeriodBalance.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
  };

  return BankPeriodBalance;
};
