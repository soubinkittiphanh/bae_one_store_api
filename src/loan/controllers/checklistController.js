const checklistService = require('../services/checklistService');
const logger = require('../../api/logger');

const checklistController = {
  async getChecklist(req, res) {
    try {
      const data = await checklistService.getChecklist();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching go-live checklist:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async confirmItem(req, res) {
    try {
      const { itemKey } = req.params;
      const userId = req.user ? req.user.id : null;
      const data = await checklistService.confirmItem(itemKey, userId);
      return res.status(200).json({ status: true, message: `Checklist item ${itemKey} confirmed successfully`, data });
    } catch (err) {
      logger.error(`Error confirming checklist item:`, err);
      return res.status(500).json({ status: false, message: err.message });
    }
  }
};

module.exports = checklistController;
