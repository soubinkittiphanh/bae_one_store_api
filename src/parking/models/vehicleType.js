/**
 * Parking Vehicle Type master (ປະເພດຍານພາຫະນະ)
 *
 * Customer-maintained list of vehicle types. Other parking tables
 * (vehicles, slots, pricing rules, monthly passes, tickets) reference
 * a type by its string `code` (e.g. 'car', 'motorbike'), so `code` is
 * immutable once created. Labels, icon and colour may be edited freely.
 */
module.exports = (sequelize, DataTypes) => {
  const ParkingVehicleType = sequelize.define('parking_vehicle_type', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    code: {
      // Uniqueness is a *named* index (see options.indexes) rather than `unique: true`,
      // because sync({ alter }) re-adds an unnamed unique index on every startup
      // (see code_2/code_3 duplicates on parking_zones).
      type: DataTypes.STRING(30),
      allowNull: false
    },
    nameLa: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    nameEn: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'mdi-car'
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
    tableName: 'parking_vehicle_types',
    // Same collation as the other parking tables, so string comparisons on `code` can be joined
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    indexes: [
      { name: 'uk_parking_vehicle_types_code', unique: true, fields: ['code'] }
    ]
  });

  ParkingVehicleType.associate = function(models) {
    if (models.user) {
      ParkingVehicleType.belongsTo(models.user, { foreignKey: 'createdById', as: 'createdBy', constraints: false });
    }
  };

  return ParkingVehicleType;
};
