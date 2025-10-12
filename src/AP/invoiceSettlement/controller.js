// ===============================================================
// AP SETTLEMENT CONTROLLER - UPDATED FOR YOUR MODEL
// File: /AP/settlement/controller.js
// ===============================================================
const logger = require("../../api/logger");
const { apInvoiceSettlement, currency, apSettlementAudit, apInvoiceSettlementLine, apInvoice, user, vendor, sequelize, Applicant, Agency } = require("../../models");
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
                    { model: currency, as: 'currency', required: false },
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
                            },
                            {
                                model: Agency,
                                as: 'agency',
                            },
                            {
                                model: Applicant,
                                as: 'applicant',
                            }
                        ]
                    }
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
                    { model: currency, as: 'currency', required: false },
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
                            },
                            {
                                model: Agency,
                                as: 'agency',
                            },
                            {
                                model: Applicant,
                                as: 'applicant',
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
    // GET SETTLEMENT AUDIT BY SETTLEMENT ID
    // ===============================================================
    static async getSettlementAuditBySettlementId(req, res) {
        try {
            const { id } = req.params;

            const settlementAudit = await apSettlementAudit.findAll({
                where: { settlementId: id },
                order: [['id', 'DESC']],
            });

            if (!settlementAudit) {
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Settlement fetched successfully',
                data: settlementAudit
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
                exchangeRate,
                paymentAmount,
                baseAmount,
                currencyId,
                paymentMethodId,
                bankAccountId,
                status = 'draft',
                reference,
                description,
                note,
                makerId,
                checkerId,
                approvalNote,
                reason,
                settlementLines = [],
                invoiceAllocations = [] // Keep for backward compatibility
            } = req.body;

            // Use settlementLines if provided, otherwise fall back to invoiceAllocations
            const lines = settlementLines.length > 0 ? settlementLines : invoiceAllocations;

            logger.info('Extracted data:', {
                settlementDate,
                exchangeRate,
                paymentAmount,
                baseAmount,
                currencyId,
                paymentMethodId,
                bankAccountId,
                status,
                reference,
                description,
                note,
                makerId,
                settlementLinesCount: lines.length,
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

            // Create main settlement record
            const settlementData = {
                settlementDate,
                exchangeRate,
                paymentAmount,
                baseAmount,
                currencyId,
                paymentMethodId,
                bankAccountId,
                status,
                reference,
                description,
                note,
                makerId: makerId || req.user?.id,
                checkerId
            };

            logger.info('Creating settlement with data:', { settlementData });

            const settlement = await apInvoiceSettlement.create(settlementData, { transaction });

            logger.info('Main settlement created successfully:', {
                id: settlement.id,
                settlementDate: settlement.settlementDate
            });


            // Create settlement lines if provided
            if (lines && lines.length > 0) {
                logger.info('=== CREATING SETTLEMENT LINES ===');
                logger.info('Number of lines to process:', { count: lines.length });

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    logger.info(`Processing line ${i + 1}/${lines.length}:`, {
                        lineIndex: i,
                        line: line
                    });

                    let invoiceLineItemId = null;

                    // Handle invoice-linked lines
                    if (line.invoiceId) {
                        try {
                            const invoiceLineItem = await InvoiceLineItem.findOne({
                                where: { invoiceId: line.invoiceId },
                                order: [['id', 'ASC']]
                            });

                            if (invoiceLineItem) {
                                invoiceLineItemId = invoiceLineItem.id;
                                logger.info(`Mapped invoice ${line.invoiceId} to invoice line item ${invoiceLineItemId}`);
                            } else {
                                logger.warn(`No invoice line items found for invoice ${line.invoiceId}, creating default line item`);

                                const invoice = await apInvoice.findByPk(line.invoiceId);
                                if (!invoice) {
                                    throw new Error(`Invoice ${line.invoiceId} not found`);
                                }

                                const defaultLineItem = await InvoiceLineItem.create({
                                    invoiceId: line.invoiceId,
                                    type: line.type,
                                    DRglAccountId: line.DRglAccountId,
                                    CRglAccountId: line.CRglAccountId,
                                    txnId: line.txnId,
                                    lineNumber: 1,
                                    description: line.description || 'Default settlement line',
                                    quantity: 1,
                                    unitPrice: invoice.totalAmount || line.amount,
                                    lineTotal: invoice.totalAmount || line.amount,
                                    status: 'active'
                                }, { transaction });

                                invoiceLineItemId = defaultLineItem.id;
                                logger.info(`Created default invoice line item ${invoiceLineItemId} for invoice ${line.invoiceId}`);
                            }
                        } catch (mappingError) {
                            logger.error('Error mapping invoice to invoice line item:', {
                                invoiceId: line.invoiceId,
                                error: mappingError.message
                            });
                            throw new Error(`Failed to map invoice ${line.invoiceId} to invoice line item: ${mappingError.message}`);
                        }
                    }
                    // Handle manual lines (type === 'manual' and no invoiceId)
                    else if (line.type === 'manual') {
                        logger.info(`Processing manual settlement line without invoice`);
                        invoiceLineItemId = null; // Manual lines don't need an invoice line item
                    }

                    // Validate agency if provided
                    if (line.agencyId) {
                        const agency = await Agency.findByPk(line.agencyId);
                        if (!agency) {
                            throw new Error(`Invalid agency ID: ${line.agencyId}`);
                        }
                        logger.info(`Validated agency ID: ${line.agencyId}`);
                    }

                    // Validate applicant if provided
                    if (line.applicantId) {
                        const applicant = await Applicant.findByPk(line.applicantId);
                        if (!applicant) {
                            throw new Error(`Invalid applicant ID: ${line.applicantId}`);
                        }
                        logger.info(`Validated applicant ID: ${line.applicantId}`);
                    }

                    // Validate amount
                    if (!line.amount || line.amount <= 0) {
                        throw new Error(`Invalid amount for line ${i + 1}: ${line.amount}`);
                    }

                    // Create settlement line data
                    const lineData = {
                        amount: line.amount,
                        type: line.type,
                        DRglAccountId: line.DRglAccountId,
                        CRglAccountId: line.CRglAccountId,
                        txnId: line.txnId,
                        status: 'active',
                        settlementId: settlement.id,
                        invoiceLineItemId: invoiceLineItemId,
                        agencyId: line.agencyId || null,
                        description: line.description || null,
                        applicantId: line.applicantId || null
                    };

                    logger.info('Settlement line data to create:', {
                        lineData,
                        lineType: line.type,
                        originalInvoiceId: line.invoiceId,
                        mappedInvoiceLineItemId: invoiceLineItemId
                    });

                    try {
                        await apInvoiceSettlementLine.create(lineData, { transaction });
                        logger.info(`Settlement line ${i + 1} created successfully`);

                    } catch (lineError) {
                        logger.error('Error creating settlement line:', {
                            lineIndex: i,
                            lineData,
                            lineType: line.type,
                            originalInvoiceId: line.invoiceId,
                            mappedInvoiceLineItemId: invoiceLineItemId,
                            error: {
                                message: lineError.message,
                                stack: lineError.stack,
                                sql: lineError.sql,
                                parameters: lineError.parameters
                            }
                        });
                        throw lineError;
                    }
                }

                logger.info('All settlement lines created successfully');
            } else {
                logger.info('No settlement lines to process');
            }

            await transaction.commit();
            logger.info('Transaction committed successfully');

            // Fetch created settlement with associations
            logger.info('Fetching created settlement with associations');

            const createdSettlement = await apInvoiceSettlement.findByPk(settlement.id, {
                include: [
                    { model: user, as: 'maker', required: false },
                    { model: user, as: 'checker', required: false },
                    { model: currency, as: 'currency', required: false },
                    {
                        model: apInvoiceSettlementLine,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: InvoiceLineItem,
                                as: 'invoiceLineItem',
                                required: false,
                                include: [
                                    {
                                        model: apInvoice,
                                        as: 'invoice',
                                        include: [
                                            { model: vendor, as: 'vendor' }
                                        ]
                                    }
                                ]
                            },
                            {
                                model: Agency,
                                as: 'agency',
                                required: false
                            },
                            {
                                model: Applicant,
                                as: 'applicant',
                                required: false
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
    static async updateSettlement(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const {
                settlementDate,
                exchangeRate,
                paymentAmount,
                baseAmount,
                status,
                reference,
                description,
                note,
                currencyId,
                paymentMethodId,
                bankAccountId,
                makerId,
                checkerId,
                approvalNote,
                reason = 'UPDATE ',
                settlementLines = [],
                invoiceAllocations = [] // Keep for backward compatibility
            } = req.body;

            // Use settlementLines if provided, otherwise fall back to invoiceAllocations
            const lines = settlementLines.length > 0 ? settlementLines : invoiceAllocations;

            logger.info(`=== UPDATING AP SETTLEMENT ID: ${id} ===`);
            logger.info('Update data received:', {
                settlementDate,
                exchangeRate,
                paymentAmount,
                baseAmount,
                currencyId,
                paymentMethodId,
                bankAccountId,
                status,
                settlementLinesCount: lines.length
            });

            // Find existing settlement
            const existingSettlement = await apInvoiceSettlement.findByPk(id);
            if (!existingSettlement) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Settlement not found'
                });
            }

            // Store old values for audit
            const oldValues = {
                settlementDate: existingSettlement.settlementDate,
                exchangeRate: existingSettlement.exchangeRate,
                paymentAmount: existingSettlement.paymentAmount,
                baseAmount: existingSettlement.baseAmount,
                status: existingSettlement.status,
                currencyId: existingSettlement.currencyId,
                paymentMethodId: existingSettlement.paymentMethodId,
                bankAccountId: existingSettlement.bankAccountId
            };

            // Check if settlement can be modified
            if (existingSettlement.canBeModified && !existingSettlement.canBeModified()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Settlement cannot be modified in current status'
                });
            }

            // Update settlement
            const updateData = {
                settlementDate,
                exchangeRate,
                paymentAmount,
                baseAmount,
                status,
                reference,
                description,
                currencyId,
                paymentMethodId,
                bankAccountId,
                makerId,
                checkerId,
                note
            };

            const updatedSettlementData = await existingSettlement.update(updateData, { transaction });
            logger.info(`Settlement header updated successfully ${JSON.stringify(updatedSettlementData)}`);

            // Create audit record if reason is provided
            // Create audit record if reason is provided
            if (reason) {
                await apSettlementAudit.create({
                    settlementId: id,
                    userId: makerId || req.user?.id,
                    action: 'update',
                    reason: reason,
                    oldValue: JSON.stringify(oldValues),
                    newValue: JSON.stringify(updateData),
                    recordData: JSON.stringify({
                        settlementId: id,
                        action: 'update',
                        timestamp: new Date(),
                        user: makerId || req.user?.id,
                        changes: {
                            before: oldValues,
                            after: updateData
                        }
                    })
                }, { transaction });
                logger.info('Settlement audit record created for update');
            }


            // Update settlement lines
            if (lines && lines.length > 0) {
                logger.info('=== UPDATING SETTLEMENT LINES ===');

                // Delete existing lines
                await apInvoiceSettlementLine.destroy({
                    where: { settlementId: id },
                    transaction
                });
                logger.info('Existing settlement lines deleted');

                // Create new lines
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    logger.info(`Processing line ${i + 1}/${lines.length}:`, { line });

                    let invoiceLineItemId = null;

                    // Handle invoice-linked lines
                    if (line.invoiceId) {
                        const invoiceLineItem = await InvoiceLineItem.findOne({
                            where: { invoiceId: line.invoiceId },
                            order: [['id', 'ASC']]
                        });

                        if (invoiceLineItem) {
                            invoiceLineItemId = invoiceLineItem.id;
                            logger.info(`Mapped invoice ${line.invoiceId} to invoice line item ${invoiceLineItemId}`);
                        } else {
                            // Create default if not exists
                            const invoice = await apInvoice.findByPk(line.invoiceId);
                            if (invoice) {
                                const defaultLineItem = await InvoiceLineItem.create({
                                    invoiceId: line.invoiceId,
                                    lineNumber: 1,
                                    description: line.description || 'Default settlement line',
                                    quantity: 1,
                                    unitPrice: invoice.totalAmount || line.amount,
                                    lineTotal: invoice.totalAmount || line.amount,
                                    status: 'active',
                                    type: line.type,
                                    DRglAccountId: line.DRglAccountId,
                                    CRglAccountId: line.CRglAccountId,
                                    txnId: line.txnId
                                }, { transaction });
                                invoiceLineItemId = defaultLineItem.id;
                                logger.info(`Created default invoice line item ${invoiceLineItemId}`);
                            }
                        }
                    }
                    // Handle manual lines
                    else if (line.type === 'manual') {
                        logger.info('Processing manual settlement line without invoice');
                        invoiceLineItemId = null;
                    }

                    // Validate agency if provided
                    if (line.agencyId) {
                        const agency = await Agency.findByPk(line.agencyId);
                        if (!agency) {
                            throw new Error(`Invalid agency ID: ${line.agencyId}`);
                        }
                    }

                    // Validate applicant if provided
                    if (line.applicantId) {
                        const applicant = await Applicant.findByPk(line.applicantId);
                        if (!applicant) {
                            throw new Error(`Invalid applicant ID: ${line.applicantId}`);
                        }
                    }

                    // Validate amount
                    if (!line.amount || line.amount <= 0) {
                        throw new Error(`Invalid amount for line ${i + 1}: ${line.amount}`);
                    }

                    const lineData = {
                        amount: line.amount,
                        type: line.type,
                        DRglAccountId: line.DRglAccountId,
                        CRglAccountId: line.CRglAccountId,
                        txnId: line.txnId,
                        status: 'active',
                        description: line.description,
                        settlementId: id,
                        invoiceLineItemId: invoiceLineItemId,
                        agencyId: line.agencyId || null,
                        applicantId: line.applicantId || null
                    };

                    await apInvoiceSettlementLine.create(lineData, { transaction });
                    logger.info(`Settlement line ${i + 1} created successfully`);
                }

                logger.info('All settlement lines updated successfully');
            }

            await transaction.commit();
            logger.info('Transaction committed successfully');

            // Fetch updated settlement
            const updatedSettlement = await apInvoiceSettlement.findByPk(id, {
                include: [
                    { model: user, as: 'maker', required: false },
                    { model: user, as: 'checker', required: false },
                    { model: currency, as: 'currency', required: false },
                    {
                        model: apInvoiceSettlementLine,
                        as: 'invoiceSettlements',
                        include: [
                            {
                                model: InvoiceLineItem,
                                as: 'invoiceLineItem',
                                required: false,
                                include: [
                                    {
                                        model: apInvoice,
                                        as: 'invoice',
                                        include: [
                                            { model: vendor, as: 'vendor' }
                                        ]
                                    }
                                ]
                            },
                            {
                                model: Agency,
                                as: 'agency',
                                required: false
                            },
                            {
                                model: Applicant,
                                as: 'applicant',
                                required: false
                            }
                        ]
                    }
                ]
            });

            logger.info(`=== AP SETTLEMENT UPDATED SUCCESSFULLY: ${id} ===`);

            res.status(200).json({
                success: true,
                message: 'AP Settlement updated successfully',
                data: updatedSettlement
            });

        } catch (error) {
            await transaction.rollback();
            logger.error('=== ERROR UPDATING AP SETTLEMENT ===', {
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    sql: error.sql,
                    parameters: error.parameters
                },
                settlementId: req.params.id,
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
                status: ['approved', 'partially_paid', 'overdue', 'draft']
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