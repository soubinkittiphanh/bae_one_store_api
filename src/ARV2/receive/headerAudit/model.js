// ===============================================================
// AR RECEIVE HEADER AUDIT TRAIL MODEL
// ===============================================================
const logger = require("../../../api/logger");

// models/ARReceiveHeaderAudit.js
module.exports = (sequelize, DataTypes) => {
  const ARReceiveHeaderAudit = sequelize.define('ARReceiveHeaderAudit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    
    // Basic audit information
    action: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'VOID', 'CANCEL', 'APPROVE'),
      allowNull: false,
      defaultValue: 'UPDATE'
    },
    
    // Store the complete receive header record as JSON
    recordData: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Complete AR receive header record at time of change'
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
    
    // Receive Header ID being audited
    receiveHeaderId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: false, // We handle our own timestamp
    freezeTableName: true,
    indexes: [
      {
        fields: ['receiveHeaderId', 'auditDate']
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

  ARReceiveHeaderAudit.associate = models => {
    logger.info(`Associating table ARReceiveHeaderAudit with models`);
    
    // Audit belongs to receive header
    ARReceiveHeaderAudit.belongsTo(models.arReceiveHeader, {
      foreignKey: 'receiveHeaderId',
      as: 'receiveHeader'
    });
    
    // Audit belongs to user who made the change
    ARReceiveHeaderAudit.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  // Class method to create audit record
  ARReceiveHeaderAudit.createAuditRecord = async function(receiveHeaderData, userId, action = 'UPDATE', reason = null) {
    try {
      // Ensure we have the receive header ID
      if (!receiveHeaderData || !receiveHeaderData.id) {
        logger.warn('Cannot create audit record: Receive header data or ID missing');
        return null;
      }

      return await this.create({
        receiveHeaderId: receiveHeaderData.id,
        action: action,
        recordData: receiveHeaderData,
        reason: reason,
        userId: userId,
        auditDate: new Date()
      });
    } catch (error) {
      logger.error('Failed to create AR receive header audit record:', error);
      // Don't throw error - audit shouldn't break main functionality
      return null;
    }
  };

  // Instance method to get formatted action text
  ARReceiveHeaderAudit.prototype.getActionText = function() {
    const actionMap = {
      'CREATE': 'Payment Receipt Created',
      'UPDATE': 'Payment Receipt Updated',
      'DELETE': 'Payment Receipt Deleted',
      'VOID': 'Payment Receipt Voided',
      'CANCEL': 'Payment Receipt Cancelled',
      'APPROVE': 'Payment Receipt Approved'
    };
    return actionMap[this.action] || this.action;
  };

  // Instance method to get receipt summary
  ARReceiveHeaderAudit.prototype.getReceiptSummary = function() {
    const data = this.recordData;
    if (!data) return null;

    return {
      receiptNumber: data.receiptNumber,
      totalReceivedAmount: data.totalReceivedAmount,
      paymentMethod: data.paymentMethod,
      receivedDate: data.receivedDate,
      bookingDate: data.bookingDate,
      referenceNumber: data.referenceNumber,
      invoiceNumber: data.invoiceHeader?.invoiceNumber,
      customer: data.invoiceHeader?.customer?.name
    };
  };

  return ARReceiveHeaderAudit;
};