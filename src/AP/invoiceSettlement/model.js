// ===============================================================
// IMPROVED APSettlement MODEL WITH CONSISTENT AUDIT HOOKS
// ===============================================================
const logger = require("../../api/logger");

// models/APInvoiceSettlement.js - IMPROVED VERSION
module.exports = (sequelize, DataTypes) => {
  const APSettlement = sequelize.define('APInvoiceSettlement', {
    settlementDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    paymentAmount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false
    },
    baseAmount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'approved', 'completed', 'cancelled'),
      defaultValue: 'draft'
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 1.00
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT
    },
    note: {
      type: DataTypes.TEXT
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true,
    hooks: {
      // BUSINESS LOGIC HOOK
      beforeSave: (settlement) => {
        logger.info(`SYSTEM CHECK BEFORE SAVE `)
        // Auto-calculate base amount if same currency
        if (settlement.paymentCurrencyId === settlement.baseCurrencyId) {
          settlement.baseAmount = settlement.paymentAmount;
          // settlement.exchangeRate = 1.000000;
        } else if (settlement.paymentAmount && settlement.exchangeRate) {
          settlement.baseAmount = settlement.paymentAmount / settlement.exchangeRate;
        }

        // Set exchange date to settlement date if not provided
        if (!settlement.exchangeDate) {
          settlement.exchangeDate = settlement.settlementDate;
        }
      },

      // AUDIT HOOKS - STORE DATA BEFORE CHANGES

      // Before creating - prepare for audit after creation
      beforeCreate: async (settlement, options) => {
        try {
          // Mark that this is a new record for afterCreate hook
          settlement._isNewRecord = true;
          settlement._auditUserId = options.userId || settlement.makerId || 1;
          settlement._auditReason = options.reason || 'Settlement created';
        } catch (error) {
          logger.error('Error in beforeCreate hook:', error);
        }
      },

      // Before updating - store current state to audit
      beforeUpdate: async (settlement, options) => {

        // try {
        //   const APSettlementAudit = sequelize.models.APSettlementAudit;

        //   if (!APSettlementAudit) {
        //     logger.warn('APSettlementAudit model not found');
        //     return;
        //   }

        //   // Get the current complete record from database BEFORE update
        //   const APSettlementModel = sequelize.models.APInvoiceSettlement;
        //   const currentRecord = await APSettlementModel.findByPk(settlement.id, {
        //     include: [
        //       {
        //         model: sequelize.models.payment,
        //         as: 'paymentMethod',
        //         attributes: ['id', 'payment_code','payment_name'],
        //         required: false
        //       },
        //       {
        //         model: sequelize.models.bankAccount,
        //         as: 'bankAccount',
        //         attributes: ['id', 'accountName', 'accountNumber'],
        //         required: false
        //       },
        //       {
        //         model: sequelize.models.user,
        //         as: 'maker',
        //         attributes: ['id', 'cus_name', 'cus_email'],
        //         required: false
        //       },
        //       {
        //         model: sequelize.models.user,
        //         as: 'checker',
        //         attributes: ['id', 'cus_name', 'cus_email'],
        //         required: false
        //       },
        //       {
        //         model: sequelize.models.InvoiceSettlementLine,
        //         as: 'invoiceSettlements',
        //         required: false
        //       }
        //     ]
        //   });

        //   if (currentRecord && typeof APSettlementAudit.createAuditRecord === 'function') {
        //     const userId =  settlement.updateUserId || settlement.makerId || 1;

        //     // Determine action based on status change
        //     let action = 'UPDATE';
        //     let reason = options.reason || 'Settlement updated';

        //     if (settlement.changed('status')) {
        //       const newStatus = settlement.status;
        //       const oldStatus = settlement._previousDataValues?.status;

        //       switch (newStatus) {
        //         case 'pending':
        //           action = 'UPDATE';
        //           reason = options.reason || 'Settlement submitted for approval';
        //           break;
        //         case 'approved':
        //           action = 'APPROVE';
        //           reason = options.reason || 'Settlement approved';
        //           break;
        //         case 'completed':
        //           action = 'COMPLETE';
        //           reason = options.reason || 'Settlement completed';
        //           break;
        //         case 'cancelled':
        //           action = 'CANCEL';
        //           reason = options.reason || 'Settlement cancelled';
        //           break;
        //         default:
        //           action = 'UPDATE';
        //           reason = options.reason || `Settlement status changed from ${oldStatus} to ${newStatus}`;
        //       }
        //     }

        //     // Store current state BEFORE the update
        //     await APSettlementAudit.createAuditRecord(
        //       currentRecord.toJSON(),
        //       userId,
        //       action,
        //       reason
        //     );

        //     logger.info(`Audit record created for settlement ${settlement.id} before update - Action: ${action}`);
        //   }
        // } catch (error) {
        //   logger.error('Failed to create audit record before update:', error);
        //   // Don't throw error - audit shouldn't break main functionality
        // }
      },

      // After creating - store the new record state
      afterCreate: async (settlement, options) => {
        try {
          const APSettlementAudit = sequelize.models.APSettlementAudit;

          if (!APSettlementAudit || !settlement._isNewRecord) {
            return;
          }

          // Get the complete record with associations after creation
          const APSettlementModel = sequelize.models.APInvoiceSettlement;
          const completeRecord = await APSettlementModel.findByPk(settlement.id, {
            include: [
              {
                model: sequelize.models.payment,
                as: 'paymentMethod',
                attributes: ['id', 'name'],
                required: false
              },
              {
                model: sequelize.models.bankAccount,
                as: 'bankAccount',
                attributes: ['id', 'accountName', 'accountNumber'],
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

          if (completeRecord && typeof APSettlementAudit.createAuditRecord === 'function') {
            await APSettlementAudit.createAuditRecord(
              completeRecord.toJSON(),
              settlement._auditUserId,
              'CREATE',
              settlement._auditReason
            );

            logger.info(`Audit record created for new settlement ${settlement.id}`);
          }
        } catch (error) {
          logger.error('Failed to create audit record after create:', error);
        }
      },

      // Before deleting - store the record being deleted
      beforeDestroy: async (settlement, options) => {
        try {
          const APSettlementAudit = sequelize.models.APSettlementAudit;

          if (!APSettlementAudit) {
            logger.warn('APSettlementAudit model not found');
            return;
          }

          // Get complete record with associations BEFORE deletion
          const APSettlementModel = sequelize.models.APInvoiceSettlement;
          const completeRecord = await APSettlementModel.findByPk(settlement.id, {
            include: [
              {
                model: sequelize.models.payment,
                as: 'paymentMethod',
                attributes: ['id', 'name'],
                required: false
              },
              {
                model: sequelize.models.bankAccount,
                as: 'bankAccount',
                attributes: ['id', 'accountName', 'accountNumber'],
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
                as: 'checker',
                attributes: ['id', 'cus_name', 'cus_email'],
                required: false
              },
              {
                model: sequelize.models.apInvoiceSettlementLine,
                as: 'invoiceSettlements',
                required: false
              }
            ]
          });

          if (completeRecord && typeof APSettlementAudit.createAuditRecord === 'function') {
            const userId = options.userId || settlement.makerId || 1;
            const reason = options.reason || 'Settlement deleted';

            // Store complete record state BEFORE deletion
            await APSettlementAudit.createAuditRecord(
              completeRecord.toJSON(),
              userId,
              'DELETE',
              reason
            );

            logger.info(`Audit record created for settlement ${settlement.id} before deletion`);
          }
        } catch (error) {
          logger.error('Failed to create audit record before delete:', error);
        }
      }
    }
  });

  APSettlement.associate = models => {
    logger.info(`Associating table APInvoiceSettlement with models`);

    // Settlement belongs to payment method
    APSettlement.belongsTo(models.payment, {
      foreignKey: 'paymentMethodId',
      as: 'paymentMethod',
    });
    APSettlement.belongsTo(models.currency, {
      foreignKey: 'currencyId',
      as: 'currency',
    });

    // Settlement belongs to bank account
    APSettlement.belongsTo(models.bankAccount, {
      foreignKey: 'bankAccountId',
      as: 'bankAccount',
    });

    // Settlement created by user (maker)
    APSettlement.belongsTo(models.user, {
      foreignKey: 'makerId',
      as: 'maker',
    });

    // Settlement approved by user (checker)
    APSettlement.belongsTo(models.user, {
      foreignKey: 'checkerId',
      as: 'checker',
    });

    // Settlement has many settlement lines
    APSettlement.hasMany(models.apInvoiceSettlementLine, {
      foreignKey: 'settlementId',
      as: 'invoiceSettlements'
    });

    // Settlement -> Audit Trail (One-to-Many)
    APSettlement.hasMany(models.apSettlementAudit, {
      foreignKey: 'settlementId',
      as: 'auditTrail',
    });
  };

  // Instance methods
  APSettlement.prototype.getUnallocatedAmount = async function () {
    const InvoiceSettlementLine = sequelize.models.apInvoiceSettlementLine;
    const allocated = await InvoiceSettlementLine.sum('amount', {
      where: {
        settlementId: this.id,
        status: 'active'
      }
    });
    return parseFloat(this.baseAmount) - (parseFloat(allocated) || 0);
  };

  APSettlement.prototype.canBeModified = function () {
    return ['draft', 'pending'].includes(this.status);
  };

  APSettlement.prototype.canBeApproved = function () {
    return this.status === 'pending';
  };

  APSettlement.prototype.canBeCompleted = function () {
    return ['pending', 'approved'].includes(this.status);
  };

  // Enhanced methods with consistent audit pattern
  APSettlement.prototype.approve = async function (userId, reason = null) {
    if (!this.canBeApproved()) {
      throw new Error('Settlement cannot be approved in current status');
    }

    const transaction = await sequelize.transaction();

    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'approved',
        checkerId: userId
      }, {
        transaction,
        userId: userId,
        reason: reason || 'Settlement approved'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  APSettlement.prototype.complete = async function (userId, reason = null) {
    if (!this.canBeCompleted()) {
      throw new Error('Settlement cannot be completed in current status');
    }

    const transaction = await sequelize.transaction();

    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'completed'
      }, {
        transaction,
        userId: userId,
        reason: reason || 'Settlement completed'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  APSettlement.prototype.cancel = async function (userId, reason = null) {
    if (!this.canBeModified()) {
      throw new Error('Settlement cannot be cancelled in current status');
    }

    const transaction = await sequelize.transaction();

    try {
      // The beforeUpdate hook will automatically create audit record
      await this.update({
        status: 'cancelled'
      }, {
        transaction,
        userId: userId,
        reason: reason || 'Settlement cancelled'
      });

      await transaction.commit();
      return this;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  // Get audit history for this settlement
  APSettlement.prototype.getAuditHistory = async function (limit = 10) {
    const APSettlementAudit = sequelize.models.APSettlementAudit;
    if (!APSettlementAudit) {
      logger.warn('APSettlementAudit model not found');
      return [];
    }

    try {
      return await APSettlementAudit.findAll({
        where: { settlementId: this.id },
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
      logger.error('Error getting settlement audit history:', error);
      return [];
    }
  };

  return APSettlement;
};