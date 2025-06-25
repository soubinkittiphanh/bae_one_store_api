
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');



const { ticketLine, ticket, product } = require('../../models');

const ticketLineController = {
  // Create a new ticket line
  create: async (req, res) => {
    try {
      const { ticketId, productId, quantity, unitPrice, specialInstructions } = req.body;

      // Validate required fields
      if (!ticketId || !productId || !quantity || !unitPrice) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: ticketId, productId, quantity, unitPrice'
        });
      }

      // Calculate total price
      const totalPrice = quantity * unitPrice;

      // Verify ticket exists
      const existingTicket = await ticket.findByPk(ticketId);
      if (!existingTicket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Verify product exists
      const existingProduct = await product.findByPk(productId);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      const newTicketLine = await ticketLine.create({
        ticketId,
        productId,
        quantity,
        unitPrice,
        totalPrice,
        specialInstructions: specialInstructions || null,
        status: 'ordered'
      });

      // Fetch the created ticket line with associations
      const createdTicketLine = await ticketLine.findByPk(newTicketLine.id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Ticket line created successfully',
        data: createdTicketLine
      });
    } catch (error) {
      console.error('Error creating ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get all ticket lines
  getAll: async (req, res) => {
    try {
      const { page = 1, limit = 10, status, ticketId } = req.query;
      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = {};
      if (status) whereClause.status = status;
      if (ticketId) whereClause.ticketId = ticketId;

      const ticketLines = await ticketLine.findAndCountAll({
        where: whereClause,
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        message: 'Ticket lines retrieved successfully',
        data: {
          ticketLines: ticketLines.rows,
          totalCount: ticketLines.count,
          currentPage: parseInt(page),
          totalPages: Math.ceil(ticketLines.count / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching ticket lines:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get ticket line by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      const ticketLineData = await ticketLine.findByPk(id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ]
      });

      if (!ticketLineData) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Ticket line retrieved successfully',
        data: ticketLineData
      });
    } catch (error) {
      console.error('Error fetching ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get ticket lines by ticket ID
  getByTicketId: async (req, res) => {
    try {
      const { ticketId } = req.params;

      const ticketLines = await ticketLine.findAll({
        where: { ticketId },
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ],
        order: [['createdAt', 'ASC']]
      });

      res.status(200).json({
        success: true,
        message: 'Ticket lines retrieved successfully',
        data: ticketLines
      });
    } catch (error) {
      console.error('Error fetching ticket lines by ticket ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Update ticket line
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { quantity, unitPrice, specialInstructions, status } = req.body;

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      // Prepare update data
      const updateData = {};
      if (quantity !== undefined) updateData.quantity = quantity;
      if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
      if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions;
      if (status !== undefined) updateData.status = status;

      // Recalculate total price if quantity or unitPrice changed
      if (quantity !== undefined || unitPrice !== undefined) {
        const newQuantity = quantity !== undefined ? quantity : existingTicketLine.quantity;
        const newUnitPrice = unitPrice !== undefined ? unitPrice : existingTicketLine.unitPrice;
        updateData.totalPrice = newQuantity * newUnitPrice;
      }

      await ticketLine.update(updateData, { where: { id } });

      // Fetch updated ticket line with associations
      const updatedTicketLine = await ticketLine.findByPk(id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Ticket line updated successfully',
        data: updatedTicketLine
      });
    } catch (error) {
      console.error('Error updating ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Update ticket line status
  updateStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const validStatuses = ['ordered', 'preparing', 'ready', 'served'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
        });
      }

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      await ticketLine.update({ status }, { where: { id } });

      const updatedTicketLine = await ticketLine.findByPk(id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Ticket line status updated successfully',
        data: updatedTicketLine
      });
    } catch (error) {
      console.error('Error updating ticket line status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Delete ticket line
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      await ticketLine.destroy({ where: { id } });

      res.status(200).json({
        success: true,
        message: 'Ticket line deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get ticket line statistics
  getStats: async (req, res) => {
    try {
      const { ticketId } = req.query;

      const whereClause = ticketId ? { ticketId } : {};

      const stats = await ticketLine.findAll({
        where: whereClause,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalAmount']
        ],
        group: ['status'],
        raw: true
      });

      const totalStats = await ticketLine.findOne({
        where: whereClause,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalItems'],
          [sequelize.fn('SUM', sequelize.col('totalPrice')), 'grandTotal']
        ],
        raw: true
      });

      res.status(200).json({
        success: true,
        message: 'Ticket line statistics retrieved successfully',
        data: {
          statusBreakdown: stats,
          totals: totalStats
        }
      });
    } catch (error) {
      console.error('Error fetching ticket line statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

module.exports = ticketLineController;
