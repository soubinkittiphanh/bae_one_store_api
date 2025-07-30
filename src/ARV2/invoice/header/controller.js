// ===============================================================
// AR INVOICE HEADER CONTROLLER
// ===============================================================

const logger = require('../../../api/logger');
const { user, customer, currency, arInvoiceLine, arReceiveHeader } = require('../../../models');
const InvoiceHeader = require('../../../models').arInvoiceHeader;
const { Op } = require('sequelize');
class InvoiceHeaderController {

  // GET ALL INVOICES WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        status = '',
        customerId = '',
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
      if (customerId) {
        whereClause.customerId = customerId;
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
            model: customer,
            as: 'customer'
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
            model: customer,
            as: 'customer'
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
            model: arReceiveHeader,
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

  // CREATE NEW INVOICE
  static async create(req, res) {
    try {
      const {
        invoiceNumber,
        invoiceDate,
        dueDate,
        customerId,
        currencyId,
        exchangeRate = 1,
        totalAmount = 0,
        taxAmount = 0,
        netAmount = 0,
        status = 'draft',
        description
      } = req.body;

      // Validate required fields
      if (!invoiceNumber || !invoiceDate || !customerId) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number, invoice date, and customer ID are required'
        });
      }

      // Check if invoice number already exists
      const existingInvoice = await InvoiceHeader.findOne({
        where: { invoiceNumber }
      });

      if (existingInvoice) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number already exists'
        });
      }

      // Verify customer exists
      const customerExists = await customer.findByPk(customerId);
      if (!customerExists) {
        return res.status(400).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Verify currency exists if provided
      if (currencyId) {
        const currencyExists = await currency.findByPk(currencyId);
        if (!currencyExists) {
          return res.status(400).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      const invoice = await InvoiceHeader.create({
        invoiceNumber,
        invoiceDate,
        dueDate,
        customerId,
        currencyId,
        exchangeRate,
        totalAmount,
        taxAmount,
        netAmount,
        status,
        description,
        makerId: req.user?.id
      });

      const createdInvoice = await InvoiceHeader.findByPk(invoice.id, {
        include: [
          {
            model: customer,
            as: 'customer'
          },
          {
            model: currency,
            as: 'currency'
          },
          {
            model: user,
            as: 'maker'
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        data: createdInvoice
      });

    } catch (error) {
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
    try {
      const { id } = req.params;
      const updateData = req.body;

      const invoice = await InvoiceHeader.findByPk(id);
      if (!invoice) {
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
          return res.status(400).json({
            success: false,
            message: 'Invoice number already exists'
          });
        }
      }

      // Verify foreign key references if being updated
      if (updateData.customerId) {
        const customerExists = await customer.findByPk(updateData.customerId);
        if (!customerExists) {
          return res.status(400).json({
            success: false,
            message: 'Customer not found'
          });
        }
      }

      if (updateData.currencyId) {
        const currencyExists = await currency.findByPk(updateData.currencyId);
        if (!currencyExists) {
          return res.status(400).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      // Add update user info
      updateData.updateUserId = req.user?.id;

      await invoice.update(updateData);

      const updatedInvoice = await InvoiceHeader.findByPk(id, {
        include: [
          {
            model: customer,
            as: 'customer'
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
      const { customerId, dateFrom, dateTo } = req.query;
      const whereClause = {};

      if (customerId) whereClause.customerId = customerId;
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
            model: customer,
            as: 'customer',
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
  static async getCustomerTotals(customerId) {
    const totals = await InvoiceHeader.findAll({
      where: { customerId },
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