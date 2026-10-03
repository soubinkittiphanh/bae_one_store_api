const logger = require('../../api/logger');
const service = require('./service');

class MinistryPeriodBalanceController {
  static async getMasterSummary(req, res) {
    try {
      const { branchId, year, month } = req.query;
      const now = new Date();
      const targetYear = year ? parseInt(year) : now.getFullYear();
      const targetMonth = month ? parseInt(month) : now.getMonth() + 1;

      const result = await service.getMasterSummary(branchId, targetYear, targetMonth);
      res.json(result);
    } catch (error) {
      logger.error('Error in getMasterSummary controller:', error);
      res.status(500).json({ success: false, message: error.message || 'Error fetching master summary' });
    }
  }

  static async getPeriodList(req, res) {
    try {
      const { branchId, year } = req.query;
      const targetYear = year ? parseInt(year) : new Date().getFullYear();
      const result = await service.getYearPeriodsList(branchId, targetYear);
      res.json(result);
    } catch (error) {
      logger.error('Error in getPeriodList controller:', error);
      res.status(500).json({ success: false, message: error.message || 'Error fetching periods list' });
    }
  }

  static async closePeriod(req, res) {
    try {
      const { branchId, year, month, note } = req.body;
      const userId = req.user?.id || req.body.userId;

      if (!year || !month) {
        return res.status(400).json({ success: false, message: 'year and month are required' });
      }

      const result = await service.closePeriod(branchId, year, month, userId, note);
      res.json(result);
    } catch (error) {
      logger.error('Error in closePeriod controller:', error);
      res.status(500).json({ success: false, message: error.message || 'Error closing period' });
    }
  }

  static async reopenPeriod(req, res) {
    try {
      const { branchId, year, month } = req.body;
      const userId = req.user?.id || req.body.userId;

      if (!year || !month) {
        return res.status(400).json({ success: false, message: 'year and month are required' });
      }

      const result = await service.reopenPeriod(branchId, year, month, userId);
      res.json(result);
    } catch (error) {
      logger.error('Error in reopenPeriod controller:', error);
      res.status(500).json({ success: false, message: error.message || 'Error reopening period' });
    }
  }

  static async backfillAll(req, res) {
    try {
      const { branchId } = req.body;
      const userId = req.user?.id || req.body.userId;

      const result = await service.backfillAllHistory(branchId, userId);
      res.json(result);
    } catch (error) {
      logger.error('Error in backfillAll controller:', error);
      res.status(500).json({ success: false, message: error.message || 'Error executing backfill' });
    }
  }
}

module.exports = MinistryPeriodBalanceController;
