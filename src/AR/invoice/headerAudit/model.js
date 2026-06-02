// ===============================================================
// AR INVOICE HEADER AUDIT TRAIL MODEL
// ===============================================================
const logger = require("../../../api/logger");

// models/ARInvoiceHeaderAudit.js
module.exports = (sequelize, DataTypes) => {
  const ARInvoiceHeaderAudit = sequelize.define('ARInvoiceHeaderAudit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    
    // Basic audit information
    action: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'SEND', 'PAY', 'CANCEL', 'OVERDUE'),
      allowNull: false,
      defaultValue: 'UPDATE'
    },
    
    // Store the complete invoice header record as JSON
    recordData: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Complete AR invoice header record at time of change'
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
    
    // Invoice Header ID being audited
    invoiceHeaderId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    timestamps: false, // We handle our own timestamp
    freezeTableName: true,
    indexes: [
      {
        fields: ['invoiceHeaderId', 'auditDate']
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

  ARInvoiceHeaderAudit.associate = models => {
    logger.info(`Associating table ARInvoiceHeaderAudit with models`);
    
    // Audit belongs to invoice header
    ARInvoiceHeaderAudit.belongsTo(models.arInvoiceHeader, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceHeader'
    });
    
    // Audit belongs to user who made the change
    ARInvoiceHeaderAudit.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  // Class method to create audit record
  ARInvoiceHeaderAudit.createAuditRecord = async function(invoiceHeaderData, userId, action = 'UPDATE', reason = null) {
    try {
      // Ensure we have the invoice header ID
      if (!invoiceHeaderData || !invoiceHeaderData.id) {
        logger.warn('Cannot create audit record: Invoice header data or ID missing');
        return null;
      }

      return await this.create({
        invoiceHeaderId: invoiceHeaderData.id,
        action: action,
        recordData: invoiceHeaderData,
        reason: reason,
        userId: userId,
        auditDate: new Date()
      });
    } catch (error) {
      logger.error('Failed to create AR invoice header audit record:', error);
      // Don't throw error - audit shouldn't break main functionality
      return null;
    }
  };

  // Instance method to get formatted action text
  ARInvoiceHeaderAudit.prototype.getActionText = function() {
    const actionMap = {
      'CREATE': 'Invoice Created',
      'UPDATE': 'Invoice Updated',
      'DELETE': 'Invoice Deleted',
      'SEND': 'Invoice Sent',
      'PAY': 'Payment Received',
      'CANCEL': 'Invoice Cancelled',
      'OVERDUE': 'Invoice Overdue'
    };
    return actionMap[this.action] || this.action;
  };

  // Instance method to get invoice summary
  ARInvoiceHeaderAudit.prototype.getInvoiceSummary = function() {
    const data = this.recordData;
    if (!data) return null;

    return {
      invoiceNumber: data.invoiceNumber,
      totalAmount: data.totalAmount,
      netAmount: data.netAmount,
      taxAmount: data.taxAmount,
      status: data.status,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      customer: data.customer?.name,
      currency: data.currency?.code
    };
  };

  return ARInvoiceHeaderAudit;
};