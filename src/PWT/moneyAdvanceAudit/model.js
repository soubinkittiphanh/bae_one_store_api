// ===============================================================
// MONEY ADVANCE AUDIT MODEL - SIMPLE AUDIT TRAIL
// ===============================================================
const logger = require("../../api/logger");

// models/MoneyAdvanceAudit.js
module.exports = (sequelize, DataTypes) => {
  const MoneyAdvanceAudit = sequelize.define('MoneyAdvanceAudit', {
    recordId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Reference to the main MoneyAdvance record'
    },
    action: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'SETTLE'),
      allowNull: false,
      comment: 'Action performed on the record'
    },
    oldData: {
      type: DataTypes.JSON, // Use JSON for non-PostgreSQL databases
      allowNull: true,
      comment: 'Data before the change (null for CREATE)'
    },
    newData: {
      type: DataTypes.JSON, // Use JSON for non-PostgreSQL databases
      allowNull: true,
      comment: 'Data after the change (null for DELETE)'
    },
    changedFields: {
      type: DataTypes.JSON, // Use JSON for non-PostgreSQL databases
      allowNull: true,
      comment: 'List of fields that were changed'
    },
    changedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User ID who made the change'
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp of the change'
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Reason for the change'
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'IP address of the user'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Browser/client information'
    }
  }, {
    sequelize,
    tableName: 'MoneyAdvanceAudit',
    timestamps: false, // We handle timestamps manually
    freezeTableName: true,
    
    // Indexes for better performance
    indexes: [
      {
        fields: ['recordId'],
        name: 'idx_money_advance_audit_record_id'
      },
      {
        fields: ['changedAt'],
        name: 'idx_money_advance_audit_changed_at'
      },
      {
        fields: ['changedBy'],
        name: 'idx_money_advance_audit_changed_by'
      },
      {
        fields: ['action'],
        name: 'idx_money_advance_audit_action'
      }
    ]
  });

  // Static method to create audit record
  MoneyAdvanceAudit.createAuditRecord = async function(recordId, action, oldData, newData, options = {}) {
    try {
      const { userId, reason, ipAddress, userAgent, transaction } = options;
      
      // Calculate changed fields
      let changedFields = null;
      if (oldData && newData) {
        changedFields = [];
        const fieldsToIgnore = ['updateTimestamp', 'createdAt'];
        
        Object.keys(newData).forEach(key => {
          if (!fieldsToIgnore.includes(key) && oldData[key] !== newData[key]) {
            changedFields.push({
              field: key,
              oldValue: oldData[key],
              newValue: newData[key]
            });
          }
        });
      }
      
      const auditRecord = await MoneyAdvanceAudit.create({
        recordId,
        action,
        oldData,
        newData,
        changedFields,
        changedBy: userId,
        changedAt: new Date(),
        reason,
        ipAddress,
        userAgent
      }, { transaction });
      
      logger.info(`Audit record created for MoneyAdvance ${recordId}, action: ${action}`);
      return auditRecord;
      
    } catch (error) {
      logger.error('Error creating audit record:', error);
      // Don't throw error to avoid breaking main operation
    }
  };

  // Get audit trail for a record
  MoneyAdvanceAudit.getAuditTrail = async function(recordId, options = {}) {
    const { limit = 50, offset = 0, order = [['changedAt', 'DESC']] } = options;
    
    return await MoneyAdvanceAudit.findAll({
      where: { recordId },
      order,
      limit,
      offset,
      include: [
        {
          model: sequelize.models.user,
          as: 'changedByUser',
          // attributes: ['id', 'cus_name', 'email'],
          required: false
        }
      ]
    });
  };

  // Get changes by user
  MoneyAdvanceAudit.getChangesByUser = async function(userId, options = {}) {
    const { limit = 50, offset = 0, recordId } = options;
    
    const whereClause = { changedBy: userId };
    if (recordId) {
      whereClause.recordId = recordId;
    }
    
    return await MoneyAdvanceAudit.findAll({
      where: whereClause,
      order: [['changedAt', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.MoneyAdvance,
          as: 'record',
          attributes: ['id', 'purpose', 'amount', 'status']
        },
        {
          model: sequelize.models.user,
          as: 'changedByUser',
          // attributes: ['id', 'cus_name', 'email']
        }
      ]
    });
  };

  // Get changes within date range
  MoneyAdvanceAudit.getChangesByDateRange = async function(startDate, endDate, options = {}) {
    const { limit = 100, offset = 0, recordId } = options;
    
    const whereClause = {
      changedAt: {
        [sequelize.Op.between]: [startDate, endDate]
      }
    };
    
    if (recordId) {
      whereClause.recordId = recordId;
    }
    
    return await MoneyAdvanceAudit.findAll({
      where: whereClause,
      order: [['changedAt', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.MoneyAdvance,
          as: 'record',
          attributes: ['id', 'purpose', 'amount', 'status']
        },
        {
          model: sequelize.models.user,
          as: 'changedByUser',
          // attributes: ['id', 'cus_name', 'email']
        }
      ]
    });
  };

  // Instance method to get change summary
  MoneyAdvanceAudit.prototype.getChangeSummary = function() {
    const summary = {
      id: this.id,
      action: this.action,
      changedAt: this.changedAt,
      changedBy: this.changedByUser?.cus_name || 'System',
      reason: this.reason,
      changedFieldsCount: this.changedFields ? this.changedFields.length : 0,
      keyChanges: []
    };
    
    // Extract key changes for display
    if (this.changedFields && this.changedFields.length > 0) {
      const importantFields = ['amount', 'status', 'purpose', 'dueDate'];
      this.changedFields.forEach(change => {
        if (importantFields.includes(change.field)) {
          summary.keyChanges.push({
            field: change.field,
            from: change.oldValue,
            to: change.newValue
          });
        }
      });
    }
    
    return summary;
  };

  // Cleanup old audit records
  MoneyAdvanceAudit.cleanupOldRecords = async function(daysToKeep = 365, options = {}) {
    const { dryRun = false, batchSize = 1000 } = options;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    if (dryRun) {
      const count = await MoneyAdvanceAudit.count({
        where: {
          changedAt: {
            [sequelize.Op.lt]: cutoffDate
          }
        }
      });
      return { wouldDelete: count };
    }
    
    const deletedCount = await MoneyAdvanceAudit.destroy({
      where: {
        changedAt: {
          [sequelize.Op.lt]: cutoffDate
        }
      },
      limit: batchSize
    });
    
    logger.info(`Cleaned up ${deletedCount} old audit records`);
    return { deleted: deletedCount };
  };

  // Associations
  MoneyAdvanceAudit.associate = models => {
    logger.info(`Associating table MoneyAdvanceAudit with models`);
    
    MoneyAdvanceAudit.belongsTo(models.moneyAdvance, {
      foreignKey: 'recordId',
      as: 'record'
    });
    
    MoneyAdvanceAudit.belongsTo(models.user, {
      foreignKey: 'changedByUserId',
      as: 'changedByUser'
    });
  };

  return MoneyAdvanceAudit;
};