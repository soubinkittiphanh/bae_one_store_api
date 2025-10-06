// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// INVOICE SETTLEMENT LINE MODEL (Cleaned for your fields only)
// models/InvoiceSettlementLine.js
module.exports = (sequelize, DataTypes) => {
    const InvoiceSettlementLine = sequelize.define('InvoiceSettlementLine', {

        amount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            comment: 'Settlement amount'
        },

        // Settlement Line Status
        status: {
            type: DataTypes.ENUM('active', 'cancelled'),
            defaultValue: 'active'
        }

    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        
        // Model validation - Only for your fields
        validate: {
            // Ensure amounts are positive
            amountValid() {
                if (this.amount <= 0) {
                    throw new Error('Settlement amount must be greater than zero');
                }
            }
        },

        // Hooks - Updated for your fields only
        hooks: {
            beforeSave: async (settlementLine) => {
                // Validate amount is positive
                if (settlementLine.amount <= 0) {
                    throw new Error('Settlement amount must be greater than zero');
                }

                logger.info('Settlement line validated before save:', {
                    id: settlementLine.id,
                    amount: settlementLine.amount,
                    status: settlementLine.status,
                    settlementId: settlementLine.settlementId
                });
            },

            afterCreate: async (settlementLine) => {
                logger.info(`Settlement line created: ${settlementLine.id} with amount ${settlementLine.amount}`);
                
                // Update settlement totals if needed
                if (settlementLine.settlementId) {
                    await settlementLine.updateSettlementTotals();
                }
            },

            afterUpdate: async (settlementLine) => {
                logger.info(`Settlement line updated: ${settlementLine.id} with amount ${settlementLine.amount}`);
                
                // Update settlement totals if needed
                if (settlementLine.settlementId) {
                    await settlementLine.updateSettlementTotals();
                }
            },

            afterDestroy: async (settlementLine) => {
                logger.info(`Settlement line deleted: ${settlementLine.id}`);
                
                // Update settlement totals if needed
                if (settlementLine.settlementId) {
                    await settlementLine.updateSettlementTotals();
                }
            }
        }
    });

    // Associations
    InvoiceSettlementLine.associate = (models) => {
        logger.info('Associating InvoiceSettlementLine with models');

        // Settlement Line belongs to Settlement Header
        InvoiceSettlementLine.belongsTo(models.apInvoiceSettlement, {
            foreignKey: 'settlementId',
            as: 'settlement'
        });
        InvoiceSettlementLine.belongsTo(models.Applicant, {
            foreignKey: 'applicantId',
            as: 'applicant'
        });
        InvoiceSettlementLine.belongsTo(models.Agency, {
            foreignKey: 'agencyId',
            as: 'agency'
        });

        // Settlement Line belongs to Invoice Line Item (if you have this model)
        if (models.invoiceLineItem) {
            InvoiceSettlementLine.belongsTo(models.invoiceLineItem, {
                foreignKey: 'invoiceLineItemId',
                as: 'invoiceLineItem'
            });
        }

        // Settlement Line created by user
        InvoiceSettlementLine.belongsTo(models.user, {
            foreignKey: 'createdBy',
            as: 'creator'
        });
    };

    // Instance Methods - Updated for your simplified model
    InvoiceSettlementLine.prototype.updateSettlementTotals = async function () {
        try {
            if (!this.settlementId) return;

            const settlement = await sequelize.models.apInvoiceSettlement.findByPk(this.settlementId);
            if (!settlement) return;

            // Calculate total allocated amount from all settlement lines
            const totalAllocated = await this.constructor.sum('amount', {
                where: {
                    settlementId: this.settlementId,
                    status: 'active'
                }
            });

            // Update settlement with allocated amount (if settlement model has these fields)
            const updateData = {};
            if (settlement.allocatedAmount !== undefined) {
                updateData.allocatedAmount = parseFloat(totalAllocated) || 0;
            }
            if (settlement.baseAmount !== undefined && settlement.unallocatedAmount !== undefined) {
                updateData.unallocatedAmount = parseFloat(settlement.baseAmount) - (parseFloat(totalAllocated) || 0);
            }

            if (Object.keys(updateData).length > 0) {
                await settlement.update(updateData);
            }

            logger.info(`Updated settlement ${this.settlementId} allocated amount to ${totalAllocated}`);
        } catch (error) {
            logger.error('Error updating settlement totals:', error);
        }
    };

    // Static Methods - Updated for your fields
    InvoiceSettlementLine.getBySettlement = async function (settlementId, options = {}) {
        return await this.findAll({
            where: {
                settlementId,
                status: 'active'
            },
            include: [
                {
                    model: sequelize.models.apInvoiceSettlement,
                    as: 'settlement'
                }
            ],
            order: [['createdAt', 'ASC']],
            ...options
        });
    };

    InvoiceSettlementLine.getTotalBySettlement = async function (settlementId) {
        const result = await this.findOne({
            attributes: [
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'lineCount']
            ],
            where: {
                settlementId,
                status: 'active'
            }
        });

        return {
            totalAmount: parseFloat(result?.dataValues?.totalAmount) || 0,
            lineCount: parseInt(result?.dataValues?.lineCount) || 0
        };
    };

    InvoiceSettlementLine.getActiveLines = async function (whereClause = {}) {
        return await this.findAll({
            where: {
                status: 'active',
                ...whereClause
            },
            include: [
                {
                    model: sequelize.models.apInvoiceSettlement,
                    as: 'settlement'
                }
            ],
            order: [['createdAt', 'ASC']]
        });
    };

    return InvoiceSettlementLine;
};