// ===============================================================
// AR RECEIVE HEADER MODEL WITH AUDIT TRAIL
// ===============================================================
const logger = require("../../../api/logger");

// models/ARReceiveHeader.js - ENHANCED WITH AUDIT
module.exports = (sequelize, DataTypes) => {
  const ReceiveHeader = sequelize.define('ARReceiveHeader', {
    receiptNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    receivedDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    totalReceivedAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 1
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'check', 'bank_transfer', 'credit_card', 'other'),
      allowNull: false,
      defaultValue: 'cash'
    },
    referenceNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Add status field for better tracking
    status: {
      type: DataTypes.ENUM('active', 'voided', 'cancelled'),
      allowNull: false,
      defaultValue: 'active'
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    indexes: [
      {
        fields: ['receiptNumber']
      },
      {
        fields: ['bookingDate']
      },
      {
        fields: ['invoiceHeaderId']
      },
      {
        fields: ['status']
      }
    ],
    hooks: {
      // BUSINESS LOGIC HOOKS
      beforeSave: (receipt) => {
        // Auto-set booking date to received date if not provided
        if (!receipt.bookingDate && receipt.receivedDate) {
          receipt.bookingDate = receipt.receivedDate;
        }

        // Ensure totalReceivedAmount is positive for active receipts
        if (receipt.status === 'active' && receipt.totalReceivedAmount < 0) {
          receipt.totalReceivedAmount = Math.abs(receipt.totalReceivedAmount);
        }

        // Auto-generate receipt number if not provided
        if (!receipt.receiptNumber && receipt.isNewRecord) {
          const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          receipt.receiptNumber = `RCP-${date}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }
      },

      // AUDIT HOOKS - STORE DATA BEFORE CHANGES

      // Before creating - prepare for audit after creation
      beforeCreate: async (receipt, options) => {
        try {
          // Mark that this is a new record for afterCreate hook
          receipt._isNewRecord = true;
          receipt._auditUserId = options.userId || receipt.inputterId || receipt.makerId || 1;
          receipt._auditReason = options.reason || 'Payment receipt created';
        } catch (error) {
          logger.error('Error in beforeCreate hook:', error);
        }
      },

      // Before updating - store current state to audit
      beforeUpdate: async (receipt, options) => {
        try {
          const ARReceiveHeaderAudit = sequelize.models.ARReceiveHeaderAudit;

          if (!ARReceiveHeaderAudit) {
            logger.warn('ARReceiveHeaderAudit model not found');
            return;
          }

          // Get the current complete record from database BEFORE update
          const ARReceiveHeaderModel = sequelize.models.ARReceiveHeader;
          const currentRecord = await ARReceiveHeaderModel.findByPk(receipt.id, {
            include: [
              {
                model: sequelize.models.arInvoiceHeader,
                as: 'invoiceHeader',
                attributes: ['id', 'invoiceNumber', 'totalAmount', 'status'],
                include: [
                  {
                    model: sequelize.models.customer,
                    as: 'customer',
                    attributes: ['id', 'name', 'email'],
                    required: false
                  }
                ],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'inputter',
                attributes: ['id', 'cus_name', 'cus_email'],
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
                model: sequelize.models.arReceiveLine,
                as: 'receiveLines',
                required: false
              }
            ]
          });

          if (currentRecord && typeof ARReceiveHeaderAudit.createAuditRecord === 'function') {
            const userId = options.userId || receipt.updateUserId || receipt.inputterId || receipt.makerId || 1;

            // Determine action based on status change
            let action = 'UPDATE';
            let reason = options.reason || 'Payment receipt updated';

            if (receipt.changed('status')) {
              const newStatus = receipt.status;
              const oldStatus = receipt._previousDataValues?.status;

              switch (newStatus) {
                case 'voided':
                  action = 'VOID';
                  reason = options.reason || 'Payment receipt voided';
                  break;
                case 'cancelled':
                  action = 'CANCEL';
                  reason = options.reason || 'Payment receipt cancelled';
                  break;
                case 'active':
                  if (oldStatus === 'voided' || oldStatus === 'cancelled') {
                    action = 'APPROVE';
                    reason = options.reason || 'Payment receipt reactivated';
                  } else {
                    action = 'UPDATE';
                  }
                  break;
                default:
                  action = 'UPDATE';
                  reason = options.reason || `Payment receipt status changed from ${oldStatus} to ${newStatus}`;
              }
            }

            // Store current state BEFORE the update
            await ARReceiveHeaderAudit.createAuditRecord(
              currentRecord.toJSON(),
              userId,
              action,
              reason
            );

            logger.info(`Audit record created for receive header ${receipt.id} before update - Action: ${action}`);
          }
        } catch (error) {
          logger.error('Failed to create audit record before update:', error);
          // Don't throw error - audit shouldn't break main functionality
        }
      },

      // After creating - store the new record state
      afterCreate: async (receipt, options) => {
        try {
          const ARReceiveHeaderAudit = sequelize.models.ARReceiveHeaderAudit;

          if (!ARReceiveHeaderAudit || !receipt._isNewRecord) {
            return;
          }

          // Get the complete record with associations after creation
          const ARReceiveHeaderModel = sequelize.models.ARReceiveHeader;
          const completeRecord = await ARReceiveHeaderModel.findByPk(receipt.id, {
            include: [
              {
                model: sequelize.models.arInvoiceHeader,
                as: 'invoiceHeader',
                attributes: ['id', 'invoiceNumber', 'totalAmount', 'status'],
                include: [
                  {
                    model: sequelize.models.customer,
                    as: 'customer',
                    attributes: ['id', 'name', 'email'],
                    required: false
                  }
                ],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'inputter',
                attributes: ['id', 'cus_name', 'cus_email'],
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

          if (completeRecord && typeof ARReceiveHeaderAudit.createAuditRecord === 'function') {
            await ARReceiveHeaderAudit.createAuditRecord(
              completeRecord.toJSON(),
              receipt._auditUserId,
              'CREATE',
              receipt._auditReason
            );

            logger.info(`Audit record created for new receive header ${receipt.id}`);
          }
        } catch (error) {
          logger.error('Failed to create audit record after create:', error);
        }
      },

      // Before deleting - store the record being deleted
      beforeDestroy: async (receipt, options) => {
        try {
          const ARReceiveHeaderAudit = sequelize.models.ARReceiveHeaderAudit;

          if (!ARReceiveHeaderAudit) {
            logger.warn('ARReceiveHeaderAudit model not found');
            return;
          }

          // Get complete record with associations BEFORE deletion
          const ARReceiveHeaderModel = sequelize.models.ARReceiveHeader;
          const completeRecord = await ARReceiveHeaderModel.findByPk(receipt.id, {
            include: [
              {
                model: sequelize.models.arInvoiceHeader,
                as: 'invoiceHeader',
                attributes: ['id', 'invoiceNumber', 'totalAmount', 'status'],
                include: [
                  {
                    model: sequelize.models.customer,
                    as: 'customer',
                    attributes: ['id', 'name', 'email'],
                    required: false
                  }
                ],
                required: false
              },
              {
                model: sequelize.models.user,
                as: 'inputter',
                attributes: ['id', 'cus_name', 'cus_email'],
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
                model: sequelize.models.arReceiveLine,
                as: 'receiveLines',
                required: false
              }
            ]
          });

          if (completeRecord && typeof ARReceiveHeaderAudit.createAuditRecord === 'function') {
            const userId = options.userId || receipt.inputterId || receipt.makerId || 1;
            const reason = options.reason || 'Payment receipt deleted';

            // Store complete record state BEFORE deletion
            await ARReceiveHeaderAudit.createAuditRecord(
              completeRecord.toJSON(),
              userId,
              'DELETE',
              reason
            );

            logger.info(`Audit record created for receive header ${receipt.id} before deletion`);
          }
        } catch (error) {
          logger.error('Failed to create audit record before delete:', error);
        }
      }
    }
  });

  ReceiveHeader.associate = models => {
    logger.info(`Associating table ARReceiveHeader with models`);

    ReceiveHeader.belongsTo(models.arInvoiceHeader, {
      foreignKey: 'invoiceHeaderId',
      as: 'invoiceHeader',
    });

    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'inputterId',
      as: 'inputter',
    });

    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });

    ReceiveHeader.belongsTo(models.user, {
      foreignKey: 'updateUserId',
      as: 'updateUser',
    });

    ReceiveHeader.hasMany(models.arReceiveLine, {
      foreignKey: 'receiveHeaderId',
      as: 'receiveLines',
    });

    // Receive Header -> Audit Trail (One-to-Many)
    ReceiveHeader.hasMany(models.arReceiveHeaderAudit, {
      foreignKey: 'receiveHeaderId',
      as: 'auditTrail',
    });
    ReceiveHeader.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });
    ReceiveHeader.belongsTo(models.payment, {
      foreignKey: 'paymentId',
      as: 'payment',
    });
  };

  ReceiveHeader.getNextReceiveNumber = async function (prefix = 'AR-RCP') {
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
  ReceiveHeader.prototype.isActive = function () {
    return this.status === 'active';
  };

  ReceiveHeader.prototype.isVoided = function () {
    return this.status === 'voided';
  };

  ReceiveHeader.prototype.isCancelled = function () {
    return this.status === 'cancelled';
  };

  ReceiveHeader.prototype.canBeModified = function () {
    return this.status === 'active';
  };

  ReceiveHeader.prototype.canBeVoided = function () {
    return this.status === 'active';
  };

  ReceiveHeader.prototype.canBeCancelled = function () {
    return ['active', 'voided'].includes(this.status);
  };

  ReceiveHeader.prototype.canBeReactivated = function () {
    return ['voided', 'cancelled'].includes(this.status);
  };

  // Enhanced methods with consistent audit pattern
  ReceiveHeader.prototype.voidReceipt = async function (userId, reason = null) {
    if (!this.canBeVoided()) {
      throw new Error('Payment receipt cannot be voided in current status');
    }

    const transaction = await sequelize.transaction();

    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'voided',
        updateUserId: userId
      }, {
        transaction,
        userId: userId,
        reason: reason || 'Payment receipt voided'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  ReceiveHeader.prototype.cancelReceipt = async function (userId, reason = null) {
    if (!this.canBeCancelled()) {
      throw new Error('Payment receipt cannot be cancelled in current status');
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
        reason: reason || 'Payment receipt cancelled'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  ReceiveHeader.prototype.reactivateReceipt = async function (userId, reason = null) {
    if (!this.canBeReactivated()) {
      throw new Error('Payment receipt cannot be reactivated in current status');
    }

    const transaction = await sequelize.transaction();

    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'active',
        updateUserId: userId
      }, {
        transaction,
        userId: userId,
        reason: reason || 'Payment receipt reactivated'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  // Get total amount allocated to invoice lines
  ReceiveHeader.prototype.getTotalAllocatedAmount = async function () {
    if (!this.receiveLines) {
      await this.reload({
        include: [{ association: 'receiveLines' }]
      });
    }

    return this.receiveLines?.reduce((sum, line) => {
      return sum + parseFloat(line.allocatedAmount || 0);
    }, 0) || 0;
  };

  // Get unallocated amount
  ReceiveHeader.prototype.getUnallocatedAmount = async function () {
    const totalAllocated = await this.getTotalAllocatedAmount();
    return parseFloat(this.totalReceivedAmount) - totalAllocated;
  };

  // Check if receipt is fully allocated
  ReceiveHeader.prototype.isFullyAllocated = async function () {
    const unallocated = await this.getUnallocatedAmount();
    return Math.abs(unallocated) < 0.01; // Allow for minor rounding differences
  };

  // Get audit history for this receipt
  ReceiveHeader.prototype.getAuditHistory = async function (limit = 10) {
    const ARReceiveHeaderAudit = sequelize.models.ARReceiveHeaderAudit;
    if (!ARReceiveHeaderAudit) {
      logger.warn('ARReceiveHeaderAudit model not found');
      return [];
    }

    try {
      return await ARReceiveHeaderAudit.findAll({
        where: { receiveHeaderId: this.id },
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
      logger.error('Error getting receive header audit history:', error);
      return [];
    }
  };

  // Class method to get receipts by payment method
  ReceiveHeader.getReceiptsByPaymentMethod = async function (paymentMethod, dateFrom = null, dateTo = null) {
    try {
      const whereClause = {
        paymentMethod: paymentMethod,
        status: 'active'
      };

      if (dateFrom || dateTo) {
        whereClause.receivedDate = {};
        if (dateFrom) {
          whereClause.receivedDate[sequelize.Sequelize.Op.gte] = dateFrom;
        }
        if (dateTo) {
          whereClause.receivedDate[sequelize.Sequelize.Op.lte] = dateTo;
        }
      }

      return await this.findAll({
        where: whereClause,
        include: [
          {
            model: sequelize.models.arInvoiceHeader,
            as: 'invoiceHeader',
            include: [
              {
                model: sequelize.models.customer,
                as: 'customer',
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        order: [['receivedDate', 'DESC']]
      });
    } catch (error) {
      logger.error('Error getting receipts by payment method:', error);
      throw error;
    }
  };

  // Class method to get daily receipt summary
  ReceiveHeader.getDailyReceiptSummary = async function (date) {
    try {
      const summary = await this.findAll({
        where: {
          receivedDate: date,
          status: 'active'
        },
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'receiptCount'],
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
        ],
        group: ['paymentMethod'],
        raw: true
      });

      return summary;
    } catch (error) {
      logger.error('Error getting daily receipt summary:', error);
      throw error;
    }
  };

  return ReceiveHeader;
};