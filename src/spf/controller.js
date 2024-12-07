
const SPF = require('../models').spf;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const service = require('./service')

const spfController = {
  // Create a new SPF record
  createSPF: async (req, res) => {
    try {
      const { code, value, remark, isActive } = req.body;
      const newSPF = await SPF.create({ code, value, remark, isActive });
      return res.status(201).json({ message: 'SPF created successfully', data: newSPF });
    } catch (error) {
      logger.error('Error creating SPF:', error);
      return res.status(500).json({ message: 'Failed to create SPF', error });
    }
  },

  // Get all SPF records
  getAllSPF: async (req, res) => {
    try {
      const spfRecords = await SPF.findAll();
      return res.status(200).json({ data: spfRecords });
    } catch (error) {
      logger.error('Error fetching SPF records:', error);
      return res.status(500).json({ message: 'Failed to fetch SPF records', error });
    }
  },

  // Get an SPF record by ID
  getSPFById: async (req, res) => {
    try {
      const { id } = req.params;
      const spfRecord = await SPF.findByPk(id);
      if (!spfRecord) {
        return res.status(404).json({ message: 'SPF not found' });
      }
      return res.status(200).json({ data: spfRecord });
    } catch (error) {
      logger.error('Error fetching SPF by ID:', error);
      return res.status(500).json({ message: 'Failed to fetch SPF by ID', error });
    }
  },

  // Update an SPF record
  updateSPF: async (req, res) => {
    try {
      const { id } = req.params;
      const { code, value, remark, isActive } = req.body;
      const spfRecord = await SPF.findByPk(id);
      if (!spfRecord) {
        return res.status(404).json({ message: 'SPF not found' });
      }
      await spfRecord.update({ code, value, remark, isActive });
      return res.status(200).json({ message: 'SPF updated successfully', data: spfRecord });
    } catch (error) {
      logger.error('Error updating SPF:', error);
      return res.status(500).json({ message: 'Failed to update SPF', error });
    }
  },

  // Delete an SPF record
  deleteSPF: async (req, res) => {
    try {
      const { id } = req.params;
      const spfRecord = await SPF.findByPk(id);
      if (!spfRecord) {
        return res.status(404).json({ message: 'SPF not found' });
      }
      await spfRecord.destroy();
      return res.status(200).json({ message: 'SPF deleted successfully' });
    } catch (error) {
      logger.error('Error deleting SPF:', error);
      return res.status(500).json({ message: 'Failed to delete SPF', error });
    }
  },
};

module.exports = spfController;
