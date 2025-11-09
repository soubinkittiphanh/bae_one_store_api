const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op } = require('sequelize');
const { ticketLine, ticket, product, promotion } = require('../../models');
const Payment = require('../../models').payment;

const ticketLineController = {
  // Create a new ticket line
  create: async (req, res) => {
    try {
      const {
        ticketId,
        productId,
        quantity,
        unitPrice,
        specialInstructions,
        promotionId,
        is_promotion_item,
        original_price,
        discount_amount,
        promotion_note
      } = req.body;

      // Validate required fields
      if (!ticketId || !productId || !quantity || !unitPrice) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: ticketId, productId, quantity, unitPrice'
        });
      }

      // Calculate total price (unitPrice should already be discounted if promotion applied)
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

      // Verify promotion exists if promotionId is provided
      if (promotionId) {
        const existingPromotion = await promotion.findByPk(promotionId);
        if (!existingPromotion) {
          return res.status(404).json({
            success: false,
            message: 'Promotion not found'
          });
        }
      }

      const newTicketLine = await ticketLine.create({
        ticketId,
        productId,
        quantity,
        unitPrice,
        totalPrice,
        specialInstructions: specialInstructions || null,
        status: 'ordered',
        promotionId: promotionId || null,
        is_promotion_item: is_promotion_item || false,
        original_price: original_price || null,
        discount_amount: discount_amount || 0,
        promotion_note: promotion_note || null
      });

      // Fetch the created ticket line with associations
      const createdTicketLine = await ticketLine.findByPk(newTicketLine.id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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
      const { page = 1, limit = 10, status, ticketId, promotionId } = req.query;
      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = {};
      if (status) whereClause.status = status;
      if (ticketId) whereClause.ticketId = ticketId;
      if (promotionId) whereClause.promotionId = promotionId;

      const ticketLines = await ticketLine.findAndCountAll({
        where: whereClause,
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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
          {
            model: ticket, include: [{
              model: Payment,
              as: 'payment',
              required: false
            }], as: 'ticket'
          },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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
      const {
        quantity,
        unitPrice,
        specialInstructions,
        status,
        promotionId,
        is_promotion_item,
        original_price,
        discount_amount,
        promotion_note
      } = req.body;

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      // Verify promotion exists if promotionId is provided
      if (promotionId) {
        const existingPromotion = await promotion.findByPk(promotionId);
        if (!existingPromotion) {
          return res.status(404).json({
            success: false,
            message: 'Promotion not found'
          });
        }
      }

      // Prepare update data
      const updateData = {};
      if (quantity !== undefined) updateData.quantity = quantity;
      if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
      if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions;
      if (status !== undefined) updateData.status = status;
      if (promotionId !== undefined) updateData.promotionId = promotionId;
      if (is_promotion_item !== undefined) updateData.is_promotion_item = is_promotion_item;
      if (original_price !== undefined) updateData.original_price = original_price;
      if (discount_amount !== undefined) updateData.discount_amount = discount_amount;
      if (promotion_note !== undefined) updateData.promotion_note = promotion_note;

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
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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

  // Apply promotion to ticket line
  applyPromotion: async (req, res) => {
    try {
      const { id } = req.params;
      const { promotionId, discount_amount, promotion_note } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          message: 'Promotion ID is required'
        });
      }

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      const existingPromotion = await promotion.findByPk(promotionId);
      if (!existingPromotion) {
        return res.status(404).json({
          success: false,
          message: 'Promotion not found'
        });
      }

      // Store original price if not already stored
      const original_price = existingTicketLine.original_price || existingTicketLine.unitPrice;

      // Calculate new unit price after discount
      const newUnitPrice = existingTicketLine.unitPrice - (discount_amount || 0);
      const newTotalPrice = existingTicketLine.quantity * newUnitPrice;

      await ticketLine.update({
        promotionId: promotionId,
        is_promotion_item: true,
        original_price: original_price,
        discount_amount: discount_amount || 0,
        promotion_note: promotion_note || existingPromotion.name,
        unitPrice: newUnitPrice,
        totalPrice: newTotalPrice
      }, { where: { id } });

      const updatedTicketLine = await ticketLine.findByPk(id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Promotion applied to ticket line successfully',
        data: updatedTicketLine
      });
    } catch (error) {
      console.error('Error applying promotion to ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Remove promotion from ticket line
  removePromotion: async (req, res) => {
    try {
      const { id } = req.params;

      const existingTicketLine = await ticketLine.findByPk(id);
      if (!existingTicketLine) {
        return res.status(404).json({
          success: false,
          message: 'Ticket line not found'
        });
      }

      // Restore original price
      const originalPrice = existingTicketLine.original_price || existingTicketLine.unitPrice;
      const newTotalPrice = existingTicketLine.quantity * originalPrice;

      await ticketLine.update({
        promotionId: null,
        is_promotion_item: false,
        original_price: null,
        discount_amount: 0,
        promotion_note: null,
        unitPrice: originalPrice,
        totalPrice: newTotalPrice
      }, { where: { id } });

      const updatedTicketLine = await ticketLine.findByPk(id, {
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Promotion removed from ticket line successfully',
        data: updatedTicketLine
      });
    } catch (error) {
      console.error('Error removing promotion from ticket line:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get promotional ticket lines
  getPromotionalLines: async (req, res) => {
    try {
      const { ticketId } = req.query;

      const whereClause = { is_promotion_item: true };
      if (ticketId) whereClause.ticketId = ticketId;

      const promotionalLines = await ticketLine.findAll({
        where: whereClause,
        include: [
          { model: ticket, as: 'ticket' },
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        message: 'Promotional ticket lines retrieved successfully',
        data: promotionalLines
      });
    } catch (error) {
      console.error('Error fetching promotional ticket lines:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Update ticket line status (keeping the original method)
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
          { model: product, as: 'product' },
          { model: promotion, as: 'promotion' }
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

  // Get ticket line statistics (updated to include promotion stats)
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

      const promotionStats = await ticketLine.findAll({
        where: { ...whereClause, is_promotion_item: true },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'promotionalItems'],
          [sequelize.fn('SUM', sequelize.col('discount_amount')), 'totalDiscount']
        ],
        raw: true
      });

      const totalStats = await ticketLine.findOne({
        where: whereClause,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalItems'],
          [sequelize.fn('SUM', sequelize.col('totalPrice')), 'grandTotal'],
          [sequelize.fn('SUM', sequelize.col('original_price')), 'originalTotal']
        ],
        raw: true
      });

      res.status(200).json({
        success: true,
        message: 'Ticket line statistics retrieved successfully',
        data: {
          statusBreakdown: stats,
          promotionStats: promotionStats[0] || { promotionalItems: 0, totalDiscount: 0 },
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