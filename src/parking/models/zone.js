module.exports = (sequelize, DataTypes) => {
  const ParkingZone = sequelize.define('parking_zone', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    floor: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    tableName: 'parking_zones'
  });

  ParkingZone.associate = function(models) {
    ParkingZone.hasMany(models.parkingSlot, { foreignKey: 'zoneId', as: 'slots' });
    if (models.user) {
      ParkingZone.belongsTo(models.user, { foreignKey: 'createdById', as: 'createdBy' });
    }
  };

  return ParkingZone;
};
