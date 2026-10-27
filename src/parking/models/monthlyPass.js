module.exports = (sequelize, DataTypes) => {
  const ParkingMonthlyPass = sequelize.define('parking_monthly_pass', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    passNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
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
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    customerPhone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    feeAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 300000.00
    },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'paid', 'cancelled'),
      allowNull: false,
      defaultValue: 'paid'
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'suspended', 'cancelled'),
      allowNull: false,
      defaultValue: 'active'
    },
    slotId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'parking_monthly_passes'
  });

  ParkingMonthlyPass.associate = function(models) {
    if (models.parkingSlot) {
      ParkingMonthlyPass.belongsTo(models.parkingSlot, { foreignKey: 'slotId', as: 'slot' });
    }
    if (models.user) {
      ParkingMonthlyPass.belongsTo(models.user, { foreignKey: 'createdById', as: 'createdBy' });
    }
  };

  return ParkingMonthlyPass;
};
