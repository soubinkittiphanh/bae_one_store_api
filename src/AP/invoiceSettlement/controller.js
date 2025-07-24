// ===============================================================
// AP SETTLEMENT CONTROLLER
// File: /AP/settlement/controller.js (or wherever you want to place it)
// ===============================================================
const logger = require("../../api/logger");
const { apInvoiceSettlement,apInvoiceSettlementLine, apInvoice, user, vendor, sequelize } = require("../../models");

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

            const { count, rows } = await apInvoiceSettlement.findAndCountAll({
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

            const settlement = await apInvoiceSettlement.findByPk(id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' },
                    {
                        model: apInvoiceSettlementLine,
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
            logger.info('=== CREATING NEW AP SETTLEMENT ===');
            logger.info('Request body received:', { body: req.body });

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

            logger.info('Extracted data:', {
                settlementNumber,
                settlementDate,
                paymentAmount,
                baseAmount,
                exchangeRate,
                status,
                reference,
                description,
                note,
                makerId,
                invoiceAllocationsCount: invoiceAllocations.length,
                requestUserId: req.user?.id
            });

            // Validation
            if (!settlementNumber || !settlementDate || !paymentAmount || !baseAmount) {
                logger.error('Validation failed - missing required fields:', {
                    settlementNumber: !!settlementNumber,
                    settlementDate: !!settlementDate,
                    paymentAmount: !!paymentAmount,
                    baseAmount: !!baseAmount
                });

                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: settlementNumber, settlementDate, paymentAmount, baseAmount'
                });
            }

            logger.info('Validation passed - checking for existing settlement number');

            // Check if settlement number exists
            const existingSettlement = await apInvoiceSettlement.findOne({
                where: { settlementNumber }
            });

            if (existingSettlement) {
                logger.error('Settlement number already exists:', {
                    settlementNumber,
                    existingId: existingSettlement.id
                });

                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement number already exists'
                });
            }

            logger.info('Settlement number is unique - creating main settlement record');

            // Create main settlement record
            const settlementData = {
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
            };

            logger.info('Creating settlement with data:', { settlementData });

            const settlement = await apInvoiceSettlement.create(settlementData, { transaction });

            logger.info('Main settlement created successfully:', {
                id: settlement.id,
                settlementNumber: settlement.settlementNumber
            });

            // Create invoice allocations if provided
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                logger.info('=== CREATING INVOICE ALLOCATIONS ===');
                logger.info('Number of allocations to process:', { count: invoiceAllocations.length });

                for (let i = 0; i < invoiceAllocations.length; i++) {
                    const allocation = invoiceAllocations[i];

                    logger.info(`Processing allocation ${i + 1}/${invoiceAllocations.length}:`, {
                        allocationIndex: i,
                        allocation: allocation
                    });

                    // ⚠️ IMPORTANT: You're using the wrong model here!
                    // You should use a different model for invoice allocations, not apInvoiceSettlement
                    // The error occurs because apInvoiceSettlement requires settlementNumber, paymentAmount, baseAmount
                    // But allocations don't have these fields

                    const allocationData = {
                        invoiceId: allocation.invoiceId,
                        settlementId: settlement.id,
                        settledAmount: allocation.settledAmount,
                        exchangeRate: allocation.exchangeRate || exchangeRate,
                        settlementDate: settlementDate,
                        reference: allocation.reference,
                        note: allocation.note,
                        makerId: makerId || req.user?.id
                    };

                    logger.info('Allocation data to create:', { allocationData });

                    try {
                        // ❌ THIS IS THE PROBLEM - You should use invoiceSettlement model, not apInvoiceSettlement
                        // await apInvoiceSettlement.create(allocationData, { transaction });

                        // ✅ Use the correct model for invoice allocations:
                        await apInvoiceSettlementLine.create(allocationData, { transaction });

                        logger.info(`Allocation ${i + 1} created successfully`);

                    } catch (allocationError) {
                        logger.error('Error creating allocation:', {
                            allocationIndex: i,
                            allocationData,
                            error: {
                                message: allocationError.message,
                                stack: allocationError.stack,
                                sql: allocationError.sql,
                                parameters: allocationError.parameters
                            }
                        });
                        throw allocationError;
                    }
                }

                logger.info('All invoice allocations created successfully');
            } else {
                logger.info('No invoice allocations to process');
            }

            await transaction.commit();
            logger.info('Transaction committed successfully');

            // Fetch created settlement with associations
            logger.info('Fetching created settlement with associations');

            const createdSettlement = await apInvoiceSettlement.findByPk(settlement.id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: apInvoiceSettlementLine, as: 'invoiceSettlements' }
                ]
            });

            logger.info('Settlement fetched with associations:', {
                id: createdSettlement.id,
                invoiceSettlementsCount: createdSettlement.invoiceSettlements?.length || 0
            });

            logger.info(`=== AP SETTLEMENT CREATED SUCCESSFULLY: ${settlement.id} ===`);

            res.status(201).json({
                success: true,
                message: 'AP Settlement created successfully',
                data: createdSettlement
            });

        } catch (error) {
            await transaction.rollback();

            logger.error('=== ERROR CREATING AP SETTLEMENT ===', {
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    sql: error.sql,
                    parameters: error.parameters
                },
                requestBody: req.body,
                userId: req.user?.id
            });

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
            const existingSettlement = await apInvoiceSettlement.findByPk(id);
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
                await apInvoiceSettlement.destroy({
                    where: { settlementId: id },
                    transaction
                });

                // Create new allocations
                for (const allocation of invoiceAllocations) {
                    await apInvoiceSettlement.create({
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
            const updatedSettlement = await apInvoiceSettlement.findByPk(id, {
                include: [
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' },
                    { model: apInvoiceSettlementLine, as: 'invoiceSettlements' }
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

            const settlement = await apInvoiceSettlement.findByPk(id);
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
            await apInvoiceSettlement.destroy({
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

            const settlement = await apInvoiceSettlement.findByPk(id);
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

            const settlement = await apInvoiceSettlement.findByPk(id);
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
                    { model: vendor, as: 'vendor', }
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

            const lastSettlement = await apInvoiceSettlement.findOne({
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