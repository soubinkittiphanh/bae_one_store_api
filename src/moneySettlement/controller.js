const { Op } = require('sequelize');
const logger = require('../api/logger');

const Settlement = require('../models').moneySettlement;
const user = require('../models').user;
const currency = require('../models').currency;
const MoneyAdvance = require('../models').moneyAdvance;
class SettlementController {
  
  // GET /settlements - Get all settlements with pagination
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, method, userId, moneyAdvanceId } = req.query;
      const offset = (page - 1) * limit;
      
      const whereClause = {};
      if (method) whereClause.method = method;
      if (userId) whereClause.userId = userId;
      if (moneyAdvanceId) whereClause.moneyAdvanceId = moneyAdvanceId;

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
              { model: user, as: 'maker',  },
              { model: currency, as: 'currency',  }
            ]
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
              { model: user, as: 'maker',  },
              { model: user, as: 'checker',  },
              { model: currency, as: 'currency',  }
            ]
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
      const { amount, method, notes, userId, moneyAdvanceId } = req.body;

      // Validation
      if (!amount || !method || !userId || !moneyAdvanceId) {
        return res.status(400).json({
          success: false,
          message: 'Amount, method, userId, and moneyAdvanceId are required'
        });
      }

      // Check if money advance exists and is approved
      const moneyAdvance = await MoneyAdvance.findByPk(moneyAdvanceId);
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

      // Calculate total settled amount
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

      const settlement = await Settlement.create({
        amount,
        method,
        notes,
        userId,
        moneyAdvanceId
      });

      // Check if fully settled and update money advance status
      if (totalSettled >= parseFloat(moneyAdvance.amount)) {
        await moneyAdvance.update({ status: 'settled' });
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
              { model: user, as: 'maker',  }
            ]
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
      const { amount, method, notes } = req.body;

      const settlement = await Settlement.findByPk(id, {
        include: [{ model: MoneyAdvance, as: 'moneyAdvance' }]
      });
      
      if (!settlement) {
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      // If amount is being updated, validate total doesn't exceed advance amount
      if (amount && amount !== settlement.amount) {
        const existingSettlements = await Settlement.sum('amount', {
          where: { 
            moneyAdvanceId: settlement.moneyAdvanceId,
            id: { [Op.ne]: settlement.id } // Exclude current settlement
          }
        });

        const totalSettled = (existingSettlements || 0) + parseFloat(amount);
        
        if (totalSettled > parseFloat(settlement.moneyAdvance.amount)) {
          return res.status(400).json({
            success: false,
            message: 'Updated settlement amount would exceed advance balance',
            data: {
              advanceAmount: settlement.moneyAdvance.amount,
              otherSettlements: existingSettlements || 0,
              maxAllowedAmount: parseFloat(settlement.moneyAdvance.amount) - (existingSettlements || 0)
            }
          });
        }
      }

      await settlement.update({
        amount: amount || settlement.amount,
        method: method || settlement.method,
        notes: notes !== undefined ? notes : settlement.notes
      });

      // Recalculate if money advance should be marked as settled
      const totalSettled = await Settlement.sum('amount', {
        where: { moneyAdvanceId: settlement.moneyAdvanceId }
      });

      const shouldBeSettled = totalSettled >= parseFloat(settlement.moneyAdvance.amount);
      const currentStatus = settlement.moneyAdvance.status;

      if (shouldBeSettled && currentStatus !== 'settled') {
        await settlement.moneyAdvance.update({ status: 'settled' });
      } else if (!shouldBeSettled && currentStatus === 'settled') {
        await settlement.moneyAdvance.update({ status: 'approved' });
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
            attributes: ['id', 'amount', 'purpose', 'status']
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
        include: [{ model: MoneyAdvance, as: 'moneyAdvance' }]
      });
      
      if (!settlement) {
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      await settlement.destroy();

      // Recalculate money advance status after deletion
      const remainingSettlements = await Settlement.sum('amount', {
        where: { moneyAdvanceId: settlement.moneyAdvanceId }
      });

      const totalRemaining = remainingSettlements || 0;
      const advanceAmount = parseFloat(settlement.moneyAdvance.amount);

      if (totalRemaining < advanceAmount && settlement.moneyAdvance.status === 'settled') {
        await settlement.moneyAdvance.update({ status: 'approved' });
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
      const { userId } = req.query;
      
      const whereClause = userId ? { userId } : {};

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

      res.json({
        success: true,
        data: {
          overview: {
            totalCount,
            totalAmount: totalAmount || 0
          },
          byMethod: methodStats
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

module.exports = SettlementController;