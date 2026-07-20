// ===============================================================
// AP INVOICE CONTROLLER
// ===============================================================
const logger = require("../../api/logger");
const { apInvoice, apInvoiceAudit, vendor, currency, user, invoiceLineItem, apInvoiceSettlement, sequelize, Agency } = require("../../models");
const db = require('../../models');
const { Op } = require('sequelize');

class APInvoiceController {


    static async getNextInvoiceNumber(req, res) {
        try {
            const { prefix, year } = req.query;

            // Call model method (pass only business data)
            const result = await apInvoice.getNextInvoiceNumber(
                prefix || 'AP-INV',
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
    // ===============================================================
    // FIXED: CREATE INVOICE WITH LINE ITEMS
    // ===============================================================
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
                agencyId,
                currencyId,
                makerId,
                note,
                lineItems = []  // 🎯 NEW: Extract line items from request
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

            // Validation for header
            if (!invoiceNumber || !invoiceDate || !dueDate || !totalAmount) {
                await transaction.rollback();
                await APInvoiceController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: invoiceNumber, invoiceDate, dueDate, totalAmount, vendorId'
                });
            }

            // 🎯 NEW: Validate line items
            if (!parsedLineItems || parsedLineItems.length === 0) {
                await transaction.rollback();
                await APInvoiceController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'At least one line item is required'
                });
            }

            // Validate each line item
            for (let i = 0; i < parsedLineItems.length; i++) {
                const line = parsedLineItems[i];
                if (!line.description || !line.quantity || !line.unitPrice) {
                    await transaction.rollback();
                    await APInvoiceController.cleanupUploadedFiles(req.files);
                    return res.status(400).json({
                        success: false,
                        message: `Line item ${i + 1} is missing required fields: description, quantity, unitPrice`
                    });
                }
            }

            // Check if invoice number already exists
            const existingInvoice = await db.apInvoice.findOne({
                where: { invoiceNumber }
            });

            if (existingInvoice) {
                await transaction.rollback();
                await APInvoiceController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Invoice number already exists'
                });
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
                agencyId,
                currencyId,
                makerId,
                note,
                documents: documents.length > 0 ? documents : null,
                status: 'draft'
            }, { transaction });

            // 🎯 STEP 2: Create line items
            const createdLineItems = [];
            for (let i = 0; i < parsedLineItems.length; i++) {
                const line = parsedLineItems[i];

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
                    txnId: line.txnId,
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
                    { model: db.Agency, as: 'agency' },
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
            if (req.files) {
                await APInvoiceController.cleanupUploadedFiles(req.files);
            }
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
                agencyId,
                currencyId,
                note,
                reason,
                lineItems = []
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

            logger.info(`Updating AP Invoice ID: ${id}`);

            // Find existing invoice
            const existingInvoice = await db.apInvoice.findByPk(id);
            if (!existingInvoice) {
                await transaction.rollback();
                await APInvoiceController.cleanupUploadedFiles(req.files);
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Validate line items
            if (!parsedLineItems || parsedLineItems.length === 0) {
                await transaction.rollback();
                await APInvoiceController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'At least one line item is required'
                });
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
                existingDocs = existingInvoice.documents || [];
            }

            // Clean up physically deleted files from server storage
            const fs = require('fs');
            const currentDocs = existingInvoice.documents || [];
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

            const documents = [...existingDocs, ...newDocs];

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
                agencyId,
                currencyId,
                note,
                documents: documents.length > 0 ? documents : null
            }, { transaction });

            // 🎯 STEP 2: Delete existing line items
            await db.invoiceLineItem.destroy({
                where: { invoiceId: id },
                transaction
            });

            // 🎯 STEP 3: Create new line items
            for (let i = 0; i < parsedLineItems.length; i++) {
                const line = parsedLineItems[i];

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
                    txnId: line.txnId,
                    note: line.note || null,
                    makerId: req.body.makerId || req.user?.id
                }, { transaction });
            }

            await transaction.commit();

            // Fetch updated invoice with associations
            const updatedInvoice = await db.apInvoice.findByPk(id, {
                include: [
                    { model: db.vendor, as: 'vendor' },
                    { model: db.Agency, as: 'agency' },
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
            if (req.files) {
                await APInvoiceController.cleanupUploadedFiles(req.files);
            }
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
                    { model: Agency, as: 'agency' },
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
                    { model: Agency, as: 'agency' },
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
                    { model: Agency, as: 'agency' },
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
                    { model: Agency, as: 'agency' },
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
                    { model: Agency, as: 'agency' },
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