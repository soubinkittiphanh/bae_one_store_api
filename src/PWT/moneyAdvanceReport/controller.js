const logger = require('../../api/logger');
const MoneyAdvance = require('../../models').moneyAdvance;
const user = require('../../models').user;
const currency = require('../../models').currency;
const settlement = require('../../models').moneySettlement;
const bankAccount = require('../../models').bankAccount;
const ministry = require('../../models').ministry;
const { Sequelize, Op } = require('sequelize');

class MoneyAdvanceController {

  // Get all advances with basic filtering
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, status, ministryId, currencyId } = req.query;
      const offset = (page - 1) * limit;
      
      const where = {};
      if (status) where.status = status;
      if (ministryId) where.ministryId = ministryId;
      if (currencyId) where.currencyId = currencyId;

      const { count, rows } = await MoneyAdvance.findAndCountAll({
        where,
        include: [
          { model: user, as: 'maker', attributes: ['id', 'cus_name'] },
          { model: currency, as: 'currency', attributes: ['id', 'code', 'name'] },
          { model: ministry, as: 'ministry', attributes: ['id', 'ministryCode', 'ministryName'] }
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
      logger.error('Error fetching advances:', error);
      res.status(500).json({ success: false, message: 'Error fetching advances' });
    }
  }

  // Get single advance by ID
  static async getById(req, res) {
    try {
      const advance = await MoneyAdvance.findByPk(req.params.id, {
        include: [
          { model: user, as: 'maker' },
          { model: user, as: 'checker' },
          { model: currency, as: 'currency' },
          { model: ministry, as: 'ministry' },
          { model: bankAccount, as: 'bankAccount' }
        ]
      });

      if (!advance) {
        return res.status(404).json({ success: false, message: 'Advance not found' });
      }

      res.json({ success: true, data: advance });
    } catch (error) {
      logger.error('Error fetching advance:', error);
      res.status(500).json({ success: false, message: 'Error fetching advance' });
    }
  }

  // Create new advance
  static async create(req, res) {
    try {
      const advance = await MoneyAdvance.create(req.body);
      res.status(201).json({ success: true, data: advance });
    } catch (error) {
      logger.error('Error creating advance:', error);
      res.status(500).json({ success: false, message: 'Error creating advance' });
    }
  }

  // Update advance
  static async update(req, res) {
    try {
      const [updated] = await MoneyAdvance.update(req.body, {
        where: { id: req.params.id }
      });

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Advance not found' });
      }

      const advance = await MoneyAdvance.findByPk(req.params.id);
      res.json({ success: true, data: advance });
    } catch (error) {
      logger.error('Error updating advance:', error);
      res.status(500).json({ success: false, message: 'Error updating advance' });
    }
  }

  // Approve advance
  static async approve(req, res) {
    try {
      const { checkerId } = req.body;
      const [updated] = await MoneyAdvance.update(
        { status: 'approved', checkerId, checkedAt: new Date() },
        { where: { id: req.params.id } }
      );

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Advance not found' });
      }

      const advance = await MoneyAdvance.findByPk(req.params.id);
      res.json({ success: true, data: advance });
    } catch (error) {
      logger.error('Error approving advance:', error);
      res.status(500).json({ success: false, message: 'Error approving advance' });
    }
  }

  // Delete advance
  static async delete(req, res) {
    try {
      const deleted = await MoneyAdvance.destroy({
        where: { id: req.params.id }
      });

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Advance not found' });
      }

      res.json({ success: true, message: 'Advance deleted successfully' });
    } catch (error) {
      logger.error('Error deleting advance:', error);
      res.status(500).json({ success: false, message: 'Error deleting advance' });
    }
  }

//   // Get balance report
//   static async getBalanceReport(req, res) {
//   try {
//     const { monthStart, monthEnd, ministryId, currencyId } = req.query;
    
//     if (!monthStart || !monthEnd) {
//       return res.status(400).json({
//         success: false,
//         message: 'monthStart and monthEnd are required'
//       });
//     }

//     const ministryFilter = ministryId ? `AND m.id = ${ministryId}` : '';
//     const currencyFilter = currencyId ? `AND c.id = ${currencyId}` : '';

//     const query = `
//       SELECT 
//         m.id AS ministryId,
//         m.ministryCode,
//         m.ministryName,
//         c.id AS currencyId,
//         c.code AS currencyCode,
//         c.name AS currencyName,
//         COALESCE(SUM(CASE WHEN ma.bookingDate < :monthStart THEN ma.amount ELSE 0 END), 0) AS balanceForward,
//         COALESCE(SUM(CASE WHEN ma.bookingDate BETWEEN :monthStart AND :monthEnd THEN ma.amount ELSE 0 END), 0) AS newAdvances,
//         COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.ministryId = m.id AND s.currencyId = c.id AND s.bookingDate BETWEEN :monthStart AND :monthEnd), 0) AS newSettlements
//       FROM ministry m
//       CROSS JOIN currency c
//       LEFT JOIN MoneyAdvance ma ON ma.ministryId = m.id AND ma.currencyId = c.id
//       WHERE m.isActive = 1 AND c.isActive = 1 ${ministryFilter} ${currencyFilter}
//       GROUP BY m.id, m.ministryCode, m.ministryName, c.id, c.code, c.name
//       HAVING balanceForward != 0 OR newAdvances != 0 OR newSettlements != 0
//       ORDER BY m.ministryCode, c.code
//     `;

//     // Remove the [data] destructuring - keep it as an array
//     const data = await MoneyAdvance.sequelize.query(query, {
//       replacements: { monthStart, monthEnd },
//       type: Sequelize.QueryTypes.SELECT
//     });

//     res.json({ success: true, data });
//   } catch (error) {
//     logger.error('Error fetching balance report:', error);
//     res.status(500).json({ success: false, message: 'Error fetching balance report' });
//   }
// }

static async getBalanceReport(req, res) {
    try {
      const { monthStart, monthEnd, ministryId, currencyId } = req.query;

      if (!monthStart || !monthEnd) {
        return res.status(400).json({
          success: false,
          message: 'monthStart and monthEnd are required'
        });
      }

      const ministryFilter = ministryId ? `AND m.id = ${ministryId}` : '';
      const currencyFilter = currencyId ? `AND c.id = ${currencyId}` : '';

      const query = `
        SELECT 
          m.id AS ministryId,
          m.ministryCode,
          m.ministryName,
          c.id AS currencyId,
          c.code AS currencyCode,
          c.name AS currencyName,
          (COALESCE(SUM(CASE WHEN ma.bookingDate < :monthStart THEN ma.amount ELSE 0 END), 0) - 
           COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.ministryId = m.id AND s.currencyId = c.id AND s.bookingDate < :monthStart), 0)) AS balanceForward,
          COALESCE(SUM(CASE WHEN ma.bookingDate BETWEEN :monthStart AND :monthEnd THEN ma.amount ELSE 0 END), 0) AS newAdvances,
          COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.ministryId = m.id AND s.currencyId = c.id AND s.bookingDate BETWEEN :monthStart AND :monthEnd), 0) AS newSettlements
        FROM ministry m
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.ministryId = m.id AND ma.currencyId = c.id
        WHERE m.isActive = 1 AND c.isActive = 1 ${ministryFilter} ${currencyFilter}
        GROUP BY m.id, m.ministryCode, m.ministryName, c.id, c.code, c.name
        HAVING balanceForward != 0 OR newAdvances != 0 OR newSettlements != 0
        ORDER BY m.ministryCode, c.code
      `;

      const data = await MoneyAdvance.sequelize.query(query, {
        replacements: { monthStart, monthEnd },
        type: Sequelize.QueryTypes.SELECT
      });

      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching balance report:', error);
      res.status(500).json({ success: false, message: 'Error fetching balance report' });
    }
  }



  
  // Validate balance continuity between months
  static async validateBalanceContinuity(req, res) {
    try {
      const { year, month, ministryId, currencyId } = req.query;
      
      if (!year || !month) {
        return res.status(400).json({
          success: false,
          message: 'year and month are required'
        });
      }

      const currentMonth = parseInt(month);
      const currentYear = parseInt(year);
      
      // Calculate previous month
      let prevMonth = currentMonth - 1;
      let prevYear = currentYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      }

      // Current month dates
      const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      
      // Previous month dates
      const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const prevMonthEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`;

      const ministryFilter = ministryId ? `AND m.id = ${ministryId}` : '';
      const currencyFilter = currencyId ? `AND c.id = ${currencyId}` : '';

      // Get previous month ending balance
      const prevQuery = `
        SELECT 
          m.id AS ministryId,
          m.ministryCode,
          m.ministryName,
          c.code AS currencyCode,
          (COALESCE(SUM(CASE WHEN ma.bookingDate <= :prevMonthEnd THEN ma.amount ELSE 0 END), 0) - 
           COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.ministryId = m.id AND s.currencyId = c.id AND s.bookingDate <= :prevMonthEnd), 0)) AS prevEndingBalance
        FROM ministry m
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.ministryId = m.id AND ma.currencyId = c.id
        WHERE m.isActive = 1 AND c.isActive = 1 ${ministryFilter} ${currencyFilter}
        GROUP BY m.id, m.ministryCode, m.ministryName, c.id, c.code
        HAVING prevEndingBalance != 0
        ORDER BY m.ministryCode, c.code
      `;

      // Get current month brought forward
      const currentQuery = `
        SELECT 
          m.id AS ministryId,
          m.ministryCode,
          m.ministryName,
          c.code AS currencyCode,
          COALESCE(SUM(CASE WHEN ma.bookingDate < :currentMonthStart THEN ma.amount ELSE 0 END), 0) AS currentBroughtForward
        FROM ministry m
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.ministryId = m.id AND ma.currencyId = c.id
        WHERE m.isActive = 1 AND c.isActive = 1 ${ministryFilter} ${currencyFilter}
        GROUP BY m.id, m.ministryCode, m.ministryName, c.id, c.code
        HAVING currentBroughtForward != 0
        ORDER BY m.ministryCode, c.code
      `;

      const [prevResults, currentResults] = await Promise.all([
        MoneyAdvance.sequelize.query(prevQuery, {
          replacements: { prevMonthEnd },
          type: Sequelize.QueryTypes.SELECT
        }),
        MoneyAdvance.sequelize.query(currentQuery, {
          replacements: { currentMonthStart },
          type: Sequelize.QueryTypes.SELECT
        })
      ]);

      // Compare results
      const comparison = [];
      const prevMap = new Map();
      
      prevResults.forEach(item => {
        const key = `${item.ministryId}-${item.currencyCode}`;
        prevMap.set(key, item.prevEndingBalance);
      });

      currentResults.forEach(item => {
        const key = `${item.ministryId}-${item.currencyCode}`;
        const prevEnding = prevMap.get(key) || 0;
        const currentBF = item.currentBroughtForward;
        const difference = currentBF - prevEnding;

        comparison.push({
          ministry: `${item.ministryCode} - ${item.ministryName}`,
          currency: item.currencyCode,
          prevMonthEnding: prevEnding,
          currentMonthBroughtForward: currentBF,
          difference: difference,
          isMatching: Math.abs(difference) < 0.01 // Allow for small floating point differences
        });
      });

      const mismatches = comparison.filter(item => !item.isMatching);

      res.json({
        success: true,
        data: {
          period: `${prevYear}-${String(prevMonth).padStart(2, '0')} to ${currentYear}-${String(currentMonth).padStart(2, '0')}`,
          totalComparisons: comparison.length,
          mismatches: mismatches.length,
          details: comparison,
          summary: {
            matching: comparison.length - mismatches.length,
            notMatching: mismatches.length
          }
        }
      });

    } catch (error) {
      logger.error('Error validating balance continuity:', error);
      res.status(500).json({ success: false, message: 'Error validating balance continuity' });
    }
  }
  static async getBankAccountBalanceReport(req, res) {
    try {
      const { monthStart, monthEnd, bankAccountId, currencyId } = req.query;

      if (!monthStart || !monthEnd) {
        return res.status(400).json({
          success: false,
          message: 'monthStart and monthEnd are required'
        });
      }

      const bankAccountFilter = bankAccountId ? `AND ba.id = ${bankAccountId}` : '';
      const currencyFilter = currencyId ? `AND c.id = ${currencyId}` : '';

      const query = `
        SELECT 
          ba.id AS bankAccountId,
          ba.accountNumber,
          ba.accountName,
          ba.bankName,
          ba.bankBranch,
          ba.accountType,
          c.id AS currencyId,
          c.code AS currencyCode,
          c.name AS currencyName,
          (COALESCE(SUM(CASE WHEN ma.bookingDate < :monthStart THEN ma.amount ELSE 0 END), 0) - 
           COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.bankAccountId = ba.id AND s.currencyId = c.id AND s.bookingDate < :monthStart), 0)) AS balanceForward,
          COALESCE(SUM(CASE WHEN ma.bookingDate BETWEEN :monthStart AND :monthEnd THEN ma.amount ELSE 0 END), 0) AS newAdvances,
          COALESCE((SELECT SUM(s.amount) FROM Settlement s WHERE s.bankAccountId = ba.id AND s.currencyId = c.id AND s.bookingDate BETWEEN :monthStart AND :monthEnd), 0) AS newSettlements
        FROM bankAccount ba
        CROSS JOIN currency c
        LEFT JOIN MoneyAdvance ma ON ma.bankAccountId = ba.id AND ma.currencyId = c.id
        WHERE ba.isActive = 1 AND c.isActive = 1 ${bankAccountFilter} ${currencyFilter}
        GROUP BY ba.id, ba.accountNumber, ba.accountName, ba.bankName, ba.bankBranch, ba.accountType, c.id, c.code, c.name
        HAVING balanceForward != 0 OR newAdvances != 0 OR newSettlements != 0
        ORDER BY ba.accountName, c.code
      `;

      const data = await MoneyAdvance.sequelize.query(query, {
        replacements: { monthStart, monthEnd },
        type: Sequelize.QueryTypes.SELECT
      });

      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching bank account balance report:', error);
      res.status(500).json({ success: false, message: 'Error fetching bank account balance report' });
    }
  }
  // Get advances available for settlement
  static async getAvailableForSettlement(req, res) {
    try {
      const advances = await MoneyAdvance.findAll({
        where: { status: ['approved', 'pending'] },
        include: [
          { model: user, as: 'maker' },
          { model: currency, as: 'currency' },
          { model: ministry, as: 'ministry' }
        ],
        order: [['createdAt', 'DESC']]
      });

      // Calculate settlement info for each advance
      const advancesWithSettlementInfo = await Promise.all(
        advances.map(async (advance) => {
          const settlements = await settlement.findAll({
            where: { moneyAdvanceId: advance.id }
          });

          const totalSettled = settlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
          const outstandingAmount = parseFloat(advance.amount) - totalSettled;

          return {
            ...advance.toJSON(),
            totalSettled,
            outstandingAmount,
            canReceiveSettlement: outstandingAmount > 0.01
          };
        })
      );

      const availableAdvances = advancesWithSettlementInfo.filter(a => a.canReceiveSettlement);

      res.json({ success: true, data: availableAdvances });
    } catch (error) {
      logger.error('Error fetching available advances:', error);
      res.status(500).json({ success: false, message: 'Error fetching available advances' });
    }
  }

  // Get settlements for an advance
  static async getSettlements(req, res) {
    try {
      const settlements = await settlement.findAll({
        where: { moneyAdvanceId: req.params.id },
        include: [
          { model: user, as: 'user' },
          { model: currency, as: 'currency' }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.json({ success: true, data: settlements });
    } catch (error) {
      logger.error('Error fetching settlements:', error);
      res.status(500).json({ success: false, message: 'Error fetching settlements' });
    }
  }
}

module.exports = MoneyAdvanceController;