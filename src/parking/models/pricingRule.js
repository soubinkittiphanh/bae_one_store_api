module.exports = (sequelize, DataTypes) => {
  const ParkingPricingRule = sequelize.define('parking_pricing_rule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    vehicleType: {
      type: DataTypes.ENUM('car', 'motorbike', 'vip', 'disabled', 'truck'),
      allowNull: false
    },
    gracePeriodMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15
    },
    dayStartTime: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: '06:00'
    },
    dayEndTime: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: '18:00'
    },
    dayHourlyRate: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 5000.00
    },
    nightHourlyRate: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 10000.00
    },
    nightPricingType: {
      type: DataTypes.ENUM('HOURLY', 'FLAT'),
      allowNull: false,
      defaultValue: 'HOURLY'
    },
    dailyCap: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 50000.00
    },
    lostTicketFee: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 100000.00
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    createdById: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    tableName: 'parking_pricing_rules'
  });

  ParkingPricingRule.associate = function(models) {
    if (models.user) {
      ParkingPricingRule.belongsTo(models.user, { foreignKey: 'createdById', as: 'createdBy' });
    }
  };

  return ParkingPricingRule;
};
