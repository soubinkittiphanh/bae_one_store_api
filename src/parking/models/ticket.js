module.exports = (sequelize, DataTypes) => {
  const ParkingTicket = sequelize.define('parking_ticket', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    ticketNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    vehicleId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    plateNumber: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    vehicleType: {
      type: DataTypes.ENUM('car', 'motorbike', 'vip', 'disabled', 'truck'),
      allowNull: false,
      defaultValue: 'car'
    },
    zoneId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    slotId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    entryTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    exitTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('active', 'paid', 'completed', 'lost', 'cancelled'),
      allowNull: false,
      defaultValue: 'active'
    },
    pricingRuleId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    monthlyPassId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isMonthlyPass: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isLostTicket: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    calculatedFee: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    paidFee: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    discountAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    penaltyFee: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    entryUserId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    exitUserId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    tableName: 'parking_tickets'
  });

  ParkingTicket.associate = function(models) {
    ParkingTicket.belongsTo(models.parkingVehicle, { foreignKey: 'vehicleId', as: 'vehicle' });
    ParkingTicket.belongsTo(models.parkingZone, { foreignKey: 'zoneId', as: 'zone' });
    ParkingTicket.belongsTo(models.parkingSlot, { foreignKey: 'slotId', as: 'slot' });
    if (models.parkingPricingRule) {
      ParkingTicket.belongsTo(models.parkingPricingRule, { foreignKey: 'pricingRuleId', as: 'pricingRule' });
    }
    if (models.parkingMonthlyPass) {
      ParkingTicket.belongsTo(models.parkingMonthlyPass, { foreignKey: 'monthlyPassId', as: 'monthlyPass' });
    }
    if (models.parkingPayment) {
      ParkingTicket.hasMany(models.parkingPayment, { foreignKey: 'ticketId', as: 'payments' });
    }
    if (models.user) {
      ParkingTicket.belongsTo(models.user, { foreignKey: 'entryUserId', as: 'entryUser' });
      ParkingTicket.belongsTo(models.user, { foreignKey: 'exitUserId', as: 'exitUser' });
    }
  };

  return ParkingTicket;
};
