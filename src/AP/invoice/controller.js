// ===============================================================
// AP INVOICE CONTROLLER
// ===============================================================
const logger = require("../../api/logger");
const { apInvoice, apInvoiceAudit, vendor, currency, user, invoiceLineItem, apInvoiceSettlement, sequelize } = require("../../models");
const db = require('../../models');
const { Op } = require('sequelize');

class APInvoiceController {

    // ===============================================================
    // FIXED: CREATE INVOICE WITH LINE ITEMS
    // ===============================================================
    static async createInvoice(req, res) {
        // Start a database transaction

        const transaction = await sequelize.transaction();

        try {
            logger.info('Creating new AP Invoice with line items');

            const {
                invoiceNumber,
                vendorInvoiceNumber,
                invoiceDate,
                dueDate,
                description,
                totalAmount,
                exchangeRate = 1.00,
                vendorId,
                currencyId,
                makerId,
                note,
                lineItems = []  // 🎯 NEW: Extract line items from request
            } = req.body;

            // Validation for header
            if (!invoiceNumber || !vendorInvoiceNumber || !invoiceDate || !dueDate || !totalAmount || !vendorId) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: invoiceNumber, vendorInvoiceNumber, invoiceDate, dueDate, totalAmount, vendorId'
                });
            }

            // 🎯 NEW: Validate line items
            if (!lineItems || lineItems.length === 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'At least one line item is required'
                });
            }

            // Validate each line item
            for (let i = 0; i < lineItems.length; i++) {
                const line = lineItems[i];
                if (!line.description || !line.quantity || !line.unitPrice || !line.DRglAccountId || !line.CRglAccountId) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Line item ${i + 1} is missing required fields: description, quantity, unitPrice, DRglAccountId, CRglAccountId`
                    });
                }
            }

            // Check if invoice number already exists
            const existingInvoice = await db.apInvoice.findOne({
                where: { invoiceNumber }
            });

            if (existingInvoice) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invoice number already exists'
                });
            }

            // 🎯 STEP 1: Create invoice header
            const invoice = await db.apInvoice.create({
                invoiceNumber,
                vendorInvoiceNumber,
                invoiceDate,
                dueDate,
                description,
                totalAmount,
                exchangeRate,
                vendorId,
                currencyId,
                makerId,
                note,
                status: 'draft'
            }, { transaction });

            // 🎯 STEP 2: Create line items
            const createdLineItems = [];
            for (let i = 0; i < lineItems.length; i++) {
                const line = lineItems[i];

                const lineItem = await db.invoiceLineItem.create({
                    invoiceId: invoice.id,  // 🎯 Link to created invoice
                    lineNumber: i + 1,
                    description: line.description,
                    quantity: parseFloat(line.quantity),
                    unitPrice: parseFloat(line.unitPrice),
                    discountRate: parseFloat(line.discountRate) || 0,
                    taxRate: parseFloat(line.taxRate) || 0,
                    DRglAccountId: line.DRglAccountId,
                    CRglAccountId: line.CRglAccountId,
                    note: line.note || null,
                    makerId: makerId
                    // lineTotal, discountAmount, taxAmount will be calculated by beforeSave hook
                }, { transaction });

                createdLineItems.push(lineItem);
            }

            // 🎯 STEP 3: Commit transaction
            await transaction.commit();

            // 🎯 STEP 4: Fetch complete invoice with all associations
            const createdInvoice = await db.apInvoice.findByPk(invoice.id, {
                include: [
                    { model: db.vendor, as: 'vendor' },
                    { model: db.currency, as: 'currency' },
                    { model: db.user, as: 'maker' },
                    {
                        model: db.invoiceLineItem,
                        as: 'lineItems',
                        include: [
                            { model: db.chartAccount, as: 'DRglAccount' },
                            { model: db.chartAccount, as: 'CRglAccount' }
                        ]
                    }
                ]
            });

            logger.info(`AP Invoice created successfully with ID: ${invoice.id} and ${createdLineItems.length} line items`);

            res.status(201).json({
                success: true,
                message: 'AP Invoice and line items created successfully',
                data: createdInvoice
            });

        } catch (error) {
            // 🎯 Rollback transaction on any error
            await transaction.rollback();
            logger.error('Error creating AP Invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // FIXED: UPDATE INVOICE WITH LINE ITEMS
    // ===============================================================
    static async updateInvoice(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const { id } = req.params;
            const {
                invoiceNumber,
                vendorInvoiceNumber,
                invoiceDate,
                dueDate,
                description,
                totalAmount,
                exchangeRate = 1.00,
                vendorId,
                currencyId,
                note,
                reason,
                lineItems = []
            } = req.body;

            logger.info(`Updating AP Invoice ID: ${id}`);

            // Find existing invoice
            const existingInvoice = await db.apInvoice.findByPk(id);
            if (!existingInvoice) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Validate line items
            if (!lineItems || lineItems.length === 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'At least one line item is required'
                });
            }

            // 🎯 STEP 1: Update invoice header
            await existingInvoice.update({
                invoiceNumber,
                vendorInvoiceNumber,
                invoiceDate,
                dueDate,
                description,
                totalAmount,
                exchangeRate,
                vendorId,
                currencyId,
                note
            }, { transaction });

            // 🎯 STEP 2: Delete existing line items
            await db.invoiceLineItem.destroy({
                where: { invoiceId: id },
                transaction
            });

            // 🎯 STEP 3: Create new line items
            for (let i = 0; i < lineItems.length; i++) {
                const line = lineItems[i];

                await db.invoiceLineItem.create({
                    invoiceId: id,
                    lineNumber: i + 1,
                    description: line.description,
                    quantity: parseFloat(line.quantity),
                    unitPrice: parseFloat(line.unitPrice),
                    discountRate: parseFloat(line.discountRate) || 0,
                    taxRate: parseFloat(line.taxRate) || 0,
                    DRglAccountId: line.DRglAccountId,
                    CRglAccountId: line.CRglAccountId,
                    note: line.note || null,
                    makerId: req.body.makerId || req.user?.id
                }, { transaction });
            }

            await transaction.commit();

            // Fetch updated invoice with associations
            const updatedInvoice = await db.apInvoice.findByPk(id, {
                include: [
                    { model: db.vendor, as: 'vendor' },
                    { model: db.currency, as: 'currency' },
                    { model: db.user, as: 'maker' },
                    {
                        model: db.invoiceLineItem,
                        as: 'lineItems',
                        include: [
                            { model: db.chartAccount, as: 'DRglAccount' },
                            { model: db.chartAccount, as: 'CRglAccount' }
                        ]
                    }
                ]
            });

            logger.info(`AP Invoice updated successfully with ID: ${id}`);

            res.status(200).json({
                success: true,
                message: 'AP Invoice updated successfully',
                data: updatedInvoice
            });

        } catch (error) {
            await transaction.rollback();
            logger.error('Error updating AP Invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET ALL AP INVOICES WITH FILTERS
    // ===============================================================
    static async getAllInvoices(req, res) {
        try {
            logger.info('Fetching AP Invoices');

            const {
                page = 1,
                limit = 10,
                status,
                vendorId,
                startDate,
                endDate,
                search
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = {};

            // Apply filters
            if (status) {
                whereClause.status = status;
            }

            if (vendorId) {
                whereClause.vendorId = vendorId;
            }

            if (startDate && endDate) {
                whereClause.invoiceDate = {
                    [Op.between]: [startDate, endDate]
                };
            }

            if (search) {
                whereClause[Op.or] = [
                    { invoiceNumber: { [Op.like]: `%${search}%` } },
                    { vendorInvoiceNumber: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ];
            }

            const { count, rows } = await apInvoice.findAndCountAll({
                where: whereClause,
                include: [
                    { model: vendor, as: 'vendor' },
                    { model: currency, as: 'currency' },
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' }
                ],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['createdAt', 'DESC']]
            });

            res.status(200).json({
                success: true,
                message: 'AP Invoices fetched successfully',
                data: {
                    invoices: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(count / limit),
                        totalRecords: count,
                        limit: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            logger.error('Error fetching AP Invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET AP INVOICE BY ID
    // ===============================================================
    static async getInvoiceById(req, res) {
        try {
            const { id } = req.params;
            logger.info(`Fetching AP Invoice with ID: ${id}`);

            const invoice = await apInvoice.findByPk(id, {
                include: [
                    { model: vendor, as: 'vendor' },
                    { model: currency, as: 'currency' },
                    { model: user, as: 'maker' },
                    { model: user, as: 'checker' },
                    { model: invoiceLineItem, as: 'lineItems' },
                    { model: apInvoiceSettlement, as: 'settlements' }
                ]
            });

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'AP Invoice not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'AP Invoice fetched successfully',
                data: invoice
            });

        } catch (error) {
            logger.error('Error fetching AP Invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
    // ===============================================================
    // GET AP INVOICE AUDIT BY ID
    // ===============================================================
    // ===============================================================
    // GET AP INVOICE AUDIT BY ID
    // ===============================================================
    static async getInvoiceAuditById(req, res) {
        try {
            const { id } = req.params;
            logger.info(`Fetching AP Invoice audit records with Invoice ID: ${id}`);

            const auditRecords = await apInvoiceAudit.findAll({
                where: {
                    invoiceId: id,
                },
                include: [
                    // Add any related models you want to include
                ]
            });

            // Check if any audit records were found
            if (auditRecords.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No audit records found for this AP Invoice'
                });
            }

            res.status(200).json({
                success: true,
                message: 'AP Invoice audit records fetched successfully',
                data: auditRecords
            });
        } catch (error) {
            logger.error('Error fetching AP Invoice audit:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }


    // ===============================================================
    // APPROVE AP INVOICE
    // ===============================================================
    static async approveInvoice(req, res) {
        try {
            const { id } = req.params;
            const { checkerId } = req.body;

            logger.info(`Approving AP Invoice with ID: ${id}`);

            const invoice = await apInvoice.findByPk(id);

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'AP Invoice not found'
                });
            }

            // Check if invoice can be approved
            if (invoice.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Invoice must be in pending status to be approved'
                });
            }

            if (!checkerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Checker ID is required for approval'
                });
            }

            await invoice.update({
                status: 'approved',
                checkerId: checkerId,
                approvedAt: new Date()
            });

            const approvedInvoice = await apInvoice.findByPk(id, {
                include: [
                    { model: vendor, as: 'vendor' },
                    { model: user, as: 'checker' }
                ]
            });

            logger.info(`AP Invoice approved successfully with ID: ${id}`);

            res.status(200).json({
                success: true,
                message: 'AP Invoice approved successfully',
                data: approvedInvoice
            });

        } catch (error) {
            logger.error('Error approving AP Invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // CANCEL AP INVOICE
    // ===============================================================
    static async cancelInvoice(req, res) {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            logger.info(`Cancelling AP Invoice with ID: ${id}`);

            const invoice = await apInvoice.findByPk(id);

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'AP Invoice not found'
                });
            }

            // Check if invoice can be cancelled
            if (['paid', 'cancelled'].includes(invoice.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invoice cannot be cancelled in current status'
                });
            }

            await invoice.update({
                status: 'cancelled',
                note: reason ? `${invoice.note || ''}\nCancellation reason: ${reason}` : invoice.note
            });

            logger.info(`AP Invoice cancelled successfully with ID: ${id}`);

            res.status(200).json({
                success: true,
                message: 'AP Invoice cancelled successfully',
                data: invoice
            });

        } catch (error) {
            logger.error('Error cancelling AP Invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET OVERDUE INVOICES
    // ===============================================================
    static async getOverdueInvoices(req, res) {
        try {
            logger.info('Fetching overdue AP Invoices');

            const today = new Date();

            const overdueInvoices = await apInvoice.findAll({
                where: {
                    dueDate: { [Op.lt]: today },
                    status: { [Op.not]: 'paid' },
                    paidAmount: { [Op.lt]: apInvoice.sequelize.col('totalAmount') }
                },
                include: [
                    { model: vendor, as: 'vendor' },
                    { model: currency, as: 'currency' }
                ],
                order: [['dueDate', 'ASC']]
            });

            const overdueData = overdueInvoices.map(invoice => ({
                ...invoice.toJSON(),
                outstandingAmount: invoice.getOutstandingAmount(),
                daysOverdue: Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))
            }));

            res.status(200).json({
                success: true,
                message: 'Overdue invoices fetched successfully',
                data: {
                    count: overdueInvoices.length,
                    invoices: overdueData
                }
            });

        } catch (error) {
            logger.error('Error fetching overdue invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // ===============================================================
    // GET AP SUMMARY
    // ===============================================================
    static async getAPSummary(req, res) {
        try {
            logger.info('Fetching AP Summary');

            const summary = await apInvoice.findAll({
                attributes: [
                    'status',
                    [apInvoice.sequelize.fn('COUNT', apInvoice.sequelize.col('id')), 'count'],
                    [apInvoice.sequelize.fn('SUM', apInvoice.sequelize.col('totalAmount')), 'totalAmount'],
                    [apInvoice.sequelize.fn('SUM', apInvoice.sequelize.col('paidAmount')), 'paidAmount']
                ],
                group: ['status']
            });

            const totalOutstanding = await apInvoice.sum('totalAmount', {
                where: {
                    status: { [Op.not]: 'paid' }
                }
            }) || 0;

            const totalPaid = await apInvoice.sum('paidAmount') || 0;

            res.status(200).json({
                success: true,
                message: 'AP Summary fetched successfully',
                data: {
                    statusSummary: summary,
                    totalOutstanding,
                    totalPaid,
                    netPayable: totalOutstanding - totalPaid
                }
            });

        } catch (error) {
            logger.error('Error fetching AP Summary:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
    // ===============================================================
    // GET OUTSTANDING INVOICES (OPTIONAL FILTER BY VENDOR)
    // ===============================================================
    static async getOutstandingInvoices(req, res) {
        try {
            const { vendorId } = req.query;

            logger.info('Fetching outstanding invoices' + (vendorId ? ` for vendor ID: ${vendorId}` : ''));

            const whereClause = {
                status: { [Op.not]: 'paid' },
                paidAmount: { [Op.lt]: apInvoice.sequelize.col('totalAmount') }
            };

            if (vendorId) {
                whereClause.vendorId = vendorId;
            }

            const invoices = await apInvoice.findAll({
                where: whereClause,
                include: [
                    { model: vendor, as: 'vendor' },
                    { model: currency, as: 'currency' }
                ],
                order: [['dueDate', 'ASC']]
            });

            const data = invoices.map(invoice => ({
                ...invoice.toJSON(),
                outstandingAmount: invoice.totalAmount - (invoice.paidAmount || 0)
            }));

            res.status(200).json({
                success: true,
                message: 'Outstanding invoices fetched successfully',
                data
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

module.exports = APInvoiceController;