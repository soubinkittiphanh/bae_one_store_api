// ===============================================================
// AR INVOICE HEADER MODEL WITH AUDIT TRAIL
// ===============================================================
const logger = require("../../../api/logger");

// models/ARInvoiceHeader.js - ENHANCED WITH AUDIT
module.exports = (sequelize, DataTypes) => {
  const InvoiceHeader = sequelize.define('ARInvoiceHeader', {
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    invoiceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 1
    },
    totalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    taxAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    netAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    glPostingStatus: {
      type: DataTypes.ENUM('unposted', 'posted'),
      allowNull: false,
      defaultValue: 'unposted'
    },
    glPostingDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    glBatchId: {
      type: DataTypes.STRING(100),
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
        fields: ['invoiceNumber']
      },
      {
        fields: ['status']
      },
      {
        fields: ['invoiceDate']
      }
    ],
    hooks: {
      // BUSINESS LOGIC HOOKS
      beforeSave: (invoice) => {
        // Auto-calculate net amount
        if (invoice.totalAmount && invoice.taxAmount) {
          invoice.netAmount = parseFloat(invoice.totalAmount) - parseFloat(invoice.taxAmount);
        }

        // Auto-set due date if not provided (30 days from invoice date)
        if (!invoice.dueDate && invoice.invoiceDate) {
          const dueDate = new Date(invoice.invoiceDate);
          dueDate.setDate(dueDate.getDate() + 30);
          invoice.dueDate = dueDate;
        }

        // Check for overdue status
        if (invoice.dueDate && new Date() > new Date(invoice.dueDate) && 
            ['draft', 'sent'].includes(invoice.status)) {
          invoice.status = 'overdue';
        }
      },

      // AUDIT HOOKS - STORE DATA BEFORE CHANGES

      // Before creating - prepare for audit after creation
      beforeCreate: async (invoice, options) => {
        try {
          // Mark that this is a new record for afterCreate hook
          invoice._isNewRecord = true;
          invoice._auditUserId = options.userId || invoice.makerId || 1;
          invoice._auditReason = options.reason || 'AR Invoice created';
        } catch (error) {
          logger.error('Error in beforeCreate hook:', error);
        }
      },

      // Before updating - store current state to audit
      beforeUpdate: async (invoice, options) => {
        logger.info(`Insert the audit table data invoice ${JSON.stringify(invoice)}`)
        // logger.info(`Insert the audit table data  options ${JSON.stringify(options)}`)
        try {
          const ARInvoiceHeaderAudit = sequelize.models.ARInvoiceHeaderAudit;
          
          if (!ARInvoiceHeaderAudit) {
            logger.warn('ARInvoiceHeaderAudit model not found');
            return;
          }

          // Get the current complete record from database BEFORE update
          const ARInvoiceHeaderModel = sequelize.models.ARInvoiceHeader;
          const currentRecord = await ARInvoiceHeaderModel.findByPk(invoice.id, {
            include: [
              {
                model: sequelize.models.client,
                as: 'client',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: sequelize.models.currency,
                as: 'currency',
                attributes: ['id', 'name', 'code'],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'maker',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'updateUser',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              },
              {
                model: sequelize.models.ARInvoiceLine,
                as: 'invoiceLines',
                required: false
              }
            ]
          });

          if (currentRecord && typeof ARInvoiceHeaderAudit.createAuditRecord === 'function') {
            const userId = invoice.updateUserId || invoice.makerId || 1;
            
            // Determine action based on status change
            let action = 'UPDATE';
            let reason = options.reason || 'AR Invoice updated';
            
            if (invoice.changed('status')) {
              const newStatus = invoice.status;
              const oldStatus = invoice._previousDataValues?.status;
              
              switch (newStatus) {
                case 'sent':
                  action = 'SEND';
                  reason = options.reason || 'Invoice sent to customer';
                  break;
                case 'paid':
                  action = 'PAY';
                  reason = options.reason || 'Payment received';
                  break;
                case 'overdue':
                  action = 'OVERDUE';
                  reason = options.reason || 'Invoice marked as overdue';
                  break;
                case 'cancelled':
                  action = 'CANCEL';
                  reason = options.reason || 'Invoice cancelled';
                  break;
                default:
                  action = 'UPDATE';
                  reason = options.reason || `Invoice status changed from ${oldStatus} to ${newStatus}`;
              }
            }

            // Store current state BEFORE the update
            await ARInvoiceHeaderAudit.createAuditRecord(
              currentRecord.toJSON(),
              userId,
              action,
              reason
            );

            logger.info(`Audit record created for AR invoice ${invoice.id} before update - Action: ${action}`);
          }
        } catch (error) {
          logger.error('Failed to create audit record before update:', error);
          // Don't throw error - audit shouldn't break main functionality
        }
      },

      // After creating - store the new record state
      afterCreate: async (invoice, options) => {
        try {
          const ARInvoiceHeaderAudit = sequelize.models.ARInvoiceHeaderAudit;
          
          if (!ARInvoiceHeaderAudit || !invoice._isNewRecord) {
            return;
          }

          // Get the complete record with associations after creation
          const ARInvoiceHeaderModel = sequelize.models.ARInvoiceHeader;
          const completeRecord = await ARInvoiceHeaderModel.findByPk(invoice.id, {
            include: [
              {
                model: sequelize.models.client,
                as: 'client',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: sequelize.models.currency,
                as: 'currency',
                attributes: ['id', 'name', 'code'],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'maker',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              }
            ]
          });

          if (completeRecord && typeof ARInvoiceHeaderAudit.createAuditRecord === 'function') {
            await ARInvoiceHeaderAudit.createAuditRecord(
              completeRecord.toJSON(),
              invoice._auditUserId,
              'CREATE',
              invoice._auditReason
            );

            logger.info(`Audit record created for new AR invoice ${invoice.id}`);
          }
        } catch (error) {
          logger.error('Failed to create audit record after create:', error);
        }
      },

      // Before deleting - store the record being deleted
      beforeDestroy: async (invoice, options) => {
        try {
          const ARInvoiceHeaderAudit = sequelize.models.ARInvoiceHeaderAudit;
          
          if (!ARInvoiceHeaderAudit) {
            logger.warn('ARInvoiceHeaderAudit model not found');
            return;
          }

          // Get complete record with associations BEFORE deletion
          const ARInvoiceHeaderModel = sequelize.models.ARInvoiceHeader;
          const completeRecord = await ARInvoiceHeaderModel.findByPk(invoice.id, {
            include: [
              {
                model: sequelize.models.client,
                as: 'client',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: sequelize.models.currency,
                as: 'currency',
                attributes: ['id', 'name', 'code'],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'maker',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'updateUser',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              },
              {
                model: sequelize.models.arInvoiceLine,
                as: 'invoiceLines',
                required: false
              }
            ]
          });

          if (completeRecord && typeof ARInvoiceHeaderAudit.createAuditRecord === 'function') {
            const userId = options.userId || invoice.makerId || 1;
            const reason = options.reason || 'AR Invoice deleted';

            // Store complete record state BEFORE deletion
            await ARInvoiceHeaderAudit.createAuditRecord(
              completeRecord.toJSON(),
              userId,
              'DELETE',
              reason
            );

            logger.info(`Audit record created for AR invoice ${invoice.id} before deletion`);
          }
        } catch (error) {
          logger.error('Failed to create audit record before delete:', error);
        }
      }
    }
  });

  InvoiceHeader.associate = models => {
    logger.info(`Associating table ARInvoiceHeader with models`);
    
    InvoiceHeader.belongsTo(models.client, {
      foreignKey: 'clientId',
      as: 'client',
    });
    InvoiceHeader.belongsTo(models.Agency, {
      foreignKey: 'agencyId',
      as: 'agency',
    });
    
    InvoiceHeader.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });
    // ---- batch job for job fair
    InvoiceHeader.belongsTo(models.JobBatch, {
      foreignKey: 'jobBatchId',
      as: 'jobbatch',
    });
    
    InvoiceHeader.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });
    
    InvoiceHeader.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });
    
    InvoiceHeader.hasMany(models.arInvoiceLine, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceLines',
    });
    
    InvoiceHeader.hasMany(models.arReceiveHeaderV2, {
      foreignKey: 'invoiceHeaderId',
      as: 'receiveHeaders',
    });

    // Invoice Header -> Audit Trail (One-to-Many)
    InvoiceHeader.hasMany(models.arInvoiceHeaderAudit, {
      foreignKey: 'invoiceHeaderId',
      as: 'auditTrail',
    });
  };

  // Static methods
  InvoiceHeader.getNextInvoiceNumber = async function (prefix = 'AR-INV') {
        const currentYear = new Date().getFullYear();

        // Get the maximum ID from the database
        const maxInvoice = await this.findOne({
            attributes: [[sequelize.fn('MAX', sequelize.col('id')), 'maxId']],
            raw: true
        });

        const nextId = (maxInvoice.maxId || 0) + 1;

        // Format: INV-2025-00001
        const paddedNumber = String(nextId).padStart(5, '0');
        const invoiceNumber = `${prefix}-${currentYear}-${paddedNumber}`;

        logger.info(`Next invoice number: ${invoiceNumber}`);

        return {
            invoiceNumber,
            nextId: nextId,
            year: currentYear
        };
    };
  // Instance methods
  InvoiceHeader.prototype.getOutstandingAmount = function() {
    const totalPaid = this.receiveHeaders?.reduce((sum, receive) => {
      return sum + parseFloat(receive.totalReceivedAmount || 0);
    }, 0) || 0;
    
    return parseFloat(this.totalAmount) - totalPaid;
  };

  InvoiceHeader.prototype.isOverdue = function() {
    return new Date() > new Date(this.dueDate) && !['paid', 'cancelled'].includes(this.status);
  };

  InvoiceHeader.prototype.canBeSent = function() {
    return this.status === 'draft';
  };

  InvoiceHeader.prototype.canBePaid = function() {
    return ['sent', 'overdue'].includes(this.status);
  };

  InvoiceHeader.prototype.canBeCancelled = function() {
    return ['draft', 'sent', 'overdue'].includes(this.status);
  };

  // Enhanced methods with consistent audit pattern
  InvoiceHeader.prototype.sendToCustomer = async function(userId, reason = null) {
    if (!this.canBeSent()) {
      throw new Error('Invoice cannot be sent in current status');
    }
    
    const transaction = await sequelize.transaction();
    
    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'sent',
        updateUserId: userId
      }, { 
        transaction,
        userId: userId,
        reason: reason || 'Invoice sent to customer'
      });
      
      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  InvoiceHeader.prototype.markAsPaid = async function(userId, reason = null) {
    if (!this.canBePaid()) {
      throw new Error('Invoice cannot be marked as paid in current status');
    }
    
    const transaction = await sequelize.transaction();
    
    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'paid',
        updateUserId: userId
      }, { 
        transaction,
        userId: userId,
        reason: reason || 'Payment received'
      });
      
      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  InvoiceHeader.prototype.cancel = async function(userId, reason = null) {
    if (!this.canBeCancelled()) {
      throw new Error('Invoice cannot be cancelled in current status');
    }
    
    const transaction = await sequelize.transaction();
    
    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'cancelled',
        updateUserId: userId
      }, { 
        transaction,
        userId: userId,
        reason: reason || 'Invoice cancelled'
      });
      
      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  InvoiceHeader.prototype.markAsOverdue = async function(userId = null, reason = null) {
    const transaction = await sequelize.transaction();
    
    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'overdue',
        updateUserId: userId
      }, { 
        transaction,
        userId: userId || 1, // System user for automated overdue marking
        reason: reason || 'Invoice automatically marked as overdue'
      });
      
      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  // Get audit history for this invoice
  InvoiceHeader.prototype.getAuditHistory = async function(limit = 10) {
    const ARInvoiceHeaderAudit = sequelize.models.ARInvoiceHeaderAudit;
    if (!ARInvoiceHeaderAudit) {
      logger.warn('ARInvoiceHeaderAudit model not found');
      return [];
    }

    try {
      return await ARInvoiceHeaderAudit.findAll({
        where: { invoiceHeaderId: this.id },
        include: [
          {
            model: sequelize.models.user,
            as: 'user',
            attributes: ['id', 'cus_name', 'cus_email'],
            required: false
          }
        ],
        order: [['auditDate', 'DESC']],
        limit: limit
      });
    } catch (error) {
      logger.error('Error getting AR invoice audit history:', error);
      return [];
    }
  };

  // Class method to check for overdue invoices (for batch processing)
  InvoiceHeader.checkOverdueInvoices = async function() {
    try {
      const overdueInvoices = await this.findAll({
        where: {
          status: ['draft', 'sent'],
          dueDate: {
            [sequelize.Sequelize.Op.lt]: new Date()
          }
        }
      });

      for (const invoice of overdueInvoices) {
        await invoice.markAsOverdue(null, 'Automatically marked as overdue by system');
      }

      logger.info(`Marked ${overdueInvoices.length} invoices as overdue`);
      return overdueInvoices.length;
    } catch (error) {
      logger.error('Error checking overdue invoices:', error);
      throw error;
    }
  };

  return InvoiceHeader;
};