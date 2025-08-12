const { Op } = require('sequelize');
const logger = require('../../api/logger');

const Settlement = require('../../models').moneySettlement;
const user = require('../../models').user;
const currency = require('../../models').currency;
const MoneyAdvance = require('../../models').moneyAdvance;
const BankAccount = require('../../models').bankAccount;
const Ministry = require('../../models').ministry;
const ChartAccount = require('../../models').chartAccount;

class SettlementController {

  // GET /settlements - Get all settlements with pagination
  // GET /settlements - Get all settlements with pagination
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        method,
        userId,
        moneyAdvanceId,
        bankAccountId,
        ministryId,
        chartAccountId,
        bookingDate,
        fromDate,
        toDate
      } = req.query;

      const offset = (page - 1) * limit;
      const { Op } = require('sequelize');

      const whereClause = {};

      // Handle existing filters
      if (method) whereClause.method = method;
      if (userId) whereClause.userId = userId;
      if (moneyAdvanceId) whereClause.moneyAdvanceId = moneyAdvanceId;
      if (bankAccountId) whereClause.bankAccountId = bankAccountId;
      if (ministryId) whereClause.ministryId = ministryId;
      if (chartAccountId) whereClause.chartAccountId = chartAccountId;

      // Handle date filtering - improved logic
      if (bookingDate) {
        // If specific bookingDate is provided, use exact match
        whereClause.bookingDate = bookingDate;
      } else if (fromDate || toDate) {
        // If date range is provided, use between/gte/lte operators
        const dateFilter = {};

        if (fromDate && toDate) {
          // Both dates provided - filter between dates (inclusive)
          dateFilter[Op.between] = [fromDate, toDate];
        } else if (fromDate) {
          // Only fromDate provided - filter from this date onwards
          dateFilter[Op.gte] = fromDate;
        } else if (toDate) {
          // Only toDate provided - filter up to this date
          dateFilter[Op.lte] = toDate;
        }

        whereClause.bookingDate = dateFilter;
      }

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
            required: false // Left join - settlement might not have bank account
          },
          {
            model: Ministry,
            as: 'ministry',
            required: false // Left join - settlement might not have ministry
          },
          {
            model: currency,
            as: 'currency',
            required: false // Left join - settlement might not have ministry
          },
          {
            model: ChartAccount,
            as: 'chartAccount',
            required: false // Left join - settlement might not have chart account
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
      const {
        amount,
        method,
        notes,
        userId,
        moneyAdvanceId,
        bankAccountId,
        ministryId,
        chartAccountId,
        currencyId,
        bookingDate,
        exchangeRate,
        // ✅ NEW FIELDS ADDED
        externalRef,
        externalRefNo,
        chequeNo,
        fromPersonName
      } = req.body;

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

      // Validate ministry exists if provided
      if (ministryId) {
        const ministry = await Ministry.findByPk(ministryId);
        if (!ministry) {
          return res.status(404).json({
            success: false,
            message: 'Ministry not found'
          });
        }
      }

      // Validate chart account exists if provided
      if (chartAccountId) {
        const chartAccount = await ChartAccount.findByPk(chartAccountId);
        if (!chartAccount) {
          return res.status(404).json({
            success: false,
            message: 'Chart account not found'
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
        bookingDate,
        amount,
        method,
        notes,
        userId,
        exchangeRate,
        currencyId: currencyId || null,
        moneyAdvanceId: moneyAdvanceId || null,
        bankAccountId: bankAccountId || null,
        ministryId: ministryId || null,
        chartAccountId: chartAccountId || null,
        // ✅ NEW FIELDS INCLUDED IN CREATE
        externalRef: externalRef || null,
        externalRefNo: externalRefNo || null,
        chequeNo: chequeNo || null,
        fromPersonName: fromPersonName || null
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
          },
          {
            model: currency,
            as: 'currency',
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
      const {
        amount,
        method,
        notes,
        bankAccountId,
        moneyAdvanceId,
        ministryId,
        chartAccountId,
        currencyId,
        bookingDate,
        exchangeRate,
        updateUserId,
        // ✅ NEW FIELDS ADDED TO UPDATE
        externalRef,
        externalRefNo,
        chequeNo,
        fromPersonName
      } = req.body;

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

      // Validate ministry exists if provided
      if (ministryId) {
        const ministry = await Ministry.findByPk(ministryId);
        if (!ministry) {
          return res.status(404).json({
            success: false,
            message: 'Ministry not found'
          });
        }
      }

      // Validate chart account exists if provided
      if (chartAccountId) {
        const chartAccount = await ChartAccount.findByPk(chartAccountId);
        if (!chartAccount) {
          return res.status(404).json({
            success: false,
            message: 'Chart account not found'
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
      await settlement.update({
        bookingDate: bookingDate,
        amount: amount !== undefined ? amount : settlement.amount,
        method: method || settlement.method,
        notes: notes !== undefined ? notes : settlement.notes,
        bankAccountId: bankAccountId !== undefined ? bankAccountId : settlement.bankAccountId,
        currencyId: currencyId || null,
        updateUserId: updateUserId || null,
        exchangeRate: exchangeRate || 1,
        moneyAdvanceId: finalMoneyAdvanceId !== undefined ? finalMoneyAdvanceId : settlement.moneyAdvanceId,
        ministryId: ministryId !== undefined ? ministryId : settlement.ministryId,
        chartAccountId: chartAccountId !== undefined ? chartAccountId : settlement.chartAccountId,
        // ✅ NEW FIELDS INCLUDED IN UPDATE
        externalRef: externalRef !== undefined ? externalRef : settlement.externalRef,
        externalRefNo: externalRefNo !== undefined ? externalRefNo : settlement.externalRefNo,
        chequeNo: chequeNo !== undefined ? chequeNo : settlement.chequeNo,
        fromPersonName: fromPersonName !== undefined ? fromPersonName : settlement.fromPersonName
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
          },
          {
            model: currency,
            as: 'currency',
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
}

module.exports = SettlementController;