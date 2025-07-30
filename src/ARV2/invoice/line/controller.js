// ===============================================================
// AR INVOICE LINE CONTROLLER
// ===============================================================

const logger = require('../../../api/logger');
const { user, arInvoiceHeader, arReceiveLine } = require('../../../models');
const InvoiceLine = require('../../../models').arInvoiceLine;
const { Op } = require('sequelize');

class InvoiceLineController {

  // GET ALL INVOICE LINES WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        invoiceHeaderId = '',
        minQuantity = '',
        maxQuantity = '',
        minUnitPrice = '',
        maxUnitPrice = '',
        sortBy = 'lineNumber',
        sortOrder = 'ASC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Invoice header filter
      if (invoiceHeaderId) {
        whereClause.invoiceHeaderId = invoiceHeaderId;
      }

      // Quantity range filter
      if (minQuantity || maxQuantity) {
        whereClause.quantity = {};
        if (minQuantity) whereClause.quantity[Op.gte] = minQuantity;
        if (maxQuantity) whereClause.quantity[Op.lte] = maxQuantity;
      }

      // Unit price range filter
      if (minUnitPrice || maxUnitPrice) {
        whereClause.unitPrice = {};
        if (minUnitPrice) whereClause.unitPrice[Op.gte] = minUnitPrice;
        if (maxUnitPrice) whereClause.unitPrice[Op.lte] = maxUnitPrice;
      }

      const { count, rows } = await InvoiceLine.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate', 'status']
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
          invoiceLines: rows,
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
      logger.error('Error fetching invoice lines:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice lines',
        error: error.message
      });
    }
  }

  // GET INVOICE LINE BY ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const invoiceLine = await InvoiceLine.findByPk(id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader'
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

      if (!invoiceLine) {
        return res.status(404).json({
          success: false,
          message: 'Invoice line not found'
        });
      }

      res.status(200).json({
        success: true,
        data: invoiceLine
      });

    } catch (error) {
      logger.error('Error fetching invoice line:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice line',
        error: error.message
      });
    }
  }

  // CREATE NEW INVOICE LINE
  static async create(req, res) {
    try {
      const {
        invoiceHeaderId,
        lineNumber,
        description,
        quantity = 1.00,
        unitPrice = 0.00,
        taxRate = 0.00
      } = req.body;

      // Validate required fields
      if (!invoiceHeaderId || !lineNumber || !description) {
        return res.status(400).json({
          success: false,
          message: 'Invoice header ID, line number, and description are required'
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

      // Check if line number already exists for this invoice header
      const existingLine = await InvoiceLine.findOne({
        where: { 
          invoiceHeaderId,
          lineNumber 
        }
      });

      if (existingLine) {
        return res.status(400).json({
          success: false,
          message: 'Line number already exists for this invoice'
        });
      }

      // Calculate line total and tax amount
      const lineTotal = parseFloat(quantity) * parseFloat(unitPrice);
      const taxAmount = lineTotal * (parseFloat(taxRate) / 100);

      const invoiceLine = await InvoiceLine.create({
        invoiceHeaderId,
        lineNumber,
        description,
        quantity,
        unitPrice,
        lineTotal,
        taxRate,
        taxAmount,
        makerId: req.user?.id
      });

      const createdInvoiceLine = await InvoiceLine.findByPk(invoiceLine.id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate']
          },
          {
            model: user,
            as: 'maker'
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Invoice line created successfully',
        data: createdInvoiceLine
      });

    } catch (error) {
      logger.error('Error creating invoice line:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating invoice line',
        error: error.message
      });
    }
  }

  // UPDATE INVOICE LINE
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const invoiceLine = await InvoiceLine.findByPk(id);
      if (!invoiceLine) {
        return res.status(404).json({
          success: false,
          message: 'Invoice line not found'
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.makerId;

      // Check line number uniqueness if being updated
      if (updateData.lineNumber && updateData.lineNumber !== invoiceLine.lineNumber) {
        const existingLine = await InvoiceLine.findOne({
          where: { 
            invoiceHeaderId: updateData.invoiceHeaderId || invoiceLine.invoiceHeaderId,
            lineNumber: updateData.lineNumber,
            id: { [Op.ne]: id }
          }
        });

        if (existingLine) {
          return res.status(400).json({
            success: false,
            message: 'Line number already exists for this invoice'
          });
        }
      }

      // Verify invoice header exists if being updated
      if (updateData.invoiceHeaderId) {
        const invoiceHeaderExists = await arInvoiceHeader.findByPk(updateData.invoiceHeaderId);
        if (!invoiceHeaderExists) {
          return res.status(400).json({
            success: false,
            message: 'Invoice header not found'
          });
        }
      }

      // Recalculate totals if quantity, unitPrice, or taxRate changed
      const quantity = updateData.quantity !== undefined ? parseFloat(updateData.quantity) : parseFloat(invoiceLine.quantity);
      const unitPrice = updateData.unitPrice !== undefined ? parseFloat(updateData.unitPrice) : parseFloat(invoiceLine.unitPrice);
      const taxRate = updateData.taxRate !== undefined ? parseFloat(updateData.taxRate) : parseFloat(invoiceLine.taxRate);

      if (updateData.quantity !== undefined || updateData.unitPrice !== undefined || updateData.taxRate !== undefined) {
        const lineTotal = quantity * unitPrice;
        const taxAmount = lineTotal * (taxRate / 100);
        
        updateData.lineTotal = lineTotal;
        updateData.taxAmount = taxAmount;
      }

      // Add update user info
      updateData.updateUserId = req.user?.id;

      await invoiceLine.update(updateData);

      const updatedInvoiceLine = await InvoiceLine.findByPk(id, {
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber', 'invoiceDate']
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
        message: 'Invoice line updated successfully',
        data: updatedInvoiceLine
      });

    } catch (error) {
      logger.error('Error updating invoice line:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating invoice line',
        error: error.message
      });
    }
  }

  // DELETE INVOICE LINE
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const invoiceLine = await InvoiceLine.findByPk(id);
      if (!invoiceLine) {
        return res.status(404).json({
          success: false,
          message: 'Invoice line not found'
        });
      }

      // Check if invoice line has receive lines (business logic)
      const receiveLineCount = await arReceiveLine.count({
        where: { invoiceLineId: id }
      });

      if (receiveLineCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete invoice line with associated receive lines'
        });
      }

      await invoiceLine.destroy();

      res.status(200).json({
        success: true,
        message: 'Invoice line deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting invoice line:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting invoice line',
        error: error.message
      });
    }
  }

  // GET INVOICE LINE STATISTICS
  static async getStatistics(req, res) {
    try {
      const { invoiceHeaderId } = req.query;
      const whereClause = {};

      if (invoiceHeaderId) whereClause.invoiceHeaderId = invoiceHeaderId;

      // Total counts
      const totalLines = await InvoiceLine.count({ where: whereClause });

      // Amount summaries
      const [amountSummary] = await InvoiceLine.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
          [sequelize.fn('SUM', sequelize.col('lineTotal')), 'totalLineAmount'],
          [sequelize.fn('SUM', sequelize.col('taxAmount')), 'totalTaxAmount'],
          [sequelize.fn('AVG', sequelize.col('unitPrice')), 'averageUnitPrice'],
          [sequelize.fn('AVG', sequelize.col('quantity')), 'averageQuantity']
        ],
        raw: true
      });

      // Top products by quantity
      const topByQuantity = await InvoiceLine.findAll({
        where: whereClause,
        attributes: [
          'description',
          [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
          [sequelize.fn('COUNT', '*'), 'occurrences']
        ],
        group: ['description'],
        order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
        limit: 10,
        raw: true
      });

      // Top products by value
      const topByValue = await InvoiceLine.findAll({
        where: whereClause,
        attributes: [
          'description',
          [sequelize.fn('SUM', sequelize.col('lineTotal')), 'totalValue'],
          [sequelize.fn('COUNT', '*'), 'occurrences']
        ],
        group: ['description'],
        order: [[sequelize.fn('SUM', sequelize.col('lineTotal')), 'DESC']],
        limit: 10,
        raw: true
      });

      // Tax rate distribution
      const taxRateStats = await InvoiceLine.findAll({
        where: whereClause,
        attributes: [
          'taxRate',
          [sequelize.fn('COUNT', '*'), 'count'],
          [sequelize.fn('SUM', sequelize.col('taxAmount')), 'totalTaxAmount']
        ],
        group: ['taxRate'],
        order: [[sequelize.col('taxRate'), 'ASC']],
        raw: true
      });

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalLines,
            totalQuantity: parseFloat(amountSummary.totalQuantity) || 0,
            totalLineAmount: parseFloat(amountSummary.totalLineAmount) || 0,
            totalTaxAmount: parseFloat(amountSummary.totalTaxAmount) || 0,
            averageUnitPrice: parseFloat(amountSummary.averageUnitPrice) || 0,
            averageQuantity: parseFloat(amountSummary.averageQuantity) || 0
          },
          topByQuantity,
          topByValue,
          taxRateStats
        }
      });

    } catch (error) {
      logger.error('Error fetching invoice line statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice line statistics',
        error: error.message
      });
    }
  }

  // SEARCH INVOICE LINES
  static async search(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const invoiceLines = await InvoiceLine.findAll({
        where: {
          description: { [Op.iLike]: `%${q}%` }
        },
        include: [
          {
            model: arInvoiceHeader,
            as: 'invoiceHeader',
            attributes: ['id', 'invoiceNumber']
          }
        ],
        limit: 10,
        attributes: ['id', 'lineNumber', 'description', 'quantity', 'unitPrice', 'lineTotal']
      });

      res.status(200).json({
        success: true,
        data: invoiceLines
      });

    } catch (error) {
      logger.error('Error searching invoice lines:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching invoice lines',
        error: error.message
      });
    }
  }

  // GET LINES BY INVOICE HEADER ID
  static async findByInvoiceHeader(req, res) {
    try {
      const { invoiceHeaderId } = req.params;

      const invoiceLines = await InvoiceLine.findAll({
        where: { invoiceHeaderId },
        include: [
          {
            model: user,
            as: 'maker'
          },
          {
            model: user,
            as: 'updateUser'
          }
        ],
        order: [['lineNumber', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: invoiceLines
      });

    } catch (error) {
      logger.error('Error fetching invoice lines by header:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching invoice lines by header',
        error: error.message
      });
    }
  }

  // HELPER: Get next line number for an invoice
  static async getNextLineNumber(invoiceHeaderId) {
    const maxLineNumber = await InvoiceLine.max('lineNumber', {
      where: { invoiceHeaderId }
    });

    return (maxLineNumber || 0) + 1;
  }

  // HELPER: Calculate invoice totals from lines
  static async calculateInvoiceTotals(invoiceHeaderId) {
    const [totals] = await InvoiceLine.findAll({
      where: { invoiceHeaderId },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('lineTotal')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('taxAmount')), 'totalTaxAmount']
      ],
      raw: true
    });

    return {
      totalAmount: parseFloat(totals.totalAmount) || 0,
      totalTaxAmount: parseFloat(totals.totalTaxAmount) || 0,
      netAmount: (parseFloat(totals.totalAmount) || 0) - (parseFloat(totals.totalTaxAmount) || 0)
    };
  }
}

module.exports = InvoiceLineController;