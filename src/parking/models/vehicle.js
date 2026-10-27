module.exports = (sequelize, DataTypes) => {
  const ParkingVehicle = sequelize.define('parking_vehicle', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    plateNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    vehicleType: {
      type: DataTypes.ENUM('car', 'motorbike', 'vip', 'disabled', 'truck'),
      allowNull: false,
      defaultValue: 'car'
    },
    driverName: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    driverPhone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    brand: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(50),
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
    tableName: 'parking_vehicles'
  });

  ParkingVehicle.associate = function(models) {
    if (models.parkingTicket) {
      ParkingVehicle.hasMany(models.parkingTicket, { foreignKey: 'vehicleId', as: 'tickets' });
    }
  };

  return ParkingVehicle;
};
