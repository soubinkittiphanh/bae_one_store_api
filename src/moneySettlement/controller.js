const { Op } = require('sequelize');
const logger = require('../api/logger');

const Settlement = require('../models').moneySettlement;
const user = require('../models').user;
const currency = require('../models').currency;
const MoneyAdvance = require('../models').moneyAdvance;
const BankAccount = require('../models').bankAccount;

class SettlementController {

  // GET /settlements - Get all settlements with pagination
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, method, userId, moneyAdvanceId, bankAccountId } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (method) whereClause.method = method;
      if (userId) whereClause.userId = userId;
      if (moneyAdvanceId) whereClause.moneyAdvanceId = moneyAdvanceId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;

      const { count, rows } = await Settlement.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status'],
            include: [
              { model: user, as: 'maker' },
              { model: currency, as: 'currency' }
            ],
            required: false // Left join - settlement might not have money advance
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            // attributes: ['account_number', 'account_name', 'bank_name', 'branch'],
            required: false // Left join - settlement might not have bank account
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          settlements: rows,
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
        message: 'Error fetching settlements',
        error: error.message
      });
    }
  }

  // GET /settlements/:id - Get single settlement
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const settlement = await Settlement.findByPk(id, {
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status', 'dueDate'],
            include: [
              { model: user, as: 'maker' },
              { model: user, as: 'checker' },
              { model: currency, as: 'currency' }
            ],
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch'],
            required: false
          }
        ]
      });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      res.json({
        success: true,
        data: settlement
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching settlement',
        error: error.message
      });
    }
  }

  // POST /settlements - Create new settlement
  static async create(req, res) {
    try {
      const { amount, method, notes, userId, moneyAdvanceId, bankAccountId } = req.body;

      // Validation
      if (!amount || !method || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Amount, method, and userId are required'
        });
      }

      // Validate bank account is required for bank_transfer method
      if (method === 'bank_transfer' && !bankAccountId) {
        return res.status(400).json({
          success: false,
          message: 'Bank account is required for bank transfer settlements'
        });
      }

      // Validate bank account exists if provided
      if (bankAccountId) {
        const bankAccount = await BankAccount.findByPk(bankAccountId);
        if (!bankAccount) {
          return res.status(404).json({
            success: false,
            message: 'Bank account not found'
          });
        }
      }

      let moneyAdvance = null;

      // Check if money advance exists and is approved (only if provided)
      if (moneyAdvanceId) {
        moneyAdvance = await MoneyAdvance.findByPk(moneyAdvanceId);
        if (!moneyAdvance) {
          return res.status(404).json({
            success: false,
            message: 'Money advance not found'
          });
        }

        if (moneyAdvance.status !== 'approved') {
          return res.status(400).json({
            success: false,
            message: 'Can only create settlements for approved money advances'
          });
        }

        // Calculate total settled amount for this money advance
        const existingSettlements = await Settlement.sum('amount', {
          where: { moneyAdvanceId }
        });

        const totalSettled = (existingSettlements || 0) + parseFloat(amount);

        if (totalSettled > parseFloat(moneyAdvance.amount)) {
          return res.status(400).json({
            success: false,
            message: 'Settlement amount exceeds remaining balance',
            data: {
              advanceAmount: moneyAdvance.amount,
              alreadySettled: existingSettlements || 0,
              remainingBalance: parseFloat(moneyAdvance.amount) - (existingSettlements || 0)
            }
          });
        }
      }

      const settlement = await Settlement.create({
        amount,
        method,
        notes,
        userId,
        moneyAdvanceId: moneyAdvanceId || null,
        bankAccountId:  bankAccountId || null
      });

      // Check if fully settled and update money advance status (only if money advance exists)
      if (moneyAdvance) {
        const totalSettled = await Settlement.sum('amount', {
          where: { moneyAdvanceId }
        });

        if (totalSettled >= parseFloat(moneyAdvance.amount)) {
          await moneyAdvance.update({ status: 'settled' });
        }
      }

      // Fetch the created settlement with associations
      const createdSettlement = await Settlement.findByPk(settlement.id, {
        include: [
          {
            model: user,
            as: 'proceeder',
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
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch'],
            required: false
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdSettlement,
        message: 'Settlement created successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating settlement',
        error: error.message
      });
    }
  }

  // PUT /settlements/:id - Update settlement
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { amount, method, notes, bankAccountId, moneyAdvanceId } = req.body;

      const settlement = await Settlement.findByPk(id, {
        include: [{ model: MoneyAdvance, as: 'moneyAdvance', required: false }]
      });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      // Validate bank account is required for bank_transfer method
      const updatedMethod = method || settlement.method;
      if (updatedMethod === 'bank_transfer' && !bankAccountId && !settlement.bankAccountId) {
        return res.status(400).json({
          success: false,
          message: 'Bank account is required for bank transfer settlements'
        });
      }

      // Validate bank account exists if provided
      if (bankAccountId) {
        const bankAccount = await BankAccount.findByPk(bankAccountId);
        if (!bankAccount) {
          return res.status(404).json({
            success: false,
            message: 'Bank account not found'
          });
        }
      }

      // Validate money advance exists if provided
      let newMoneyAdvance = null;
      const finalMoneyAdvanceId = moneyAdvanceId !== undefined ? moneyAdvanceId : settlement.moneyAdvanceId;

      if (finalMoneyAdvanceId) {
        newMoneyAdvance = await MoneyAdvance.findByPk(finalMoneyAdvanceId);
        if (!newMoneyAdvance) {
          return res.status(404).json({
            success: false,
            message: 'Money advance not found'
          });
        }

        if (newMoneyAdvance.status !== 'approved' && newMoneyAdvance.status !== 'settled') {
          return res.status(400).json({
            success: false,
            message: 'Can only update settlements for approved or settled money advances'
          });
        }
      }

      // If amount is being updated and there's a money advance, validate total doesn't exceed advance amount
      if (amount && amount !== settlement.amount && finalMoneyAdvanceId) {
        const existingSettlements = await Settlement.sum('amount', {
          where: {
            moneyAdvanceId: finalMoneyAdvanceId,
            id: { [Op.ne]: settlement.id } // Exclude current settlement
          }
        });

        const totalSettled = (existingSettlements || 0) + parseFloat(amount);
        const advanceAmount = newMoneyAdvance ? parseFloat(newMoneyAdvance.amount) : 0;

        if (totalSettled > advanceAmount) {
          return res.status(400).json({
            success: false,
            message: 'Updated settlement amount would exceed advance balance',
            data: {
              advanceAmount: advanceAmount,
              otherSettlements: existingSettlements || 0,
              maxAllowedAmount: advanceAmount - (existingSettlements || 0)
            }
          });
        }
      }

      // Update settlement
      // Update settlement
      await settlement.update({
        amount: amount !== undefined ? amount : settlement.amount,
        method: method || settlement.method,
        notes: notes !== undefined ? notes : settlement.notes,
        bankAccountId: bankAccountId !== undefined ? bankAccountId : settlement.bankAccountId,
        moneyAdvanceId: finalMoneyAdvanceId !== undefined ? finalMoneyAdvanceId : settlement.moneyAdvanceId
      });
      // Recalculate money advance status for old money advance (if it existed and is being changed)
      if (settlement.moneyAdvanceId && settlement.moneyAdvanceId !== finalMoneyAdvanceId) {
        const oldMoneyAdvance = await MoneyAdvance.findByPk(settlement.moneyAdvanceId);
        if (oldMoneyAdvance) {
          const oldTotalSettled = await Settlement.sum('amount', {
            where: { moneyAdvanceId: settlement.moneyAdvanceId }
          });

          const shouldBeSettled = oldTotalSettled >= parseFloat(oldMoneyAdvance.amount);

          if (shouldBeSettled && oldMoneyAdvance.status !== 'settled') {
            await oldMoneyAdvance.update({ status: 'settled' });
          } else if (!shouldBeSettled && oldMoneyAdvance.status === 'settled') {
            await oldMoneyAdvance.update({ status: 'approved' });
          }
        }
      }

      // Recalculate money advance status for new/current money advance (if it exists)
      if (finalMoneyAdvanceId) {
        const totalSettled = await Settlement.sum('amount', {
          where: { moneyAdvanceId: finalMoneyAdvanceId }
        });

        const shouldBeSettled = totalSettled >= parseFloat(newMoneyAdvance.amount);
        const currentStatus = newMoneyAdvance.status;

        if (shouldBeSettled && currentStatus !== 'settled') {
          await newMoneyAdvance.update({ status: 'settled' });
        } else if (!shouldBeSettled && currentStatus === 'settled') {
          await newMoneyAdvance.update({ status: 'approved' });
        }
      }

      const updatedSettlement = await Settlement.findByPk(id, {
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: MoneyAdvance,
            as: 'moneyAdvance',
            attributes: ['id', 'amount', 'purpose', 'status'],
            required: false
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch'],
            required: false
          }
        ]
      });

      res.json({
        success: true,
        data: updatedSettlement,
        message: 'Settlement updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating settlement',
        error: error.message
      });
    }
  }

  // DELETE /settlements/:id - Delete settlement
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const settlement = await Settlement.findByPk(id, {
        include: [{ model: MoneyAdvance, as: 'moneyAdvance', required: false }]
      });

      if (!settlement) {
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      await settlement.destroy();

      // Recalculate money advance status after deletion (only if money advance exists)
      if (settlement.moneyAdvanceId && settlement.moneyAdvance) {
        const remainingSettlements = await Settlement.sum('amount', {
          where: { moneyAdvanceId: settlement.moneyAdvanceId }
        });

        const totalRemaining = remainingSettlements || 0;
        const advanceAmount = parseFloat(settlement.moneyAdvance.amount);

        if (totalRemaining < advanceAmount && settlement.moneyAdvance.status === 'settled') {
          await settlement.moneyAdvance.update({ status: 'approved' });
        }
      }

      res.json({
        success: true,
        message: 'Settlement deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting settlement',
        error: error.message
      });
    }
  }

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
            model: BankAccount,
            as: 'bankAccount',
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch'],
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

  // GET /settlements/dashboard - Dashboard statistics
  static async getDashboard(req, res) {
    try {
      const { userId, bankAccountId, hasMoneyAdvance } = req.query;

      const whereClause = {};
      if (userId) whereClause.userId = userId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;

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
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name']
          }
        ],
        group: ['bankAccountId']
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
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch']
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

  // GET /settlements/standalone - Get standalone settlements (not linked to money advance)
  static async getStandalone(req, res) {
    try {
      const { page = 1, limit = 10, method, userId, bankAccountId } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {
        moneyAdvanceId: null // Only standalone settlements
      };

      if (method) whereClause.method = method;
      if (userId) whereClause.userId = userId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;

      const { count, rows } = await Settlement.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'proceeder',
          },
          {
            model: BankAccount,
            as: 'bankAccount',
            // attributes: ['bank_acc_id', 'account_number', 'account_name', 'bank_name', 'branch'],
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

module.exports = SettlementController;