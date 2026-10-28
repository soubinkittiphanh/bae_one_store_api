module.exports = (sequelize, DataTypes) => {
  const PlatformAccount = sequelize.define('platform_account', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    platformId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    externalAccountId: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    accountName: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    extraCredentials: {
      type: DataTypes.JSON,
      allowNull: true
    },
    isChatEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    isOrderSyncEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isInventorySyncEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'DISCONNECTED', 'SUSPENDED_OVER_QUOTA'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    tableName: 'platform_accounts'
  });

  PlatformAccount.associate = function(models) {
    if (models.platform) {
      PlatformAccount.belongsTo(models.platform, { foreignKey: 'platformId', as: 'platform' });
    }
    if (models.company) {
      PlatformAccount.belongsTo(models.company, { foreignKey: 'companyId', as: 'company' });
    }
  };

  return PlatformAccount;
};
