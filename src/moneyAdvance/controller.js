const logger = require('../api/logger');

const MoneyAdvance = require('../models').moneyAdvance;
const user = require('../models').user;
const currency = require('../models').currency;
const settlement = require('../models').moneySettlement;
const bankAccount = require('../models').bankAccount;
const ministry = require('../models').ministry;
const MoneyAdvanceAudit = require('../models').moneyAdvanceAudit;
const { AuditHelper } = require('../moneyAdvanceAudit/helper');
class MoneyAdvanceController {

  

  // UPDATED getAll METHOD IN MoneyAdvanceController
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        makerId,
        ministryId,
        bookingDate,
        available_for_settlement
      } = req.query;

      const offset = (page - 1) * limit;

      const whereClause = {};

      // Handle status parameter (can be array or single value)
      if (status) {
        if (Array.isArray(status)) {
          whereClause.status = { [require('sequelize').Op.in]: status };
        } else {
          whereClause.status = status;
        }
      }

      // Handle other filters
      if (makerId) whereClause.makerId = makerId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (bookingDate) whereClause.bookingDate = bookingDate;

      // Base query options
      const queryOptions = {
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      };

      const { count, rows } = await MoneyAdvance.findAndCountAll(queryOptions);

      let processedRows = rows;

      // Handle available_for_settlement filter
      if (available_for_settlement === 'true' || available_for_settlement === true) {
        // Filter advances that can still receive settlements
        // (either not settled at all, or partially settled)
        const advancesWithSettlementInfo = await Promise.all(
          rows.map(async (advance) => {
            // Calculate total settlements for this advance
            const settlements = await settlement.findAll({
              where: { moneyAdvanceId: advance.id }
            });

            const totalSettled = settlements.reduce((sum, s) =>
              sum + parseFloat(s.amount || 0), 0
            );

            const advanceAmount = parseFloat(advance.amount);
            const outstandingAmount = advanceAmount - totalSettled;

            // Only include if there's outstanding amount and status allows settlement
            const canReceiveSettlement =
              outstandingAmount > 0.01 && // Has outstanding amount (with small tolerance for floating point)
              ['approved', 'pending'].includes(advance.status); // Status allows settlement

            return {
              ...advance.toJSON(),
              totalSettled,
              outstandingAmount,
              canReceiveSettlement,
              settlementPercentage: advanceAmount > 0 ?
                ((totalSettled / advanceAmount) * 100).toFixed(2) : 0
            };
          })
        );

        // Filter only advances that can receive settlements
        processedRows = advancesWithSettlementInfo.filter(
          advance => advance.canReceiveSettlement
        );
      }

      // Format response to match frontend expectations
      const responseData = available_for_settlement === 'true' || available_for_settlement === true
        ? processedRows  // For settlement dialog, return the processed array directly
        : rows;          // For normal listing, return the original rows

      res.json({
        success: true,
        data: available_for_settlement === 'true' || available_for_settlement === true
          ? responseData  // Settlement dialog expects data directly
          : {             // Normal listing expects nested structure
            advances: responseData,
            pagination: {
              currentPage: parseInt(page),
              totalPages: Math.ceil(count / limit),
              totalItems: count,
              itemsPerPage: parseInt(limit)
            }
          }
      });

    } catch (error) {
      logger.error('Error fetching money advances:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching money advances',
        error: error.message
      });
    }
  }

  // ADD THIS NEW METHOD TO MoneyAdvanceController for better performance
  // GET /money-advances/available-for-settlement - Optimized endpoint for settlement dialog
  static async getAvailableForSettlement(req, res) {
    try {
      const { status = ['pending', 'approved'], limit = 50 } = req.query;

      const whereClause = {
        status: Array.isArray(status)
          ? { [require('sequelize').Op.in]: status }
          : { [require('sequelize').Op.in]: [status] }
      };

      // Get advances with their settlements in one query for better performance
      const advances = await MoneyAdvance.findAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: currency, as: 'currency' },
          { model: ministry, as: 'ministry' },
          {
            model: settlement,
            as: 'settlementLine',
            required: false // LEFT JOIN to include advances with no settlements
          }
        ],
        limit: parseInt(limit),
        order: [['createdAt', 'DESC']]
      });

      // Process advances to calculate settlement info
      const availableAdvances = advances
        .map(advance => {
          const settlements = advance.settlementLine || [];
          const totalSettled = settlements.reduce((sum, s) =>
            sum + parseFloat(s.amount || 0), 0
          );

          const advanceAmount = parseFloat(advance.amount);
          const outstandingAmount = advanceAmount - totalSettled;

          return {
            ...advance.toJSON(),
            totalSettled,
            outstandingAmount,
            settlementPercentage: advanceAmount > 0 ?
              ((totalSettled / advanceAmount) * 100).toFixed(2) : 0,
            canReceiveSettlement: outstandingAmount > 0.01
          };
        })
        .filter(advance => advance.canReceiveSettlement); // Only return settleable advances

      res.json({
        success: true,
        data: availableAdvances
      });

    } catch (error) {
      logger.error('Error fetching available advances for settlement:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available advances for settlement',
        error: error.message
      });
    }
  }
  // GET /money-advances/:id - Get single money advance
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      res.json({
        success: true,
        data: advance
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching money advance',
        error: error.message
      });
    }
  }

  // POST /money-advances - Create new money advance
  static async create(req, res) {
    try {
      const {
        bookingDate,
        amount,
        exchangeRate,
        purpose,
        note,
        makerId,
        currencyId,
        dueDate,
        bankAccountId,
        ministryId,
      } = req.body;

      // Validation
      if (!bookingDate || !amount || !makerId || !currencyId) {
        return res.status(400).json({
          success: false,
          message: 'BookingDate, amount, makerId, and currencyId are required'
        });
      }

      // Validate booking date format (YYYY-MM-DD)
      const bookingDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!bookingDateRegex.test(bookingDate)) {
        return res.status(400).json({
          success: false,
          message: 'BookingDate must be in YYYY-MM-DD format'
        });
      }

      const advance = await MoneyAdvance.create({
        bookingDate,
        amount,
        exchangeRate,
        purpose,
        note,
        makerId,
        currencyId,
        dueDate,
        bankAccountId,
        ministryId,
        status: 'approved'
      });
      // 🆕 ADD THIS: Create audit record (just 2 lines!)
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditCreate(advance.id, advance.toJSON(), auditContext);

      // Fetch the created advance with associations
      const createdAdvance = await MoneyAdvance.findByPk(advance.id, {
        include: [
          { model: user, as: 'maker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdAdvance,
        message: 'Money advance created successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating money advance',
        error: error.message
      });
    }
  }

  // PUT /money-advances/:id - Update money advance
  static async update(req, res) {
    try {
      const { id } = req.params;
      const {
        bookingDate,
        amount,
        exchangeRate,
        purpose,
        note,
        dueDate,
        bankAccountId,
        ministryId,
        updateUserId,
        currencyId
      } = req.body;

      const advance = await MoneyAdvance.findByPk(id);

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      // Only allow updates if status is pending
      // if (advance.status !== 'pending') {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Cannot update approved or settled advances'
      //   });
      // }

      // Validate booking date format if provided
      if (bookingDate) {
        const bookingDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!bookingDateRegex.test(bookingDate)) {
          return res.status(400).json({
            success: false,
            message: 'BookingDate must be in YYYY-MM-DD format'
          });
        }
      }

      // 🆕 ADD THIS: Store old data before update
      const oldData = advance.toJSON();

      await advance.update({
        bookingDate: bookingDate || advance.bookingDate,
        amount: amount || advance.amount,
        exchangeRate: exchangeRate || advance.exchangeRate,
        purpose: purpose || advance.purpose,
        note: note || advance.note,
        dueDate: dueDate || advance.dueDate,
        bankAccountId: bankAccountId || advance.bankAccountId,
        currencyId: currencyId || null,
        updateUserId: updateUserId || null,
        ministryId: ministryId || advance.ministryId
      });

      // 🆕 ADD THIS: Create audit record (just 2 lines!)
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditUpdate(id, oldData, advance.toJSON(), auditContext);


      const updatedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: updatedAdvance,
        message: 'Money advance updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating money advance',
        error: error.message
      });
    }
  }

  // PUT /money-advances/:id/approve - Approve money advance
  static async approve(req, res) {
    try {
      const { id } = req.params;
      const { checkerId } = req.body; // ID of the user approving

      const advance = await MoneyAdvance.findByPk(id);

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      if (advance.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending advances can be approved'
        });
      }
      // 🆕 ADD THIS: Store old data before update
      const oldData = advance.toJSON();

      await advance.update({
        status: 'approved',
        checkerId,
        approvedAt: new Date()
      });
      // 🆕 ADD THIS: Create audit record for approval (just 2 lines!)
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditApprove(id, oldData, advance.toJSON(), auditContext);

      const approvedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: approvedAdvance,
        message: 'Money advance approved successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error approving money advance',
        error: error.message
      });
    }
  }

  // PUT /money-advances/:id/settle - Mark as settled
  static async settle(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id);

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      if (advance.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Only approved advances can be settled'
        });
      }
      // 🆕 ADD THIS: Store old data before update
      const oldData = advance.toJSON();

      await advance.update({
        status: 'settled'
      });
      // 🆕 ADD THIS: Create audit record for settlement (just 2 lines!)
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditSettle(id, oldData, advance.toJSON(), auditContext);

      const settledAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ]
      });

      res.json({
        success: true,
        data: settledAdvance,
        message: 'Money advance settled successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error settling money advance',
        error: error.message
      });
    }
  }

  // DELETE /money-advances/:id - Delete money advance
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id);

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      // Only allow deletion if status is pending
      if (advance.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete approved or settled advances'
        });
      }
      // 🆕 ADD THIS: Store data before deletion
      const oldData = advance.toJSON();
      await advance.destroy();
      // 🆕 ADD THIS: Create audit record for deletion (just 2 lines!)
      const auditContext = AuditHelper.getAuditContext(req);
      await AuditHelper.auditDelete(id, oldData, auditContext);

      res.json({
        success: true,
        message: 'Money advance deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting money advance',
        error: error.message
      });
    }
  }

  // GET /money-advances/dashboard - Dashboard statistics
  static async getDashboard(req, res) {
    try {
      const { makerId, ministryId, bookingDate } = req.query;

      const whereClause = {};
      if (makerId) whereClause.makerId = makerId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (bookingDate) whereClause.bookingDate = bookingDate;

      const [total, pending, approved, settled] = await Promise.all([
        MoneyAdvance.count({ where: whereClause }),
        MoneyAdvance.count({ where: { ...whereClause, status: 'pending' } }),
        MoneyAdvance.count({ where: { ...whereClause, status: 'approved' } }),
        MoneyAdvance.count({ where: { ...whereClause, status: 'settled' } })
      ]);

      const totalAmount = await MoneyAdvance.sum('amount', { where: whereClause });
      const pendingAmount = await MoneyAdvance.sum('amount', {
        where: { ...whereClause, status: 'pending' }
      });

      res.json({
        success: true,
        data: {
          counts: { total, pending, approved, settled },
          amounts: {
            total: totalAmount || 0,
            pending: pendingAmount || 0
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard data',
        error: error.message
      });
    }
  }

  // GET /money-advances/by-ministry - Get advances grouped by ministry
  static async getByMinistry(req, res) {
    try {
      const { status, bookingDate } = req.query;

      const whereClause = {};
      if (status) whereClause.status = status;
      if (bookingDate) whereClause.bookingDate = bookingDate;

      const advances = await MoneyAdvance.findAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry', required: true }
        ],
        order: [['ministry', 'name', 'ASC'], ['createdAt', 'DESC']]
      });

      // Group by ministry
      const groupedByMinistry = advances.reduce((acc, advance) => {
        const ministryName = advance.ministry.name;
        if (!acc[ministryName]) {
          acc[ministryName] = {
            ministry: advance.ministry,
            advances: [],
            totalAmount: 0,
            count: 0
          };
        }
        acc[ministryName].advances.push(advance);
        acc[ministryName].totalAmount += parseFloat(advance.amount);
        acc[ministryName].count += 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: groupedByMinistry
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching advances by ministry',
        error: error.message
      });
    }
  }

  // GET /money-advances/by-booking-date - Get advances grouped by booking date
  static async getByBookingDate(req, res) {
    try {
      const { status, ministryId, startDate, endDate } = req.query;

      const whereClause = {};
      if (status) whereClause.status = status;
      if (ministryId) whereClause.ministryId = ministryId;

      // Date range filtering
      if (startDate && endDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.between]: [startDate, endDate]
        };
      } else if (startDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.gte]: startDate
        };
      } else if (endDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.lte]: endDate
        };
      }

      const advances = await MoneyAdvance.findAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ],
        order: [['bookingDate', 'DESC'], ['createdAt', 'DESC']]
      });

      // Group by booking date
      const groupedByDate = advances.reduce((acc, advance) => {
        const bookingDate = advance.bookingDate;
        if (!acc[bookingDate]) {
          acc[bookingDate] = {
            date: bookingDate,
            advances: [],
            totalAmount: 0,
            count: 0
          };
        }
        acc[bookingDate].advances.push(advance);
        acc[bookingDate].totalAmount += parseFloat(advance.amount);
        acc[bookingDate].count += 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: groupedByDate
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching advances by booking date',
        error: error.message
      });
    }
  }

  // GET /money-advances/summary-by-date - Get summary statistics by date range
  static async getSummaryByDate(req, res) {
    try {
      const { startDate, endDate, ministryId } = req.query;

      const whereClause = {};
      if (ministryId) whereClause.ministryId = ministryId;

      if (startDate && endDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.between]: [startDate, endDate]
        };
      }

      const summary = await MoneyAdvance.findAll({
        where: whereClause,
        attributes: [
          'bookingDate',
          'status',
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
          [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total_amount']
        ],
        group: ['bookingDate', 'status'],
        order: [['bookingDate', 'DESC']]
      });

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching summary by date',
        error: error.message
      });
    }
  }

  // =============== NEW REPORT METHODS ===============

  // GET /money-advances/report - Get report data with filters
  // Enhanced GET /money-advances/report - Get report data with additional fields
  static async getReport(req, res) {
    try {
      const {
        fromDate,
        toDate,
        ministryId,
        currencyId,
        status,
        makerId
      } = req.query;

      const whereClause = {};

      // Date range filtering
      if (fromDate && toDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.between]: [fromDate, toDate]
        };
      } else if (fromDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.gte]: fromDate
        };
      } else if (toDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.lte]: toDate
        };
      }

      // Other filters
      if (ministryId) whereClause.ministryId = ministryId;
      if (currencyId) whereClause.currencyId = currencyId;
      if (status) whereClause.status = status;
      if (makerId) whereClause.makerId = makerId;

      // Get the main report data
      const reportData = await MoneyAdvance.findAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' },
          { model: ministry, as: 'ministry' }
        ],
        order: [['bookingDate', 'DESC'], ['createdAt', 'DESC']]
      });

      // Calculate settlement amounts and outstanding amounts for each advance
      const processedData = await Promise.all(reportData.map(async (advance) => {
        // Get total settlement amount for this advance
        const settlements = await settlement.findAll({
          where: { moneyAdvanceId: advance.id }
        });

        const settlementAmount = settlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        const outstandingAmount = parseFloat(advance.amount) - settlementAmount;
        const settlementCount = settlements.length;

        // Calculate LCY (Local Currency) equivalent
        const exchangeRate = parseFloat(advance.exchangeRate) || 1;
        const lcyEquivalent = parseFloat(advance.amount) * exchangeRate;
        const settlementLcyEquivalent = settlementAmount * exchangeRate;
        const outstandingLcyEquivalent = outstandingAmount * exchangeRate;

        return {
          ...advance.toJSON(),
          settlementAmount,
          outstandingAmount,
          settlementCount,
          // New fields
          exchangeRate: advance.exchangeRate,
          currencyCode: advance.currency?.code || 'N/A',
          currencyName: advance.currency?.name || 'N/A',
          lcyEquivalent,
          settlementLcyEquivalent,
          outstandingLcyEquivalent,
          // Additional calculated fields
          settlementPercentage: parseFloat(advance.amount) > 0 ?
            ((settlementAmount / parseFloat(advance.amount)) * 100).toFixed(2) : 0,
          isFullySettled: settlementAmount >= parseFloat(advance.amount),
          daysOverdue: advance.dueDate ?
            Math.max(0, Math.floor((new Date() - new Date(advance.dueDate)) / (1000 * 60 * 60 * 24))) : 0
        };
      }));

      // Calculate summary data with LCY equivalents
      const totalAdvances = processedData.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const totalSettlements = processedData.reduce((sum, item) => sum + (item.settlementAmount || 0), 0);
      const outstandingBalance = totalAdvances - totalSettlements;

      // LCY summary calculations
      const totalAdvancesLcy = processedData.reduce((sum, item) => sum + (item.lcyEquivalent || 0), 0);
      const totalSettlementsLcy = processedData.reduce((sum, item) => sum + (item.settlementLcyEquivalent || 0), 0);
      const outstandingBalanceLcy = totalAdvancesLcy - totalSettlementsLcy;

      // Calculate brought forward (previous period outstanding)
      const broughtForwardWhere = { ...whereClause };
      if (fromDate) {
        broughtForwardWhere.bookingDate = {
          [require('sequelize').Op.lt]: fromDate
        };
      }

      const broughtForwardData = await MoneyAdvance.findAll({
        where: broughtForwardWhere,
        include: [
          { model: settlement, as: 'settlementLine' },
          { model: currency, as: 'currency' }
        ]
      });

      let broughtForward = 0;
      let broughtForwardLcy = 0;

      for (const advance of broughtForwardData) {
        const settlements = await settlement.findAll({
          where: { moneyAdvanceId: advance.id }
        });
        const settlementAmount = settlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        const outstanding = parseFloat(advance.amount) - settlementAmount;
        const exchangeRate = parseFloat(advance.exchangeRate) || 1;

        broughtForward += outstanding;
        broughtForwardLcy += outstanding * exchangeRate;
      }

      // Enhanced summary with currency breakdown
      const currencyBreakdown = processedData.reduce((acc, item) => {
        const currencyCode = item.currencyCode;
        if (!acc[currencyCode]) {
          acc[currencyCode] = {
            currencyCode,
            currencyName: item.currencyName,
            totalAdvances: 0,
            totalSettlements: 0,
            outstandingBalance: 0,
            lcyEquivalent: 0,
            count: 0
          };
        }

        acc[currencyCode].totalAdvances += parseFloat(item.amount);
        acc[currencyCode].totalSettlements += item.settlementAmount || 0;
        acc[currencyCode].outstandingBalance += item.outstandingAmount || 0;
        acc[currencyCode].lcyEquivalent += item.lcyEquivalent || 0;
        acc[currencyCode].count += 1;

        return acc;
      }, {});

      const summary = {
        // Original summary
        totalAdvances,
        totalSettlements,
        outstandingBalance,
        broughtForward,

        // New LCY summary
        totalAdvancesLcy,
        totalSettlementsLcy,
        outstandingBalanceLcy,
        broughtForwardLcy,

        // Additional summary metrics
        totalRecords: processedData.length,
        fullySettledCount: processedData.filter(item => item.isFullySettled).length,
        partiallySettledCount: processedData.filter(item =>
          item.settlementAmount > 0 && !item.isFullySettled
        ).length,
        unsettledCount: processedData.filter(item => item.settlementAmount === 0).length,
        overdueCount: processedData.filter(item => item.daysOverdue > 0).length,

        // Currency breakdown
        currencyBreakdown: Object.values(currencyBreakdown),

        // Settlement statistics
        averageSettlementPercentage: processedData.length > 0 ?
          (processedData.reduce((sum, item) => sum + parseFloat(item.settlementPercentage), 0) / processedData.length).toFixed(2) : 0
      };

      res.json({
        success: true,
        data: processedData,
        summary
      });
    } catch (error) {
      logger.error('Error generating report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating report',
        error: error.message
      });
    }
  }

  // Enhanced export function with additional fields
  static async exportReport(req, res) {
    try {
      const ExcelJS = require('exceljs');

      const {
        fromDate,
        toDate,
        ministryId,
        currencyId,
        status,
        makerId
      } = req.query;

      const whereClause = {};

      // Apply same filters as getReport
      if (fromDate && toDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.between]: [fromDate, toDate]
        };
      } else if (fromDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.gte]: fromDate
        };
      } else if (toDate) {
        whereClause.bookingDate = {
          [require('sequelize').Op.lte]: toDate
        };
      }

      if (ministryId) whereClause.ministryId = ministryId;
      if (currencyId) whereClause.currencyId = currencyId;
      if (status) whereClause.status = status;
      if (makerId) whereClause.makerId = makerId;

      const reportData = await MoneyAdvance.findAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: ministry, as: 'ministry' }
        ],
        order: [['bookingDate', 'DESC']]
      });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Money Advance Report');

      // Enhanced headers with new fields
      worksheet.columns = [
        { header: 'Date', key: 'bookingDate', width: 12 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Exchange Rate', key: 'exchangeRate', width: 12 },
        { header: 'LCY Equivalent', key: 'lcyEquivalent', width: 15 },
        { header: 'Settlement Amount', key: 'settlementAmount', width: 15 },
        { header: 'Outstanding', key: 'outstandingAmount', width: 15 },
        { header: 'Settlement %', key: 'settlementPercentage', width: 12 },
        { header: 'Ministry', key: 'ministry', width: 20 },
        { header: 'Purpose', key: 'purpose', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Due Date', key: 'dueDate', width: 12 },
        { header: 'Days Overdue', key: 'daysOverdue', width: 12 },
        { header: 'Maker', key: 'maker', width: 20 },
        { header: 'Checker', key: 'checker', width: 20 }
      ];

      // Process and add data rows with calculations
      for (const advance of reportData) {
        // Get settlements for this advance
        const settlements = await settlement.findAll({
          where: { moneyAdvanceId: advance.id }
        });

        const settlementAmount = settlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        const outstandingAmount = parseFloat(advance.amount) - settlementAmount;
        const exchangeRate = parseFloat(advance.exchangeRate) || 1;
        const lcyEquivalent = parseFloat(advance.amount) * exchangeRate;
        const settlementPercentage = parseFloat(advance.amount) > 0 ?
          ((settlementAmount / parseFloat(advance.amount)) * 100).toFixed(2) : 0;
        const daysOverdue = advance.dueDate ?
          Math.max(0, Math.floor((new Date() - new Date(advance.dueDate)) / (1000 * 60 * 60 * 24))) : 0;

        worksheet.addRow({
          bookingDate: advance.bookingDate,
          amount: advance.amount,
          currency: advance.currency?.code || '',
          exchangeRate: advance.exchangeRate || 1,
          lcyEquivalent: lcyEquivalent.toFixed(2),
          settlementAmount: settlementAmount.toFixed(2),
          outstandingAmount: outstandingAmount.toFixed(2),
          settlementPercentage: settlementPercentage + '%',
          ministry: advance.ministry?.ministryName || '',
          purpose: advance.purpose || '',
          status: advance.status,
          dueDate: advance.dueDate || '',
          daysOverdue: daysOverdue,
          maker: advance.maker?.cus_name || '',
          checker: advance.checker?.cus_name || ''
        });
      }

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add number formatting for currency columns
      worksheet.getColumn('amount').numFmt = '#,##0.00';
      worksheet.getColumn('exchangeRate').numFmt = '#,##0.0000';
      worksheet.getColumn('lcyEquivalent').numFmt = '#,##0.00';
      worksheet.getColumn('settlementAmount').numFmt = '#,##0.00';
      worksheet.getColumn('outstandingAmount').numFmt = '#,##0.00';

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="money-advance-report-${new Date().toISOString().split('T')[0]}.xlsx"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      logger.error('Error exporting report:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting report',
        error: error.message
      });
    }
  }

  // GET /money-advances/:id/settlements - Get settlements for a specific advance
  static async getSettlements(req, res) {
    try {
      const { id } = req.params;

      const advance = await MoneyAdvance.findByPk(id);
      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      const settlements = await settlement.findAll({
        where: { moneyAdvanceId: id },
        include: [
          { model: user, as: 'proceeder' }
        ],
        order: [['bookingDate', 'DESC']]
      });

      res.json({
        success: true,
        data: settlements
      });
    } catch (error) {
      logger.error('Error fetching settlements:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching settlements',
        error: error.message
      });
    }
  }

  // Add these methods to your MoneyAdvanceController class
  // Updated GET /money-advances/ministry-summary - Get ministry summary report grouped by currency
  static async getMinistrySummary(req, res) {
    try {
      const { reportMonth, ministryId } = req.query;

      if (!reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Report month is required (YYYY-MM format)'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      // Get all ministries
      const ministries = await ministry.findAll({
        where: ministryId ? { id: ministryId } : {},
        order: [['ministryName', 'ASC']]
      });

      const reportData = [];
      let totalBroughtForwardLcy = 0;
      let totalCurrentMonthLcy = 0;
      let totalSettlementLcy = 0;
      let totalBalanceLcy = 0;

      for (const min of ministries) {
        // Get all unique currencies used by this ministry
        const ministryCurrencies = await MoneyAdvance.findAll({
          where: { ministryId: min.id },
          include: [{ model: currency, as: 'currency' }],
          attributes: ['currencyId'],
          group: ['currencyId', 'currency.id'],
          raw: false
        });

        // If no currencies found, add a default LAK entry
        if (ministryCurrencies.length === 0) {
          const defaultCurrency = await currency.findOne({ where: { code: 'LAK' } });
          if (defaultCurrency) {
            ministryCurrencies.push({
              currencyId: defaultCurrency.id,
              currency: defaultCurrency
            });
          }
        }

        // Process each currency for this ministry
        for (const currencyItem of ministryCurrencies) {
          const curr = currencyItem.currency;
          if (!curr) continue;

          // 1. Calculate Brought Forward for this ministry-currency combination
          const broughtForwardAdvances = await MoneyAdvance.findAll({
            where: {
              ministryId: min.id,
              currencyId: curr.id,
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            }
          });

          const broughtForwardSettlements = await settlement.findAll({
            where: {
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                ministryId: min.id,
                currencyId: curr.id
              }
            }]
          });

          let broughtForwardAmount = 0;
          let broughtForwardExchangeRate = 1;

          // Sum advances
          broughtForwardAdvances.forEach(advance => {
            broughtForwardAmount += parseFloat(advance.amount);
            broughtForwardExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          // Subtract settlements
          broughtForwardSettlements.forEach(settle => {
            broughtForwardAmount -= parseFloat(settle.amount);
          });

          const broughtForwardLcy = broughtForwardAmount * broughtForwardExchangeRate;

          // 2. Calculate Current Month Advances for this ministry-currency combination
          const currentMonthAdvances = await MoneyAdvance.findAll({
            where: {
              ministryId: min.id,
              currencyId: curr.id,
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            }
          });

          let currentMonthAmount = 0;
          let currentMonthExchangeRate = 1;

          currentMonthAdvances.forEach(advance => {
            currentMonthAmount += parseFloat(advance.amount);
            currentMonthExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          const currentMonthLcy = currentMonthAmount * currentMonthExchangeRate;

          // 3. Calculate Current Month Settlements for this ministry-currency combination
          const currentMonthSettlements = await settlement.findAll({
            where: {
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                ministryId: min.id,
                currencyId: curr.id
              }
            }]
          });

          let settlementAmount = 0;
          let settlementExchangeRate = currentMonthExchangeRate; // Use same rate as advances

          currentMonthSettlements.forEach(settle => {
            settlementAmount += parseFloat(settle.amount);
            // Use the exchange rate from the original advance
            settlementExchangeRate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
          });

          const settlementLcy = settlementAmount * settlementExchangeRate;

          // 4. Calculate Balance in LCY
          const balanceLcy = broughtForwardLcy + currentMonthLcy - settlementLcy;

          // Only add to results if there's any activity (non-zero amounts)
          if (broughtForwardAmount !== 0 || currentMonthAmount !== 0 || settlementAmount !== 0) {
            reportData.push({
              ministryId: min.id,
              ministryName: min.ministryName,
              ministryCode: min.ministryCode,
              currencyId: curr.id,
              currencyCode: curr.code,
              currencyName: curr.name,

              // Brought Forward
              broughtForwardAmount: broughtForwardAmount,
              broughtForwardCurrency: curr.code,
              broughtForwardExchangeRate: broughtForwardExchangeRate,
              broughtForwardLcy: broughtForwardLcy,

              // Current Month Advances
              currentMonthAmount: currentMonthAmount,
              currentMonthCurrency: curr.code,
              currentMonthExchangeRate: currentMonthExchangeRate,
              currentMonthLcy: currentMonthLcy,

              // Current Month Settlements
              settlementAmount: settlementAmount,
              settlementCurrency: curr.code,
              settlementExchangeRate: settlementExchangeRate,
              settlementLcy: settlementLcy,

              // Balance
              balanceLcy: balanceLcy,

              // For grouping in frontend
              ministryGroup: `${min.ministryName} (${min.ministryCode})`,
              currencyLine: `${curr.code} - ${curr.name}`
            });

            // Add to totals
            totalBroughtForwardLcy += broughtForwardLcy;
            totalCurrentMonthLcy += currentMonthLcy;
            totalSettlementLcy += settlementLcy;
            totalBalanceLcy += balanceLcy;
          }
        }
      }

      // Sort by ministry name, then by currency code
      reportData.sort((a, b) => {
        if (a.ministryName !== b.ministryName) {
          return a.ministryName.localeCompare(b.ministryName);
        }
        return a.currencyCode.localeCompare(b.currencyCode);
      });

      // Calculate summary totals
      const summary = {
        totalBroughtForwardLcy,
        totalCurrentMonthLcy,
        totalSettlementLcy,
        totalBalanceLcy,
        reportMonth: reportMonth,
        totalMinistries: ministries.length,
        totalCurrencyLines: reportData.length,
        uniqueCurrencies: [...new Set(reportData.map(item => item.currencyCode))].length
      };

      res.json({
        success: true,
        data: reportData,
        summary
      });

    } catch (error) {
      logger.error('Error generating ministry summary report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating ministry summary report',
        error: error.message
      });
    }
  }

  // Updated GET /money-advances/ministry-details - Get detailed transactions for a ministry-currency combination
  static async getMinistryDetails(req, res) {
    try {
      const { ministryId, currencyId, reportMonth } = req.query;

      if (!ministryId || !currencyId || !reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Ministry ID, Currency ID, and report month are required'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      const transactions = [];

      // 1. Get brought forward items for this ministry-currency combination
      const broughtForwardAdvances = await MoneyAdvance.findAll({
        where: {
          ministryId: ministryId,
          currencyId: currencyId,
          bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
        },
        include: [
          { model: currency, as: 'currency' },
          { model: user, as: 'maker' },
          { model: settlement, as: 'settlementLine' }
        ]
      });

      // Add brought forward items
      broughtForwardAdvances.forEach(advance => {
        const totalSettled = advance.settlementLine
          .filter(s => new Date(s.bookingDate) <= new Date(broughtForwardEnd))
          .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        const outstanding = parseFloat(advance.amount) - totalSettled;

        if (outstanding > 0) {
          const rate = parseFloat(advance.exchangeRate) || 1;
          transactions.push({
            id: `bf-${advance.id}`,
            bookingDate: advance.bookingDate,
            type: 'brought_forward',
            amount: outstanding,
            currencyCode: advance.currency?.code || 'LAK',
            exchangeRate: rate,
            lcyAmount: outstanding * rate,
            purpose: advance.purpose,
            user: advance.maker?.cus_name || 'N/A',
            referenceNumber: `ADV-${advance.id}`
          });
        }
      });

      // 2. Get current month advances for this ministry-currency combination
      const currentMonthAdvances = await MoneyAdvance.findAll({
        where: {
          ministryId: ministryId,
          currencyId: currencyId,
          bookingDate: {
            [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
          }
        },
        include: [
          { model: currency, as: 'currency' },
          { model: user, as: 'maker' }
        ]
      });

      currentMonthAdvances.forEach(advance => {
        const rate = parseFloat(advance.exchangeRate) || 1;
        transactions.push({
          id: `adv-${advance.id}`,
          bookingDate: advance.bookingDate,
          type: 'advance',
          amount: parseFloat(advance.amount),
          currencyCode: advance.currency?.code || 'LAK',
          exchangeRate: rate,
          lcyAmount: parseFloat(advance.amount) * rate,
          purpose: advance.purpose,
          user: advance.maker?.cus_name || 'N/A',
          referenceNumber: `ADV-${advance.id}`
        });
      });

      // 3. Get current month settlements for this ministry-currency combination
      const currentMonthSettlements = await settlement.findAll({
        where: {
          bookingDate: {
            [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
          }
        },
        include: [{
          model: MoneyAdvance,
          as: 'moneyAdvance',
          where: {
            ministryId: ministryId,
            currencyId: currencyId
          },
          include: [
            { model: currency, as: 'currency' },
            { model: user, as: 'maker' }
          ]
        }, {
          model: user,
          as: 'proceeder'
        }]
      });

      currentMonthSettlements.forEach(settle => {
        const rate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
        transactions.push({
          id: `set-${settle.id}`,
          bookingDate: settle.bookingDate,
          type: 'settlement',
          amount: parseFloat(settle.amount),
          currencyCode: settle.moneyAdvance.currency?.code || 'LAK',
          exchangeRate: rate,
          lcyAmount: parseFloat(settle.amount) * rate,
          purpose: settle.notes || settle.moneyAdvance.purpose,
          user: settle.proceeder?.cus_name || 'N/A',
          referenceNumber: `SET-${settle.id} (ADV-${settle.moneyAdvance.id})`
        });
      });

      // Sort by date
      transactions.sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate));

      res.json({
        success: true,
        data: transactions
      });

    } catch (error) {
      logger.error('Error getting ministry details:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting ministry details',
        error: error.message
      });
    }
  }

  // Updated export function with currency separation - FIXED VERSION
  static async exportMinistrySummary(req, res) {
    try {
      const ExcelJS = require('exceljs');
      const { reportMonth, ministryId } = req.query;

      if (!reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Report month is required'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      // Get all ministries
      const ministries = await ministry.findAll({
        where: ministryId ? { id: ministryId } : {},
        order: [['ministryName', 'ASC']]
      });

      const reportData = [];

      for (const min of ministries) {
        // Get all unique currencies used by this ministry
        const ministryCurrencies = await MoneyAdvance.findAll({
          where: { ministryId: min.id },
          include: [{ model: currency, as: 'currency' }],
          attributes: ['currencyId'],
          group: ['currencyId', 'currency.id'],
          raw: false
        });

        // If no currencies found, add a default LAK entry
        if (ministryCurrencies.length === 0) {
          const defaultCurrency = await currency.findOne({ where: { code: 'LAK' } });
          if (defaultCurrency) {
            ministryCurrencies.push({
              currencyId: defaultCurrency.id,
              currency: defaultCurrency
            });
          }
        }

        // Process each currency for this ministry
        for (const currencyItem of ministryCurrencies) {
          const curr = currencyItem.currency;
          if (!curr) continue;

          // 1. Calculate Brought Forward for this ministry-currency combination
          const broughtForwardAdvances = await MoneyAdvance.findAll({
            where: {
              ministryId: min.id,
              currencyId: curr.id,
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            }
          });

          const broughtForwardSettlements = await settlement.findAll({
            where: {
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                ministryId: min.id,
                currencyId: curr.id
              }
            }]
          });

          let broughtForwardAmount = 0;
          let broughtForwardExchangeRate = 1;

          // Sum advances
          broughtForwardAdvances.forEach(advance => {
            broughtForwardAmount += parseFloat(advance.amount);
            broughtForwardExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          // Subtract settlements
          broughtForwardSettlements.forEach(settle => {
            broughtForwardAmount -= parseFloat(settle.amount);
          });

          const broughtForwardLcy = broughtForwardAmount * broughtForwardExchangeRate;

          // 2. Calculate Current Month Advances for this ministry-currency combination
          const currentMonthAdvances = await MoneyAdvance.findAll({
            where: {
              ministryId: min.id,
              currencyId: curr.id,
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            }
          });

          let currentMonthAmount = 0;
          let currentMonthExchangeRate = 1;

          currentMonthAdvances.forEach(advance => {
            currentMonthAmount += parseFloat(advance.amount);
            currentMonthExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          const currentMonthLcy = currentMonthAmount * currentMonthExchangeRate;

          // 3. Calculate Current Month Settlements for this ministry-currency combination
          const currentMonthSettlements = await settlement.findAll({
            where: {
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                ministryId: min.id,
                currencyId: curr.id
              }
            }]
          });

          let settlementAmount = 0;
          let settlementExchangeRate = currentMonthExchangeRate;

          currentMonthSettlements.forEach(settle => {
            settlementAmount += parseFloat(settle.amount);
            settlementExchangeRate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
          });

          const settlementLcy = settlementAmount * settlementExchangeRate;

          // 4. Calculate Balance in LCY
          const balanceLcy = broughtForwardLcy + currentMonthLcy - settlementLcy;

          // Only add to results if there's any activity (non-zero amounts)
          if (broughtForwardAmount !== 0 || currentMonthAmount !== 0 || settlementAmount !== 0) {
            reportData.push({
              ministryId: min.id,
              ministryName: min.ministryName,
              ministryCode: min.ministryCode,
              currencyId: curr.id,
              currencyCode: curr.code,
              currencyName: curr.name,
              broughtForwardAmount,
              broughtForwardExchangeRate,
              broughtForwardLcy,
              currentMonthAmount,
              currentMonthExchangeRate,
              currentMonthLcy,
              settlementAmount,
              settlementExchangeRate,
              settlementLcy,
              balanceLcy,
              currencyLine: `${curr.code} - ${curr.name}`
            });
          }
        }
      }

      // Sort by ministry name, then by currency code
      reportData.sort((a, b) => {
        if (a.ministryName !== b.ministryName) {
          return a.ministryName.localeCompare(b.ministryName);
        }
        return a.currencyCode.localeCompare(b.currencyCode);
      });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Ministry Summary by Currency');

      // Add title
      worksheet.mergeCells('A1:N1');
      worksheet.getCell('A1').value = `ລາຍງານສະຫຼຸບຕາມກະຊວງແລະສະກຸນເງິນ - ${reportMonth}`;
      worksheet.getCell('A1').font = { bold: true, size: 16 };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      // Add headers
      const headers = [
        'ກະຊວງ',
        'ລະຫັດກະຊວງ',
        'ສະກຸນເງິນ',
        'ຍອດຍົກມາ',
        'ອັດຕາແລກປ່ຽນ',
        'ຍອດຍົກມາ LCY',
        'ລາຍຈ່າຍເດືອນນີ້',
        'ອັດຕາແລກປ່ຽນ',
        'ລາຍຈ່າຍເດືອນນີ້ LCY',
        'ການຊຳລະ',
        'ອັດຕາແລກປ່ຽນ',
        'ການຊຳລະ LCY',
        'ຍອດສະຫຼຸບ LCY',
        'ສາຍສະກຸນເງິນ'
      ];

      worksheet.addRow([]); // Empty row
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      reportData.forEach(item => {
        worksheet.addRow([
          item.ministryName,
          item.ministryCode,
          item.currencyCode,
          item.broughtForwardAmount.toFixed(2),
          item.broughtForwardExchangeRate.toFixed(4),
          item.broughtForwardLcy.toFixed(2),
          item.currentMonthAmount.toFixed(2),
          item.currentMonthExchangeRate.toFixed(4),
          item.currentMonthLcy.toFixed(2),
          item.settlementAmount.toFixed(2),
          item.settlementExchangeRate.toFixed(4),
          item.settlementLcy.toFixed(2),
          item.balanceLcy.toFixed(2),
          item.currencyLine
        ]);
      });

      // Add empty row before summary
      worksheet.addRow([]);

      // Calculate summary totals
      const totals = {
        totalBroughtForwardAmount: reportData.reduce((sum, item) => sum + item.broughtForwardAmount, 0),
        totalBroughtForwardLcy: reportData.reduce((sum, item) => sum + item.broughtForwardLcy, 0),
        totalCurrentMonthAmount: reportData.reduce((sum, item) => sum + item.currentMonthAmount, 0),
        totalCurrentMonthLcy: reportData.reduce((sum, item) => sum + item.currentMonthLcy, 0),
        totalSettlementAmount: reportData.reduce((sum, item) => sum + item.settlementAmount, 0),
        totalSettlementLcy: reportData.reduce((sum, item) => sum + item.settlementLcy, 0),
        totalBalanceLcy: reportData.reduce((sum, item) => sum + item.balanceLcy, 0)
      };

      // Add summary row
      const summaryRow = worksheet.addRow([
        'ລວມທັງໝົດ',
        '',
        'ທຸກສະກຸນເງິນ',
        totals.totalBroughtForwardAmount.toFixed(2),
        '',
        totals.totalBroughtForwardLcy.toFixed(2),
        totals.totalCurrentMonthAmount.toFixed(2),
        '',
        totals.totalCurrentMonthLcy.toFixed(2),
        totals.totalSettlementAmount.toFixed(2),
        '',
        totals.totalSettlementLcy.toFixed(2),
        totals.totalBalanceLcy.toFixed(2),
        'ລວມທັງໝົດ'
      ]);

      // Style the summary row
      summaryRow.font = { bold: true };
      summaryRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCC00' } // Yellow background
      };

      // Add borders to summary row
      summaryRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thick' },
          bottom: { style: 'thick' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add currency breakdown summary
      worksheet.addRow([]); // Empty row
      worksheet.addRow(['ສະຫຼຸບຕາມສະກຸນເງິນ']);

      // Get unique currencies and their totals
      const currencyTotals = {};
      reportData.forEach(item => {
        if (!currencyTotals[item.currencyCode]) {
          currencyTotals[item.currencyCode] = {
            broughtForwardAmount: 0,
            broughtForwardLcy: 0,
            currentMonthAmount: 0,
            currentMonthLcy: 0,
            settlementAmount: 0,
            settlementLcy: 0,
            balanceLcy: 0,
            count: 0
          };
        }

        currencyTotals[item.currencyCode].broughtForwardAmount += item.broughtForwardAmount;
        currencyTotals[item.currencyCode].broughtForwardLcy += item.broughtForwardLcy;
        currencyTotals[item.currencyCode].currentMonthAmount += item.currentMonthAmount;
        currencyTotals[item.currencyCode].currentMonthLcy += item.currentMonthLcy;
        currencyTotals[item.currencyCode].settlementAmount += item.settlementAmount;
        currencyTotals[item.currencyCode].settlementLcy += item.settlementLcy;
        currencyTotals[item.currencyCode].balanceLcy += item.balanceLcy;
        currencyTotals[item.currencyCode].count += 1;
      });

      // Add currency breakdown header
      const currencyHeaderRow = worksheet.addRow([
        'ສະກຸນເງິນ',
        'ຈຳນວນກະຊວງ',
        'ລວມຍອດຍົກມາ',
        'ລວມຍອດຍົກມາ LCY',
        'ລວມລາຍຈ່າຍເດືອນນີ້',
        'ລວມລາຍຈ່າຍເດືອນນີ້ LCY',
        'ລວມການຊຳລະ',
        'ລວມການຊຳລະ LCY',
        'ລວມຍອດສະຫຼຸບ LCY'
      ]);
      currencyHeaderRow.font = { bold: true };
      currencyHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add currency breakdown data
      Object.keys(currencyTotals).sort().forEach(currencyCode => {
        const curr = currencyTotals[currencyCode];
        const currencyRow = worksheet.addRow([
          currencyCode,
          curr.count,
          curr.broughtForwardAmount.toFixed(2),
          curr.broughtForwardLcy.toFixed(2),
          curr.currentMonthAmount.toFixed(2),
          curr.currentMonthLcy.toFixed(2),
          curr.settlementAmount.toFixed(2),
          curr.settlementLcy.toFixed(2),
          curr.balanceLcy.toFixed(2)
        ]);

        // Add light background to currency rows
        currencyRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F8FF' } // Light blue
        };
      });

      // Add final statistics
      worksheet.addRow([]); // Empty row
      const statsRow = worksheet.addRow([
        'ສະຖິຕິລາຍງານ',
        '',
        `ລວມກະຊວງ: ${[...new Set(reportData.map(item => item.ministryId))].length}`,
        `ລວມສາຍສະກຸນເງິນ: ${reportData.length}`,
        `ສະກຸນເງິນທີ່ໃຊ້: ${Object.keys(currencyTotals).length}`,
        `ເດືອນລາຍງານ: ${reportMonth}`,
        `ສ້າງເມື່ອ: ${new Date().toLocaleString('lo-LA')}`
      ]);
      statsRow.font = { italic: true };
      statsRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' } // Light gray
      };

      // Auto-size columns
      worksheet.columns.forEach(column => {
        column.width = 15;
      });

      // Add number formatting
      const numberColumns = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
      numberColumns.forEach(col => {
        worksheet.getColumn(col).numFmt = '#,##0.00';
      });

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ministry-summary-report-${reportMonth}.xlsx"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      logger.error('Error exporting ministry summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting ministry summary',
        error: error.message
      });
    }
  }
  // Add these methods to your MoneyAdvanceController class

  // GET /money-advances/bank-account-summary - Get bank account summary report grouped by currency
  static async getBankAccountSummary(req, res) {
    try {
      const { reportMonth, bankAccountId } = req.query;

      if (!reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Report month is required (YYYY-MM format)'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      // Get all bank accounts
      const bankAccounts = await bankAccount.findAll({
        where: bankAccountId ? { id: bankAccountId } : {},
        order: [['accountName', 'ASC']]
      });

      const reportData = [];
      let totalBroughtForwardLcy = 0;
      let totalCurrentMonthLcy = 0;
      let totalSettlementLcy = 0;
      let totalBalanceLcy = 0;

      for (const bank of bankAccounts) {
        // Get all unique currencies used by this bank account
        const bankCurrencies = await MoneyAdvance.findAll({
          where: { bankAccountId: bank.id },
          include: [{ model: currency, as: 'currency' }],
          attributes: ['currencyId'],
          group: ['currencyId', 'currency.id'],
          raw: false
        });

        // If no currencies found, add a default LAK entry
        if (bankCurrencies.length === 0) {
          const defaultCurrency = await currency.findOne({ where: { code: 'LAK' } });
          if (defaultCurrency) {
            bankCurrencies.push({
              currencyId: defaultCurrency.id,
              currency: defaultCurrency
            });
          }
        }

        // Process each currency for this bank account
        for (const currencyItem of bankCurrencies) {
          const curr = currencyItem.currency;
          if (!curr) continue;

          // 1. Calculate Brought Forward for this bank-currency combination
          const broughtForwardAdvances = await MoneyAdvance.findAll({
            where: {
              bankAccountId: bank.id,
              currencyId: curr.id,
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            }
          });

          const broughtForwardSettlements = await settlement.findAll({
            where: {
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                bankAccountId: bank.id,
                currencyId: curr.id
              }
            }]
          });

          let broughtForwardAmount = 0;
          let broughtForwardExchangeRate = 1;

          // Sum advances
          broughtForwardAdvances.forEach(advance => {
            broughtForwardAmount += parseFloat(advance.amount);
            broughtForwardExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          // Subtract settlements
          broughtForwardSettlements.forEach(settle => {
            broughtForwardAmount -= parseFloat(settle.amount);
          });

          const broughtForwardLcy = broughtForwardAmount * broughtForwardExchangeRate;

          // 2. Calculate Current Month Advances for this bank-currency combination
          const currentMonthAdvances = await MoneyAdvance.findAll({
            where: {
              bankAccountId: bank.id,
              currencyId: curr.id,
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            }
          });

          let currentMonthAmount = 0;
          let currentMonthExchangeRate = 1;

          currentMonthAdvances.forEach(advance => {
            currentMonthAmount += parseFloat(advance.amount);
            currentMonthExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          const currentMonthLcy = currentMonthAmount * currentMonthExchangeRate;

          // 3. Calculate Current Month Settlements for this bank-currency combination
          const currentMonthSettlements = await settlement.findAll({
            where: {
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                bankAccountId: bank.id,
                currencyId: curr.id
              }
            }]
          });

          let settlementAmount = 0;
          let settlementExchangeRate = currentMonthExchangeRate;

          currentMonthSettlements.forEach(settle => {
            settlementAmount += parseFloat(settle.amount);
            settlementExchangeRate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
          });

          const settlementLcy = settlementAmount * settlementExchangeRate;

          // 4. Calculate Balance in LCY
          const balanceLcy = broughtForwardLcy + currentMonthLcy - settlementLcy;

          // Only add to results if there's any activity (non-zero amounts)
          if (broughtForwardAmount !== 0 || currentMonthAmount !== 0 || settlementAmount !== 0) {
            reportData.push({
              bankAccountId: bank.id,
              bankAccountName: bank.accountName,
              bankAccountNumber: bank.accountNumber,
              bankName: bank.bankName,
              currencyId: curr.id,
              currencyCode: curr.code,
              currencyName: curr.name,

              // Brought Forward
              broughtForwardAmount: broughtForwardAmount,
              broughtForwardCurrency: curr.code,
              broughtForwardExchangeRate: broughtForwardExchangeRate,
              broughtForwardLcy: broughtForwardLcy,

              // Current Month Advances
              currentMonthAmount: currentMonthAmount,
              currentMonthCurrency: curr.code,
              currentMonthExchangeRate: currentMonthExchangeRate,
              currentMonthLcy: currentMonthLcy,

              // Current Month Settlements
              settlementAmount: settlementAmount,
              settlementCurrency: curr.code,
              settlementExchangeRate: settlementExchangeRate,
              settlementLcy: settlementLcy,

              // Balance
              balanceLcy: balanceLcy,

              // For grouping in frontend
              bankAccountGroup: `${bank.accountName} (${bank.accountNumber})`,
              currencyLine: `${curr.code} - ${curr.name}`
            });

            // Add to totals
            totalBroughtForwardLcy += broughtForwardLcy;
            totalCurrentMonthLcy += currentMonthLcy;
            totalSettlementLcy += settlementLcy;
            totalBalanceLcy += balanceLcy;
          }
        }
      }

      // Sort by bank account name, then by currency code
      reportData.sort((a, b) => {
        if (a.bankAccountName !== b.bankAccountName) {
          return a.bankAccountName.localeCompare(b.bankAccountName);
        }
        return a.currencyCode.localeCompare(b.currencyCode);
      });

      // Calculate summary totals
      const summary = {
        totalBroughtForwardLcy,
        totalCurrentMonthLcy,
        totalSettlementLcy,
        totalBalanceLcy,
        reportMonth: reportMonth,
        totalBankAccounts: bankAccounts.length,
        totalCurrencyLines: reportData.length,
        uniqueCurrencies: [...new Set(reportData.map(item => item.currencyCode))].length
      };

      res.json({
        success: true,
        data: reportData,
        summary
      });

    } catch (error) {
      logger.error('Error generating bank account summary report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating bank account summary report',
        error: error.message
      });
    }
  }

  // GET /money-advances/bank-account-details - Get detailed transactions for a bank account-currency combination
  static async getBankAccountDetails(req, res) {
    try {
      const { bankAccountId, currencyId, reportMonth } = req.query;

      if (!bankAccountId || !currencyId || !reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Bank Account ID, Currency ID, and report month are required'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      const transactions = [];

      // 1. Get brought forward items for this bank account-currency combination
      const broughtForwardAdvances = await MoneyAdvance.findAll({
        where: {
          bankAccountId: bankAccountId,
          currencyId: currencyId,
          bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
        },
        include: [
          { model: currency, as: 'currency' },
          { model: user, as: 'maker' },
          { model: settlement, as: 'settlementLine' },
          { model: ministry, as: 'ministry' }
        ]
      });

      // Add brought forward items
      broughtForwardAdvances.forEach(advance => {
        const totalSettled = advance.settlementLine
          .filter(s => new Date(s.bookingDate) <= new Date(broughtForwardEnd))
          .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
        const outstanding = parseFloat(advance.amount) - totalSettled;

        if (outstanding > 0) {
          const rate = parseFloat(advance.exchangeRate) || 1;
          transactions.push({
            id: `bf-${advance.id}`,
            bookingDate: advance.bookingDate,
            type: 'brought_forward',
            amount: outstanding,
            currencyCode: advance.currency?.code || 'LAK',
            exchangeRate: rate,
            lcyAmount: outstanding * rate,
            purpose: advance.purpose,
            ministry: advance.ministry?.ministryName || 'N/A',
            user: advance.maker?.cus_name || 'N/A',
            referenceNumber: `ADV-${advance.id}`
          });
        }
      });

      // 2. Get current month advances for this bank account-currency combination
      const currentMonthAdvances = await MoneyAdvance.findAll({
        where: {
          bankAccountId: bankAccountId,
          currencyId: currencyId,
          bookingDate: {
            [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
          }
        },
        include: [
          { model: currency, as: 'currency' },
          { model: user, as: 'maker' },
          { model: ministry, as: 'ministry' }
        ]
      });

      currentMonthAdvances.forEach(advance => {
        const rate = parseFloat(advance.exchangeRate) || 1;
        transactions.push({
          id: `adv-${advance.id}`,
          bookingDate: advance.bookingDate,
          type: 'advance',
          amount: parseFloat(advance.amount),
          currencyCode: advance.currency?.code || 'LAK',
          exchangeRate: rate,
          lcyAmount: parseFloat(advance.amount) * rate,
          purpose: advance.purpose,
          ministry: advance.ministry?.ministryName || 'N/A',
          user: advance.maker?.cus_name || 'N/A',
          referenceNumber: `ADV-${advance.id}`
        });
      });

      // 3. Get current month settlements for this bank account-currency combination
      const currentMonthSettlements = await settlement.findAll({
        where: {
          bookingDate: {
            [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
          }
        },
        include: [{
          model: MoneyAdvance,
          as: 'moneyAdvance',
          where: {
            bankAccountId: bankAccountId,
            currencyId: currencyId
          },
          include: [
            { model: currency, as: 'currency' },
            { model: user, as: 'maker' },
            { model: ministry, as: 'ministry' }
          ]
        }, {
          model: user,
          as: 'proceeder'
        }]
      });

      currentMonthSettlements.forEach(settle => {
        const rate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
        transactions.push({
          id: `set-${settle.id}`,
          bookingDate: settle.bookingDate,
          type: 'settlement',
          amount: parseFloat(settle.amount),
          currencyCode: settle.moneyAdvance.currency?.code || 'LAK',
          exchangeRate: rate,
          lcyAmount: parseFloat(settle.amount) * rate,
          purpose: settle.notes || settle.moneyAdvance.purpose,
          ministry: settle.moneyAdvance.ministry?.ministryName || 'N/A',
          user: settle.proceeder?.cus_name || 'N/A',
          referenceNumber: `SET-${settle.id} (ADV-${settle.moneyAdvance.id})`
        });
      });

      // Sort by date
      transactions.sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate));

      res.json({
        success: true,
        data: transactions
      });

    } catch (error) {
      logger.error('Error getting bank account details:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting bank account details',
        error: error.message
      });
    }
  }

  // Export function for bank account summary
  static async exportBankAccountSummary(req, res) {
    try {
      const ExcelJS = require('exceljs');
      const { reportMonth, bankAccountId } = req.query;

      if (!reportMonth) {
        return res.status(400).json({
          success: false,
          message: 'Report month is required'
        });
      }

      // Parse the report month
      const [year, month] = reportMonth.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const previousMonthEnd = new Date(year, month - 1, 0);

      const currentMonthStart = startDate.toISOString().split('T')[0];
      const currentMonthEnd = endDate.toISOString().split('T')[0];
      const broughtForwardEnd = previousMonthEnd.toISOString().split('T')[0];

      // Get all bank accounts
      const bankAccounts = await bankAccount.findAll({
        where: bankAccountId ? { id: bankAccountId } : {},
        order: [['accountName', 'ASC']]
      });

      const reportData = [];

      for (const bank of bankAccounts) {
        // Get all unique currencies used by this bank account
        const bankCurrencies = await MoneyAdvance.findAll({
          where: { bankAccountId: bank.id },
          include: [{ model: currency, as: 'currency' }],
          attributes: ['currencyId'],
          group: ['currencyId', 'currency.id'],
          raw: false
        });

        // Process each currency for this bank account
        for (const currencyItem of bankCurrencies) {
          const curr = currencyItem.currency;
          if (!curr) continue;

          // Calculate brought forward, current month, and settlements
          // (Same calculation logic as in getBankAccountSummary)

          const broughtForwardAdvances = await MoneyAdvance.findAll({
            where: {
              bankAccountId: bank.id,
              currencyId: curr.id,
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            }
          });

          const broughtForwardSettlements = await settlement.findAll({
            where: {
              bookingDate: { [require('sequelize').Op.lte]: broughtForwardEnd }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                bankAccountId: bank.id,
                currencyId: curr.id
              }
            }]
          });

          let broughtForwardAmount = 0;
          let broughtForwardExchangeRate = 1;

          broughtForwardAdvances.forEach(advance => {
            broughtForwardAmount += parseFloat(advance.amount);
            broughtForwardExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          broughtForwardSettlements.forEach(settle => {
            broughtForwardAmount -= parseFloat(settle.amount);
          });

          const broughtForwardLcy = broughtForwardAmount * broughtForwardExchangeRate;

          const currentMonthAdvances = await MoneyAdvance.findAll({
            where: {
              bankAccountId: bank.id,
              currencyId: curr.id,
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            }
          });

          let currentMonthAmount = 0;
          let currentMonthExchangeRate = 1;

          currentMonthAdvances.forEach(advance => {
            currentMonthAmount += parseFloat(advance.amount);
            currentMonthExchangeRate = parseFloat(advance.exchangeRate) || 1;
          });

          const currentMonthLcy = currentMonthAmount * currentMonthExchangeRate;

          const currentMonthSettlements = await settlement.findAll({
            where: {
              bookingDate: {
                [require('sequelize').Op.between]: [currentMonthStart, currentMonthEnd]
              }
            },
            include: [{
              model: MoneyAdvance,
              as: 'moneyAdvance',
              where: {
                bankAccountId: bank.id,
                currencyId: curr.id
              }
            }]
          });

          let settlementAmount = 0;
          let settlementExchangeRate = currentMonthExchangeRate;

          currentMonthSettlements.forEach(settle => {
            settlementAmount += parseFloat(settle.amount);
            settlementExchangeRate = parseFloat(settle.moneyAdvance.exchangeRate) || 1;
          });

          const settlementLcy = settlementAmount * settlementExchangeRate;
          const balanceLcy = broughtForwardLcy + currentMonthLcy - settlementLcy;

          if (broughtForwardAmount !== 0 || currentMonthAmount !== 0 || settlementAmount !== 0) {
            reportData.push({
              bankAccountId: bank.id,
              bankAccountName: bank.accountName,
              bankAccountNumber: bank.accountNumber,
              bankName: bank.bankName,
              currencyId: curr.id,
              currencyCode: curr.code,
              currencyName: curr.name,
              broughtForwardAmount,
              broughtForwardExchangeRate,
              broughtForwardLcy,
              currentMonthAmount,
              currentMonthExchangeRate,
              currentMonthLcy,
              settlementAmount,
              settlementExchangeRate,
              settlementLcy,
              balanceLcy,
              currencyLine: `${curr.code} - ${curr.name}`
            });
          }
        }
      }

      // Sort by bank account name, then by currency code
      reportData.sort((a, b) => {
        if (a.bankAccountName !== b.bankAccountName) {
          return a.bankAccountName.localeCompare(b.bankAccountName);
        }
        return a.currencyCode.localeCompare(b.currencyCode);
      });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bank Account Summary by Currency');

      // Add title
      worksheet.mergeCells('A1:O1');
      worksheet.getCell('A1').value = `ລາຍງານສະຫຼຸບຕາມບັນຊີທະນາຄານແລະສະກຸນເງິນ - ${reportMonth}`;
      worksheet.getCell('A1').font = { bold: true, size: 16 };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      // Add headers
      const headers = [
        'ບັນຊີທະນາຄານ',
        'ເລກບັນຊີ',
        'ທະນາຄານ',
        'ສະກຸນເງິນ',
        'ຍອດຍົກມາ',
        'ອັດຕາແລກປ່ຽນ',
        'ຍອດຍົກມາ LCY',
        'ລາຍຈ່າຍເດືອນນີ້',
        'ອັດຕາແລກປ່ຽນ',
        'ລາຍຈ່າຍເດືອນນີ້ LCY',
        'ການຊຳລະ',
        'ອັດຕາແລກປ່ຽນ',
        'ການຊຳລະ LCY',
        'ຍອດສະຫຼຸບ LCY',
        'ສາຍສະກຸນເງິນ'
      ];

      worksheet.addRow([]); // Empty row
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      reportData.forEach(item => {
        worksheet.addRow([
          item.bankAccountName,
          item.bankAccountNumber,
          item.bankName,
          item.currencyCode,
          item.broughtForwardAmount.toFixed(2),
          item.broughtForwardExchangeRate.toFixed(4),
          item.broughtForwardLcy.toFixed(2),
          item.currentMonthAmount.toFixed(2),
          item.currentMonthExchangeRate.toFixed(4),
          item.currentMonthLcy.toFixed(2),
          item.settlementAmount.toFixed(2),
          item.settlementExchangeRate.toFixed(4),
          item.settlementLcy.toFixed(2),
          item.balanceLcy.toFixed(2),
          item.currencyLine
        ]);
      });

      // Add summary calculations (similar to ministry report)
      worksheet.addRow([]);

      const totals = {
        totalBroughtForwardAmount: reportData.reduce((sum, item) => sum + item.broughtForwardAmount, 0),
        totalBroughtForwardLcy: reportData.reduce((sum, item) => sum + item.broughtForwardLcy, 0),
        totalCurrentMonthAmount: reportData.reduce((sum, item) => sum + item.currentMonthAmount, 0),
        totalCurrentMonthLcy: reportData.reduce((sum, item) => sum + item.currentMonthLcy, 0),
        totalSettlementAmount: reportData.reduce((sum, item) => sum + item.settlementAmount, 0),
        totalSettlementLcy: reportData.reduce((sum, item) => sum + item.settlementLcy, 0),
        totalBalanceLcy: reportData.reduce((sum, item) => sum + item.balanceLcy, 0)
      };

      const summaryRow = worksheet.addRow([
        'ລວມທັງໝົດ',
        '',
        '',
        'ທຸກສະກຸນເງິນ',
        totals.totalBroughtForwardAmount.toFixed(2),
        '',
        totals.totalBroughtForwardLcy.toFixed(2),
        totals.totalCurrentMonthAmount.toFixed(2),
        '',
        totals.totalCurrentMonthLcy.toFixed(2),
        totals.totalSettlementAmount.toFixed(2),
        '',
        totals.totalSettlementLcy.toFixed(2),
        totals.totalBalanceLcy.toFixed(2),
        'ລວມທັງໝົດ'
      ]);

      summaryRow.font = { bold: true };
      summaryRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCC00' }
      };

      // Auto-size columns
      worksheet.columns.forEach(column => {
        column.width = 15;
      });

      // Add number formatting
      const numberColumns = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
      numberColumns.forEach(col => {
        worksheet.getColumn(col).numFmt = '#,##0.00';
      });

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bank-account-summary-report-${reportMonth}.xlsx"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      logger.error('Error exporting bank account summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting bank account summary',
        error: error.message
      });
    }
  }



  // ===============================================================
  // NEW METHODS TO ADD - AUDIT TRAIL ENDPOINTS
  // ===============================================================

  // GET /money-advances/:id/audit - Get audit trail for specific record
  static async getAuditTrail(req, res) {
    try {
      const { id } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const auditTrail = await MoneyAdvanceAudit.getAuditTrail(id, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const summaryData = auditTrail.map(record => ({
        id: record.id,
        action: record.action,
        changedAt: record.changedAt,
        changedBy: record.changedByUser?.cus_name || 'System',
        reason: record.reason,
        keyChanges: record.changedFields?.slice(0, 3) || [], // Show first 3 changes
        totalChanges: record.changedFields?.length || 0
      }));

      res.json({
        success: true,
        data: summaryData,
        totalRecords: auditTrail.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching audit trail',
        error: error.message
      });
    }
  }

  // GET /audit/user/:userId - Get all changes made by a specific user
  static async getUserAuditTrail(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const changes = await MoneyAdvanceAudit.getChangesByUser(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: changes,
        totalRecords: changes.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching user audit trail',
        error: error.message
      });
    }
  }

  // GET /audit/date-range - Get changes within date range
  static async getAuditByDateRange(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const { limit = 100, offset = 0 } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const changes = await MoneyAdvanceAudit.getChangesByDateRange(
        new Date(startDate),
        new Date(endDate),
        {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      );

      res.json({
        success: true,
        data: changes,
        dateRange: { startDate, endDate },
        totalRecords: changes.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching audit trail by date range',
        error: error.message
      });
    }
  }


}

module.exports = MoneyAdvanceController;