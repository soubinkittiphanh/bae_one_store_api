// ===============================================================
// AP SETTLEMENT CONTROLLER - UPDATED FOR YOUR MODEL
// File: /AP/settlement/controller.js
// ===============================================================
const logger = require("../../api/logger");
const { apInvoiceSettlement, apInvoiceSettlementLine, apInvoice, user, vendor, sequelize } = require("../../models");
const InvoiceLineItem = require("../../models").invoiceLineItem;

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

            // Search by reference only (since settlementNumber doesn't exist in your model)
            if (search) {
                whereClause[sequelize.Sequelize.Op.or] = [
                    { reference: { [sequelize.Sequelize.Op.like]: `%${search}%` } }
                ];
            }

            const { count, rows } = await apInvoiceSettlement.findAndCountAll({
                where: whereClause,
                include: [
                    { model: user, as: 'maker', required: false },
                    { model: user, as: 'checker', required: false }
                ],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['settlementDate', 'DESC'], ['id', 'DESC']]
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
                    { model: user, as: 'maker', required: false },
                    { model: user, as: 'checker', required: false },
                    {
                        model: apInvoiceSettlementLine,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: InvoiceLineItem,
                                as: 'invoiceLineItem',
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
    // CREATE SETTLEMENT - UPDATED FOR YOUR MODEL
    // ===============================================================
    static async createSettlement(req, res) {
        const transaction = await sequelize.transaction();
        try {
            logger.info('=== CREATING NEW AP SETTLEMENT ===');
            logger.info('Request body received:', { body: req.body });

            const {
                settlementDate,
                paymentAmount,
                baseAmount,
                status = 'draft',
                reference,
                description,
                note,
                invoiceAllocations = []
            } = req.body;

            logger.info('Extracted data:', {
                settlementDate,
                paymentAmount,
                baseAmount,
                status,
                reference,
                description,
                note,
                invoiceAllocationsCount: invoiceAllocations.length,
                requestUserId: req.user?.id
            });

            // Validation - only for fields that exist in your model
            if (!settlementDate || !paymentAmount || !baseAmount) {
                logger.error('Validation failed - missing required fields:', {
                    settlementDate: !!settlementDate,
                    paymentAmount: !!paymentAmount,
                    baseAmount: !!baseAmount
                });

                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: settlementDate, paymentAmount, baseAmount'
                });
            }

            logger.info('Validation passed - creating main settlement record');

            // Create main settlement record - only using fields from your model
            const settlementData = {
                settlementDate,
                paymentAmount,
                baseAmount,
                status,
                reference,
                description,
                note
            };

            logger.info('Creating settlement with data:', { settlementData });

            const settlement = await apInvoiceSettlement.create(settlementData, { transaction });

            logger.info('Main settlement created successfully:', {
                id: settlement.id,
                settlementDate: settlement.settlementDate
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

                    // Map invoiceId to invoiceLineItemId
                    let invoiceLineItemId = null;
                    if (allocation.invoiceId) {
                        try {
                            const invoiceLineItem = await InvoiceLineItem.findOne({
                                where: { invoiceId: allocation.invoiceId },
                                order: [['id', 'ASC']]
                            });

                            if (invoiceLineItem) {
                                invoiceLineItemId = invoiceLineItem.id;
                                logger.info(`Mapped invoice ${allocation.invoiceId} to invoice line item ${invoiceLineItemId}`);
                            } else {
                                logger.warn(`No invoice line items found for invoice ${allocation.invoiceId}, creating default line item`);
                                
                                const invoice = await apInvoice.findByPk(allocation.invoiceId);
                                if (!invoice) {
                                    throw new Error(`Invoice ${allocation.invoiceId} not found`);
                                }

                                const defaultLineItem = await InvoiceLineItem.create({
                                    invoiceId: allocation.invoiceId,
                                    lineNumber: 1,
                                    description: 'Default settlement line',
                                    quantity: 1,
                                    unitPrice: invoice.totalAmount || allocation.amount,
                                    lineTotal: invoice.totalAmount || allocation.amount,
                                    status: 'active'
                                }, { transaction });

                                invoiceLineItemId = defaultLineItem.id;
                                logger.info(`Created default invoice line item ${invoiceLineItemId} for invoice ${allocation.invoiceId}`);
                            }
                        } catch (mappingError) {
                            logger.error('Error mapping invoice to invoice line item:', {
                                invoiceId: allocation.invoiceId,
                                error: mappingError.message
                            });
                            throw new Error(`Failed to map invoice ${allocation.invoiceId} to invoice line item: ${mappingError.message}`);
                        }
                    }

                    if (!invoiceLineItemId) {
                        throw new Error(`Could not resolve invoice line item for invoice ${allocation.invoiceId}`);
                    }

                    // Create allocation data - only using fields that exist in settlement line model
                    const allocationData = {
                        amount: allocation.amount,
                        status: 'active',
                        settlementId: settlement.id,
                        invoiceLineItemId: invoiceLineItemId
                    };

                    logger.info('Allocation data to create:', { 
                        allocationData,
                        originalInvoiceId: allocation.invoiceId,
                        mappedInvoiceLineItemId: invoiceLineItemId
                    });

                    try {
                        await apInvoiceSettlementLine.create(allocationData, { transaction });
                        logger.info(`Allocation ${i + 1} created successfully with invoice line item ${invoiceLineItemId}`);

                    } catch (allocationError) {
                        logger.error('Error creating allocation:', {
                            allocationIndex: i,
                            allocationData,
                            originalInvoiceId: allocation.invoiceId,
                            mappedInvoiceLineItemId: invoiceLineItemId,
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
                    { model: user, as: 'maker', required: false },
                    {
                        model: apInvoiceSettlementLine,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: InvoiceLineItem,
                                as: 'invoiceLineItem',
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
                    }
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
            logger.error(` ERROR CREATING AP SETTLEMENT ${error}`)
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
    // UPDATE SETTLEMENT - UPDATED FOR YOUR MODEL
    // ===============================================================
    static async updateSettlement(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const {
                settlementDate,
                paymentAmount,
                baseAmount,
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
            if (existingSettlement.canBeModified && !existingSettlement.canBeModified()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be modified in current status'
                });
            }

            // Update settlement - only using fields from your model
            await existingSettlement.update({
                settlementDate,
                paymentAmount,
                baseAmount,
                status,
                reference,
                description,
                note
            }, { transaction });

            // Update invoice allocations
            if (invoiceAllocations && invoiceAllocations.length > 0) {
                // Delete existing allocations
                await apInvoiceSettlementLine.destroy({
                    where: { settlementId: id },
                    transaction
                });

                // Create new allocations with mapping
                for (const allocation of invoiceAllocations) {
                    // Map invoiceId to invoiceLineItemId (same logic as create)
                    let invoiceLineItemId = null;
                    if (allocation.invoiceId) {
                        const invoiceLineItem = await InvoiceLineItem.findOne({
                            where: { invoiceId: allocation.invoiceId },
                            order: [['id', 'ASC']]
                        });

                        if (invoiceLineItem) {
                            invoiceLineItemId = invoiceLineItem.id;
                        } else {
                            // Create default if not exists
                            const invoice = await apInvoice.findByPk(allocation.invoiceId);
                            if (invoice) {
                                const defaultLineItem = await InvoiceLineItem.create({
                                    invoiceId: allocation.invoiceId,
                                    lineNumber: 1,
                                    description: 'Default settlement line',
                                    quantity: 1,
                                    unitPrice: invoice.totalAmount || allocation.amount,
                                    lineTotal: invoice.totalAmount || allocation.amount,
                                    status: 'active'
                                }, { transaction });
                                invoiceLineItemId = defaultLineItem.id;
                            }
                        }
                    }

                    if (invoiceLineItemId) {
                        const allocationData = {
                            amount: allocation.amount,
                            status: 'active',
                            settlementId: id,
                            invoiceLineItemId: invoiceLineItemId
                        };

                        await apInvoiceSettlementLine.create(allocationData, { transaction });
                    }
                }
            }

            await transaction.commit();

            // Fetch updated settlement
            const updatedSettlement = await apInvoiceSettlement.findByPk(id, {
                include: [
                    { model: user, as: 'maker', required: false },
                    { model: user, as: 'checker', required: false },
                    {
                        model: apInvoiceSettlementLine,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: InvoiceLineItem,
                                as: 'invoiceLineItem',
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
                    }
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
    // DELETE SETTLEMENT - UPDATED FOR YOUR MODEL
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
            if (settlement.canBeModified && !settlement.canBeModified()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be deleted in current status'
                });
            }

            // Delete related invoice settlement lines first
            await apInvoiceSettlementLine.destroy({
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
    // APPROVE SETTLEMENT - UPDATED FOR YOUR MODEL
    // ===============================================================
    static async approveSettlement(req, res) {
        try {
            const { id } = req.params;

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

            // Only update status since checkerId and approvedAt don't exist in your model
            await settlement.update({
                status: 'approved'
            });

            logger.info(`Settlement ${settlement.id} approved`);

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
    // COMPLETE SETTLEMENT - UPDATED FOR YOUR MODEL
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

            // Only update status since completedAt doesn't exist in your model
            await settlement.update({
                status: 'completed'
            });

            logger.info(`Settlement ${settlement.id} completed`);

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
    // GET OUTSTANDING INVOICES - UNCHANGED
    // ===============================================================
    static async getOutstandingInvoices(req, res) {
        try {
            const { vendorId, currencyId } = req.query;
            const whereClause = {
                status: ['approved', 'partially_paid', 'overdue','draft']
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
                    { model: vendor, as: 'vendor' }
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
}

module.exports = APSettlementController;