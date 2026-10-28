module.exports = (sequelize, DataTypes) => {
  const Platform = sequelize.define('platform', {
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
    category: {
      type: DataTypes.ENUM('SOCIAL_CHAT', 'ECOMMERCE_MARKETPLACE', 'MESSAGING_APP'),
      allowNull: false,
      defaultValue: 'SOCIAL_CHAT'
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    hasChat: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    hasOrderSync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    hasInventorySync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    hasProductSync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    authType: {
      type: DataTypes.ENUM('OAUTH2', 'API_KEY', 'WEBHOOK'),
      allowNull: false,
      defaultValue: 'OAUTH2'
    },
    apiBaseUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    oauthAuthUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    oauthTokenUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    defaultMonthlyPrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    tableName: 'platforms'
  });

  Platform.associate = function(models) {
    if (models.platformAccount) {
      Platform.hasMany(models.platformAccount, { foreignKey: 'platformId', as: 'accounts' });
    }
  };

  return Platform;
};
