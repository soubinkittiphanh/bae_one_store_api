module.exports = (sequelize, DataTypes) => {
  const ParkingSlot = sequelize.define('parking_slot', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    zoneId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    slotNumber: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    slotType: {
      type: DataTypes.ENUM('car', 'motorbike', 'vip', 'disabled', 'truck'),
      allowNull: false,
      defaultValue: 'car'
    },
    status: {
      type: DataTypes.ENUM('available', 'occupied', 'reserved', 'out_of_service'),
      allowNull: false,
      defaultValue: 'available'
    },
    currentTicketId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    tableName: 'parking_slots'
  });

  ParkingSlot.associate = function(models) {
    ParkingSlot.belongsTo(models.parkingZone, { foreignKey: 'zoneId', as: 'zone' });
    if (models.parkingTicket) {
      ParkingSlot.belongsTo(models.parkingTicket, { foreignKey: 'currentTicketId', as: 'currentTicket' });
    }
  };

  return ParkingSlot;
};
