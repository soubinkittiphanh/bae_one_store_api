const { Op } = require('sequelize');
const Settlement = require('../../models').moneySettlement;
const user = require('../../models').user;
const currency = require('../../models').currency;
const MoneyAdvance = require('../../models').moneyAdvance;
const BankAccount = require('../../models').bankAccount;
const Ministry = require('../../models').ministry;
const ChartAccount = require('../../models').chartAccount;

class SettlementSpecializedController {

  // GET /settlements/by-advance/:moneyAdvanceId - Get settlements for specific advance
  static async getByAdvanceId(req, res) {
    try {
      const { moneyAdvanceId } = req.params;

      const settlements = await Settlement.findAll({
        where: { moneyAdvanceId },
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: currency,
            as: 'currency',
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            required: false
          },
          {
            model: Ministry,
            as: 'ministry',
            required: false
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      // Calculate settlement summary
      const totalSettled = await Settlement.sum('amount', {
        where: { moneyAdvanceId }
      });

      const moneyAdvance = await MoneyAdvance.findByPk(moneyAdvanceId, {
        attributes: ['id', 'amount', 'purpose', 'status']
      });

      res.json({
        success: true,
        data: {
          settlements,
          summary: {
            totalSettled: totalSettled || 0,
            advanceAmount: moneyAdvance ? moneyAdvance.amount : 0,
            remainingBalance: moneyAdvance ? parseFloat(moneyAdvance.amount) - (totalSettled || 0) : 0,
            settlementCount: settlements.length
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching settlements for advance',
        error: error.message
      });
    }
  }

  // GET /settlements/by-bank-account/:bankAccountId - Get settlements for specific bank account
  static async getByBankAccountId(req, res) {
    try {
      const { bankAccountId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Settlement.findAndCountAll({
        where: { bankAccountId },
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: currency,
            as: 'currency',
            required: false
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status'],
            include: [
              { model: user, as: 'maker' }
            ],
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
          },
          {
            model: Ministry,
            as: 'ministry',
            required: false
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
            required: false
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      // Calculate total amount for this bank account
      const totalAmount = await Settlement.sum('amount', {
        where: { bankAccountId }
      });

      res.json({
        success: true,
        data: {
          settlements: rows,
          summary: {
            totalAmount: totalAmount || 0,
            settlementCount: count
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(count / limit),
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching settlements for bank account',
        error: error.message
      });
    }
  }

  // GET /settlements/by-ministry/:ministryId - Get settlements for specific ministry
  static async getByMinistryId(req, res) {
    try {
      const { ministryId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Settlement.findAndCountAll({
        where: { ministryId },
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: currency,
            as: 'currency',
            required: false
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status'],
            include: [
              { model: user, as: 'maker' }
            ],
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            required: false
          },
          {
            model: Ministry,
            as: 'ministry',
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
            required: false
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      // Calculate total amount for this ministry
      const totalAmount = await Settlement.sum('amount', {
        where: { ministryId }
      });

      res.json({
        success: true,
        data: {
          settlements: rows,
          summary: {
            totalAmount: totalAmount || 0,
            settlementCount: count
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(count / limit),
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching settlements for ministry',
        error: error.message
      });
    }
  }

  // GET /settlements/by-chart-account/:chartAccountId - Get settlements for specific chart account
  static async getByChartAccountId(req, res) {
    try {
      const { chartAccountId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Settlement.findAndCountAll({
        where: { chartAccountId },
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: currency,
            as: 'currency',
            required: false
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status'],
            include: [
              { model: user, as: 'maker' }
            ],
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            required: false
          },
          {
            model: Ministry,
            as: 'ministry',
            required: false
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      // Calculate total amount for this chart account
      const totalAmount = await Settlement.sum('amount', {
        where: { chartAccountId }
      });

      res.json({
        success: true,
        data: {
          settlements: rows,
          summary: {
            totalAmount: totalAmount || 0,
            settlementCount: count
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(count / limit),
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching settlements for chart account',
        error: error.message
      });
    }
  }

  // GET /settlements/standalone - Get standalone settlements (not linked to money advance)
  static async getStandalone(req, res) {
    try {
      const { page = 1, limit = 10, method, userId, bankAccountId, ministryId, chartAccountId } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {
        moneyAdvanceId: null // Only standalone settlements
      };

      if (method) whereClause.method = method;
      if (userId) whereClause.userId = userId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (chartAccountId) whereClause.chartAccountId = chartAccountId;

      const { count, rows } = await Settlement.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: currency,
            as: 'currency',
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            required: false
          },
          {
            model: Ministry,
            as: 'ministry',
            required: false
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
            required: false
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      // Calculate total amount for standalone settlements
      const totalAmount = await Settlement.sum('amount', {
        where: whereClause
      });

      res.json({
        success: true,
        data: {
          settlements: rows,
          summary: {
            totalAmount: totalAmount || 0,
            settlementCount: count
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(count / limit),
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching standalone settlements',
        error: error.message
      });
    }
  }
}

module.exports = SettlementSpecializedController;