
const Table = require('../../models').table;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');


const tableController = {
  // Get all tables
  getAllTables: async (req, res) => {
    try {
      const { status, capacity, page = 1, limit = 10 } = req.query;
      
      // Build where condition
      const whereCondition = {};
      if (status) {
        whereCondition.status = status;
      }
      if (capacity) {
        whereCondition.capacity = parseInt(capacity);
      }

      const offset = (page - 1) * limit;
      
      const tables = await Table.findAndCountAll({
        where: whereCondition,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['number', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: tables.rows,
        pagination: {
          total: tables.count,
          page: parseInt(page),
          pages: Math.ceil(tables.count / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching tables',
        error: error.message
      });
    }
  },

  // Get table by ID
  getTableById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      res.status(200).json({
        success: true,
        data: table
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching table',
        error: error.message
      });
    }
  },

  // Get table by number
  getTableByNumber: async (req, res) => {
    try {
      const { number } = req.params;
      
      const table = await Table.findOne({
        where: { number }
      });
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      res.status(200).json({
        success: true,
        data: table
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching table',
        error: error.message
      });
    }
  },

  // Create new table
  createTable: async (req, res) => {
    try {
      const { name, number, capacity, status = 'available' } = req.body;

      // Validation
      if (!number || !capacity) {
        return res.status(400).json({
          success: false,
          message: 'Table number and capacity are required'
        });
      }

      if (capacity < 1 || capacity > 20) {
        return res.status(400).json({
          success: false,
          message: 'Capacity must be between 1 and 20'
        });
      }

      // Check if table number already exists
      const existingTable = await Table.findOne({ where: { number } });
      if (existingTable) {
        return res.status(409).json({
          success: false,
          message: 'Table number already exists'
        });
      }

      const newTable = await Table.create({
        name,
        number,
        capacity,
        status
      });

      res.status(201).json({
        success: true,
        message: 'Table created successfully',
        data: newTable
      });
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating table',
        error: error.message
      });
    }
  },

  // Update table
  updateTable: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      // If updating number, check for uniqueness
      if (updateData.number && updateData.number !== table.number) {
        const existingTable = await Table.findOne({
          where: { 
            number: updateData.number,
            id: { [Op.ne]: id }
          }
        });
        
        if (existingTable) {
          return res.status(409).json({
            success: false,
            message: 'Table number already exists'
          });
        }
      }

      await table.update(updateData);

      res.status(200).json({
        success: true,
        message: 'Table updated successfully',
        data: table
      });
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating table',
        error: error.message
      });
    }
  },

  // Delete table
  deleteTable: async (req, res) => {
    try {
      const { id } = req.params;
      
      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      // Check if table is currently occupied
      if (table.status === 'occupied' && table.currentOrderId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete occupied table with active order'
        });
      }

      await table.destroy();

      res.status(200).json({
        success: true,
        message: 'Table deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting table',
        error: error.message
      });
    }
  },

  // Update table status
  updateTableStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, currentOrderId = null } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const validStatuses = ['available', 'occupied', 'cleaning', 'reserved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
        });
      }

      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      const updateData = { status };
      
      // Handle time tracking and order assignment
      if (status === 'occupied') {
        updateData.timeOccupied = new Date();
        if (currentOrderId) {
          updateData.currentOrderId = currentOrderId;
        }
      } else if (status === 'available') {
        updateData.timeOccupied = null;
        updateData.currentOrderId = null;
      }

      await table.update(updateData);

      res.status(200).json({
        success: true,
        message: 'Table status updated successfully',
        data: table
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating table status',
        error: error.message
      });
    }
  },

  // Get available tables
  getAvailableTables: async (req, res) => {
    try {
      const { capacity } = req.query;
      
      const whereCondition = { status: 'available' };
      
      if (capacity) {
        whereCondition.capacity = { [Op.gte]: parseInt(capacity) };
      }

      const tables = await Table.findAll({
        where: whereCondition,
        order: [['capacity', 'ASC'], ['number', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: tables,
        count: tables.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching available tables',
        error: error.message
      });
    }
  },

  // Get occupied tables
  getOccupiedTables: async (req, res) => {
    try {
      const tables = await Table.findAll({
        where: { status: 'occupied' },
        order: [['timeOccupied', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: tables,
        count: tables.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching occupied tables',
        error: error.message
      });
    }
  },

  // Bulk update table statuses
  bulkUpdateStatus: async (req, res) => {
    try {
      const { tableIds, status } = req.body;

      if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Table IDs array is required'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const validStatuses = ['available', 'occupied', 'cleaning', 'reserved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const updateData = { status };
      if (status === 'available') {
        updateData.timeOccupied = null;
        updateData.currentOrderId = null;
      }

      const [updatedCount] = await Table.update(updateData, {
        where: { id: tableIds }
      });

      res.status(200).json({
        success: true,
        message: `${updatedCount} table(s) updated successfully`,
        updatedCount
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating tables',
        error: error.message
      });
    }
  }
};

module.exports = tableController;

