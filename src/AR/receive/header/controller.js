// ===============================================================
// AR RECEIVE HEADER CONTROLLER
// ===============================================================
const logger = require("../../../api/logger");
const { user, MOU, JobBatch, Agency, arReceiveHeaderV2, arInvoiceLine, arReceiveLine, sequelize, arInvoiceHeader, currency,Transaction } = require('../../../models');
const ReceiveHeader = require('../../../models').arReceiveHeaderV2;
const { Op } = require('sequelize');

class ReceiveHeaderController {
  static async getNextReceiveNumber(req, res) {
    try {
      const { prefix, year } = req.query;

      // Call model method (pass only business data)
      const result = await arReceiveHeaderV2.getNextReceiveNumber(
        prefix || 'AR-RCP',
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
  // GET ALL RECEIVE HEADERS WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        paymentId = '',
        invoiceHeaderId = '',
        bookingDateFrom = '',
        bookingDateTo = '',
        receivedDateFrom = '',
        receivedDateTo = '',
        minAmount = '',
        maxAmount = '',
        sortBy = 'bookingDate',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { receiptNumber: { [Op.iLike]: `%${search}%` } },
          { referenceNumber: { [Op.iLike]: `%${search}%` } },
          { notes: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Payment method filter
      if (paymentId) {
        whereClause.paymentId = paymentId;
      }

      // Invoice header filter
      if (invoiceHeaderId) {
        whereClause.invoiceHeaderId = invoiceHeaderId;
      }

      // Booking date range filter
      if (bookingDateFrom || bookingDateTo) {
        whereClause.bookingDate = {};
        if (bookingDateFrom) whereClause.bookingDate[Op.gte] = bookingDateFrom;
        if (bookingDateTo) whereClause.bookingDate[Op.lte] = bookingDateTo;
      }

      // Received date range filter
      if (receivedDateFrom || receivedDateTo) {
        whereClause.receivedDate = {};
        if (receivedDateFrom) whereClause.receivedDate[Op.gte] = receivedDateFrom;
        if (receivedDateTo) whereClause.receivedDate[Op.lte] = receivedDateTo;
      }

      // Amount range filter
      if (minAmount || maxAmount) {
        whereClause.totalReceivedAmount = {};
        if (minAmount) whereClause.totalReceivedAmount[Op.gte] = minAmount;
        if (maxAmount) whereClause.totalReceivedAmount[Op.lte] = maxAmount;
      }

      const { count, rows } = await ReceiveHeader.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate', 'status'],
            include: [
              {
                model: JobBatch,
                as: 'jobbatch',
                include: [
                  {
                    model: MOU,
                    as: 'mou',
                    include: [
                      {
                        model: Agency,
                        as: 'agency',
                      }
                    ],
                  }
                ],
              }
            ],
          },
          {
            model: user,
            as: 'inputter'
          },
          {
            model: user,
            as: 'maker'
          },
          {
            model: currency,
            as: 'currency'
          },
          {
            model: user,
            as: 'updateUser'
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
          receiveHeaders: rows,
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
      logger.error('Error fetching receive headers:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive headers',
        error: error.message
      });
    }
  }
  static async findAllForPL(req, res) {
  try {
    const {
      search = '',
      paymentId = '',
      invoiceHeaderId = '',
      bookingDateFrom = '',
      bookingDateTo = '',
      receivedDateFrom = '',
      receivedDateTo = '',
      minAmount = '',
      maxAmount = '',
      sortBy = 'bookingDate',
      sortOrder = 'DESC'
    } = req.query;

    const whereClause = {};

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { receiptNumber: { [Op.iLike]: `%${search}%` } },
        { referenceNumber: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Payment method filter
    if (paymentId) {
      whereClause.paymentId = paymentId;
    }

    // Invoice header filter
    if (invoiceHeaderId) {
      whereClause.invoiceHeaderId = invoiceHeaderId;
    }

    // Booking date range filter
    if (bookingDateFrom || bookingDateTo) {
      whereClause.bookingDate = {};
      if (bookingDateFrom) whereClause.bookingDate[Op.gte] = bookingDateFrom;
      if (bookingDateTo) whereClause.bookingDate[Op.lte] = bookingDateTo;
    }

    // Received date range filter
    if (receivedDateFrom || receivedDateTo) {
      whereClause.receivedDate = {};
      if (receivedDateFrom) whereClause.receivedDate[Op.gte] = receivedDateFrom;
      if (receivedDateTo) whereClause.receivedDate[Op.lte] = receivedDateTo;
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      whereClause.totalReceivedAmount = {};
      if (minAmount) whereClause.totalReceivedAmount[Op.gte] = minAmount;
      if (maxAmount) whereClause.totalReceivedAmount[Op.lte] = maxAmount;
    }

    const { count, rows } = await ReceiveHeader.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: arInvoiceHeader,
          as: 'invoiceHeader',
          attributes: ['id', 'invoiceNumber', 'invoiceDate', 'status'],
          include: [
            {
              model: JobBatch,
              as: 'jobbatch',
              include: [
                {
                  model: MOU,
                  as: 'mou',
                  include: [
                    {
                      model: Agency,
                      as: 'agency',
                    }
                  ],
                }
              ],
            }
          ],
        },
        {
          model: user,
          as: 'inputter'
        },
        {
          model: user,
          as: 'maker'
        },
        {
          model: currency,
          as: 'currency'
        },
        {
          model: user,
          as: 'updateUser'
        },
        {
          model: arReceiveLine,
          as: 'receiveLines',
          include: [
            {
              model: Transaction,
              as: 'transaction'
            }
          ]
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      distinct: true
    });

    res.status(200).json({
      success: true,
      data: {
        receiveHeaders: rows,
        totalItems: count
      }
    });
  } catch (error) {
    logger.error('Error fetching receive headers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching receive headers',
      error: error.message
    });
  }
}
  // GET RECEIVE HEADER BY ID (Updated to include receive lines)
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const receiveHeader = await ReceiveHeader.findByPk(id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader'
          },
          {
            model: user,
            as: 'inputter'
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
            model: arReceiveLine,
            as: 'receiveLines',
            include: [
              {
                model: arInvoiceLine,
                as: 'invoiceLine'
              }
            ]
          }
        ]
      });

      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      res.status(200).json({
        success: true,
        data: receiveHeader
      });

    } catch (error) {
      logger.error('Error fetching receive header:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive header',
        error: error.message
      });
    }
  }
  // CREATE NEW RECEIVE HEADER WITH ALLOCATION LINES
  // UPDATED CREATE METHOD - Invoice is now optional
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
        receiptNumber,
        bookingDate,
        receivedDate,
        invoiceHeaderId, // NOW OPTIONAL
        totalReceivedAmount = 0.00,
        paymentId,
        exchangeRate = 1,
        currencyId,
        referenceNumber,
        notes,
        inputterId,
        allocationLines = [] // Extract allocationLines from request body
      } = req.body;

      // Support multipart/form-data where arrays are stringified
      let parsedAllocationLines = allocationLines;
      if (typeof allocationLines === 'string') {
        try {
          parsedAllocationLines = JSON.parse(allocationLines);
        } catch (e) {
          parsedAllocationLines = [];
        }
      }

      logger.info('Create receive header request:', {
        receiptNumber,
        invoiceHeaderId: invoiceHeaderId || 'none',
        totalReceivedAmount,
        allocationLinesCount: parsedAllocationLines.length
      });

      // Validate required fields
      if (!receiptNumber || !bookingDate || !receivedDate) {
        await transaction.rollback();
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Receipt number, booking date, and received date are required'
        });
      }

      // Validate allocation lines
      if (!parsedAllocationLines || parsedAllocationLines.length === 0) {
        await transaction.rollback();
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'At least one allocation line is required'
        });
      }

      // Handle empty string inputterId - convert to null
      const validInputterId = inputterId && inputterId.toString().trim() !== '' ? inputterId : null;

      // Check if receipt number already exists
      const existingReceipt = await ReceiveHeader.findOne({
        where: { receiptNumber }
      });

      if (existingReceipt) {
        await transaction.rollback();
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Receipt number already exists'
        });
      }

      // Verify invoice header exists ONLY if provided
      if (invoiceHeaderId) {
        const invoiceHeaderExists = await arInvoiceHeader.findByPk(invoiceHeaderId);
        if (!invoiceHeaderExists) {
          await transaction.rollback();
          await ReceiveHeaderController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: 'Invoice header not found'
          });
        }
      }

      // Verify inputter exists if provided (only check if not null/empty)
      if (validInputterId) {
        const inputterExists = await user.findByPk(validInputterId);
        if (!inputterExists) {
          await transaction.rollback();
          await ReceiveHeaderController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: 'Inputter not found'
          });
        }
      }

      // Validate allocation lines - UPDATED to support manual lines
      for (const allocation of parsedAllocationLines) {
        // Check if it's a manual line (no invoiceLineId) or invoice-based line
        const isManualLine = !allocation.invoiceLineId || allocation.isManual;

        if (isManualLine) {
          // For manual lines, require description and allocatedAmount
          if (!allocation.description || !allocation.allocatedAmount || parseFloat(allocation.allocatedAmount) <= 0) {
            await transaction.rollback();
            await ReceiveHeaderController.cleanupUploadedFiles(req.files);
            return res.status(400).json({
              success: false,
              message: 'Manual allocation lines require a description and a valid allocated amount'
            });
          }
        } else {
          // For invoice-based lines, require invoiceLineId, txnId, and allocatedAmount
          if (!allocation.invoiceLineId || !allocation.txnId || !allocation.allocatedAmount || parseFloat(allocation.allocatedAmount) <= 0) {
            await transaction.rollback();
            await ReceiveHeaderController.cleanupUploadedFiles(req.files);
            return res.status(400).json({
              success: false,
              message: 'Invoice-based allocation lines require an invoice line, financial code, and valid allocated amount'
            });
          }

          // Verify invoice line exists
          const invoiceLineExists = await arInvoiceLine.findByPk(allocation.invoiceLineId);
          if (!invoiceLineExists) {
            await transaction.rollback();
            await ReceiveHeaderController.cleanupUploadedFiles(req.files);
            return res.status(400).json({
              success: false,
              message: `Invoice line ID ${allocation.invoiceLineId} not found`
            });
          }
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

      // Create receive header with optional invoiceHeaderId
      const receiveHeader = await ReceiveHeader.create({
        receiptNumber,
        bookingDate,
        receivedDate,
        invoiceHeaderId: invoiceHeaderId || null, // Allow null
        totalReceivedAmount,
        paymentId,
        exchangeRate,
        currencyId,
        referenceNumber,
        notes,
        documents: documents.length > 0 ? documents : null,
        inputterId: validInputterId,
        makerId: req.user?.id
      }, { transaction });

      logger.info('Receive header created:', { id: receiveHeader.id });

      // Create allocation lines (receive lines) - UPDATED to handle manual lines
      const allocationLinesData = parsedAllocationLines.map(allocation => ({
        receiveHeaderId: receiveHeader.id,
        lineNumber: allocation.lineNumber,
        invoiceLineId: allocation.invoiceLineId || null, // Allow null for manual lines
        txnId: allocation.txnId || null, // Allow null for manual lines
        DRglAccountId: allocation.DRglAccountId,
        CRglAccountId: allocation.CRglAccountId,
        description: allocation.description || null, // Store description for manual lines
        allocatedAmount: parseFloat(allocation.allocatedAmount),
        allocationDate: allocation.allocationDate || receivedDate,
        notes: allocation.notes || '',
        isManual: !allocation.invoiceLineId, // Flag manual lines
        makerId: req.user?.id
      }));

      const createdReceiveLines = await arReceiveLine.bulkCreate(allocationLinesData, { transaction });

      logger.info('Receive lines created:', { count: createdReceiveLines.length });

      await transaction.commit();

      // Fetch the complete receive header with allocations
      const createdReceiveHeader = await ReceiveHeader.findByPk(receiveHeader.id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate'],
            required: false // LEFT JOIN - don't require invoice
          },
          {
            model: user,
            as: 'inputter',
            required: false
          },
          {
            model: user,
            as: 'maker',
            required: false
          },
          {
            model: arReceiveLine,
            as: 'receiveLines',
            include: [
              {
                model: arInvoiceLine,
                as: 'invoiceLine',
                required: false // LEFT JOIN - manual lines won't have this
              }
            ]
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Receive header created successfully',
        data: createdReceiveHeader
      });

    } catch (error) {
      await transaction.rollback();
      if (req.files) {
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
      }
      logger.error('Error creating receive header:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating receive header',
        error: error.message
      });
    }
  }

  // UPDATED UPDATE METHOD - Support manual lines and optional invoice
  static async update(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;
      const { allocationLines, ...updateData } = req.body; // Extract allocationLines separately

      // Support multipart/form-data where arrays are stringified
      let parsedAllocationLines = allocationLines;
      if (typeof allocationLines === 'string') {
        try {
          parsedAllocationLines = JSON.parse(allocationLines);
        } catch (e) {
          parsedAllocationLines = [];
        }
      }

      logger.info('Update receive header request:', {
        id,
        allocationLinesCount: parsedAllocationLines ? parsedAllocationLines.length : 0
      });

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        await transaction.rollback();
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.makerId;

      // Handle empty string inputterId
      if ('inputterId' in updateData) {
        updateData.inputterId = updateData.inputterId && updateData.inputterId.toString().trim() !== ''
          ? updateData.inputterId
          : null;
      }

      // Handle empty string invoiceHeaderId
      if ('invoiceHeaderId' in updateData) {
        updateData.invoiceHeaderId = updateData.invoiceHeaderId && updateData.invoiceHeaderId.toString().trim() !== ''
          ? updateData.invoiceHeaderId
          : null;
      }

      // Check receipt number uniqueness if being updated
      if (updateData.receiptNumber && updateData.receiptNumber !== receiveHeader.receiptNumber) {
        const existingReceipt = await ReceiveHeader.findOne({
          where: {
            receiptNumber: updateData.receiptNumber,
            id: { [Op.ne]: id }
          }
        });

        if (existingReceipt) {
          await transaction.rollback();
          await ReceiveHeaderController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: 'Receipt number already exists'
          });
        }
      }

      // Verify foreign key references if being updated
      if (updateData.invoiceHeaderId) {
        const invoiceHeaderExists = await arInvoiceHeader.findByPk(updateData.invoiceHeaderId);
        if (!invoiceHeaderExists) {
          await transaction.rollback();
          await ReceiveHeaderController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: 'Invoice header not found'
          });
        }
      }

      if (updateData.inputterId) {
        const inputterExists = await user.findByPk(updateData.inputterId);
        if (!inputterExists) {
          await transaction.rollback();
          await ReceiveHeaderController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: 'Inputter not found'
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
        existingDocs = receiveHeader.documents || [];
      }

      // Clean up physically deleted files from server storage
      const fs = require('fs');
      const currentDocs = receiveHeader.documents || [];
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

      // Update receive header
      await receiveHeader.update(updateData, { transaction });

      // Handle allocation lines if provided - UPDATED to support manual lines
      if (parsedAllocationLines && Array.isArray(parsedAllocationLines)) {
        // Delete existing receive lines
        await arReceiveLine.destroy({
          where: { receiveHeaderId: id },
          transaction
        });

        // Create new allocation lines
        if (parsedAllocationLines.length > 0) {
          // Validate allocation lines - UPDATED
          for (const allocation of parsedAllocationLines) {
            const isManualLine = !allocation.invoiceLineId || allocation.isManual;

            if (isManualLine) {
              // For manual lines, require description and allocatedAmount
              if (!allocation.description || !allocation.allocatedAmount || parseFloat(allocation.allocatedAmount) <= 0) {
                await transaction.rollback();
                await ReceiveHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                  success: false,
                  message: 'Manual allocation lines must have description and allocatedAmount'
                });
              }
            } else {
              // For invoice-based lines, verify invoice line exists
              const invoiceLineExists = await arInvoiceLine.findByPk(allocation.invoiceLineId);
              if (!invoiceLineExists) {
                await transaction.rollback();
                await ReceiveHeaderController.cleanupUploadedFiles(req.files);
                return res.status(400).json({
                  success: false,
                  message: `Invoice line ${allocation.invoiceLineId} not found`
                });
              }
            }

            // Validate allocated amount
            const allocatedAmount = parseFloat(allocation.allocatedAmount);
            if (allocatedAmount <= 0) {
              await transaction.rollback();
              await ReceiveHeaderController.cleanupUploadedFiles(req.files);
              return res.status(400).json({
                success: false,
                message: 'Allocated amount must be greater than 0'
              });
            }
          }

          const allocationLinesData = parsedAllocationLines.map(allocation => ({
            receiveHeaderId: id,
            lineNumber: allocation.lineNumber,
            invoiceLineId: allocation.invoiceLineId || null, // Allow null for manual lines
            txnId: allocation.txnId || null, // Allow null for manual lines
            DRglAccountId: allocation.DRglAccountId,
            CRglAccountId: allocation.CRglAccountId,
            description: allocation.description || null, // Store description for manual lines
            allocatedAmount: parseFloat(allocation.allocatedAmount),
            allocationDate: allocation.allocationDate || receiveHeader.receivedDate,
            notes: allocation.notes || '',
            isManual: !allocation.invoiceLineId, // Flag manual lines
            makerId: req.user?.id
          }));

          await arReceiveLine.bulkCreate(allocationLinesData, { transaction });
        }
      }

      await transaction.commit();

      // Fetch updated receive header with allocations
      const updatedReceiveHeader = await ReceiveHeader.findByPk(id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate'],
            required: false // LEFT JOIN
          },
          {
            model: user,
            as: 'inputter',
            required: false
          },
          {
            model: user,
            as: 'maker',
            required: false
          },
          {
            model: user,
            as: 'updateUser',
            required: false
          },
          {
            model: arReceiveLine,
            as: 'receiveLines',
            include: [
              {
                model: arInvoiceLine,
                as: 'invoiceLine',
                required: false // LEFT JOIN
              }
            ]
          }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Receive header updated successfully',
        data: updatedReceiveHeader
      });

    } catch (error) {
      await transaction.rollback();
      if (req.files) {
        await ReceiveHeaderController.cleanupUploadedFiles(req.files);
      }
      logger.error('Error updating receive header:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating receive header',
        error: error.message
      });
    }
  }
  // DELETE RECEIVE HEADER
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      // Check if receive header has receive lines (business logic)
      const receiveLineCount = await arReceiveLine.count({
        where: { receiveHeaderId: id }
      });

      if (receiveLineCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete receive header with associated receive lines'
        });
      }

      await receiveHeader.destroy();

      res.status(200).json({
        success: true,
        message: 'Receive header deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting receive header:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting receive header',
        error: error.message
      });
    }
  }

  // GET RECEIVE HEADER STATISTICS
  static async getStatistics(req, res) {
    try {
      const { invoiceHeaderId, dateFrom, dateTo } = req.query;
      const whereClause = {};

      if (invoiceHeaderId) whereClause.invoiceHeaderId = invoiceHeaderId;
      if (dateFrom || dateTo) {
        whereClause.bookingDate = {};
        if (dateFrom) whereClause.bookingDate[Op.gte] = dateFrom;
        if (dateTo) whereClause.bookingDate[Op.lte] = dateTo;
      }

      // Total counts
      const totalReceipts = await ReceiveHeader.count({ where: whereClause });

      // Payment method breakdown
      const paymentMethodStats = await ReceiveHeader.findAll({
        where: whereClause,
        attributes: [
          'paymentId',
          [sequelize.fn('COUNT', sequelize.col('paymentId')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
        ],
        group: ['paymentId'],
        raw: true
      });

      // Amount summaries
      const [amountSummary] = await ReceiveHeader.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalReceivedAmount'],
          [sequelize.fn('AVG', sequelize.col('totalReceivedAmount')), 'averageAmount'],
          [sequelize.fn('MIN', sequelize.col('totalReceivedAmount')), 'minAmount'],
          [sequelize.fn('MAX', sequelize.col('totalReceivedAmount')), 'maxAmount']
        ],
        raw: true
      });

      // Monthly breakdown
      const monthlyStats = await ReceiveHeader.findAll({
        where: whereClause,
        attributes: [
          [sequelize.literal("DATE_TRUNC('month', \"bookingDate\")"), 'month'],
          [sequelize.fn('COUNT', '*'), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
        ],
        group: [sequelize.literal("DATE_TRUNC('month', \"bookingDate\")")],
        order: [[sequelize.literal("DATE_TRUNC('month', \"bookingDate\")"), 'DESC']],
        limit: 12,
        raw: true
      });

      // Top inputters by volume
      const topInputters = await ReceiveHeader.findAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'inputter',
            attributes: ['id', 'username']
          }
        ],
        attributes: [
          'inputterId',
          [sequelize.fn('COUNT', '*'), 'receiptCount'],
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
        ],
        group: ['inputterId', 'inputter.id', 'inputter.username'],
        order: [[sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'DESC']],
        limit: 10,
        raw: false
      });

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalReceipts,
            totalReceivedAmount: parseFloat(amountSummary.totalReceivedAmount) || 0,
            averageAmount: parseFloat(amountSummary.averageAmount) || 0,
            minAmount: parseFloat(amountSummary.minAmount) || 0,
            maxAmount: parseFloat(amountSummary.maxAmount) || 0
          },
          paymentMethodBreakdown: paymentMethodStats,
          monthlyStats: monthlyStats,
          topInputters: topInputters
        }
      });

    } catch (error) {
      logger.error('Error fetching receive header statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive header statistics',
        error: error.message
      });
    }
  }

  // SEARCH RECEIVE HEADERS
  static async search(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const receiveHeaders = await ReceiveHeader.findAll({
        where: {
          [Op.or]: [
            { receiptNumber: { [Op.iLike]: `%${q}%` } },
            { referenceNumber: { [Op.iLike]: `%${q}%` } },
            { notes: { [Op.iLike]: `%${q}%` } }
          ]
        },
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber']
          }
        ],
        limit: 10,
        attributes: ['id', 'receiptNumber', 'bookingDate', 'totalReceivedAmount', 'paymentId']
      });

      res.status(200).json({
        success: true,
        data: receiveHeaders
      });

    } catch (error) {
      logger.error('Error searching receive headers:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching receive headers',
        error: error.message
      });
    }
  }

  // GET RECEIPTS BY INVOICE HEADER ID
  static async findByInvoiceHeader(req, res) {
    try {
      const { invoiceHeaderId } = req.params;

      const receiveHeaders = await ReceiveHeader.findAll({
        where: { invoiceHeaderId },
        include: [
          {
            model: user,
            as: 'inputter'
          },
          {
            model: user,
            as: 'maker'
          },
          {
            model: arReceiveLine,
            as: 'receiveLines'
          }
        ],
        order: [['bookingDate', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: receiveHeaders
      });

    } catch (error) {
      logger.error('Error fetching receive headers by invoice:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive headers by invoice',
        error: error.message
      });
    }
  }

  // HELPER: Get payment method statistics
  static async getPaymentMethodStats() {
    const stats = await ReceiveHeader.findAll({
      attributes: [
        'paymentId',
        [sequelize.fn('COUNT', '*'), 'count'],
        [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
      ],
      group: ['paymentId'],
      raw: true
    });

    return stats;
  }

  // HELPER: Calculate total received for an invoice
  static async calculateInvoiceReceivedTotal(invoiceHeaderId) {
    const [total] = await ReceiveHeader.findAll({
      where: { invoiceHeaderId },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalReceived'],
        [sequelize.fn('COUNT', '*'), 'receiptCount']
      ],
      raw: true
    });

    return {
      totalReceived: parseFloat(total.totalReceived) || 0,
      receiptCount: parseInt(total.receiptCount) || 0
    };
  }

  // HELPER: Get next receipt number
  static async getNextReceiptNumber(prefix = 'RCP') {
    const latestReceipt = await ReceiveHeader.findOne({
      where: {
        receiptNumber: {
          [Op.like]: `${prefix}%`
        }
      },
      order: [['receiptNumber', 'DESC']],
      attributes: ['receiptNumber']
    });

    if (!latestReceipt) {
      return `${prefix}001`;
    }

    const lastNumber = parseInt(latestReceipt.receiptNumber.replace(prefix, ''));
    const nextNumber = (lastNumber + 1).toString().padStart(3, '0');

    return `${prefix}${nextNumber}`;
  }

  // VOID RECEIPT
  static async voidReceipt(req, res) {
    try {
      const { id } = req.params;
      const { userId, reason } = req.body;

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      await receiveHeader.voidReceipt(userId || req.user?.id, reason);

      res.status(200).json({
        success: true,
        message: 'Receive header voided successfully',
        data: receiveHeader
      });
    } catch (error) {
      logger.error('Error voiding receive header:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error voiding receive header'
      });
    }
  }

  // CANCEL RECEIPT
  static async cancelReceipt(req, res) {
    try {
      const { id } = req.params;
      const { userId, reason } = req.body;

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      await receiveHeader.cancelReceipt(userId || req.user?.id, reason);

      res.status(200).json({
        success: true,
        message: 'Receive header cancelled successfully',
        data: receiveHeader
      });
    } catch (error) {
      logger.error('Error cancelling receive header:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error cancelling receive header'
      });
    }
  }

  // REACTIVATE RECEIPT
  static async reactivateReceipt(req, res) {
    try {
      const { id } = req.params;
      const { userId, reason } = req.body;

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      await receiveHeader.reactivateReceipt(userId || req.user?.id, reason);

      res.status(200).json({
        success: true,
        message: 'Receive header reactivated successfully',
        data: receiveHeader
      });
    } catch (error) {
      logger.error('Error reactivating receive header:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error reactivating receive header'
      });
    }
  }
}

module.exports = ReceiveHeaderController;