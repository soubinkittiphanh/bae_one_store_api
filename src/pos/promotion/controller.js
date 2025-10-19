// controllers/promotionController.js
const { promotion: Promotion, ticketLine: TicketLine } = require('../../models');
const { Op } = require('sequelize');

class PromotionController {
  
  // Get all active promotions
  async getActivePromotions(req, res) {
    try {
      const currentDate = new Date();
      
      const promotions = await Promotion.findAll({
        where: {
          is_active: true,
          start_date: { [Op.lte]: currentDate },
          end_date: { [Op.gte]: currentDate },
          [Op.or]: [
            { max_uses: null },
            { current_uses: { [Op.lt]: sequelize.col('max_uses') } }
          ]
        },
        order: [['priority', 'DESC'], ['created_at', 'ASC']]
      });

      res.json({
        success: true,
        data: promotions
      });
    } catch (error) {
      console.error('Error fetching active promotions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch promotions',
        error: error.message
      });
    }
  }

  // Calculate applicable promotions for ticket lines
  async calculatePromotions(req, res) {
    try {
      const { ticketLines } = req.body;
      
      if (!ticketLines || !Array.isArray(ticketLines)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ticket lines provided'
        });
      }

      const activePromotions = await this.getActivePromotionsData();
      const applicablePromotions = [];

      for (const promotion of activePromotions) {
        const result = this.evaluatePromotion(ticketLines, promotion);
        if (result.applicable) {
          applicablePromotions.push(result);
        }
      }

      // Sort by best savings first
      applicablePromotions.sort((a, b) => b.discount_amount - a.discount_amount);

      res.json({
        success: true,
        data: applicablePromotions
      });
    } catch (error) {
      console.error('Error calculating promotions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate promotions',
        error: error.message
      });
    }
  }

  // Apply promotion to ticket
  async applyPromotion(req, res) {
    try {
      const { ticketId, promotionId, ticketLines } = req.body;
      
      const promotion = await Promotion.findByPk(promotionId);
      if (!promotion) {
        return res.status(404).json({
          success: false,
          message: 'Promotion not found'
        });
      }

      // Validate promotion is still active and usable
      const isValid = this.validatePromotion(promotion);
      if (!isValid.valid) {
        return res.status(400).json({
          success: false,
          message: isValid.reason
        });
      }

      // Calculate promotion effect
      const promotionResult = this.evaluatePromotion(ticketLines, promotion);
      if (!promotionResult.applicable) {
        return res.status(400).json({
          success: false,
          message: 'Promotion is not applicable to current items'
        });
      }

      // Apply the promotion (this would update ticket lines)
      const updatedLines = await this.applyPromotionToLines(
        ticketId, 
        promotion, 
        promotionResult,
        ticketLines
      );

      // Increment usage count
      await promotion.increment('current_uses');

      res.json({
        success: true,
        data: {
          promotion: promotion,
          discount_amount: promotionResult.discount_amount,
          updated_lines: updatedLines,
          message: `${promotion.name} applied successfully`
        }
      });
    } catch (error) {
      console.error('Error applying promotion:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to apply promotion',
        error: error.message
      });
    }
  }

  // Private helper methods
  async getActivePromotionsData() {
    const currentDate = new Date();
    return await Promotion.findAll({
      where: {
        is_active: true,
        start_date: { [Op.lte]: currentDate },
        end_date: { [Op.gte]: currentDate },
        [Op.or]: [
          { max_uses: null },
          { current_uses: { [Op.lt]: sequelize.col('max_uses') } }
        ]
      },
      order: [['priority', 'DESC']]
    });
  }

  evaluatePromotion(ticketLines, promotion) {
    switch (promotion.type) {
      case 'buy_x_get_y':
        return this.evaluateBuyXGetY(ticketLines, promotion);
      case 'percentage':
        return this.evaluatePercentage(ticketLines, promotion);
      case 'fixed_amount':
        return this.evaluateFixedAmount(ticketLines, promotion);
      case 'combo_deal':
        return this.evaluateComboDeal(ticketLines, promotion);
      default:
        return { applicable: false, reason: 'Unknown promotion type' };
    }
  }

  evaluateBuyXGetY(ticketLines, promotion) {
    const conditions = promotion.conditions;
    
    // Filter applicable items
    const applicableItems = ticketLines.filter(line => {
      if (conditions.applicable_categories && conditions.applicable_categories.length > 0) {
        return conditions.applicable_categories.includes(line.product_category);
      }
      if (conditions.applicable_products && conditions.applicable_products.length > 0) {
        return conditions.applicable_products.includes(line.product_id);
      }
      return false;
    });

    if (applicableItems.length === 0) {
      return { applicable: false, reason: 'No applicable items found' };
    }

    // Calculate total quantity of applicable items
    const totalQty = applicableItems.reduce((sum, line) => sum + line.quantity, 0);
    const buyQty = conditions.buy_quantity || 2;
    const getQty = conditions.get_quantity || 1;
    const minQtyRequired = buyQty + getQty;

    if (totalQty < minQtyRequired) {
      return { 
        applicable: false, 
        reason: `Need at least ${minQtyRequired} items (have ${totalQty})` 
      };
    }

    // Calculate how many free items can be given
    const cycles = Math.floor(totalQty / minQtyRequired);
    const freeItems = cycles * getQty;
    
    if (freeItems === 0) {
      return { applicable: false, reason: 'Not enough items for promotion' };
    }

    // Calculate discount (price of cheapest items that would be free)
    const sortedItems = applicableItems
      .flatMap(line => Array(line.quantity).fill(line))
      .sort((a, b) => a.unit_price - b.unit_price);
    
    let discountAmount = 0;
    for (let i = 0; i < freeItems && i < sortedItems.length; i++) {
      discountAmount += sortedItems[i].unit_price;
    }

    return {
      applicable: true,
      promotion_id: promotion.id,
      promotion_name: promotion.name,
      discount_amount: discountAmount,
      free_items: freeItems,
      description: `${promotion.name} - ${freeItems} free item(s)`,
      details: {
        cycles: cycles,
        total_applicable_qty: totalQty,
        buy_quantity: buyQty,
        get_quantity: getQty
      }
    };
  }

  evaluatePercentage(ticketLines, promotion) {
    const conditions = promotion.conditions;
    let applicableTotal = 0;

    const applicableItems = ticketLines.filter(line => {
      const isApplicable = this.isItemApplicableForPromotion(line, conditions);
      if (isApplicable) {
        applicableTotal += line.unit_price * line.quantity;
      }
      return isApplicable;
    });

    if (applicableItems.length === 0 || applicableTotal === 0) {
      return { applicable: false, reason: 'No applicable items found' };
    }

    // Check minimum order amount
    if (conditions.minimum_order && applicableTotal < conditions.minimum_order) {
      return { 
        applicable: false, 
        reason: `Minimum order of ${conditions.minimum_order} required` 
      };
    }

    const discountPercentage = conditions.discount_percentage || 0;
    const maxDiscount = conditions.max_discount_amount || null;
    
    let discountAmount = (applicableTotal * discountPercentage) / 100;
    if (maxDiscount && discountAmount > maxDiscount) {
      discountAmount = maxDiscount;
    }

    return {
      applicable: true,
      promotion_id: promotion.id,
      promotion_name: promotion.name,
      discount_amount: discountAmount,
      description: `${promotion.name} - ${discountPercentage}% off`,
      details: {
        applicable_total: applicableTotal,
        discount_percentage: discountPercentage
      }
    };
  }

  isItemApplicableForPromotion(line, conditions) {
    // Check categories
    if (conditions.applicable_categories && conditions.applicable_categories.length > 0) {
      if (!conditions.applicable_categories.includes(line.product_category)) {
        return false;
      }
    }

    // Check specific products
    if (conditions.applicable_products && conditions.applicable_products.length > 0) {
      if (!conditions.applicable_products.includes(line.product_id)) {
        return false;
      }
    }

    // Check excluded categories
    if (conditions.excluded_categories && conditions.excluded_categories.length > 0) {
      if (conditions.excluded_categories.includes(line.product_category)) {
        return false;
      }
    }

    // Check excluded products
    if (conditions.excluded_products && conditions.excluded_products.length > 0) {
      if (conditions.excluded_products.includes(line.product_id)) {
        return false;
      }
    }

    return true;
  }

  validatePromotion(promotion) {
    const currentDate = new Date();
    
    if (!promotion.is_active) {
      return { valid: false, reason: 'Promotion is not active' };
    }
    
    if (currentDate < promotion.start_date) {
      return { valid: false, reason: 'Promotion has not started yet' };
    }
    
    if (currentDate > promotion.end_date) {
      return { valid: false, reason: 'Promotion has expired' };
    }
    
    if (promotion.max_uses && promotion.current_uses >= promotion.max_uses) {
      return { valid: false, reason: 'Promotion usage limit reached' };
    }
    
    return { valid: true };
  }

  async applyPromotionToLines(ticketId, promotion, promotionResult, ticketLines) {
    // Implementation would depend on your specific needs
    // This is a simplified version
    
    if (promotion.type === 'buy_x_get_y') {
      // Create discount line items for free products
      const freeItemsToAdd = promotionResult.free_items;
      // Logic to add free items or create discount lines
    }
    
    // Return updated lines
    return ticketLines;
  }

  // CRUD operations for promotions
  async createPromotion(req, res) {
    try {
      const promotionData = req.body;
      
      const promotion = await Promotion.create(promotionData);
      
      res.status(201).json({
        success: true,
        data: promotion,
        message: 'Promotion created successfully'
      });
    } catch (error) {
      console.error('Error creating promotion:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create promotion',
        error: error.message
      });
    }
  }

  async getAllPromotions(req, res) {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;
      
      const whereClause = {};
      if (status) {
        whereClause.is_active = status === 'active';
      }

      const { count, rows } = await Promotion.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          pages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching promotions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch promotions',
        error: error.message
      });
    }
  }

  async updatePromotion(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const [updatedRows] = await Promotion.update(updateData, {
        where: { id: id }
      });

      if (updatedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Promotion not found'
        });
      }

      const updatedPromotion = await Promotion.findByPk(id);

      res.json({
        success: true,
        data: updatedPromotion,
        message: 'Promotion updated successfully'
      });
    } catch (error) {
      console.error('Error updating promotion:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update promotion',
        error: error.message
      });
    }
  }

  async deletePromotion(req, res) {
    try {
      const { id } = req.params;

      const deletedRows = await Promotion.destroy({
        where: { id: id }
      });

      if (deletedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Promotion not found'
        });
      }

      res.json({
        success: true,
        message: 'Promotion deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting promotion:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete promotion',
        error: error.message
      });
    }
  }
}

module.exports = new PromotionController();