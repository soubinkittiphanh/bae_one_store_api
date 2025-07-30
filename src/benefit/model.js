
// ===============================================================
// BENEFIT MODEL

const logger = require("../api/logger");

// models/Benefit.js
module.exports = (sequelize, DataTypes) => {
  const Benefit = sequelize.define('Benefit', {
    // Benefit Information
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('salary', 'allowance', 'insurance', 'accommodation', 'transportation', 'other'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'LAK'
    },
    
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
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
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  Benefit.associate = models => {
    logger.info(`Associating table Benefit with models`);
    
    // User associations
    Benefit.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker'
    });
    Benefit.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser'
    });
    
    // JobAdvertise association
    Benefit.belongsTo(models.jobAdvertise, {
      foreignKey: 'jobAdvertiseId',
      as: 'jobAdvertise'
    });
  };

  return Benefit;
};