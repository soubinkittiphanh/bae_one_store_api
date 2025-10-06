const logger = require("../../api/logger");

// models/JobBatch.js
module.exports = (sequelize, DataTypes) => {
  const JobBatch = sequelize.define('JobBatch', {
    // Batch Information
    batchName: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    runningNo: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [1, 50]
      }
    },
    jobDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Batch Details
    totalPositions: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },

    // Dates
    batchStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    batchEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    batchDeliveryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    deploymentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // Status and Priority
    status: {
      type: DataTypes.ENUM('draft', 'active',),
      allowNull: false,
      defaultValue: 'draft'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'medium'
    },


    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Processing Information
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        fields: ['runningNo'],
        unique: true
      },
      {
        fields: ['batchName']
      },
      {
        fields: ['status']
      },
      {
        fields: ['batchStartDate']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['isActive']
      }
    ],
    hooks: {
      beforeValidate: async (jobBatch, options) => {
        // Auto-generate sequential running number if not provided
        if (!jobBatch.runningNo && jobBatch.mouId) {
          try {
            // Count existing batches for this MOU
            const batchCount = await JobBatch.count({
              where: {
                mouId: jobBatch.mouId
              }
            });

            // Generate running number: MOU_ID-001, MOU_ID-002, etc.
            const nextNumber = batchCount + 1;
            const paddedNumber = String(nextNumber).padStart(2, '0');
            jobBatch.runningNo = `${jobBatch.jobCode}-${paddedNumber}`;

          } catch (error) {
            logger.error('Error generating running number:', error);
            // Fallback to timestamp-based if there's an error
            const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
            jobBatch.runningNo = `JB-${timestamp}`;
          }
        } else if (!jobBatch.runningNo) {
          // Fallback if no mouId is provided
          const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
          jobBatch.runningNo = `JB-${timestamp}`;
        }
      }
    }
  });

  JobBatch.associate = models => {
    logger.info(`Associating table JobBatch with models`);

    // User associations
    JobBatch.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker'
    });

    JobBatch.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser'
    });
    JobBatch.belongsTo(models.MOU, {
      foreignKey: 'mouId',
      as: 'mou',
    });
    JobBatch.hasMany(models.Applicant, {
      foreignKey: 'jobBatchId',
      as: 'applicants',
      onDelete: 'CASCADE', // Optional: delete applicants when job batch is deleted
      onUpdate: 'CASCADE'
    });

  };

  // Instance methods
  JobBatch.prototype.getRemainingPositions = function () {
    return this.totalPositions - this.filledPositions;
  };

  JobBatch.prototype.getCompletionPercentage = function () {
    if (!this.totalPositions || this.totalPositions === 0) return 0;
    return Math.round((this.filledPositions / this.totalPositions) * 100);
  };

  JobBatch.prototype.isOverdue = function () {
    if (!this.batchEndDate) return false;
    return new Date() > new Date(this.batchEndDate) && this.status !== 'completed';
  };

  // Class methods
  JobBatch.getActiveBatches = function () {
    return this.findAll({
      where: {
        status: 'active',
        isActive: true
      },
      order: [['priority', 'DESC'], ['batchStartDate', 'ASC']]
    });
  };


  return JobBatch;
};