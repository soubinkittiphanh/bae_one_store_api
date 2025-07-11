const logger = require('../api/logger');

const MoneyAdvance = require('../models').moneyAdvance;
const user = require('../models').user;
const currency = require('../models').currency;
const settlement = require('../models').moneySettlement;
const bankAccount = require('../models').bankAccount;

class MoneyAdvanceController {
  
  // GET /money-advances - Get all money advances with pagination
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, status, makerId } = req.query;
      const offset = (page - 1) * limit;
      
      const whereClause = {};
      if (status) whereClause.status = status;
      if (makerId) whereClause.makerId = makerId;

      const { count, rows } = await MoneyAdvance.findAndCountAll({
        where: whereClause,
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency'},
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          advances: rows,
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
        message: 'Error fetching money advances',
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
          { model: bankAccount, as: 'bankAccount' }
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
      const { amount, purpose, note, makerId, currencyId, dueDate, bankAccountId } = req.body;

      // Validation
      if (!amount || !makerId || !currencyId) {
        return res.status(400).json({
          success: false,
          message: 'Amount, makerId, and currencyId are required'
        });
      }

      const advance = await MoneyAdvance.create({
        amount,
        purpose,
        note,
        makerId,
        currencyId,
        dueDate,
        bankAccountId,
        status: 'pending'
      });

      // Fetch the created advance with associations
      const createdAdvance = await MoneyAdvance.findByPk(advance.id, {
        include: [
          { model: user, as: 'maker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' }
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
      const { amount, purpose, note, dueDate, bankAccountId } = req.body;

      const advance = await MoneyAdvance.findByPk(id);
      
      if (!advance) {
        return res.status(404).json({
          success: false,
          message: 'Money advance not found'
        });
      }

      // Only allow updates if status is pending
      if (advance.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update approved or settled advances'
        });
      }

      await advance.update({
        amount: amount || advance.amount,
        purpose: purpose || advance.purpose,
        note: note || advance.note,
        dueDate: dueDate || advance.dueDate,
        bankAccountId: bankAccountId || advance.bankAccountId
      });

      const updatedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' }
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

      await advance.update({
        status: 'approved',
        checkerId,
        approvedAt: new Date()
      });

      const approvedAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: bankAccount, as: 'bankAccount' }
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

      await advance.update({
        status: 'settled'
      });

      const settledAdvance = await MoneyAdvance.findByPk(id, {
        include: [
          { model: user, as: 'maker', },
          { model: user, as: 'checker', },
          { model: currency, as: 'currency' },
          { model: settlement, as: 'settlementLine' },
          { model: bankAccount, as: 'bankAccount' }
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

      await advance.destroy();

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
      const { makerId } = req.query;
      
      const whereClause = makerId ? { makerId } : {};

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
}

module.exports = MoneyAdvanceController;