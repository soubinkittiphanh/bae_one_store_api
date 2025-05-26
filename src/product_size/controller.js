
const ProductSize = require('../models').product;
const WebGroup = require('../models').webProductGroup;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { literal, Op } = require('sequelize');

// controllers/productSizeController.js
exports.create = async (req, res) => {
  try {
    const { productId, sizeName, price } = req.body;
    const productSize = await ProductSize.create({ productId, sizeName, price });
    res.status(201).json(productSize);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product size', details: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const sizes = await ProductSize.findAll();
    res.json(sizes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product sizes' });
  }
};

exports.getByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const sizes = await ProductSize.findAll({ where: { productId } });
    res.json(sizes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sizes for product' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { sizeName, price } = req.body;

    const size = await ProductSize.findByPk(id);
    if (!size) return res.status(404).json({ error: 'Product size not found' });

    size.sizeName = sizeName;
    size.price = price;
    await size.save();

    res.json(size);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product size' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ProductSize.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'Product size not found' });

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product size' });
  }
};



