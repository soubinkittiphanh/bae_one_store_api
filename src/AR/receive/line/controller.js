// ===============================================================
// AR RECEIVE LINE CONTROLLER
// ===============================================================
const logger = require("../../../api/logger");
const { user, arReceiveHeaderV2, arInvoiceLine } = require('../../../models');
const ReceiveLine = require('../../../models').arReceiveLine;
const { Op } = require('sequelize');

class ReceiveLineController {

  // GET ALL RECEIVE LINES WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        receiveHeaderId = '',
        invoiceLineId = '',
        allocationDateFrom = '',
        allocationDateTo = '',
        minAmount = '',
        maxAmount = '',
        sortBy = 'lineNumber',
        sortOrder = 'ASC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { notes: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Receive header filter
      if (receiveHeaderId) {
        whereClause.receiveHeaderId = receiveHeaderId;
      }

      // Invoice line filter
      if (invoiceLineId) {
        whereClause.invoiceLineId = invoiceLineId;
      }

      // Allocation date range filter
      if (allocationDateFrom || allocationDateTo) {
        whereClause.allocationDate = {};
        if (allocationDateFrom) whereClause.allocationDate[Op.gte] = allocationDateFrom;
        if (allocationDateTo) whereClause.allocationDate[Op.lte] = allocationDateTo;
      }

      // Allocated amount range filter
      if (minAmount || maxAmount) {
        whereClause.allocatedAmount = {};
        if (minAmount) whereClause.allocatedAmount[Op.gte] = minAmount;
        if (maxAmount) whereClause.allocatedAmount[Op.lte] = maxAmount;
      }

      const { count, rows } = await ReceiveLine.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader',
            attributes: ['id', 'receiptNumber', 'bookingDate', 'paymentMethod']
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['id', 'lineNumber', 'description', 'lineTotal']
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
          receiveLines: rows,
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
      logger.error('Error fetching receive lines:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive lines',
        error: error.message
      });
    }
  }

  // GET RECEIVE LINE BY ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const receiveLine = await ReceiveLine.findByPk(id, {
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader'
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine'
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

      if (!receiveLine) {
        return res.status(404).json({
          success: false,
          message: 'Receive line not found'
        });
      }

      res.status(200).json({
        success: true,
        data: receiveLine
      });

    } catch (error) {
      logger.error('Error fetching receive line:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive line',
        error: error.message
      });
    }
  }

  // CREATE NEW RECEIVE LINE
  static async create(req, res) {
    try {
      const {
        receiveHeaderId,
        invoiceLineId,
        lineNumber,
        allocatedAmount = 0.00,
        allocationDate,
        notes
      } = req.body;

      // Validate required fields
      if (!receiveHeaderId || !invoiceLineId || !lineNumber || !allocationDate) {
        return res.status(400).json({
          success: false,
          message: 'Receive header ID, invoice line ID, line number, and allocation date are required'
        });
      }

      // Verify receive header exists
      const receiveHeaderExists = await arReceiveHeaderV2.findByPk(receiveHeaderId);
      if (!receiveHeaderExists) {
        return res.status(400).json({
          success: false,
          message: 'Receive header not found'
        });
      }

      // Verify invoice line exists
      const invoiceLineExists = await arInvoiceLine.findByPk(invoiceLineId);
      if (!invoiceLineExists) {
        return res.status(400).json({
          success: false,
          message: 'Invoice line not found'
        });
      }

      // Check if line number already exists for this receive header
      const existingLine = await ReceiveLine.findOne({
        where: { 
          receiveHeaderId,
          lineNumber 
        }
      });

      if (existingLine) {
        return res.status(400).json({
          success: false,
          message: 'Line number already exists for this receive header'
        });
      }

      // Validate allocation amount doesn't exceed available amount
      const totalAllocated = await ReceiveLineController.getTotalAllocatedForInvoiceLine(invoiceLineId);
      const availableAmount = parseFloat(invoiceLineExists.lineTotal) - totalAllocated;
      
      if (parseFloat(allocatedAmount) > availableAmount) {
        return res.status(400).json({
          success: false,
          message: `Allocation amount exceeds available amount. Available: ${availableAmount.toFixed(2)}`
        });
      }

      const receiveLine = await ReceiveLine.create({
        receiveHeaderId,
        invoiceLineId,
        lineNumber,
        allocatedAmount,
        allocationDate,
        notes,
        makerId: req.user?.id
      });

      const createdReceiveLine = await ReceiveLine.findByPk(receiveLine.id, {
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader',
            attributes: ['id', 'receiptNumber', 'bookingDate']
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['id', 'lineNumber', 'description']
          },
          {
            model: user,
            as: 'maker'
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Receive line created successfully',
        data: createdReceiveLine
      });

    } catch (error) {
      logger.error('Error creating receive line:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating receive line',
        error: error.message
      });
    }
  }

  // UPDATE RECEIVE LINE
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const receiveLine = await ReceiveLine.findByPk(id);
      if (!receiveLine) {
        return res.status(404).json({
          success: false,
          message: 'Receive line not found'
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.makerId;

      // Check line number uniqueness if being updated
      if (updateData.lineNumber && updateData.lineNumber !== receiveLine.lineNumber) {
        const existingLine = await ReceiveLine.findOne({
          where: { 
            receiveHeaderId: updateData.receiveHeaderId || receiveLine.receiveHeaderId,
            lineNumber: updateData.lineNumber,
            id: { [Op.ne]: id }
          }
        });

        if (existingLine) {
          return res.status(400).json({
            success: false,
            message: 'Line number already exists for this receive header'
          });
        }
      }

      // Verify foreign key references if being updated
      if (updateData.receiveHeaderId) {
        const receiveHeaderExists = await arReceiveHeaderV2.findByPk(updateData.receiveHeaderId);
        if (!receiveHeaderExists) {
          return res.status(400).json({
            success: false,
            message: 'Receive header not found'
          });
        }
      }

      if (updateData.invoiceLineId) {
        const invoiceLineExists = await arInvoiceLine.findByPk(updateData.invoiceLineId);
        if (!invoiceLineExists) {
          return res.status(400).json({
            success: false,
            message: 'Invoice line not found'
          });
        }
      }

      // Validate allocation amount if being updated
      if (updateData.allocatedAmount !== undefined) {
        const invoiceLineId = updateData.invoiceLineId || receiveLine.invoiceLineId;
        const invoiceLine = await arInvoiceLine.findByPk(invoiceLineId);
        const totalAllocated = await ReceiveLineController.getTotalAllocatedForInvoiceLine(invoiceLineId, id);
        const availableAmount = parseFloat(invoiceLine.lineTotal) - totalAllocated;
        
        if (parseFloat(updateData.allocatedAmount) > availableAmount) {
          return res.status(400).json({
            success: false,
            message: `Allocation amount exceeds available amount. Available: ${availableAmount.toFixed(2)}`
          });
        }
      }

      // Add update user info
      updateData.updateUserId = req.user?.id;

      await receiveLine.update(updateData);

      const updatedReceiveLine = await ReceiveLine.findByPk(id, {
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader',
            attributes: ['id', 'receiptNumber', 'bookingDate']
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['id', 'lineNumber', 'description']
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
        message: 'Receive line updated successfully',
        data: updatedReceiveLine
      });

    } catch (error) {
      logger.error('Error updating receive line:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating receive line',
        error: error.message
      });
    }
  }

  // DELETE RECEIVE LINE
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const receiveLine = await ReceiveLine.findByPk(id);
      if (!receiveLine) {
        return res.status(404).json({
          success: false,
          message: 'Receive line not found'
        });
      }

      await receiveLine.destroy();

      res.status(200).json({
        success: true,
        message: 'Receive line deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting receive line:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting receive line',
        error: error.message
      });
    }
  }

  // GET RECEIVE LINE STATISTICS
  static async getStatistics(req, res) {
    try {
      const { receiveHeaderId, invoiceLineId } = req.query;
      const whereClause = {};

      if (receiveHeaderId) whereClause.receiveHeaderId = receiveHeaderId;
      if (invoiceLineId) whereClause.invoiceLineId = invoiceLineId;

      // Total counts
      const totalLines = await ReceiveLine.count({ where: whereClause });

      // Amount summaries
      const [amountSummary] = await ReceiveLine.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('allocatedAmount')), 'totalAllocatedAmount'],
          [sequelize.fn('AVG', sequelize.col('allocatedAmount')), 'averageAmount'],
          [sequelize.fn('MIN', sequelize.col('allocatedAmount')), 'minAmount'],
          [sequelize.fn('MAX', sequelize.col('allocatedAmount')), 'maxAmount']
        ],
        raw: true
      });

      // Monthly allocation trends
      const monthlyStats = await ReceiveLine.findAll({
        where: whereClause,
        attributes: [
          [sequelize.literal("DATE_TRUNC('month', \"allocationDate\")"), 'month'],
          [sequelize.fn('COUNT', '*'), 'count'],
          [sequelize.fn('SUM', sequelize.col('allocatedAmount')), 'totalAmount']
        ],
        group: [sequelize.literal("DATE_TRUNC('month', \"allocationDate\")")],
        order: [[sequelize.literal("DATE_TRUNC('month', \"allocationDate\")"), 'DESC']],
        limit: 12,
        raw: true
      });

      // Top allocations by amount
      const topAllocations = await ReceiveLine.findAll({
        where: whereClause,
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader',
            attributes: ['receiptNumber']
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['description']
          }
        ],
        order: [['allocatedAmount', 'DESC']],
        limit: 10,
        attributes: ['id', 'allocatedAmount', 'allocationDate']
      });

      // Allocation efficiency (percentage of invoice lines covered)
      const invoiceLineCoverage = await ReceiveLine.findAll({
        where: whereClause,
        include: [
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['lineTotal']
          }
        ],
        attributes: [
          'invoiceLineId',
          [sequelize.fn('SUM', sequelize.col('allocatedAmount')), 'totalAllocated']
        ],
        group: ['invoiceLineId', 'invoiceLine.id', 'invoiceLine.lineTotal'],
        raw: false
      });

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalLines,
            totalAllocatedAmount: parseFloat(amountSummary.totalAllocatedAmount) || 0,
            averageAmount: parseFloat(amountSummary.averageAmount) || 0,
            minAmount: parseFloat(amountSummary.minAmount) || 0,
            maxAmount: parseFloat(amountSummary.maxAmount) || 0
          },
          monthlyStats: monthlyStats,
          topAllocations: topAllocations,
          invoiceLineCoverage: invoiceLineCoverage
        }
      });

    } catch (error) {
      logger.error('Error fetching receive line statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive line statistics',
        error: error.message
      });
    }
  }

  // SEARCH RECEIVE LINES
  static async search(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const receiveLines = await ReceiveLine.findAll({
        where: {
          notes: { [Op.iLike]: `%${q}%` }
        },
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader',
            attributes: ['id', 'receiptNumber']
          },
          {
            model: arInvoiceLine,
            as: 'invoiceLine',
            attributes: ['id', 'description']
          }
        ],
        limit: 10,
        attributes: ['id', 'lineNumber', 'allocatedAmount', 'allocationDate']
      });

      res.status(200).json({
        success: true,
        data: receiveLines
      });

    } catch (error) {
      logger.error('Error searching receive lines:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching receive lines',
        error: error.message
      });
    }
  }

  // GET LINES BY RECEIVE HEADER ID
  static async findByReceiveHeader(req, res) {
    try {
      const { receiveHeaderId } = req.params;

      const receiveLines = await ReceiveLine.findAll({
        where: { receiveHeaderId },
        include: [
          {
            model: arInvoiceLine,
            as: 'invoiceLine'
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
        order: [['lineNumber', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: receiveLines
      });

    } catch (error) {
      logger.error('Error fetching receive lines by header:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive lines by header',
        error: error.message
      });
    }
  }

  // GET LINES BY INVOICE LINE ID
  static async findByInvoiceLine(req, res) {
    try {
      const { invoiceLineId } = req.params;

      const receiveLines = await ReceiveLine.findAll({
        where: { invoiceLineId },
        include: [
          {
            model: arReceiveHeaderV2,
            as: 'receiveHeader'
          },
          {
            model: user,
            as: 'maker'
          }
        ],
        order: [['allocationDate', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: receiveLines
      });

    } catch (error) {
      logger.error('Error fetching receive lines by invoice line:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receive lines by invoice line',
        error: error.message
      });
    }
  }

  // HELPER: Get next line number for a receive header
  static async getNextLineNumber(receiveHeaderId) {
    const maxLineNumber = await ReceiveLine.max('lineNumber', {
      where: { receiveHeaderId }
    });

    return (maxLineNumber || 0) + 1;
  }

  // HELPER: Get total allocated amount for an invoice line
  static async getTotalAllocatedForInvoiceLine(invoiceLineId, excludeId = null) {
    const whereClause = { invoiceLineId };
    
    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const [result] = await ReceiveLine.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('allocatedAmount')), 'totalAllocated']
      ],
      raw: true
    });

    return parseFloat(result.totalAllocated) || 0;
  }

  // HELPER: Calculate allocation status for an invoice line
  static async getInvoiceLineAllocationStatus(invoiceLineId) {
    const invoiceLine = await arInvoiceLine.findByPk(invoiceLineId);
    if (!invoiceLine) return null;

    const totalAllocated = await ReceiveLineController.getTotalAllocatedForInvoiceLine(invoiceLineId);
    const lineTotal = parseFloat(invoiceLine.lineTotal);
    
    return {
      lineTotal,
      totalAllocated,
      remainingAmount: lineTotal - totalAllocated,
      allocationPercentage: lineTotal > 0 ? (totalAllocated / lineTotal * 100).toFixed(2) : 0,
      isFullyAllocated: totalAllocated >= lineTotal
    };
  }

  // HELPER: Calculate receive header totals from lines
  static async calculateReceiveHeaderTotals(receiveHeaderId) {
    const [totals] = await ReceiveLine.findAll({
      where: { receiveHeaderId },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('allocatedAmount')), 'totalAllocated'],
        [sequelize.fn('COUNT', '*'), 'lineCount']
      ],
      raw: true
    });

    return {
      totalAllocated: parseFloat(totals.totalAllocated) || 0,
      lineCount: parseInt(totals.lineCount) || 0
    };
  }
}

module.exports = ReceiveLineController;