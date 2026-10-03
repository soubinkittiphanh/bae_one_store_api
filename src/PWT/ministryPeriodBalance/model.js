const logger = require('../../api/logger');

module.exports = (sequelize, DataTypes) => {
  const MinistryPeriodBalance = sequelize.define('MinistryPeriodBalance', {
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ministryId: {
      type: DataTypes.INTEGER,
      allowNull: false
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
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    closedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    note: {
      type: DataTypes.STRING,
      allowNull: true
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
        fields: ['branchId', 'ministryId', 'currencyId', 'year', 'month'],
        name: 'unique_ministry_period_balance'
      }
    ]
  });

  MinistryPeriodBalance.associate = (models) => {
    logger.info('Associating table MinistryPeriodBalance with models');
    MinistryPeriodBalance.belongsTo(models.ministry, {
      foreignKey: 'ministryId',
      as: 'ministry'
    });
    MinistryPeriodBalance.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency'
    });
    MinistryPeriodBalance.belongsTo(models.user, {
      foreignKey: 'closedBy',
      as: 'closedByUser'
    });
  };

  return MinistryPeriodBalance;
};
