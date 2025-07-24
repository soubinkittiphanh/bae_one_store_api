// ===============================================================
// DATABASE MODELS - SEQUELIZE
// ===============================================================
const logger = require("../../api/logger");

// INVOICE SETTLEMENT LINE MODEL (Simplified)
// models/InvoiceSettlementLine.js
module.exports = (sequelize, DataTypes) => {
    const InvoiceSettlementLine = sequelize.define('InvoiceSettlementLine', {
        // Settlement line number within the settlement
        lineNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },

        // Simple settlement fields
        unit: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 1,
            comment: 'Quantity being settled'
        },

        unitPrice: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            comment: 'Price per unit for settlement'
        },

        amount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            comment: 'Settlement amount'
        },

        total: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            comment: 'Total settlement for this line'
        },

        // Settlement Line Status
        status: {
            type: DataTypes.ENUM('active', 'cancelled'),
            defaultValue: 'active'
        },


    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        // Model validation
        validate: {
            // Ensure amounts are positive
            amountValid() {
                if (this.amount <= 0) {
                    throw new Error('Settlement amount must be greater than zero');
                }
            },

            unitValid() {
                if (this.unit <= 0) {
                    throw new Error('Unit quantity must be greater than zero');
                }
            },

            unitPriceValid() {
                if (this.unitPrice <= 0) {
                    throw new Error('Unit price must be greater than zero');
                }
            }
        },

        // Hooks
        hooks: {
            beforeSave: async (settlementLine) => {
                // Auto-calculate total from unit × unitPrice
                settlementLine.total = parseFloat(settlementLine.unit) * parseFloat(settlementLine.unitPrice);

                // If amount is not set, use total
                if (!settlementLine.amount) {
                    settlementLine.amount = settlementLine.total;
                }

                // Auto-generate line number if not provided
                if (!settlementLine.lineNumber) {
                    const maxLineNumber = await settlementLine.constructor.max('lineNumber', {
                        where: { settlementId: settlementLine.settlementId }
                    });
                    settlementLine.lineNumber = (maxLineNumber || 0) + 1;
                }

                // Validate against invoice line item total amount
                if (settlementLine.invoiceLineItemId) {
                    const invoiceLineItem = await sequelize.models.InvoiceLineItem.findByPk(settlementLine.invoiceLineItemId);
                    if (invoiceLineItem) {
                        // Check total settled amount doesn't exceed line item total
                        const totalSettled = await settlementLine.constructor.sum('amount', {
                            where: {
                                invoiceLineItemId: settlementLine.invoiceLineItemId,
                                status: 'active',
                                id: { [sequelize.Sequelize.Op.ne]: settlementLine.id || 0 }
                            }
                        });

                        const newTotal = (parseFloat(totalSettled) || 0) + parseFloat(settlementLine.amount);
                        if (newTotal > parseFloat(invoiceLineItem.lineTotal)) {
                            throw new Error('Total settlement amount exceeds invoice line item total');
                        }
                    }
                }
            },

            afterCreate: async (settlementLine) => {
                logger.info(`Settlement line created: ${settlementLine.id} for settlement ${settlementLine.settlementId}`);

                // Update invoice line item settlement status
                await settlementLine.updateInvoiceLineItemStatus();

                // Update parent settlement totals
                await settlementLine.updateSettlementTotals();
            },

            afterUpdate: async (settlementLine) => {
                logger.info(`Settlement line updated: ${settlementLine.id}`);

                // Update invoice line item settlement status
                await settlementLine.updateInvoiceLineItemStatus();

                // Update parent settlement totals
                await settlementLine.updateSettlementTotals();
            },

            afterDestroy: async (settlementLine) => {
                logger.info(`Settlement line deleted: ${settlementLine.id}`);

                // Update invoice line item settlement status
                await settlementLine.updateInvoiceLineItemStatus();

                // Update parent settlement totals
                await settlementLine.updateSettlementTotals();
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

        // Settlement Line belongs to Invoice Line Item
        InvoiceSettlementLine.belongsTo(models.invoiceLineItem, {
            foreignKey: 'invoiceLineItemId',
            as: 'invoiceLineItem'
        });

        // Settlement Line created by user
        InvoiceSettlementLine.belongsTo(models.user, {
            foreignKey: 'createdBy',
            as: 'creator'
        });
    };

    // Instance Methods
    InvoiceSettlementLine.prototype.updateInvoiceLineItemStatus = async function () {
        try {
            const invoiceLineItem = await invoiceLineItem.findByPk(this.invoiceLineItemId);
            if (!invoiceLineItem) return;

            // Calculate total settled amount for this line item
            const totalSettled = await this.constructor.sum('amount', {
                where: {
                    invoiceLineItemId: this.invoiceLineItemId,
                    status: 'active'
                }
            });

            const settledAmount = parseFloat(totalSettled) || 0;
            const lineTotal = parseFloat(invoiceLineItem.lineTotal);
            const outstandingAmount = lineTotal - settledAmount;

            // Determine settlement status
            let settlementStatus = 'unsettled';
            if (settledAmount >= lineTotal) {
                settlementStatus = 'settled';
            } else if (settledAmount > 0) {
                settlementStatus = 'partial';
            }

            // Update invoice line item
            await invoiceLineItem.update({
                settledAmount: settledAmount,
                outstandingAmount: Math.max(0, outstandingAmount),
                settlementStatus: settlementStatus,
                lastSettledAt: settledAmount > 0 ? new Date() : invoiceLineItem.lastSettledAt
            });

            logger.info(`Updated invoice line item ${this.invoiceLineItemId} settlement status to ${settlementStatus}`);
        } catch (error) {
            logger.error('Error updating invoice line item status:', error);
        }
    };

    InvoiceSettlementLine.prototype.updateSettlementTotals = async function () {
        try {
            const settlement = await sequelize.models.APInvoiceSettlement.findByPk(this.settlementId);
            if (!settlement) return;

            // Calculate total allocated amount from all settlement lines
            const totalAllocated = await this.constructor.sum('amount', {
                where: {
                    settlementId: this.settlementId,
                    status: 'active'
                }
            });

            // Update settlement with allocated amount
            await settlement.update({
                allocatedAmount: parseFloat(totalAllocated) || 0,
                unallocatedAmount: parseFloat(settlement.baseAmount) - (parseFloat(totalAllocated) || 0)
            });

            logger.info(`Updated settlement ${this.settlementId} allocated amount to ${totalAllocated}`);
        } catch (error) {
            logger.error('Error updating settlement totals:', error);
        }
    };

    // Static Methods
    InvoiceSettlementLine.getBySettlement = async function (settlementId, options = {}) {
        return await this.findAll({
            where: {
                settlementId,
                status: 'active'
            },
            include: [
                {
                    model: sequelize.models.invoiceLineItem,
                    as: 'invoiceLineItem',
                    include: [
                        {
                            model: sequelize.models.APInvoice,
                            as: 'invoice',
                            include: ['vendor']
                        }
                    ]
                }
            ],
            order: [['lineNumber', 'ASC']],
            ...options
        });
    };

    InvoiceSettlementLine.getByInvoiceLineItem = async function (invoiceLineItemId, options = {}) {
        return await this.findAll({
            where: {
                invoiceLineItemId,
                status: 'active'
            },
            include: [
                {
                    model: sequelize.models.APInvoiceSettlement,
                    as: 'settlement'
                }
            ],
            order: [['createdAt', 'DESC']],
            ...options
        });
    };

    InvoiceSettlementLine.getTotalBySettlement = async function (settlementId) {
        const result = await this.findOne({
            attributes: [
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalLines'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'lineCount']
            ],
            where: {
                settlementId,
                status: 'active'
            }
        });

        return {
            totalAmount: parseFloat(result.dataValues.totalAmount) || 0,
            totalLines: parseFloat(result.dataValues.totalLines) || 0,
            lineCount: parseInt(result.dataValues.lineCount) || 0
        };
    };

    return InvoiceSettlementLine;
};