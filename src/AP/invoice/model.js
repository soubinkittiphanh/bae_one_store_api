// ===============================================================
// DATABASE MODELS - SEQUELIZE WITH AUDIT TRAIL - COMPLETE FIXED VERSION
// ===============================================================
const logger = require("../../api/logger");

// AP INVOICE MODEL
// models/APInvoice.js
module.exports = (sequelize, DataTypes) => {
    const APInvoice = sequelize.define('APInvoice', {
        invoiceNumber: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        vendorInvoiceNumber: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        invoiceDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            // allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        totalAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        paidAmount: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        exchangeRate: {
            type: DataTypes.DECIMAL(20, 2),
            allowNull: false,
            defaultValue: 1.00
        },
        status: {
            type: DataTypes.ENUM('draft', 'pending', 'approved', 'partially_paid', 'paid', 'overdue', 'cancelled'),
            defaultValue: 'draft'
        },
        approvedAt: {
            type: DataTypes.DATE
        },
        note: {
            type: DataTypes.TEXT
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
        hooks: {
            // Existing hook for business logic
            beforeSave: (invoice) => {
                // Update status based on payment
                if (parseFloat(invoice.paidAmount) >= parseFloat(invoice.totalAmount)) {
                    invoice.status = 'paid';
                } else if (parseFloat(invoice.paidAmount) > 0) {
                    invoice.status = 'partially_paid';
                } else if (['paid', 'partially_paid', 'overdue'].includes(invoice.status)) {
                    invoice.status = 'approved';
                }

                // Check for overdue
                if (invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid') {
                    invoice.status = 'overdue';
                }
            },

            // AUDIT TRAIL HOOKS - FIXED WITH PROPER TRANSACTION HANDLING

            // Before any update, save current state to audit table
            beforeUpdate: async (invoice, options) => {
                try {
                    const APInvoiceModel = sequelize.models.APInvoice;
                    const AuditModel = sequelize.models.APInvoiceAudit;

                    if (!APInvoiceModel || !AuditModel || typeof AuditModel.createAuditRecord !== 'function') {
                        return;
                    }

                    // 🔧 FIX: Use the transaction from options
                    const currentRecord = await APInvoiceModel.findByPk(invoice.id, {
                        include: [
                            {
                                model: sequelize.models.vendor,
                                as: 'vendor',
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
                                as: 'checker',
                                attributes: ['id', 'cus_name', 'cus_email'],
                                required: false
                            },
                            {
                                model: sequelize.models.invoiceLineItem,
                                as: 'lineItems',
                                required: false
                            }
                        ],
                        transaction: options.transaction // 🔧 CRITICAL FIX
                    });

                    if (currentRecord) {
                        const userId = invoice.updateUserId || options.context?.userId || 1;
                        const reason = options.context?.reason || 'Record updated';

                        // 🔧 FIX: Pass transaction to audit creation
                        await AuditModel.createAuditRecord(
                            currentRecord.toJSON(),
                            userId,
                            'UPDATE',
                            reason,
                            options.transaction // 🔧 CRITICAL FIX
                        );

                        logger.info(`Audit record created for invoice ${invoice.id} update`);
                    }
                } catch (error) {
                    logger.error('Failed to create audit record before update:', error);
                    // Don't throw error - audit shouldn't break main functionality
                }
            },

            // After create, save the new record to audit table
            afterCreate: async (invoice, options) => {
                // try {
                //     const AuditModel = sequelize.models.APInvoiceAudit;

                //     if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') {
                //         return;
                //     }

                //     const APInvoiceModel = sequelize.models.APInvoice;
                //     if (!APInvoiceModel) {
                //         logger.warn('APInvoice model not found in sequelize.models');
                //         return;
                //     }

                //     // 🔧 FIX: Use the transaction from options
                //     const completeRecord = await APInvoiceModel.findByPk(invoice.id, {
                //         include: [
                //             {
                //                 model: sequelize.models.vendor,
                //                 as: 'vendor',
                //                 attributes: ['id', 'name'],
                //                 required: false
                //             },
                //             {
                //                 model: sequelize.models.currency,
                //                 as: 'currency',
                //                 attributes: ['id', 'name', 'code'],
                //                 required: false
                //             },
                //             {
                //                 model: sequelize.models.user,
                //                 as: 'maker',
                //                 attributes: ['id', 'cus_name', 'cus_email'],
                //                 required: false
                //             }
                //         ],
                //         transaction: options.transaction // 🔧 CRITICAL FIX
                //     });

                //     // 🔧 FIX: Pass transaction to audit creation
                //     await AuditModel.createAuditRecord(
                //         completeRecord ? completeRecord.toJSON() : invoice.toJSON(),
                //         invoice.makerId,
                //         'CREATE',
                //         'Invoice created',
                //         options.transaction // 🔧 CRITICAL FIX
                //     );

                //     logger.info(`Audit record created for new invoice ${invoice.id}`);
                // } catch (error) {
                //     logger.error('Failed to create audit record after create:', error);
                //     // Don't throw error - audit shouldn't break main functionality
                // }
            },

            // Before delete, save the record being deleted
            beforeDestroy: async (invoice, options) => {
                try {
                    const AuditModel = sequelize.models.APInvoiceAudit;

                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') {
                        return;
                    }

                    const APInvoiceModel = sequelize.models.APInvoice;
                    if (!APInvoiceModel) {
                        logger.warn('APInvoice model not found in sequelize.models');
                        return;
                    }

                    const userId = options.context?.userId || 1;
                    const reason = options.context?.reason || 'Invoice deleted';

                    // 🔧 FIX: Use the transaction from options
                    const completeRecord = await APInvoiceModel.findByPk(invoice.id, {
                        include: [
                            {
                                model: sequelize.models.vendor,
                                as: 'vendor',
                                attributes: ['id', 'name'],
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
                                as: 'checker',
                                attributes: ['id', 'cus_name', 'cus_email'],
                                required: false
                            }
                        ],
                        transaction: options.transaction // 🔧 CRITICAL FIX
                    });

                    // 🔧 FIX: Pass transaction to audit creation
                    await AuditModel.createAuditRecord(
                        completeRecord ? completeRecord.toJSON() : invoice.toJSON(),
                        userId,
                        'DELETE',
                        reason,
                        options.transaction // 🔧 CRITICAL FIX
                    );

                    logger.info(`Audit record created for invoice ${invoice.id} deletion`);
                } catch (error) {
                    logger.error('Failed to create audit record before delete:', error);
                    // Don't throw error - audit shouldn't break main functionality
                }
            }
        }
    });

    APInvoice.associate = models => {
        logger.info(`Associating table APInvoice with models`);

        // Invoice belongs to vendor
        APInvoice.belongsTo(models.vendor, {
            foreignKey: 'vendorId',
            as: 'vendor',
        });
        
        // Invoice belongs to agency
        APInvoice.belongsTo(models.Agency, {
            foreignKey: 'agencyId',
            as: 'agency',
        });

        // Invoice belongs to currency
        APInvoice.belongsTo(models.currency, {
            foreignKey: 'currencyId',
            as: 'currency',
        });

        // Invoice created by user (maker)
        APInvoice.belongsTo(models.user, {
            foreignKey: 'makerId',
            as: 'maker',
        });

        // Invoice approved by user (checker)
        APInvoice.belongsTo(models.user, {
            foreignKey: 'checkerId',
            as: 'checker',
        });

        // Invoice -> InvoiceLineItem (One-to-Many)
        APInvoice.hasMany(models.invoiceLineItem, {
            foreignKey: 'invoiceId',
            as: 'lineItems',
        });

        // Invoice -> PaymentSettlement (One-to-Many)
        APInvoice.hasMany(models.apInvoiceSettlement, {
            foreignKey: 'invoiceId',
            as: 'settlements',
        });

        // Invoice -> Audit Trail (One-to-Many)
        APInvoice.hasMany(models.apInvoiceAudit, {
            foreignKey: 'invoiceId',
            as: 'auditTrail',
        });
    };

    APInvoice.getNextInvoiceNumber = async function (prefix = 'AP-INV') {
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
    APInvoice.prototype.getOutstandingAmount = function () {
        return parseFloat(this.totalAmount) - parseFloat(this.paidAmount);
    };

    APInvoice.prototype.isOverdue = function () {
        return new Date() > this.dueDate && this.status !== 'paid';
    };

    APInvoice.prototype.canBePaid = function () {
        return ['approved', 'partially_paid', 'overdue'].includes(this.status);
    };

    // New method to get audit history
    APInvoice.prototype.getAuditHistory = async function (limit = 10) {
        const AuditModel = sequelize.models.APInvoiceAudit;
        if (!AuditModel) {
            logger.warn('APInvoiceAudit model not found in sequelize.models');
            return [];
        }

        try {
            return await AuditModel.findAll({
                where: { invoiceId: this.id },
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
            logger.error('Error getting audit history:', error);
            return [];
        }
    };

    // 🔧 FIXED: Method to approve invoice with audit trail
    APInvoice.prototype.approve = async function (userId, comments = null) {
        const transaction = await sequelize.transaction();

        try {
            // Update invoice status
            await this.update({
                status: 'approved',
                checkerId: userId,
                approvedAt: new Date()
            }, {
                transaction,
                context: {
                    userId: userId,
                    reason: 'Invoice approved',
                    comments: comments
                }
            });

            // Create specific approval audit record
            const AuditModel = sequelize.models.APInvoiceAudit;
            if (AuditModel && typeof AuditModel.createAuditRecord === 'function') {
                // 🔧 FIX: Pass transaction to createAuditRecord
                await AuditModel.createAuditRecord(
                    this.toJSON(),
                    userId,
                    'APPROVE',
                    comments || 'Invoice approved',
                    transaction // 🔧 CRITICAL FIX
                );
            }

            await transaction.commit();
            logger.info(`Invoice ${this.id} approved by user ${userId}`);

            return this;
        } catch (error) {
            await transaction.rollback();
            logger.error(`Failed to approve invoice ${this.id}:`, error);
            throw error;
        }
    };

    // 🔧 FIXED: Method to reject invoice with audit trail
    APInvoice.prototype.reject = async function (userId, reason) {
        const transaction = await sequelize.transaction();

        try {
            // Update invoice status
            await this.update({
                status: 'draft', // or 'rejected' if you have that status
                checkerId: userId
            }, {
                transaction,
                context: {
                    userId: userId,
                    reason: reason || 'Invoice rejected'
                }
            });

            // Create specific rejection audit record
            const AuditModel = sequelize.models.APInvoiceAudit;
            if (AuditModel && typeof AuditModel.createAuditRecord === 'function') {
                // 🔧 FIX: Pass transaction to createAuditRecord
                await AuditModel.createAuditRecord(
                    this.toJSON(),
                    userId,
                    'REJECT',
                    reason || 'Invoice rejected',
                    transaction // 🔧 CRITICAL FIX
                );
            }

            await transaction.commit();
            logger.info(`Invoice ${this.id} rejected by user ${userId}`);

            return this;
        } catch (error) {
            await transaction.rollback();
            logger.error(`Failed to reject invoice ${this.id}:`, error);
            throw error;
        }
    };

    return APInvoice;
};