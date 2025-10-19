module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('role', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Role name (e.g., admin, manager, staff)'
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Permission level: admin=100, manager=50, supervisor=30, staff=10'
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of permission strings (e.g., ["ticket.cancel", "ticket.void"])'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Role description'
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
    indexes: [
      {
        fields: ['name']
      },
      {
        fields: ['level']
      }
    ]
  });

  // Associations
  Role.associate = function(models) {
    // One role has many users
    Role.hasMany(models.user, {
      foreignKey: 'roleId',
      as: 'users'
    });
  };

  return Role;
};