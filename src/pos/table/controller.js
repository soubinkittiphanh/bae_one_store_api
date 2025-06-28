
const Table = require('../../models').table;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');


const tableController = {
  // Get all tables (existing method - no changes needed)
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
      logger.error('Error fetching tables:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tables',
        error: error.message
      });
    }
  },

  // Seat customer at table (new method)
  seatCustomer: async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        customerName, 
        partySize = 1
      } = req.body;

      // Validation
      if (!customerName || !customerName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Customer name is required'
        });
      }

      if (partySize < 1 || partySize > 20) {
        return res.status(400).json({
          success: false,
          message: 'Party size must be between 1 and 20'
        });
      }

      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      // Check if table is available
      if (table.status !== 'available') {
        return res.status(400).json({
          success: false,
          message: `Table is currently ${table.status} and cannot be occupied`
        });
      }

      // Check table capacity
      if (partySize > table.capacity) {
        return res.status(400).json({
          success: false,
          message: `Party size (${partySize}) exceeds table capacity (${table.capacity})`
        });
      }

      // Update table with customer information
      const updateData = {
        status: 'occupied',
        timeOccupied: new Date(),
        capacity: partySize,
        customerName: customerName.trim()
      };

      await table.update(updateData);

      // Log the seating event
      logger.info(`Customer "${customerName}" seated at table ${table.number}`, {
        tableId: id,
        customerName,
        partySize
      });

      res.status(200).json({
        success: true,
        message: `${customerName} has been seated at Table ${table.number}`,
        data: table
      });

    } catch (error) {
      logger.error('Error seating customer:', error);
      res.status(500).json({
        success: false,
        message: 'Error seating customer',
        error: error.message
      });
    }
  },

  // Update table status with enhanced customer handling
  updateTableStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        status, 
        currentOrderId = null,
        customerName = null,
        timeOccupied = null
      } = req.body;

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
      
      // Handle different status transitions
      switch (status) {
        case 'occupied':
          updateData.timeOccupied = timeOccupied || new Date();
          if (currentOrderId) updateData.currentOrderId = currentOrderId;
          if (customerName) updateData.customerName = customerName.trim();
          break;
          
        case 'available':
          updateData.timeOccupied = null;
          updateData.currentOrderId = null;
          updateData.customerName = null;
          break;
          
        case 'cleaning':
          // Keep customer name during cleaning, clear order
          updateData.currentOrderId = null;
          break;
          
        case 'reserved':
          updateData.timeOccupied = null;
          updateData.currentOrderId = null;
          // Keep customer name for reservations if provided
          if (customerName) {
            updateData.customerName = customerName.trim();
          }
          break;
      }

      await table.update(updateData);

      res.status(200).json({
        success: true,
        message: 'Table status updated successfully',
        data: table
      });

    } catch (error) {
      logger.error('Error updating table status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating table status',
        error: error.message
      });
    }
  },

  // Clear table when customer leaves
  clearTable: async (req, res) => {
    try {
      const { id } = req.params;

      const table = await Table.findByPk(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          message: 'Table not found'
        });
      }

      // Check if table has active order
      if (table.currentOrderId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot clear table with active order. Complete or cancel the order first.'
        });
      }

      const previousCustomer = table.customerName;

      // Clear table data
      const updateData = {
        status: 'cleaning',
        timeOccupied: null,
        customerName: null,
        currentOrderId: null
      };

      await table.update(updateData);

      // Log the clearing event
      logger.info(`Table ${table.number} cleared`, {
        tableId: id,
        previousCustomer
      });

      res.status(200).json({
        success: true,
        message: `Table ${table.number} has been cleared and is ready for cleaning`,
        data: table
      });

    } catch (error) {
      logger.error('Error clearing table:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing table',
        error: error.message
      });
    }
  },

  // Get tables with current customers
  getTablesWithCustomers: async (req, res) => {
    try {
      const tables = await Table.findAll({
        where: {
          status: ['occupied', 'reserved'],
          customerName: { [Op.ne]: null }
        },
        order: [['timeOccupied', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: tables,
        count: tables.length
      });

    } catch (error) {
      logger.error('Error fetching tables with customers:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tables with customers',
        error: error.message
      });
    }
  },

  // Keep all your existing methods unchanged
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
        updateData.customerName = null;
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

