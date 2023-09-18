
const Product = require('../models').product;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { literal, Op } = require('sequelize');


// Get all products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: ['costCurrency', 'saleCurrency'],
    });
    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single product by ID
const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findOne({ include: ['costCurrency', 'saleCurrency'], where: { id } });
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
  let { pro_id, pro_name, pro_price, pro_desc, pro_status,
    pro_image_path, retail_cost_percent, cost_price,
    stock_count, locking_session_id, isActive, minStock, barCode, saleCurrencyId, costCurrencyId } = req.body;
  locking_session_id = Date.now()
  try {
    const newProduct = await Product.create({
      pro_id,
      pro_name,
      pro_price,
      pro_desc,
      pro_status,
      pro_image_path,
      retail_cost_percent,
      cost_price,
      stock_count,
      locking_session_id,
      minStock,
      isActive,
      barCode, saleCurrencyId, costCurrencyId
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
  const { pro_id, pro_name, pro_price, pro_desc, pro_status,
    pro_image_path, retail_cost_percent, cost_price, stock_count,
    isActive, minStock, barCode, saleCurrencyId, costCurrencyId } = req.body;
  try {
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await Product.update(
      {
        pro_id,
        pro_name,
        pro_price,
        pro_desc,
        pro_status,
        pro_image_path,
        retail_cost_percent,
        cost_price,
        stock_count,
        locking_session_id,
        minStock,
        isActive,
        barCode, saleCurrencyId, costCurrencyId
      },
      { where: { id } }
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
    await Product.destroy({ where: { id } });
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
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
  updateProductCountAll
};


