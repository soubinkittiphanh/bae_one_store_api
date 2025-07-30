// ===============================================================
// AR RECEIVE HEADER CONTROLLER
// ===============================================================
const logger = require("../api/logger");
const { user, arInvoiceHeader, arReceiveLine } = require('../models');
const ReceiveHeader = require('../models').arReceiveHeader;
const { Op } = require('sequelize');

class ReceiveHeaderController {

  // GET ALL RECEIVE HEADERS WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        paymentMethod = '',
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
      if (paymentMethod) {
        whereClause.paymentMethod = paymentMethod;
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
            attributes: ['id', 'invoiceNumber', 'invoiceDate', 'status']
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

  // GET RECEIVE HEADER BY ID
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
            as: 'receiveLines'
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

  // CREATE NEW RECEIVE HEADER
  static async create(req, res) {
    try {
      const {
        receiptNumber,
        bookingDate,
        receivedDate,
        invoiceHeaderId,
        totalReceivedAmount = 0.00,
        paymentMethod = 'cash',
        referenceNumber,
        notes,
        inputterId
      } = req.body;

      // Validate required fields
      if (!receiptNumber || !bookingDate || !receivedDate || !invoiceHeaderId) {
        return res.status(400).json({
          success: false,
          message: 'Receipt number, booking date, received date, and invoice header ID are required'
        });
      }

      // Check if receipt number already exists
      const existingReceipt = await ReceiveHeader.findOne({
        where: { receiptNumber }
      });

      if (existingReceipt) {
        return res.status(400).json({
          success: false,
          message: 'Receipt number already exists'
        });
      }

      // Verify invoice header exists
      const invoiceHeaderExists = await arInvoiceHeader.findByPk(invoiceHeaderId);
      if (!invoiceHeaderExists) {
        return res.status(400).json({
          success: false,
          message: 'Invoice header not found'
        });
      }

      // Verify inputter exists if provided
      if (inputterId) {
        const inputterExists = await user.findByPk(inputterId);
        if (!inputterExists) {
          return res.status(400).json({
            success: false,
            message: 'Inputter not found'
          });
        }
      }

      const receiveHeader = await ReceiveHeader.create({
        receiptNumber,
        bookingDate,
        receivedDate,
        invoiceHeaderId,
        totalReceivedAmount,
        paymentMethod,
        referenceNumber,
        notes,
        inputterId,
        makerId: req.user?.id
      });

      const createdReceiveHeader = await ReceiveHeader.findByPk(receiveHeader.id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate']
          },
          {
            model: user,
            as: 'inputter'
          },
          {
            model: user,
            as: 'maker'
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Receive header created successfully',
        data: createdReceiveHeader
      });

    } catch (error) {
      logger.error('Error creating receive header:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating receive header',
        error: error.message
      });
    }
  }

  // UPDATE RECEIVE HEADER
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const receiveHeader = await ReceiveHeader.findByPk(id);
      if (!receiveHeader) {
        return res.status(404).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.makerId;

      // Check receipt number uniqueness if being updated
      if (updateData.receiptNumber && updateData.receiptNumber !== receiveHeader.receiptNumber) {
        const existingReceipt = await ReceiveHeader.findOne({
          where: { 
            receiptNumber: updateData.receiptNumber,
            id: { [Op.ne]: id }
          }
        });

        if (existingReceipt) {
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
          return res.status(400).json({
            success: false,
            message: 'Invoice header not found'
          });
        }
      }

      if (updateData.inputterId) {
        const inputterExists = await user.findByPk(updateData.inputterId);
        if (!inputterExists) {
          return res.status(400).json({
            success: false,
            message: 'Inputter not found'
          });
        }
      }

      // Add update user info
      updateData.updateUserId = req.user?.id;

      await receiveHeader.update(updateData);

      const updatedReceiveHeader = await ReceiveHeader.findByPk(id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate']
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
          }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Receive header updated successfully',
        data: updatedReceiveHeader
      });

    } catch (error) {
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
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('paymentMethod')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
        ],
        group: ['paymentMethod'],
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
        attributes: ['id', 'receiptNumber', 'bookingDate', 'totalReceivedAmount', 'paymentMethod']
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
        'paymentMethod',
        [sequelize.fn('COUNT', '*'), 'count'],
        [sequelize.fn('SUM', sequelize.col('totalReceivedAmount')), 'totalAmount']
      ],
      group: ['paymentMethod'],
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
}

module.exports = ReceiveHeaderController;