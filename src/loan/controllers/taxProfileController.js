const taxProfileService = require('../services/taxProfileService');
const logger = require('../../api/logger');

const taxProfileController = {
  async getTaxProfile(req, res) {
    try {
      const data = await taxProfileService.getTaxProfile();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching tax profile:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async updateTaxProfile(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const data = await taxProfileService.updateTaxProfile(req.body, userId);
      return res.status(200).json({ status: true, message: 'Tax profile updated successfully', data });
    } catch (err) {
      logger.error('Error updating tax profile:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async confirmTaxProfile(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const data = await taxProfileService.confirmTaxProfile(userId);
      return res.status(200).json({ status: true, message: 'Tax profile confirmed successfully', data });
    } catch (err) {
      logger.error('Error confirming tax profile:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async updateComponentTax(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : null;
      const data = await taxProfileService.updateComponentTax(id, req.body, userId);
      return res.status(200).json({ status: true, message: 'Component tax settings updated', data });
    } catch (err) {
      logger.error('Error updating component tax:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getVatReport(req, res) {
    try {
      const data = await taxProfileService.getVatReport(req.query);
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error generating VAT report:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  }
};

module.exports = taxProfileController;
