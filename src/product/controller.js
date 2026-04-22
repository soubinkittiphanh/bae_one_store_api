
const { product: Product, webProductGroup: WebGroup, category: Category, unit: Unit, productAudit, user: User } = require('../models');
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { literal, Op } = require('sequelize');


// Get all products
// const getAllProducts = async (req, res) => {
//   try {
//     const products = await Product.findAll({
//       include: ['priceLists','costCurrency', 'saleCurrency', 'images','company','category', {
//         model: WebGroup,
//         through: { attributes: [] }
//       }],
//     });
//     res.status(200).json(products);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };

const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      categoryId,
      stockLevel,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      isActive = 1
    } = req.query;

    // Build where clause
    const where = {
      isActive: parseInt(isActive) // Only active products by default
    };

    // Search filter
    if (search) {
      where[Op.or] = [
        { pro_name: { [Op.like]: `%${search}%` } },
        { pro_desc: { [Op.like]: `%${search}%` } },
        { barCode: { [Op.like]: `%${search}%` } }
      ];
    }

    // Category filter - handle both possible foreign keys
    if (categoryId) {
      where[Op.or] = [
        { pro_category: categoryId },
        { categoryCategId: categoryId }
      ];
    }

    // Stock level filter
    if (stockLevel) {
      switch (stockLevel) {
        case 'out':
          where[Op.or] = [
            { stock_count: 0 },
            { stock_count: null }
          ];
          break;
        case 'low':
          where.stock_count = {
            [Op.and]: [
              { [Op.gt]: 0 },
              { [Op.lte]: Product.sequelize.col('minStock') }
            ]
          };
          break;
        case 'normal':
          where.stock_count = {
            [Op.gt]: Product.sequelize.col('minStock')
          };
          break;
        case 'over':
          // Simplified overstock logic
          where.stock_count = {
            [Op.gte]: Product.sequelize.literal('minStock * 2')
          };
          break;
      }
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Sorting
    const validSortFields = ['pro_name', 'pro_price', 'stock_count', 'createdAt', 'updateTimestamp'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        // Category association - use the correct foreign key
        {
          model: Category,
          as: 'category',
          attributes: ['categ_id', 'categ_name', 'categ_desc'],
          required: false
        },
        // Unit associations - be explicit about which ones exist
        {
          model: Unit,
          as: 'stockUnit',
          attributes: ['id', 'name', 'symbol'],
          required: false
        },
        // Only include baseUnit if the association exists
        {
          model: Unit,
          as: 'baseUnit',
          attributes: ['id', 'name', 'symbol'],
          required: false
        },
        // Your existing includes - keep them simple to avoid conflicts
        'priceLists',
        'costCurrency',
        'saleCurrency',
        'images',
        'company'
        // Note: Removed WebGroup for now to avoid many-to-many issues
      ],
      limit: parseInt(limit),
      offset,
      order: [[orderField, orderDirection]],
      distinct: true,
      subQuery: false // Important for proper pagination with includes
    });

    // Format the response to match frontend expectations
    const formattedProducts = products.map(product => ({
      id: product.id,
      pro_id: product.pro_id,
      pro_name: product.pro_name,
      pro_desc: product.pro_desc,
      pro_price: product.pro_price,
      cost_price: product.cost_price,

      // Frontend compatibility mappings
      pro_card_count: product.stock_count,
      stock_count: product.stock_count,
      pro_min_stock: product.minStock,
      minStock: product.minStock,

      pro_status: product.pro_status,
      pro_image_path: product.pro_image_path,
      barCode: product.barCode,
      isActive: product.isActive,
      _category: product._category,
      createdAt: product.createdAt,
      updatedAt: product.updateTimestamp,
      updateTimestamp: product.updateTimestamp,
      stockUnitId: product.stockUnitId,
      receiveUnitId: product.receiveUnitId,
      baseUnitId: product.baseUnitId,

      // Associations - handle safely
      category: product.category,
      unit: product.stockUnit || product.baseUnit,
      stockUnit: product.stockUnit,
      baseUnit: product.baseUnit,
      priceLists: product.priceLists || [],
      costCurrency: product.costCurrency,
      saleCurrency: product.saleCurrency,
      images: product.images || [],
      company: product.company
    }));

    res.status(200).json({
      success: true,
      data: {
        products: formattedProducts,
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / parseInt(limit)),
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit),
          hasNextPage: offset + parseInt(limit) < count,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

const getAllActiveProducts = async (req, res) => {
  try {
    const {
      search,
      categoryId,
      sortBy = 'pro_name',
      sortOrder = 'ASC'
    } = req.query;

    const where = {
      isActive: 1
    };

    // Search filter
    if (search) {
      where[Op.or] = [
        { pro_name: { [Op.like]: `%${search}%` } },
        { barCode: { [Op.like]: `%${search}%` } }
      ];
    }

    // Category filter
    if (categoryId) {
      where[Op.or] = [
        { pro_category: categoryId },
        { categoryCategId: categoryId }
      ];
    }

    const validSortFields = ['pro_name', 'pro_price', 'createdAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'pro_name';
    const orderDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const products = await Product.findAll({
      where,
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['categ_id', 'categ_name'],
          required: false
        },
        {
          model: Unit,
          as: 'stockUnit',
          attributes: ['id', 'name', 'symbol'],
          required: false
        },
        'priceLists',
        'images'
      ],
      order: [[orderField, orderDirection]],
      distinct: true,
      subQuery: true // ✔ important for hasMany
    });

    const formattedProducts = products.map(product => ({
      id: product.id,
      pro_id: product.pro_id,
      pro_name: product.pro_name,
      pro_price: product.pro_price,
      stock_count: product.stock_count,
      minStock: product.minStock,
      barCode: product.barCode,
      isActive: product.isActive,
      stockUnitId: product.stockUnitId,
      receiveUnitId: product.receiveUnitId,
      baseUnitId: product.baseUnitId,

      category: product.category,
      _category: product._category,
      unit: product.stockUnit,
      priceLists: product.priceLists || [],
      images: product.images || []
    }));

    res.status(200).json({
      success: true,
      data: {
        products: formattedProducts,
        totalItems: formattedProducts.length
      }
    });

  } catch (error) {
    console.error('Error fetching active products:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get a single product by ID
const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findOne({ include: ['costCurrency', 'saleCurrency', 'images'], where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
const updateProductCountById = async (req, res) => {
  const { id } = req.params;
  Product.update({
    stock_count: literal(`(
      SELECT COUNT(card.card_number)
      FROM card
      WHERE card.productId =${id} AND card.saleLineId IS NULL
    )`)
  }).then(() => {
    logger.info('Product count updated successfully');
    res.status(200).send(`Operation completed`)
  }).catch((error) => {
    logger.error('Error updating product count:' + error);
    res.status(501).send(`Server error ${error}`)
  });
};

const updateProductCountAll = async (req, res) => {
  try {
    const products = await Product.findAll()
    logger.info(`All product count ${products.length} to be update stock count`)
    for (const iterator of products) {
      iterator.update({
        stock_count: literal(`(
          SELECT COUNT(card.card_number)
          FROM card
          WHERE card.productId =${iterator.id} AND card.saleLineId IS NULL
        )`)
      })
    }
    res.status(200).send(`Operation completed`)
  } catch (error) {
    logger.error(`Cannot find all product with error ${error}`)
    res.status(501).send(`Server error ${error}`)
  }
};

// Create a new product
const createProduct = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  let { pro_id, pro_name, pro_price, pro_desc, pro_status, validateStockOnSale,
    pro_image_path, retail_cost_percent, cost_price,
    stock_count, locking_session_id, isActive, minStock, barCode, saleCurrencyId, costCurrencyId, companyId, vendorName, _category,
    receiveUnitId, stockUnitId, baseUnitId } = req.body;
  locking_session_id = Date.now()
  try {
    const newProduct = await Product.create({
      pro_id,
      pro_name,
      pro_price,
      pro_desc,
      pro_status,
      validateStockOnSale,
      pro_image_path,
      retail_cost_percent,
      cost_price,
      stock_count,
      locking_session_id,
      minStock,
      isActive,
      barCode,
      saleCurrencyId,
      costCurrencyId,
      companyId,
      vendorName,
      _category,
      receiveUnitId,
      stockUnitId,
      baseUnitId,
    }, {
      context: { userId: req.user?.id || 1, reason: 'Product created via API' }
    });
    res.status(200).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing product by ID
const updateProductById = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { id } = req.params;
  const { pro_id, pro_name, pro_price, pro_desc, pro_status, validateStockOnSale,
    pro_image_path, retail_cost_percent, cost_price, stock_count,
    isActive, minStock, barCode, saleCurrencyId, costCurrencyId, companyId, vendorName, _category,
    receiveUnitId, stockUnitId, baseUnitId } = req.body;
  try {
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await product.update(
      {
        pro_id,
        pro_name,
        pro_price,
        pro_desc,
        pro_status,
        validateStockOnSale,
        pro_image_path,
        retail_cost_percent,
        cost_price,
        stock_count,
        locking_session_id: Date.now(),
        minStock,
        isActive,
        barCode, saleCurrencyId, costCurrencyId, companyId, vendorName, _category,
        receiveUnitId, stockUnitId, baseUnitId
      },
      { 
        context: { userId: req.user?.id || 1, reason: req.body.reason || 'Product updated via API' }
      }
    );
    res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a product by ID
const deleteProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await Product.destroy({ 
      where: { id },
      context: { userId: req.user?.id || 1, reason: req.body.reason || 'Product deleted via API' }
    });
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// Diable a product by ID
const disableProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    product.isActive = false;
    await product.save({
      context: { userId: req.user?.id || 1, reason: req.body.reason || 'Product disabled via API' }
    })
    res.status(200).json({ message: 'Product disabled successfully' });
  } catch (error) {
    console.error(`cannot disable product with error ${error}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProductById,
  deleteProductById,
  updateProductCountById,
  updateProductCountAll,
  disableProductById,
  getAllActiveProducts,
  getProductAudit: async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`Fetching audit records for product ID: ${id}`);

      const auditRecords = await productAudit.findAll({
        where: { productId: id },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'cus_name', 'cus_email']
          }
        ],
        order: [['auditDate', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: auditRecords
      });
    } catch (error) {
      logger.error('Error fetching product audit:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      });
    }
  }
};


