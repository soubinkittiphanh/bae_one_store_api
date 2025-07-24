// ===============================================================
// AP SETTLEMENT CONTROLLER
// File: /AP/settlement/controller.js (or wherever you want to place it)
// ===============================================================
const logger = require("../../api/logger");
const { apInvoiceSettlementLine, apInvoice, user, vendor, sequelize } = require("../../models");

class APSettlementController {

    // ===============================================================
    // GET ALL SETTLEMENTS
    // ===============================================================
    static async getAllSettlements(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                startDate,
                endDate,
                search
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = {};

            // Filter by status
            if (status) {
                whereClause.status = status;
            }

            // Filter by date range
            if (startDate && endDate) {
                whereClause.settlementDate = {
                    [sequelize.Sequelize.Op.between]: [startDate, endDate]
                };
            }

            // Search by settlement number or reference
            if (search) {
                whereClause[sequelize.Sequelize.Op.or] = [
                    { settlementNumber: { [sequelize.Sequelize.Op.like]: `%${search}%` } },
                    { reference: { [sequelize.Sequelize.Op.like]: `%${search}%` } }
                ];
            }

            const { count, rows } = await apInvoiceSettlementLine.findAndCountAll({
                where: whereClause,
                include: [
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' }
                ],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['settlementDate', 'DESC'], ['settlementNumber', 'DESC']]
            });

            const totalPages = Math.ceil(count / limit);

            res.status(200).json({
                success: true,
                message: 'Settlements fetched successfully',
                data: {
                    settlements: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalItems: count,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            logger.error('Error fetching settlements:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET SETTLEMENT BY ID
    // ===============================================================
    static async getSettlementById(req, res) {
        try {
            const { id } = req.params;

            const settlement = await apInvoiceSettlementLine.findByPk(id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' },
                    {
                        model: invoiceSettlement,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: apInvoice,
                                as: 'invoice',
                                include: [
                                    { model: vendor, as: 'vendor' }
                                ]
                            }
                        ]
                    }
                ]
            });

            if (!settlement) {
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Settlement fetched successfully',
                data: settlement
            });

        } catch (error) {
            logger.error('Error fetching settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // CREATE SETTLEMENT
    // ===============================================================
    static async createSettlement(req, res) {
        const transaction = await sequelize.transaction();

        try {
            logger.info('Creating new AP Settlement');

            const {
                settlementNumber,
                settlementDate,
                paymentAmount,
                baseAmount,
                exchangeRate = 1.000000,
                status = 'draft',
                reference,
                description,
                note,
                makerId,
                invoiceAllocations = []
            } = req.body;

            // Validation
            if (!settlementNumber || !settlementDate || !paymentAmount || !baseAmount) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: settlementNumber, settlementDate, paymentAmount, baseAmount'
                });
            }

            // Check if settlement number exists
            const existingSettlement = await apInvoiceSettlementLine.findOne({
                where: { settlementNumber }
            });

            if (existingSettlement) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement number already exists'
                });
            }

            // Create settlement
            const settlement = await apInvoiceSettlementLine.create({
                settlementNumber,
                settlementDate,
                paymentAmount,
                baseAmount,
                exchangeRate,
                status,
                reference,
                description,
                note,
                makerId: makerId || req.user?.id
            }, { transaction });

            // Create invoice allocations if provided
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                for (const allocation of invoiceAllocations) {
                    await invoiceSettlement.create({
                        invoiceId: allocation.invoiceId,
                        settlementId: settlement.id,
                        settledAmount: allocation.settledAmount,
                        exchangeRate: allocation.exchangeRate || exchangeRate,
                        settlementDate: settlementDate,
                        reference: allocation.reference,
                        note: allocation.note,
                        makerId: makerId || req.user?.id
                    }, { transaction });
                }
            }

            await transaction.commit();

            // Fetch created settlement with associations
            const createdSettlement = await apInvoiceSettlementLine.findByPk(settlement.id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: invoiceSettlement, as: 'invoiceSettlements' }
                ]
            });

            logger.info(`AP Settlement created successfully with ID: ${settlement.id}`);

            res.status(201).json({
                success: true,
                message: 'AP Settlement created successfully',
                data: createdSettlement
            });

        } catch (error) {
            await transaction.rollback();
            logger.error('Error creating AP Settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // UPDATE SETTLEMENT
    // ===============================================================
    static async updateSettlement(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const {
                settlementNumber,
                settlementDate,
                paymentAmount,
                baseAmount,
                exchangeRate,
                status,
                reference,
                description,
                note,
                invoiceAllocations = []
            } = req.body;

            logger.info(`Updating AP Settlement ID: ${id}`);

            // Find existing settlement
            const existingSettlement = await apInvoiceSettlementLine.findByPk(id);
            if (!existingSettlement) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            // Check if settlement can be modified
            if (!existingSettlement.canBeModified()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be modified in current status'
                });
            }

            // Update settlement
            await existingSettlement.update({
                settlementNumber,
                settlementDate,
                paymentAmount,
                baseAmount,
                exchangeRate,
                status,
                reference,
                description,
                note
            }, { transaction });

            // Update invoice allocations
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                // Delete existing allocations
                await invoiceSettlement.destroy({
                    where: { settlementId: id },
                    transaction
                });

                // Create new allocations
                for (const allocation of invoiceAllocations) {
                    await invoiceSettlement.create({
                        invoiceId: allocation.invoiceId,
                        settlementId: id,
                        settledAmount: allocation.settledAmount,
                        exchangeRate: allocation.exchangeRate || exchangeRate,
                        settlementDate: settlementDate,
                        reference: allocation.reference,
                        note: allocation.note,
                        makerId: req.user?.id
                    }, { transaction });
                }
            }

            await transaction.commit();

            // Fetch updated settlement
            const updatedSettlement = await apInvoiceSettlementLine.findByPk(id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' },
                    { model: invoiceSettlement, as: 'invoiceSettlements' }
                ]
            });

            logger.info(`AP Settlement updated successfully with ID: ${id}`);

            res.status(200).json({
                success: true,
                message: 'AP Settlement updated successfully',
                data: updatedSettlement
            });

        } catch (error) {
            await transaction.rollback();
            logger.error('Error updating AP Settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // DELETE SETTLEMENT
    // ===============================================================
    static async deleteSettlement(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;

            const settlement = await apInvoiceSettlementLine.findByPk(id);
            if (!settlement) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            // Check if settlement can be deleted
            if (!settlement.canBeModified()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be deleted in current status'
                });
            }

            // Delete related invoice settlements first
            await invoiceSettlement.destroy({
                where: { settlementId: id },
                transaction
            });

            // Delete settlement
            await settlement.destroy({ transaction });

            await transaction.commit();

            logger.info(`AP Settlement deleted successfully with ID: ${id}`);

            res.status(200).json({
                success: true,
                message: 'AP Settlement deleted successfully'
            });

        } catch (error) {
            await transaction.rollback();
            logger.error('Error deleting AP Settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // APPROVE SETTLEMENT
    // ===============================================================
    static async approveSettlement(req, res) {
        try {
            const { id } = req.params;
            const { checkerId, reason } = req.body;

            const settlement = await apInvoiceSettlementLine.findByPk(id);
            if (!settlement) {
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            if (!settlement.canBeApproved()) {
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be approved in current status'
                });
            }

            await settlement.update({
                status: 'approved',
                checkerId: checkerId || req.user?.id,
                approvedAt: new Date()
            });

            logger.info(`Settlement ${settlement.settlementNumber} approved by user ${checkerId}`);

            res.status(200).json({
                success: true,
                message: 'Settlement approved successfully',
                data: settlement
            });

        } catch (error) {
            logger.error('Error approving settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // COMPLETE SETTLEMENT
    // ===============================================================
    static async completeSettlement(req, res) {
        try {
            const { id } = req.params;

            const settlement = await apInvoiceSettlementLine.findByPk(id);
            if (!settlement) {
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            if (!settlement.canBeCompleted()) {
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be completed in current status'
                });
            }

            await settlement.update({
                status: 'completed',
                completedAt: new Date()
            });

            logger.info(`Settlement ${settlement.settlementNumber} completed`);

            res.status(200).json({
                success: true,
                message: 'Settlement completed successfully',
                data: settlement
            });

        } catch (error) {
            logger.error('Error completing settlement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET OUTSTANDING INVOICES
    // ===============================================================
    static async getOutstandingInvoices(req, res) {
        try {
            const { vendorId, currencyId } = req.query;
            const whereClause = {
                status: ['approved', 'partially_paid', 'overdue']
            };

            if (vendorId) {
                whereClause.vendorId = vendorId;
            }

            if (currencyId) {
                whereClause.currencyId = currencyId;
            }

            const invoices = await apInvoice.findAll({
                where: whereClause,
                attributes: [
                    'id', 'invoiceNumber', 'vendorInvoiceNumber', 'invoiceDate',
                    'dueDate', 'totalAmount', 'paidAmount', 'status',
                    [sequelize.literal('totalAmount - paidAmount'), 'outstandingAmount']
                ],
                include: [
                    { model: vendor, as: 'vendor', attributes: ['id', 'name', 'vendorCode'] }
                ],
                having: sequelize.literal('outstandingAmount > 0'),
                order: [['dueDate', 'ASC'], ['invoiceNumber', 'ASC']]
            });

            res.status(200).json({
                success: true,
                message: 'Outstanding invoices fetched successfully',
                data: invoices
            });

        } catch (error) {
            logger.error('Error fetching outstanding invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GENERATE SETTLEMENT NUMBER
    // ===============================================================
    static async generateSettlementNumber(req, res) {
        try {
            const year = new Date().getFullYear();
            const prefix = `PAY-${year}-`;

            const lastSettlement = await apInvoiceSettlementLine.findOne({
                where: {
                    settlementNumber: {
                        [sequelize.Sequelize.Op.like]: `${prefix}%`
                    }
                },
                order: [['settlementNumber', 'DESC']]
            });

            let nextNumber = 1;
            if (lastSettlement) {
                const lastNumber = parseInt(lastSettlement.settlementNumber.split('-').pop());
                nextNumber = lastNumber + 1;
            }

            const settlementNumber = `${prefix}${nextNumber.toString().padStart(3, '0')}`;

            res.status(200).json({
                success: true,
                message: 'Settlement number generated successfully',
                data: { settlementNumber }
            });

        } catch (error) {
            logger.error('Error generating settlement number:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = APSettlementController;