const Card = require("../models").card; // Import the cards model
const Product = require("../models").product; // Import the product model
const Currency = require("../models").currency; // Import the currency model
const Location = require("../models").location; // Import the location model (if exists)
const { Op } = require("sequelize");
const { sequelize } = require('../models');

const cardController = {
  // Create a new card with enhanced fields
  async create(req, res) {
    try {
      const newCard = await Card.create({
        card_type_code: req.body.card_type_code,
        product_id: req.body.product_id,
        cost: req.body.cost,
        costLCY: req.body.costLCY,
        exchangeRate: req.body.exchangeRate || 1,
        card_number: req.body.card_number,
        card_isused: req.body.card_isused || 0,
        locking_session_id: req.body.locking_session_id,
        card_input_date: req.body.card_input_date || new Date(),
        inputter: req.body.inputter,
        update_user: req.body.update_user,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        
        // New fields
        lotNumber: req.body.lotNumber || null,
        expiryDate: req.body.expiryDate || null,
        hasExpiry: req.body.hasExpiry || false,
        hasLot: req.body.hasLot || false,
        costPerUnit: req.body.costPerUnit || null,
        totalCost: req.body.totalCost || null,
        costType: req.body.costType || 'perUnit',
        stockCardQty: req.body.stockCardQty || 1,
        srcLocationId: req.body.srcLocationId || null,
        currencyId: req.body.currencyId || null
      });
      return res.status(201).json(newCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Bulk create cards for stock addition
  async bulkCreate(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        inputter,
        product_id,
        productId,
        stockCardQty,
        totalCost,
        costPerUnit,
        srcLocationId,
        currencyId,
        exchangeRate,
        costType,
        lotNumber,
        expiryDate,
        hasExpiry,
        hasLot
      } = req.body;

      // Validate required fields
      if (!inputter || !product_id || !stockCardQty || !totalCost) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: "Missing required fields: inputter, product_id, stockCardQty, totalCost" 
        });
      }

      // Generate unique session ID
      const sessionId = `${Date.now()}_${inputter}`;
      
      // Calculate costs
      const calculatedCostPerUnit = costType === 'total' ? 
        totalCost / stockCardQty : costPerUnit;
      const calculatedTotalCost = costType === 'perUnit' ? 
        costPerUnit * stockCardQty : totalCost;

      const cards = [];
      
      // Create individual cards for each unit
      for (let i = 0; i < stockCardQty; i++) {
        const cardNumber = `${product_id}_${sessionId}_${i + 1}`;
        
        const cardData = {
          card_type_code: 1, // Stock in type
          product_id: product_id,
          cost: calculatedCostPerUnit,
          costLCY: calculatedCostPerUnit * (exchangeRate || 1),
          exchangeRate: exchangeRate || 1,
          card_number: cardNumber,
          card_isused: 0,
          locking_session_id: sessionId,
          card_input_date: new Date(),
          inputter: inputter,
          isActive: true,
          
          // New enhanced fields
          lotNumber: lotNumber || null,
          expiryDate: expiryDate || null,
          hasExpiry: hasExpiry || !!expiryDate,
          hasLot: hasLot || !!lotNumber,
          costPerUnit: calculatedCostPerUnit,
          totalCost: calculatedTotalCost,
          costType: costType || 'perUnit',
          stockCardQty: 1, // Each card represents 1 unit
          srcLocationId: srcLocationId || null,
          currencyId: currencyId || null
        };
        
        cards.push(cardData);
      }

      // Bulk create all cards
      const createdCards = await Card.bulkCreate(cards, { transaction });
      
      await transaction.commit();
      
      return res.status(201).json({
        message: `Successfully created ${stockCardQty} stock cards`,
        sessionId: sessionId,
        totalCards: createdCards.length,
        summary: {
          productId: product_id,
          quantity: stockCardQty,
          costPerUnit: calculatedCostPerUnit,
          totalCost: calculatedTotalCost,
          lotNumber: lotNumber,
          expiryDate: expiryDate,
          currency: currencyId,
          location: srcLocationId
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('Bulk create error:', error);
      return res.status(400).json({ message: error.message });
    }
  },

  // Get all cards with enhanced filtering
  async getAll(req, res) {
    try {
      const { 
        includeExpired, 
        lotNumber, 
        expiryStatus,
        locationId,
        currencyId 
      } = req.query;
      
      let whereClause = {};
      
      // Filter by expiry status
      if (expiryStatus === 'expired') {
        whereClause.expiryDate = {
          [Op.lt]: new Date()
        };
      } else if (expiryStatus === 'expiring') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        whereClause.expiryDate = {
          [Op.between]: [new Date(), thirtyDaysFromNow]
        };
      } else if (!includeExpired) {
        whereClause[Op.or] = [
          { expiryDate: null },
          { expiryDate: { [Op.gte]: new Date() } }
        ];
      }
      
      // Filter by lot number
      if (lotNumber) {
        whereClause.lotNumber = { [Op.like]: `%${lotNumber}%` };
      }
      
      // Filter by location
      if (locationId) {
        whereClause.srcLocationId = locationId;
      }
      
      // Filter by currency
      if (currencyId) {
        whereClause.currencyId = currencyId;
      }

      const cards = await Card.findAll({ 
        where: whereClause,
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id', 'pro_price']
          },
          {
            model: Currency,
            as: 'currency',
            attributes: ['id', 'code', 'name']
          }
        ],
        order: [['createdAt', 'DESC']]
      });
      
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get cards by date range with enhanced grouping
  async getAllByDate(req, res) {
    try {
      const { startDate, endDate, groupBy } = req.query;
  
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required." });
      }
  
      let groupByFields = ['product_id'];
      let selectFields = [
        'product_id',
        [sequelize.fn('COUNT', sequelize.col('card.id')), 'cardCount'],
        [sequelize.fn('SUM', sequelize.col('card.cost')), 'totalCost'],
        [sequelize.col('product.pro_name'), 'pro_name']
      ];
      
      // Add grouping by lot number if requested
      if (groupBy === 'lot') {
        groupByFields.push('lotNumber');
        selectFields.push('lotNumber');
      }
      
      // Add grouping by expiry date if requested
      if (groupBy === 'expiry') {
        groupByFields.push('expiryDate');
        selectFields.push('expiryDate');
      }
  
      const cards = await Card.findAll({
        attributes: selectFields,
        where: {
          createdAt: {
            [Op.between]: [new Date(startDate), new Date(endDate)]
          }
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: []
          },
          {
            model: Currency,
            as: 'currency',
            attributes: ['code']
          }
        ],
        group: groupByFields,
        raw: true,
      });
  
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get expiring items
  async getExpiringItems(req, res) {
    try {
      const { days = 30 } = req.query;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + parseInt(days));

      const expiringItems = await Card.findAll({
        where: {
          expiryDate: {
            [Op.between]: [new Date(), futureDate]
          },
          isActive: true,
          card_isused: 0
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id']
          }
        ],
        order: [['expiryDate', 'ASC']]
      });

      return res.status(200).json({
        message: `Items expiring within ${days} days`,
        count: expiringItems.length,
        items: expiringItems
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get items by lot number
  async getByLotNumber(req, res) {
    try {
      const { lotNumber } = req.params;
      
      const items = await Card.findAll({
        where: {
          lotNumber: lotNumber,
          isActive: true
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id']
          }
        ]
      });

      return res.status(200).json({
        lotNumber: lotNumber,
        count: items.length,
        items: items
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get stock summary with expiry analysis
  async getStockSummary(req, res) {
    try {
      const summary = await Card.findAll({
        attributes: [
          'product_id',
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT card_number')), 'totalStock'],
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalValue'],
          [sequelize.fn('COUNT', 
            sequelize.literal('CASE WHEN expiryDate < NOW() THEN 1 END')), 'expiredCount'],
          [sequelize.fn('COUNT', 
            sequelize.literal('CASE WHEN expiryDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 1 END')), 'expiringSoonCount'],
          [sequelize.fn('COUNT', 
            sequelize.literal('CASE WHEN lotNumber IS NOT NULL THEN 1 END')), 'withLotCount']
        ],
        where: {
          card_isused: 0,
          isActive: true,
        },
        group: ['product_id'],
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id', 'pro_price']
          }
        ],
      });
      
      return res.status(200).json(summary);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Enhanced get by ID
  async getById(req, res) {
    try {
      const cardId = req.params.id;
      const card = await Card.findByPk(cardId, {
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id', 'pro_price']
          },
          {
            model: Currency,
            as: 'currency',
            attributes: ['id', 'code', 'name']
          }
        ]
      });
      
      if (!card) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      return res.status(200).json(card);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Enhanced update with new fields
  async updateById(req, res) {
    try {
      const cardId = req.params.id;
      const card = await Card.findByPk(cardId);
      
      if (!card) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      
      const updatedCard = await Card.update({
        card_type_code: req.body.card_type_code,
        product_id: req.body.product_id,
        cost: req.body.cost,
        costLCY: req.body.costLCY,
        exchangeRate: req.body.exchangeRate,
        card_number: req.body.card_number,
        card_isused: req.body.card_isused,
        locking_session_id: req.body.locking_session_id,
        card_input_date: req.body.card_input_date,
        inputter: req.body.inputter,
        update_user: req.body.update_user,
        isActive: req.body.isActive,
        
        // New fields
        lotNumber: req.body.lotNumber,
        expiryDate: req.body.expiryDate,
        hasExpiry: req.body.hasExpiry,
        hasLot: req.body.hasLot,
        costPerUnit: req.body.costPerUnit,
        totalCost: req.body.totalCost,
        costType: req.body.costType,
        stockCardQty: req.body.stockCardQty,
        srcLocationId: req.body.srcLocationId,
        currencyId: req.body.currencyId
      }, { 
        where: { id: cardId },
        returning: true 
      });
      
      return res.status(200).json(updatedCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Delete with validation
  async deleteById(req, res) {
    try {
      const cardId = req.params.id;
      const card = await Card.findByPk(cardId);
      
      if (!card) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      
      // Check if card is used
      if (card.card_isused === 1) {
        return res.status(400).json({ 
          message: "Cannot delete used card. Consider marking as inactive instead." 
        });
      }
      
      await Card.destroy({ where: { id: cardId } });
      return res.status(204).send();
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get count and sum grouped by product (enhanced)
  async getAllCountAndSumGroupByProduct(req, res) {
    try {
      const cardStats = await Card.findAll({
        attributes: [
          'product_id',
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT card_number')), 'cardCount'],
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalCardValue'],
          [sequelize.fn('COUNT', 
            sequelize.literal('CASE WHEN expiryDate < NOW() THEN 1 END')), 'expiredCount'],
          [sequelize.fn('COUNT', 
            sequelize.literal('CASE WHEN expiryDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 1 END')), 'expiringSoonCount']
        ],
        where: {
          card_isused: 0,
          isActive: true,
        },
        group: ['product_id'],
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id', 'pro_price']
          }
        ],
      });
      return res.status(200).json(cardStats);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
};

module.exports = cardController;