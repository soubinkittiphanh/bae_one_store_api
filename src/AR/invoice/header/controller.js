// ===============================================================
// AR INVOICE HEADER CONTROLLER
// ===============================================================

const logger = require('../../../api/logger');
const { Agency, user, JobBatch, client, currency, arInvoiceLine,arReceiveLine, arReceiveHeaderV2, arInvoiceHeaderAudit, sequelize } = require('../../../models');
const InvoiceHeader = require('../../../models').arInvoiceHeader;
const { Op, where } = require('sequelize');
class InvoiceHeaderController {

    static async getNextInvoiceNumber(req, res) {
        try {
            const { prefix, year } = req.query;

            // Call model method (pass only business data)
            const result = await InvoiceHeader.getNextInvoiceNumber(
                prefix || 'AR-INV',
                year ? parseInt(year) : null
            );

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Controller error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
    // GET ALL INVOICES WITH FILTERS AND PAGINATION
    static async findAll(req, res) {
        try {
            const {
                page = 1,
                limit = 25,
                search = '',
                status = '',
                agencyId = '',
                dateFrom = '',
                dateTo = '',
                sortBy = 'invoiceDate',
                sortOrder = 'DESC'
            } = req.query;
            const offset = (page - 1) * limit;
            const whereClause = {};

            // Search filter
            if (search) {
                whereClause[Op.or] = [
                    { invoiceNumber: { [Op.iLike]: `%${search}%` } },
                    { description: { [Op.iLike]: `%${search}%` } }
                ];
            }

            // Status filter
            if (status) {
                whereClause.status = status;
            }

            // Customer filter
            if (agencyId) {
                whereClause.agencyId = agencyId;
            }

            // Date range filter
            if (dateFrom || dateTo) {
                whereClause.invoiceDate = {};
                if (dateFrom) whereClause.invoiceDate[Op.gte] = dateFrom;
                if (dateTo) whereClause.invoiceDate[Op.lte] = dateTo;
            }

            const { count, rows } = await InvoiceHeader.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: client,
                        as: 'client'
                    },
                    {
                        model: Agency,
                        as: 'agency'
                    },
                    {
                        model: currency,
                        as: 'currency'
                    },
                    {
                        model: user,
                        as: 'maker'
                    },
                    {
                        model: user,
                        as: 'updateUser'
                    },
                    {
                        model: arInvoiceLine,
                        as: 'invoiceLines'
                    },
                    {
                        model: arReceiveHeaderV2,
                        as: 'receiveHeaders',
                        include: [
                            {
                                model: arReceiveLine,
                                as: 'receiveLines'
                            }
                        ]
                    }
                ],
                order: [[sortBy, sortOrder.toUpperCase()]],
                limit: parseInt(limit),
                offset: parseInt(offset),
                distinct: true
            });

            const totalPages = Math.ceil(count / limit);

            res.status(200).json({
                success: true,
                data: {
                    invoices: rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalItems: count,
                        itemsPerPage: parseInt(limit),
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                }
            });

        } catch (error) {
            logger.error('Error fetching invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoices',
                error: error.message
            });
        }
    }

    // GET INVOICE BY ID
    static async findById(req, res) {
        try {
            const { id } = req.params;

            const invoice = await InvoiceHeader.findByPk(id, {
                include: [
                    {
                        model: client,
                        as: 'client'
                    },
                    {
                        model: Agency,
                        as: 'agency'
                    },
                    {
                        model: currency,
                        as: 'currency'
                    },
                    {
                        model: user,
                        as: 'maker'
                    },
                    {
                        model: user,
                        as: 'updateUser'
                    },
                    {
                        model: arInvoiceLine,
                        as: 'invoiceLines'
                    },
                    {
                        model: arReceiveHeaderV2,
                        as: 'receiveHeaders'
                    }
                ]
            });

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            res.status(200).json({
                success: true,
                data: invoice
            });

        } catch (error) {
            logger.error('Error fetching invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoice',
                error: error.message
            });
        }
    }
    // GET INVOICE BY ID
    static async findAuditByHeaderId(req, res) {
        try {
            const { id } = req.params;

            const invoiceAudit = await arInvoiceHeaderAudit.findAll({
                where: {
                    invoiceHeaderId: id,
                },
                include: []
            });

            if (!invoiceAudit) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice audit not found'
                });
            }

            res.status(200).json({
                success: true,
                data: invoiceAudit
            });

        } catch (error) {
            logger.error('Error fetching invoiceAudit:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoiceAudit',
                error: error.message
            });
        }
    }
    // CREATE NEW INVOICE
    static async cleanupUploadedFiles(files) {
        if (!files) return;
        try {
            const fs = require('fs');
            const allFiles = [...(files.documents || [])];
            for (const file of allFiles) {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            }
        } catch (error) {
            logger.error('Error cleaning up files:', error);
        }
    }

    static async create(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const {
                invoiceNumber,
                invoiceDate,
                dueDate,
                agencyId,
                currencyId,
                jobBatchId,
                exchangeRate = 1,
                totalAmount = 0,
                taxAmount = 0,
                netAmount = 0,
                status = 'draft',
                description,
                lineItems = [] // Extract lineItems from request body
            } = req.body;

            // Support multipart/form-data where arrays are stringified
            let parsedLineItems = lineItems;
            if (typeof lineItems === 'string') {
                try {
                    parsedLineItems = JSON.parse(lineItems);
                } catch (e) {
                    parsedLineItems = [];
                }
            }

            // Validate required fields
            if (!invoiceNumber || !invoiceDate || !agencyId) {
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Invoice number, invoice date, and customer ID are required'
                });
            }

            // Validate line items
            if (!parsedLineItems || parsedLineItems.length === 0) {
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'At least one line item is required'
                });
            }

            // Check if invoice number already exists
            const existingInvoice = await InvoiceHeader.findOne({
                where: { invoiceNumber }
            });

            if (existingInvoice) {
                await transaction.rollback();
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Invoice number already exists'
                });
            }

            // Verify customer exists
            const customerExists = await Agency.findByPk(agencyId);
            if (!customerExists) {
                await transaction.rollback();
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Customer not found'
                });
            }

            // Verify currency exists if provided
            if (currencyId) {
                const currencyExists = await currency.findByPk(currencyId);
                if (!currencyExists) {
                    await transaction.rollback();
                    await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Currency not found'
                    });
                }
            }

            // Process uploaded documents
            let documentsData = [];
            if (req.files && req.files.documents) {
                documentsData = req.files.documents.map(file => ({
                    name: file.originalname,
                    filename: file.filename,
                    path: file.path.replace(/\\/g, '/'),
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date()
                }));
            }

            let initialDocs = [];
            if (req.body.documents) {
                try {
                    initialDocs = typeof req.body.documents === 'string' ? JSON.parse(req.body.documents) : req.body.documents;
                } catch (e) {
                    initialDocs = [];
                }
            }
            const documents = [...initialDocs, ...documentsData];

            // Create invoice header
            const invoice = await InvoiceHeader.create({
                invoiceNumber,
                jobBatchId,
                invoiceDate,
                dueDate,
                agencyId,
                currencyId,
                exchangeRate,
                totalAmount,
                taxAmount,
                netAmount,
                status,
                description,
                documents: documents.length > 0 ? documents : null,
                makerId: req.user?.id
            }, { transaction });

            // Create invoice lines
            const lineItemsData = parsedLineItems.map(item => ({
                invoiceHeaderId: invoice.id, // Link to the created invoice header
                lineNumber: item.lineNumber,
                description: item.description,
                quantity: item.quantity,
                DRglAccountId: item.DRglAccountId,
                CRglAccountId: item.CRglAccountId,
                txnId: item.txnId,
                unitPrice: item.unitPrice,
                taxRate: item.taxRate || 0,
                taxAmount: item.taxAmount || 0,
                lineTotal: item.lineTotal,
                makerId: req.user?.id
            }));

            await arInvoiceLine.bulkCreate(lineItemsData, { transaction });

            // Commit the transaction
            await transaction.commit();

            // Fetch the complete invoice with line items
            const createdInvoice = await InvoiceHeader.findByPk(invoice.id, {
                include: [
                    {
                        model: client,
                        as: 'client'
                    },
                    {
                        model: Agency,
                        as: 'agency'
                    },
                    {
                        model: currency,
                        as: 'currency'
                    },
                    {
                        model: user,
                        as: 'maker'
                    },
                    {
                        model: arInvoiceLine,
                        as: 'invoiceLines' // Make sure this association is defined in your model
                    }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Invoice created successfully',
                data: createdInvoice
            });

        } catch (error) {
            await transaction.rollback();
            if (req.files) {
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
            }
            logger.error('Error creating invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating invoice',
                error: error.message
            });
        }
    }

    // UPDATE INVOICE
    static async update(req, res) {
        const transaction = await sequelize.transaction();
        try {
            const { id } = req.params;
            const { lineItems, ...updateData } = req.body; // Extract lineItems separately

            let parsedLineItems = lineItems;
            if (typeof lineItems === 'string') {
                try {
                    parsedLineItems = JSON.parse(lineItems);
                } catch (e) {
                    parsedLineItems = [];
                }
            }

            const invoice = await InvoiceHeader.findByPk(id);
            if (!invoice) {
                await transaction.rollback();
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Remove fields that shouldn't be updated directly
            delete updateData.id;
            delete updateData.makerId;

            // Check invoice number uniqueness if being updated
            if (updateData.invoiceNumber && updateData.invoiceNumber !== invoice.invoiceNumber) {
                const existingInvoice = await InvoiceHeader.findOne({
                    where: {
                        invoiceNumber: updateData.invoiceNumber,
                        id: { [Op.ne]: id }
                    }
                });

                if (existingInvoice) {
                    await transaction.rollback();
                    await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Invoice number already exists'
                    });
                }
            }

            // Verify foreign key references if being updated
            if (updateData.agencyId) {
                const customerExists = await Agency.findByPk(updateData.agencyId);
                if (!customerExists) {
                    await transaction.rollback();
                    await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Customer not found'
                    });
                }
            }

            if (updateData.currencyId) {
                const currencyExists = await currency.findByPk(updateData.currencyId);
                if (!currencyExists) {
                    await transaction.rollback();
                    await InvoiceHeaderController.cleanupUploadedFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: 'Currency not found'
                    });
                }
            }

            // Process document updates
            let newDocs = [];
            if (req.files && req.files.documents) {
                newDocs = req.files.documents.map(file => ({
                    name: file.originalname,
                    filename: file.filename,
                    path: file.path.replace(/\\/g, '/'),
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date()
                }));
            }

            let existingDocs = [];
            if (req.body.documents) {
                try {
                    existingDocs = typeof req.body.documents === 'string' ? JSON.parse(req.body.documents) : req.body.documents;
                } catch (e) {
                    existingDocs = [];
                }
            } else {
                existingDocs = invoice.documents || [];
            }

            // Clean up physically deleted files from server storage
            const fs = require('fs');
            const currentDocs = invoice.documents || [];
            const deletedDocs = currentDocs.filter(cDoc => !existingDocs.some(eDoc => eDoc.filename === cDoc.filename));
            for (const doc of deletedDocs) {
                if (doc.path && fs.existsSync(doc.path)) {
                    try {
                        fs.unlinkSync(doc.path);
                    } catch (e) {
                        logger.error('Error deleting physical file:', e);
                    }
                }
            }

            updateData.documents = [...existingDocs, ...newDocs];
            if (updateData.documents.length === 0) {
                updateData.documents = null;
            }

            // Add update user info
            updateData.updateUserId = req.user?.id;

            // Update invoice header
            await invoice.update(updateData, { transaction });

            // Handle line items if provided
            if (parsedLineItems && Array.isArray(parsedLineItems)) {
                // Delete existing line items
                await arInvoiceLine.destroy({
                    where: { invoiceHeaderId: id },
                    transaction
                });

                // Create new line items
                if (parsedLineItems.length > 0) {
                    const lineItemsData = parsedLineItems.map(item => ({
                        invoiceHeaderId: id,
                        lineNumber: item.lineNumber,
                        description: item.description,
                        quantity: item.quantity,
                        DRglAccountId: item.DRglAccountId,
                        CRglAccountId: item.CRglAccountId,
                        txnId: item.txnId,
                        unitPrice: item.unitPrice,
                        taxRate: item.taxRate || 0,
                        taxAmount: item.taxAmount || 0,
                        lineTotal: item.lineTotal,
                        makerId: req.user?.id
                    }));

                    await arInvoiceLine.bulkCreate(lineItemsData, { transaction });
                }
            }

            await transaction.commit();

            // Fetch updated invoice with line items
            const updatedInvoice = await InvoiceHeader.findByPk(id, {
                include: [
                    {
                        model: client,
                        as: 'client'
                    },
                    {
                        model: Agency,
                        as: 'agency'
                    },
                    {
                        model: currency,
                        as: 'currency'
                    },
                    {
                        model: user,
                        as: 'maker'
                    },
                    {
                        model: user,
                        as: 'updateUser'
                    },
                    {
                        model: arInvoiceLine,
                        as: 'invoiceLines'
                    }
                ]
            });

            res.status(200).json({
                success: true,
                message: 'Invoice updated successfully',
                data: updatedInvoice
            });

        } catch (error) {
            logger.error('Error updating invoice:', error);
            await transaction.rollback();
            if (req.files) {
                await InvoiceHeaderController.cleanupUploadedFiles(req.files);
            }
            res.status(500).json({
                success: false,
                message: 'Error updating invoice',
                error: error.message
            });
        }
    }
    // DELETE INVOICE
    static async delete(req, res) {
        try {
            const { id } = req.params;

            const invoice = await InvoiceHeader.findByPk(id);
            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Business logic: prevent deletion of paid invoices
            if (invoice.status === 'paid') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete paid invoices'
                });
            }

            await invoice.destroy();

            res.status(200).json({
                success: true,
                message: 'Invoice deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting invoice',
                error: error.message
            });
        }
    }

    // UPDATE INVOICE STATUS
    static async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, notes } = req.body;

            const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`
                });
            }

            const invoice = await InvoiceHeader.findByPk(id);
            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            await invoice.update({
                status,
                description: notes || invoice.description,
                updateUserId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: `Invoice status updated to ${status}`,
                data: invoice
            });

        } catch (error) {
            logger.error('Error updating invoice status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating invoice status',
                error: error.message
            });
        }
    }

    // GET INVOICE STATISTICS
    static async getStatistics(req, res) {
        try {
            const { agencyId, dateFrom, dateTo } = req.query;
            const whereClause = {};

            if (agencyId) whereClause.agencyId = agencyId;
            if (dateFrom || dateTo) {
                whereClause.invoiceDate = {};
                if (dateFrom) whereClause.invoiceDate[Op.gte] = dateFrom;
                if (dateTo) whereClause.invoiceDate[Op.lte] = dateTo;
            }

            // Total counts
            const totalInvoices = await InvoiceHeader.count({ where: whereClause });

            // Status breakdown
            const statusStats = await InvoiceHeader.findAll({
                where: whereClause,
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('status')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount']
                ],
                group: ['status'],
                raw: true
            });

            // Amount summaries
            const [amountSummary] = await InvoiceHeader.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount'],
                    [sequelize.fn('SUM', sequelize.col('taxAmount')), 'totalTaxAmount'],
                    [sequelize.fn('SUM', sequelize.col('netAmount')), 'totalNetAmount'],
                    [sequelize.fn('AVG', sequelize.col('totalAmount')), 'averageAmount']
                ],
                raw: true
            });

            // Monthly breakdown
            const monthlyStats = await InvoiceHeader.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.literal("DATE_TRUNC('month', \"invoiceDate\")"), 'month'],
                    [sequelize.fn('COUNT', '*'), 'count'],
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount']
                ],
                group: [sequelize.literal("DATE_TRUNC('month', \"invoiceDate\")")],
                order: [[sequelize.literal("DATE_TRUNC('month', \"invoiceDate\")"), 'DESC']],
                limit: 12,
                raw: true
            });

            // Overdue invoices
            const overdueCount = await InvoiceHeader.count({
                where: {
                    ...whereClause,
                    status: 'overdue'
                }
            });

            // Paid vs unpaid
            const paidCount = await InvoiceHeader.count({
                where: {
                    ...whereClause,
                    status: 'paid'
                }
            });

            res.status(200).json({
                success: true,
                data: {
                    summary: {
                        totalInvoices,
                        overdueCount,
                        paidCount,
                        unpaidCount: totalInvoices - paidCount,
                        totalAmount: parseFloat(amountSummary.totalAmount) || 0,
                        totalTaxAmount: parseFloat(amountSummary.totalTaxAmount) || 0,
                        totalNetAmount: parseFloat(amountSummary.totalNetAmount) || 0,
                        averageAmount: parseFloat(amountSummary.averageAmount) || 0
                    },
                    statusBreakdown: statusStats,
                    monthlyStats: monthlyStats
                }
            });

        } catch (error) {
            logger.error('Error fetching invoice statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoice statistics',
                error: error.message
            });
        }
    }

    // SEARCH INVOICES
    static async search(req, res) {
        try {
            const { q } = req.query;

            if (!q || q.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query must be at least 2 characters'
                });
            }

            const invoices = await InvoiceHeader.findAll({
                where: {
                    [Op.or]: [
                        { invoiceNumber: { [Op.iLike]: `%${q}%` } },
                        { description: { [Op.iLike]: `%${q}%` } }
                    ]
                },
                include: [
                    {
                        model: client,
                        as: 'client',
                        attributes: ['id', 'name']
                    }
                ],
                limit: 10,
                attributes: ['id', 'invoiceNumber', 'invoiceDate', 'totalAmount', 'status']
            });

            res.status(200).json({
                success: true,
                data: invoices
            });

        } catch (error) {
            logger.error('Error searching invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Error searching invoices',
                error: error.message
            });
        }
    }

    // HELPER: Get invoice totals by customer
    static async getCustomerTotals(agencyId) {
        const totals = await InvoiceHeader.findAll({
            where: { agencyId },
            attributes: [
                [sequelize.fn('COUNT', '*'), 'invoiceCount'],
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount'],
                [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'paid' THEN \"totalAmount\" ELSE 0 END")), 'paidAmount'],
                [sequelize.fn('SUM', sequelize.literal("CASE WHEN status != 'paid' THEN \"totalAmount\" ELSE 0 END")), 'unpaidAmount']
            ],
            raw: true
        });

        return totals[0];
    }
}

module.exports = InvoiceHeaderController;