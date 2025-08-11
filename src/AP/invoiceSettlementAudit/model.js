// ===============================================================
// AP SETTLEMENT AUDIT TRAIL MODEL
// ===============================================================
const logger = require("../../api/logger");

// models/APSettlementAudit.js
module.exports = (sequelize, DataTypes) => {
  const APSettlementAudit = sequelize.define('APSettlementAudit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    
    // Basic audit information
    action: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'COMPLETE', 'CANCEL'),
      allowNull: false,
      defaultValue: 'UPDATE'
    },
    
    // Store the complete settlement record as JSON
    recordData: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Complete settlement record at time of change'
    },
    
    // Optional reason for change
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Who made the change
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    
    // When the change was made
    auditDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    
    // Settlement ID being audited
    settlementId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: false, // We handle our own timestamp
    freezeTableName: true,
    indexes: [
      {
        fields: ['settlementId', 'auditDate']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['auditDate']
      }
    ]
  });

  APSettlementAudit.associate = models => {
    logger.info(`Associating table APSettlementAudit with models`);
    
    // Audit belongs to settlement
    APSettlementAudit.belongsTo(models.apInvoiceSettlement, {
      foreignKey: 'settlementId',
      as: 'settlement'
    });
    
    // Audit belongs to user who made the change
    APSettlementAudit.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  // Class method to create audit record
  APSettlementAudit.createAuditRecord = async function(settlementData, userId, action = 'UPDATE', reason = null) {
    try {
      // Ensure we have the settlement ID
      if (!settlementData || !settlementData.id) {
        logger.warn('Cannot create audit record: Settlement data or ID missing');
        return null;
      }

      return await this.create({
        settlementId: settlementData.id,
        action: action,
        recordData: settlementData,
        reason: reason,
        userId: userId,
        auditDate: new Date()
      });
    } catch (error) {
      logger.error('Failed to create settlement audit record:', error);
      // Don't throw error - audit shouldn't break main functionality
      return null;
    }
  };

  // Instance method to get formatted action text
  APSettlementAudit.prototype.getActionText = function() {
    const actionMap = {
      'CREATE': 'Settlement Created',
      'UPDATE': 'Settlement Updated',
      'DELETE': 'Settlement Deleted',
      'APPROVE': 'Settlement Approved',
      'REJECT': 'Settlement Rejected',
      'COMPLETE': 'Settlement Completed',
      'CANCEL': 'Settlement Cancelled'
    };
    return actionMap[this.action] || this.action;
  };

  // Instance method to get settlement summary
  APSettlementAudit.prototype.getSettlementSummary = function() {
    const data = this.recordData;
    if (!data) return null;

    return {
      reference: data.reference,
      paymentAmount: data.paymentAmount,
      baseAmount: data.baseAmount,
      status: data.status,
      settlementDate: data.settlementDate,
      paymentMethod: data.paymentMethod?.name,
      bankAccount: data.bankAccount?.accountName
    };
  };

  return APSettlementAudit;
};