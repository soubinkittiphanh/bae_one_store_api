
const Card = require("../models").card; // Import the users model
const Product = require("../models").product; // Import the users model
const Currency = require("../models").currency; // Import the users model
const { Op } = require("sequelize");
const { sequelize } = require('../models');
const cardController = {
  // Create a new card
  async create(req, res) {
    try {
      const newCard = await Card.create({
        card_type_code: req.body.card_type_code,
        product_id: req.body.product_id,
        cost: req.body.cost,
        card_number: req.body.card_number,
        card_isused: req.body.card_isused,
        locking_session_id: req.body.locking_session_id,
        card_input_date: req.body.card_input_date,
        inputter: req.body.inputter,
        update_user: req.body.update_user,
        isActive: req.body.isActive,
      });
      return res.status(201).json(newCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get all cards
  async getAll(req, res) {
    try {
      const cards = await Card.findAll({ include: 'product' });
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
  // Get all cards

  async getAllByDate(req, res) {
    try {
      const { startDate, endDate } = req.query;
  
      // Validate date input
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required." });
      }
  
      // Query to group by product and aggregate cost and card count
      const cards = await Card.findAll({
        attributes: [
          'productId',  // Group by productId
          [sequelize.fn('COUNT', sequelize.col('card.id')), 'cardCount'],  // Count the cards (reference `card.id`)
          [sequelize.fn('SUM', sequelize.col('card.cost')), 'totalCost'],  // Sum the cost (reference `card.cost`)
          [sequelize.col('product.pro_name'), 'pro_name'],  // Product name (fix alias reference)
        ],
        where: {
          createdAt: {
            [Op.between]: [new Date(startDate), new Date(endDate)]
          }
        },
        include: [
          {
            model: Product,
            as: 'product', // This is where you specify the alias for the association
            attributes: []  // No need to select all columns of Product, just the name is enough
          },
          {
            model: Currency,
            as: 'currency',
            attributes: ['code']  // Assuming you need the currency code too
          }
        ],
        group: ['productId', 'product.pro_name'],  // Group by productId and product name
        raw: true, // To get raw data and not Sequelize instances
      });
  
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
  

  // async getAllByDate(req, res) {
  //   try {
  //     const { startDate, endDate } = req.query;

  //     // Validate date input
  //     if (!startDate || !endDate) {
  //       return res.status(400).json({ message: "Start date and end date are required." });
  //     }

  //     const cards = await Card.findAll({
  //       where: {
  //         createdAt: {
  //           [Op.between]: [new Date(startDate), new Date(endDate)]
  //         }
  //       },
  //       include: ['product','currency']
  //     });

  //     return res.status(200).json(cards);
  //   } catch (error) {
  //     return res.status(400).json({ message: error.message });
  //   }
  // },

  // Get all count cards group by product
  async getAllCountCardGroupByProduct(req, res) {
    try {
      const cards = await Card.findAll({
        where: {
          isActive: true,
        }
      });
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get count of cards and sum of card values grouped by product
  async getAllCountAndSumGroupByProduct(req, res) {
    try {
      const cardStats = await Card.findAll({
        attributes: [
          'product_id',
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT card_number')), 'cardCount'],
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalCardValue'],
        ],
        where: {
          card_isused: 0,
          isActive: true,
        },
        group: ['product_id'],
        // raw: true, // To get raw data instead of instances
        include: ['product'],
        // include: [{
        //   model: Product,
        //   attributes: ['pro_name', 'pro_price'], // Include the attributes you need from the Product model
        // }],
      });
      return res.status(200).json(cardStats);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
  // Get a specific card by ID
  async getById(req, res) {
    try {
      const cardId = req.params.id;
      const cardById = await Card.findByPk(cardId);
      if (!cardById) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      return res.status(200).json(cardById);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Update a specific card by ID
  async updateById(req, res) {
    try {
      const cardId = req.params.id;
      const cardById = await Card.findByPk(cardId);
      if (!cardById) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      const updatedCard = await Card.update(
        {
          card_type_code: req.body.card_type_code,
          product_id: req.body.product_id,
          cost: req.body.cost,
          card_number: req.body.card_number,
          card_isused: req.body.card_isused,
          locking_session_id: req.body.locking_session_id,
          card_input_date: req.body.card_input_date,
          inputter: req.body.inputter,
          update_user: req.body.update_user,
          isActive: req.body.isActive,
        },
        { where: { id: cardId } }
      );
      return res.status(200).json(updatedCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Delete a specific card by ID
  async deleteById(req, res) {
    try {
      const cardId = req.params.id;
      const cardById = await Card.findByPk(cardId);
      if (!cardById) {
        return res.status(404).json({ message: `Card with ID ${cardId} not found` });
      }
      await Card.destroy({ where: { id: cardId } });
      return res.status(204).send();
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
};

module.exports = cardController;
