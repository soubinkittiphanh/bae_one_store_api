const { Op } = require('sequelize');
const Settlement = require('../../models').moneySettlement;
const BankAccount = require('../../models').bankAccount;
const Ministry = require('../../models').ministry;
const ChartAccount = require('../../models').chartAccount;

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
            attributes: ['id', 'name', 'code']
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
            attributes: ['id', 'accountCode', 'accountName']
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