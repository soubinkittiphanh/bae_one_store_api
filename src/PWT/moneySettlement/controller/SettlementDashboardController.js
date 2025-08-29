const { Op } = require('sequelize');
const Settlement = require('../../../models').moneySettlement;
const BankAccount = require('../../../models').bankAccount;
const Ministry = require('../../../models').ministry;
const ChartAccount = require('../../../models').chartAccount;

class SettlementDashboardController {

  // GET /settlements/dashboard - Dashboard statistics
  static async getDashboard(req, res) {
    try {
      const { userId, bankAccountId, ministryId, chartAccountId, hasMoneyAdvance } = req.query;

      const whereClause = {};
      if (userId) whereClause.userId = userId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (chartAccountId) whereClause.chartAccountId = chartAccountId;

      // Filter by whether settlement has money advance or not
      if (hasMoneyAdvance === 'true') {
        whereClause.moneyAdvanceId = { [Op.ne]: null };
      } else if (hasMoneyAdvance === 'false') {
        whereClause.moneyAdvanceId = null;
      }

      const [totalCount, totalAmount] = await Promise.all([
        Settlement.count({ where: whereClause }),
        Settlement.sum('amount', { where: whereClause })
      ]);

      // Settlement by method
      const methodStats = await Settlement.findAll({
        where: whereClause,
        attributes: [
          'method',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total']
        ],
        group: ['method']
      });

      // Settlement by bank account (for bank transfers only)
      const bankAccountStats = await Settlement.findAll({
        where: {
          ...whereClause,
          method: 'bank_transfer',
          bankAccountId: { [Op.ne]: null }
        },
        attributes: [
          'bankAccountId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total']
        ],
        include: [
          {
            model: BankAccount,
            as: 'bankAccount',
          }
        ],
        group: ['bankAccountId']
      });

      // Settlement by ministry
      const ministryStats = await Settlement.findAll({
        where: {
          ...whereClause,
          ministryId: { [Op.ne]: null }
        },
        attributes: [
          'ministryId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total']
        ],
        include: [
          {
            model: Ministry,
            as: 'ministry',
          }
        ],
        group: ['ministryId']
      });

      // Settlement by chart account
      const chartAccountStats = await Settlement.findAll({
        where: {
          ...whereClause,
          chartAccountId: { [Op.ne]: null }
        },
        attributes: [
          'chartAccountId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total']
        ],
        include: [
          {
            model: ChartAccount,
            as: 'chartAccount',
          }
        ],
        group: ['chartAccountId']
      });

      // Settlements with vs without money advance
      const advanceStats = await Settlement.findAll({
        where: whereClause,
        attributes: [
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total'],
          [Settlement.sequelize.literal('CASE WHEN moneyAdvanceId IS NULL THEN "standalone" ELSE "with_advance" END'), 'type']
        ],
        group: [Settlement.sequelize.literal('CASE WHEN moneyAdvanceId IS NULL THEN "standalone" ELSE "with_advance" END')]
      });

      res.json({
        success: true,
        data: {
          overview: {
            totalCount,
            totalAmount: totalAmount || 0
          },
          byMethod: methodStats,
          byBankAccount: bankAccountStats,
          byMinistry: ministryStats,
          byChartAccount: chartAccountStats,
          byAdvanceType: advanceStats
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

  // GET /settlements/analytics/summary - Get summary analytics
  static async getSummaryAnalytics(req, res) {
    try {
      const { startDate, endDate, ministryId, chartAccountId } = req.query;

      const whereClause = {};
      if (ministryId) whereClause.ministryId = ministryId;
      if (chartAccountId) whereClause.chartAccountId = chartAccountId;

      // Date range filter
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
      }

      // Total settlements and amount
      const [totalSettlements, totalAmount] = await Promise.all([
        Settlement.count({ where: whereClause }),
        Settlement.sum('amount', { where: whereClause })
      ]);

      // Monthly breakdown
      const monthlyStats = await Settlement.findAll({
        where: whereClause,
        attributes: [
          [Settlement.sequelize.fn('DATE_FORMAT', Settlement.sequelize.col('createdAt'), '%Y-%m'), 'month'],
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'total']
        ],
        group: [Settlement.sequelize.fn('DATE_FORMAT', Settlement.sequelize.col('createdAt'), '%Y-%m')],
        order: [[Settlement.sequelize.fn('DATE_FORMAT', Settlement.sequelize.col('createdAt'), '%Y-%m'), 'ASC']]
      });

      // Average settlement amount
      const avgAmount = await Settlement.findOne({
        where: whereClause,
        attributes: [
          [Settlement.sequelize.fn('AVG', Settlement.sequelize.col('amount')), 'average']
        ]
      });

      res.json({
        success: true,
        data: {
          summary: {
            totalSettlements,
            totalAmount: totalAmount || 0,
            averageAmount: avgAmount?.dataValues?.average || 0
          },
          monthlyBreakdown: monthlyStats,
          period: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching summary analytics',
        error: error.message
      });
    }
  }

  // GET /settlements/analytics/top-ministries - Get top ministries by settlement amount
  static async getTopMinistries(req, res) {
    try {
      const { limit = 10, startDate, endDate } = req.query;

      const whereClause = {
        ministryId: { [Op.ne]: null }
      };

      // Date range filter
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
      }

      const topMinistries = await Settlement.findAll({
        where: whereClause,
        attributes: [
          'ministryId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'settlementCount'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'totalAmount']
        ],
        include: [
          {
            model: Ministry,
            as: 'ministry',
            // attributes: ['id', 'name', 'code']
          }
        ],
        group: ['ministryId'],
        order: [[Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'DESC']],
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          topMinistries,
          period: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching top ministries',
        error: error.message
      });
    }
  }

  // Add this method to SettlementDashboardController class

  // GET /settlements/currency-breakdown - Get settlement breakdown by currency
  static async getCurrencyBreakdown(req, res) {
    try {
      const { startDate, endDate, method, bankAccountId, ministryId, chartAccountId } = req.query;

      const whereClause = {};

      // Apply filters
      if (method) whereClause.method = method;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (chartAccountId) whereClause.chartAccountId = chartAccountId;

      // Date range filter
      if (startDate || endDate) {
        whereClause.bookingDate = {};
        if (startDate) whereClause.bookingDate[Op.gte] = new Date(startDate);
        if (endDate) whereClause.bookingDate[Op.lte] = new Date(endDate);
      }

      // Get currency breakdown with LAK equivalent calculations
      const currencyBreakdown = await Settlement.findAll({
        where: whereClause,
        attributes: [
          'currencyId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'count'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'totalAmount'],
          [Settlement.sequelize.fn('AVG', Settlement.sequelize.col('exchangeRate')), 'avgExchangeRate'],
          [Settlement.sequelize.fn('SUM',
            Settlement.sequelize.literal('amount * exchangeRate')
          ), 'lakEquivalent']
        ],
        include: [
          {
            model: require('../../../models').currency,
            as: 'currency',
            // attributes: ['id', 'code', 'name', 'symbol']
          }
        ],
        group: ['currencyId', 'currency.id'],
        order: [[Settlement.sequelize.fn('SUM',
          Settlement.sequelize.literal('amount * exchangeRate')
        ), 'DESC']]
      });

      // Calculate totals
      const totalLakEquivalent = currencyBreakdown.reduce((sum, currency) =>
        sum + parseFloat(currency.dataValues.lakEquivalent || 0), 0
      );

      const totalSettlements = currencyBreakdown.reduce((sum, currency) =>
        sum + parseInt(currency.dataValues.count || 0), 0
      );

      // Format the response data
      const formattedBreakdown = currencyBreakdown.map(item => {
        const data = item.dataValues;
        const currencyCode = item.currency?.code || 'LAK';

        return {
          currencyId: data.currencyId,
          currencyCode: currencyCode,
          currencyName: item.currency?.name || 'Lao Kip',
          currencySymbol: item.currency?.symbol || '₭',
          count: parseInt(data.count),
          totalAmount: parseFloat(data.totalAmount || 0),
          avgExchangeRate: parseFloat(data.avgExchangeRate || 1),
          lakEquivalent: parseFloat(data.lakEquivalent || 0),
          percentage: totalLakEquivalent > 0 ?
            Math.round((parseFloat(data.lakEquivalent || 0) / totalLakEquivalent) * 100) : 0
        };
      });

      res.json({
        success: true,
        data: {
          currencies: formattedBreakdown,
          summary: {
            totalCurrencies: formattedBreakdown.length,
            totalSettlements: totalSettlements,
            totalLakEquivalent: totalLakEquivalent
          },
          period: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching currency breakdown',
        error: error.message
      });
    }
  }
  // Add this method to your SettlementDashboardController class
  static async getStats(req, res) {
    try {
      const { Op } = require('sequelize');

      // Get total count and amount
      const [totalCount, totalAmountResult] = await Promise.all([
        Settlement.count(),
        Settlement.sum('amount')
      ]);

      const totalAmount = totalAmountResult || 0;

      // Get this month's settlements
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

      const thisMonth = await Settlement.count({
        where: {
          bookingDate: {
            [Op.between]: [startOfMonth, endOfMonth]
          }
        }
      });

      // Get pending settlements
      const pendingAdvances = await Settlement.findAll({
        include: [{
          model: require('../../../models').moneyAdvance,
          as: 'moneyAdvance',
          where: {
            status: { [Op.in]: ['approved', 'pending'] }
          },
          required: true
        }],
        attributes: ['moneyAdvanceId'],
        group: ['moneyAdvanceId']
      });

      const pending = pendingAdvances.length;

      res.json({
        success: true,
        data: {
          totalCount: parseInt(totalCount) || 0,
          totalAmount: parseFloat(totalAmount) || 0,
          thisMonth: parseInt(thisMonth) || 0,
          pending: parseInt(pending) || 0
        }
      });

    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching settlement statistics',
        error: error.message
      });
    }
  }
  // GET /settlements/analytics/top-chart-accounts - Get top chart accounts by settlement amount
  static async getTopChartAccounts(req, res) {
    try {
      const { limit = 10, startDate, endDate } = req.query;

      const whereClause = {
        chartAccountId: { [Op.ne]: null }
      };

      // Date range filter
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
      }

      const topChartAccounts = await Settlement.findAll({
        where: whereClause,
        attributes: [
          'chartAccountId',
          [Settlement.sequelize.fn('COUNT', Settlement.sequelize.col('Settlement.id')), 'settlementCount'],
          [Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'totalAmount']
        ],
        include: [
          {
            model: ChartAccount,
            as: 'chartAccount',
            // attributes: ['id', 'accountCode', 'accountName']
          }
        ],
        group: ['chartAccountId'],
        order: [[Settlement.sequelize.fn('SUM', Settlement.sequelize.col('amount')), 'DESC']],
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          topChartAccounts,
          period: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching top chart accounts',
        error: error.message
      });
    }
  }
}

module.exports = SettlementDashboardController;