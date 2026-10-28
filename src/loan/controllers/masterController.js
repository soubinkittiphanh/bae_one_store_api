const masterService = require('../services/masterService');
const logger = require('../../api/logger');

const masterController = {
  async getLookups(req, res) {
    try {
      const data = await masterService.getLookups();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching loan lookups:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getUdes(req, res) {
    try {
      const data = await masterService.getUdes();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching master UDEs:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getComponents(req, res) {
    try {
      const data = await masterService.getComponents();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching loan components:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getProvisionRules(req, res) {
    try {
      const data = await masterService.getProvisionRules();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching provision rules:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async updateProvisionRule(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : null;
      const data = await masterService.updateProvisionRule(id, req.body, userId);
      return res.status(200).json({ status: true, message: 'Provision rule updated successfully', data });
    } catch (err) {
      logger.error('Error updating provision rule:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getStatusRules(req, res) {
    try {
      const data = await masterService.getStatusRules();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching status rules:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getAccountingMetadata(req, res) {
    try {
      const data = await masterService.getAccountingMetadata();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching accounting metadata:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getSequences(req, res) {
    try {
      const data = await masterService.getSequences();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching numbering sequences:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getHolidayCalendars(req, res) {
    try {
      const data = await masterService.getHolidayCalendars();
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching holiday calendars:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  }
};

module.exports = masterController;
