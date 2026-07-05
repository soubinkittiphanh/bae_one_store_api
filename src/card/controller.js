const Card = require("../models").card; // Import the cards model
const Product = require("../models").product; // Import the product model
const Currency = require("../models").currency; // Import the currency model
const Location = require("../models").location; // Import the location model (if exists)
const SaleLine = require("../models").saleLine; // Import the location model (if exists)
const Size = require("../models").Size; // Import the Size model
const Color = require("../models").Color; // Import the Color model
const User = require("../models").user; // Import the User model
const { Op } = require("sequelize");
const { sequelize } = require('../models');

const cardController = {
  // Create a new card with enhanced fields including Size and Color
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
        serialNo: req.body.serialNo || null,
        expiryDate: req.body.expiryDate || null,
        hasExpiry: req.body.hasExpiry || false,
        hasLot: req.body.hasLot || false,
        costPerUnit: req.body.costPerUnit || null,
        totalCost: req.body.totalCost || null,
        costType: req.body.costType || 'perUnit',
        stockCardQty: req.body.stockCardQty || 1,
        srcLocationId: req.body.srcLocationId || null,
        currencyId: req.body.currencyId || null,
        
        // Size and Color fields
        colorId: req.body.colorId || null,
        sizeId: req.body.sizeId || null
      });
      return res.status(201).json(newCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Bulk create cards for stock addition with Size and Color support
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
        serialNo,
        expiryDate,
        hasExpiry,
        hasLot,
        colorId,
        sizeId
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
          serialNo: serialNo ? `${serialNo}_${i + 1}` : null, // Append sequence for unique serial numbers
          expiryDate: expiryDate || null,
          hasExpiry: hasExpiry || !!expiryDate,
          hasLot: hasLot || !!lotNumber,
          costPerUnit: calculatedCostPerUnit,
          totalCost: calculatedTotalCost,
          costType: costType || 'perUnit',
          stockCardQty: 1, // Each card represents 1 unit
          srcLocationId: srcLocationId || null,
          currencyId: currencyId || null,
          
          // Size and Color fields
          colorId: colorId || null,
          sizeId: sizeId || null
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
          serialNo: serialNo,
          expiryDate: expiryDate,
          currency: currencyId,
          location: srcLocationId,
          color: colorId,
          size: sizeId
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Bulk create error:', error);
      return res.status(400).json({ message: error.message });
    }
  },

  // Get all cards with enhanced filtering including Size and Color
  async getAll(req, res) {
    try {
      const {
        includeExpired,
        lotNumber,
        serialNo,
        expiryStatus,
        locationId,
        currencyId,
        colorId,
        sizeId,
        dateFrom,
        dateTo,
        productId,
        inputter,
        card_isused,
        days
      } = req.query;

      let whereClause = {};

      // Filter by card_isused if provided
      if (card_isused !== undefined) {
        whereClause.card_isused = card_isused;
      }

      // Filter by expiry status
      if (expiryStatus === 'expired') {
        whereClause.expiryDate = {
          [Op.lt]: new Date()
        };
      } else if (expiryStatus === 'expiring') {
        const expiringDays = parseInt(days) || 30;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + expiringDays);

        whereClause.expiryDate = {
          [Op.between]: [new Date(), targetDate]
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

      // Filter by serial number
      if (serialNo) {
        whereClause.serialNo = { [Op.like]: `%${serialNo}%` };
      }

      if (productId) {
        whereClause.product_id = productId;
      }

      if (inputter) {
        whereClause.inputter = inputter;
      }

      if (dateFrom && dateTo) {
        whereClause.createdAt = {
          [Op.between]: [new Date(dateFrom), new Date(dateTo + 'T23:59:59.999Z')]
        };
      } else if (dateFrom) {
        whereClause.createdAt = { [Op.gte]: new Date(dateFrom) };
      } else if (dateTo) {
        whereClause.createdAt = { [Op.lte]: new Date(dateTo + 'T23:59:59.999Z') };
      }

      // Filter by location
      if (locationId) {
        whereClause.srcLocationId = locationId;
      }

      // Filter by currency
      if (currencyId) {
        whereClause.currencyId = currencyId;
      }

      // Filter by color
      if (colorId) {
        whereClause.colorId = colorId;
      }

      // Filter by size
      if (sizeId) {
        whereClause.sizeId = sizeId;
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
          },
          {
            model: Size,
            as: 'size',
            attributes: ['id', 'size_name', 'size_code', 'size_order'],
            required: false
          },
          {
            model: Color,
            as: 'color',
            attributes: ['id', 'color_name', 'color_code', 'hex_code', 'rgb_code'],
            required: false
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'cus_name', 'cus_id'],
            required: false
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name', 'description'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Get cards by date range with enhanced grouping including Size and Color
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

      // Add grouping by color if requested
      if (groupBy === 'color' || groupBy === 'colorSize') {
        groupByFields.push('colorId');
        selectFields.push('colorId');
        selectFields.push([sequelize.col('color.color_name'), 'colorName']);
      }

      // Add grouping by size if requested
      if (groupBy === 'size' || groupBy === 'colorSize') {
        groupByFields.push('sizeId');
        selectFields.push('sizeId');
        selectFields.push([sequelize.col('size.size_name'), 'sizeName']);
      }

      const includeModels = [
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
      ];

      // Add Size and Color includes if needed
      if (groupBy === 'color' || groupBy === 'colorSize') {
        includeModels.push({
          model: Color,
          as: 'color',
          attributes: []
        });
      }

      if (groupBy === 'size' || groupBy === 'colorSize') {
        includeModels.push({
          model: Size,
          as: 'size',
          attributes: []
        });
      }

      const cards = await Card.findAll({
        attributes: selectFields,
        where: {
          createdAt: {
            [Op.between]: [new Date(startDate), new Date(endDate)]
          }
        },
        include: includeModels,
        group: groupByFields,
        raw: true,
      });

      return res.status(200).json(cards);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Enhanced get by ID with Size and Color
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
          },
          {
            model: Size,
            as: 'size',
            attributes: ['id', 'size_name', 'size_code', 'size_order', 'description'],
            required: false
          },
          {
            model: Color,
            as: 'color',
            attributes: ['id', 'color_name', 'color_code', 'hex_code', 'rgb_code', 'description'],
            required: false
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

  // Enhanced update with Size and Color fields
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
        serialNo: req.body.serialNo,
        expiryDate: req.body.expiryDate,
        hasExpiry: req.body.hasExpiry,
        hasLot: req.body.hasLot,
        costPerUnit: req.body.costPerUnit,
        totalCost: req.body.totalCost,
        costType: req.body.costType,
        stockCardQty: req.body.stockCardQty,
        srcLocationId: req.body.srcLocationId,
        currencyId: req.body.currencyId,
        
        // Size and Color fields
        colorId: req.body.colorId,
        sizeId: req.body.sizeId
      }, {
        where: { id: cardId },
        returning: true
      });

      return res.status(200).json(updatedCard);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Enhanced get count and sum grouped by product with Size and Color stats
  async getAllCountAndSumGroupByProduct(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const cardStats = await Card.findAll({
        attributes: [
          'product_id',
          [sequelize.fn('COUNT', sequelize.literal('DISTINCT card_number')), 'cardCount'],
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalCardValue'],
          [sequelize.fn('COUNT',
            sequelize.literal('CASE WHEN expiryDate < NOW() THEN 1 END')), 'expiredCount'],
          [sequelize.fn('COUNT',
            sequelize.literal(`CASE WHEN expiryDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ${days} DAY) THEN 1 END`)), 'expiringSoonCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('CASE WHEN colorId IS NOT NULL THEN 1 END')), 'withColorCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('CASE WHEN sizeId IS NOT NULL THEN 1 END')), 'withSizeCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('DISTINCT colorId')), 'uniqueColorsCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('DISTINCT sizeId')), 'uniqueSizesCount']
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
  },

  // New method: Get stock summary by Color and Size combinations
  async getStockByColorSize(req, res) {
    try {
      const { productId } = req.query;

      let whereClause = {
        card_isused: 0,
        isActive: true
      };

      if (productId) {
        whereClause.product_id = productId;
      }

      const stockSummary = await Card.findAll({
        attributes: [
          'product_id',
          'colorId',
          'sizeId',
          [sequelize.fn('COUNT', sequelize.col('card.id')), 'stockCount'],
          [sequelize.fn('SUM', sequelize.col('card.cost')), 'totalValue'],
          [sequelize.col('product.pro_name'), 'productName'],
          [sequelize.col('color.color_name'), 'colorName'],
          [sequelize.col('color.hex_code'), 'colorHex'],
          [sequelize.col('size.size_name'), 'sizeName'],
          [sequelize.col('size.size_code'), 'sizeCode']
        ],
        where: whereClause,
        include: [
          {
            model: Product,
            as: 'product',
            attributes: []
          },
          {
            model: Color,
            as: 'color',
            attributes: [],
            required: false
          },
          {
            model: Size,
            as: 'size',
            attributes: [],
            required: false
          }
        ],
        group: ['product_id', 'colorId', 'sizeId', 'product.pro_name', 'color.color_name', 'color.hex_code', 'size.size_name', 'size.size_code'],
        order: [
          ['product_id', 'ASC'],
          [sequelize.col('color.color_name'), 'ASC'],
          [sequelize.col('size.size_order'), 'ASC']
        ],
        raw: true
      });

      return res.status(200).json({
        message: 'Stock summary by color and size',
        data: stockSummary
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // Keep existing methods as they are
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
          },
          {
            model: Size,
            as: 'size',
            attributes: ['id', 'size_name', 'size_code'],
            required: false
          },
          {
            model: Color,
            as: 'color',
            attributes: ['id', 'color_name', 'color_code', 'hex_code'],
            required: false
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
          },
          {
            model: Size,
            as: 'size',
            attributes: ['id', 'size_name', 'size_code'],
            required: false
          },
          {
            model: Color,
            as: 'color',
            attributes: ['id', 'color_name', 'color_code', 'hex_code'],
            required: false
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

  // Get items by serial number
  async getBySerialNumber(req, res) {
    try {
      const { serialNo } = req.params;

      const items = await Card.findAll({
        where: {
          serialNo: serialNo,
          isActive: true
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'pro_name', 'pro_id']
          },
          {
            model: Size,
            as: 'size',
            attributes: ['id', 'size_name', 'size_code'],
            required: false
          },
          {
            model: Color,
            as: 'color',
            attributes: ['id', 'color_name', 'color_code', 'hex_code'],
            required: false
          }
        ]
      });

      return res.status(200).json({
        serialNo: serialNo,
        count: items.length,
        items: items
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

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
            sequelize.literal('CASE WHEN lotNumber IS NOT NULL THEN 1 END')), 'withLotCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('CASE WHEN colorId IS NOT NULL THEN 1 END')), 'withColorCount'],
          [sequelize.fn('COUNT',
            sequelize.literal('CASE WHEN sizeId IS NOT NULL THEN 1 END')), 'withSizeCount']
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

  // Keep existing stockmovements method as is
  async stockmovements(req, res) {
    try {
      const { dateFrom, dateTo, categoryId, locationId } = req.query;

      console.log('Request params:', { dateFrom, dateTo, categoryId, locationId });

      // Build filters
      const categoryFilter = categoryId ? `AND p.pro_category = ${parseInt(categoryId)}` : '';
      const locationFilter = locationId ? `AND movements.locationId = ${parseInt(locationId)}` : '';

      // Corrected query - we need to track actual movements, not just stock cards
      const query = `
      SELECT 
        p.id,
        p.pro_name,
        p.stock_count as currentStock,
        p.minStock,
        movement_date,
        locationId,
        location_name,
        SUM(CASE WHEN movement_type = 'stock_in' THEN quantity ELSE 0 END) as stockIn,
        SUM(CASE WHEN movement_type = 'sold' THEN quantity ELSE 0 END) as sold
      FROM product p
      LEFT JOIN (
        -- Stock additions (when cards are created - receiving stock)
        SELECT 
          c.productId as product_id,
          DATE(c.createdAt) as movement_date,
          COUNT(*) as quantity,  -- Count actual cards created (stock received)
          'stock_in' as movement_type,
          c.locationId,
          l.name as location_name
        FROM card c
        LEFT JOIN location l ON c.locationId = l.id
        WHERE c.isActive = 1
          AND DATE(c.createdAt) BETWEEN ? AND ?
        GROUP BY c.productId, DATE(c.createdAt), c.locationId, l.name
        
        UNION ALL
        
        -- Sales (when cards get saleLineId assigned - actual sales)
        SELECT 
          c.productId as product_id,
          DATE(sl.createdAt) as movement_date,
          COUNT(*) as quantity,  -- Count cards sold
          'sold' as movement_type,
          c.locationId,
          l.name as location_name
        FROM card c
        INNER JOIN saleLine sl ON c.saleLineId = sl.id
        LEFT JOIN location l ON c.locationId = l.id
        WHERE c.saleLineId IS NOT NULL 
          AND c.isActive = 1
          AND DATE(sl.createdAt) BETWEEN ? AND ?
        GROUP BY c.productId, DATE(sl.createdAt), c.locationId, l.name
      ) movements ON p.id = movements.product_id
      WHERE p.isActive = 1 ${categoryFilter}
        AND movements.movement_date IS NOT NULL
        ${locationFilter}
      GROUP BY p.id, p.pro_name, p.stock_count, p.minStock, movement_date, locationId, location_name
      ORDER BY p.pro_name, movement_date, location_name
    `;

      const results = await sequelize.query(query, {
        replacements: [dateFrom, dateTo, dateFrom, dateTo],
        type: sequelize.QueryTypes.SELECT
      });

      console.log('Raw query results count:', results.length);
      console.log('Sample results:', results.slice(0, 5));

      if (results.length === 0) {
        // Get location list for filter even when no movements found
        const locationQuery = `SELECT id, name FROM location WHERE isActive = 1 ORDER BY name`;
        const locations = await sequelize.query(locationQuery, {
          type: sequelize.QueryTypes.SELECT
        });

        return res.json({
          stockMovements: [],
          locations: locations
        });
      }

      // Group results by product and location
      const productMap = new Map();

      results.forEach(row => {
        const productKey = row.id;
        const locationKey = row.locationId || 'unknown';

        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            id: row.id,
            pro_name: row.pro_name,
            currentStock: row.currentStock || 0,
            minStock: row.minStock || 0,
            locations: new Map()
          });
        }

        const product = productMap.get(productKey);

        if (!product.locations.has(locationKey)) {
          product.locations.set(locationKey, {
            locationId: row.locationId,
            locationName: row.location_name || 'Unknown Location',
            movements: new Map(),
            totalStockIn: 0,
            totalSold: 0
          });
        }

        const location = product.locations.get(locationKey);

        if (row.movement_date && (row.stockIn > 0 || row.sold > 0)) {
          const existingMovement = location.movements.get(row.movement_date) || {
            date: row.movement_date,
            stockIn: 0,
            sold: 0
          };

          existingMovement.stockIn += parseInt(row.stockIn) || 0;
          existingMovement.sold += parseInt(row.sold) || 0;

          location.movements.set(row.movement_date, existingMovement);

          // Update totals
          location.totalStockIn += parseInt(row.stockIn) || 0;
          location.totalSold += parseInt(row.sold) || 0;
        }
      });

      // Calculate running balances - get current stock per location
      const stockMovements = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);

      // First, get current stock distribution by location for each product
      for (const [productKey, product] of productMap.entries()) {
        const locationStockQuery = `
        SELECT 
          COALESCE(c.locationId, 'unknown') as locationId,
          l.name as locationName,
          COUNT(*) as currentLocationStock
        FROM card c
        LEFT JOIN location l ON c.locationId = l.id
        WHERE c.productId = ? 
          AND c.saleLineId IS NULL 
          AND c.isActive = 1
          AND c.card_isused = 0
        GROUP BY c.locationId, l.name
      `;

        const locationStocks = await sequelize.query(locationStockQuery, {
          replacements: [product.id],
          type: sequelize.QueryTypes.SELECT
        });

        console.log(`Product ${product.id} location stocks:`, locationStocks);

        const productLocations = [];

        product.locations.forEach(location => {
          if (location.movements.size > 0) {
            const movementsArray = [];

            // Find current stock for this location
            const locationStock = locationStocks.find(ls =>
              (ls.locationId || 'unknown') == (location.locationId || 'unknown')
            );
            const currentLocationStock = locationStock ? locationStock.currentLocationStock : 0;

            // Calculate starting balance by working backwards from current stock
            let totalMovementInPeriod = 0;
            location.movements.forEach(movement => {
              totalMovementInPeriod += movement.stockIn - movement.sold;
            });

            let runningBalance = currentLocationStock - totalMovementInPeriod;

            // Create movements for each date with running balance
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dateKey = d.toISOString().split('T')[0];
              const movement = location.movements.get(dateKey);

              const dailyStockIn = movement ? movement.stockIn : 0;
              const dailySold = movement ? movement.sold : 0;

              const startBalance = runningBalance;
              runningBalance += dailyStockIn - dailySold;

              movementsArray.push({
                date: dateKey,
                stockIn: dailyStockIn,
                sold: dailySold,
                dailyNet: dailyStockIn - dailySold,
                startBalance: Math.max(0, startBalance), // Don't show negative starting balance
                endBalance: Math.max(0, runningBalance)   // Don't show negative ending balance
              });
            }

            productLocations.push({
              locationId: location.locationId,
              locationName: location.locationName,
              movements: movementsArray,
              totalStockIn: location.totalStockIn,
              totalSold: location.totalSold,
              currentStock: currentLocationStock
            });
          }
        });

        if (productLocations.length > 0) {
          stockMovements.push({
            id: product.id,
            pro_name: product.pro_name,
            currentStock: product.currentStock,
            minStock: product.minStock,
            locations: productLocations
          });
        }
      }

      // Get location list for filter
      const locationQuery = `SELECT id, name FROM location WHERE isActive = 1 ORDER BY name`;
      const locations = await sequelize.query(locationQuery, {
        type: sequelize.QueryTypes.SELECT
      });

      console.log('Final stock movements count:', stockMovements.length);
      res.json({
        stockMovements,
        locations
      });

    } catch (error) {
      console.error('Error fetching stock movements:', error);
      res.status(500).json({
        error: 'Failed to fetch stock movements',
        details: error.message
      });
    }
  }
};

module.exports = cardController;