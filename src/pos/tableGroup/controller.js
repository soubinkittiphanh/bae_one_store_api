
const TableGroup = require('../../models').tableGroup;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');
const tableGroupController = {
  // Create a new table group
  async createTableGroup(req, res) {
      try {
          const { mnemonic, name, isActive } = req.body;
          const newTableGroup = await TableGroup.create({ mnemonic, name, isActive });
          return res.status(201).json({ message: 'Table Group created successfully', tableGroup: newTableGroup });
      } catch (error) {
          return res.status(400).json({ error: error.message });
      }
  },

  // Get all table groups
  async getAllTableGroups(req, res) {
      try {
          const tableGroups = await TableGroup.findAll();
          return res.status(200).json(tableGroups);
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  },

  // Get a table group by ID
  async getTableGroupById(req, res) {
      try {
          const { id } = req.params;
          const tableGroup = await TableGroup.findByPk(id);

          if (!tableGroup) {
              return res.status(404).json({ message: 'Table Group not found' });
          }

          return res.status(200).json(tableGroup);
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  },

  // Update a table group by ID
  async updateTableGroup(req, res) {
      try {
          const { id } = req.params;
          const { mnemonic, name, isActive } = req.body;

          const tableGroup = await TableGroup.findByPk(id);
          if (!tableGroup) {
              return res.status(404).json({ message: 'Table Group not found' });
          }

          await tableGroup.update({ mnemonic, name, isActive });
          return res.status(200).json({ message: 'Table Group updated successfully', tableGroup });
      } catch (error) {
          return res.status(400).json({ error: error.message });
      }
  },

  // Delete a table group by ID
  async deleteTableGroup(req, res) {
      try {
          const { id } = req.params;

          const tableGroup = await TableGroup.findByPk(id);
          if (!tableGroup) {
              return res.status(404).json({ message: 'Table Group not found' });
          }

          await tableGroup.destroy();
          return res.status(200).json({ message: 'Table Group deleted successfully' });
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }
  }
};

module.exports = tableGroupController;
