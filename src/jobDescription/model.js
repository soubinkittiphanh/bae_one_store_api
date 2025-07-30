// ===============================================================
// JOB ADVERTISE MODEL

const logger = require("../api/logger");

// models/JobAdvertise.js
module.exports = (sequelize, DataTypes) => {
  const JobAdvertise = sequelize.define('JobAdvertise', {
    // Job Information
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false
    },
    province: {
      type: DataTypes.STRING,
      allowNull: true
    },
    jobDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    workingHours: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '8 hours/day'
    },
    restDays: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '1 day per week'
    },
    
    // Requirements
    requiresPassport: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    requiresGoodEyesight: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    requiresLanguage: {
      type: DataTypes.ENUM('none', 'basic', 'intermediate', 'advanced'),
      allowNull: true,
      defaultValue: 'none'
    },
    allowsTattoos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    
    // Job Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'closed'),
      allowNull: false,
      defaultValue: 'active'
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    maxApplicants: {
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
    indexes: [
      {
        fields: ['country']
      },
      {
        fields: ['status']
      },
      {
        fields: ['startDate']
      }
    ]
  });

  JobAdvertise.associate = models => {
    logger.info(`Associating table JobAdvertise with models`);
    
    // User associations
    JobAdvertise.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker'
    });
    JobAdvertise.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser'
    });
  };

  return JobAdvertise;
};
