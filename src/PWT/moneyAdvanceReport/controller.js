const logger = require('../../api/logger');

const MoneyAdvance = require('../../models').moneyAdvance;
const user = require('../../models').user;
const currency = require('../../models').currency;
const settlement = require('../../models').moneySettlement;
const bankAccount = require('../../models').bankAccount;
const ministry = require('../../models').ministry;
const MoneyAdvanceAudit = require('../../models').moneyAdvanceAudit;
const { AuditHelper } = require('../moneyAdvanceAudit/helper');
class MoneyAdvanceController {



  // UPDATED getAll METHOD IN MoneyAdvanceController
  static async findBroughtForward(req, res) {
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
  // UPDATED getAll METHOD IN MoneyAdvanceController
  static async findPaymentMistryGrouping(req, res) {
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
  // UPDATED getAll METHOD IN MoneyAdvanceController
  static async findSettlementMistryGrouping(req, res) {
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
}

module.exports = MoneyAdvanceController;