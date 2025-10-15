// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// JOB MODEL
// models/MOU.js
module.exports = (sequelize, DataTypes) => {
  const MOU = sequelize.define('MOU', {
    // ===============================================================
    // BASIC IDENTIFICATION
    // ===============================================================

    // ລະຫັດ Job - Job Code
    jobCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    // MOU Number
    mouNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // PM Charge
    pmCharge: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      defaultValue: 0
    },
    projectAmount: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      defaultValue: 0
    },
    exchangeRate: {
      type: DataTypes.DOUBLE,
      defaultValue: 1,
      allowNull: true
    },

    // Agency (FK handled in association)
    // stored as reference in associations
    // agencyId: handled below

    // ບໍລິສັດນາຍຈ່າງ - Employer Company
    employerCompany: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isPaidByEmployer: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },

    // ສະຖານທີ່ເຮັດວຽກ - Work Location
    workLocation: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // ໜ້າວຽກ - Job Title / Description
    jobTitle: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // ຈຳນວນແຮງງານ - Number of Workers
    numberOfWorkers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    // ປະເພດແຮງງານ - Worker Type
    workerType: {
      type: DataTypes.ENUM('Man', 'Woman', 'Spous', 'Any', 'Single man', ' Single woman'),
      allowNull: false,
      defaultValue: 'Any'
    },
    country: {
      type: DataTypes.ENUM('LAO', 'THAI', 'KOREA', 'SINGAPORE', 'JAPAN', 'ISRAEL', 'OTHER'),
      allowNull: false,
      defaultValue: 'OTHER'
    },


    // ສະຖານະງານ - Job Status
    jobStatus: {
      type: DataTypes.ENUM('draft', 'open', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },

    // ເອກະສານຕິດຂັດ - Related Documents (can store file path or JSON)
    documents: {
      type: DataTypes.JSON,
      allowNull: true
    },

    // ===============================================================
    // STATUS AND NOTES
    // ===============================================================

    // Notes
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // System Active
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
      { fields: ['jobCode'], unique: true },
      { fields: ['jobStatus'] },
      { fields: ['isActive'] },
    ]
  });

  MOU.associate = models => {
    logger.info(`Associating table Job with models`);

    // Belongs to Agency
    MOU.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency',
    });

    // Created by User
    MOU.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    MOU.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });

    // Updated by User
    MOU.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    MOU.hasMany(models.image, {
      foreignKey: 'MOUID',
      as: 'images'
    });
    // ADD THIS ASSOCIATION - MOU has many JobBatches
    MOU.hasMany(models.JobBatch, {
      foreignKey: 'mouId',
      as: 'jobBatches',
      onDelete: 'SET NULL', // When MOU is deleted, set jobBatch.mouId to NULL
      onUpdate: 'CASCADE'
    });

  };

  return MOU;
};
