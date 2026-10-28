const productService = require('../services/productService');
const logger = require('../../api/logger');

const productController = {
  async getProducts(req, res) {
    try {
      const data = await productService.getProducts(req.query);
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching loan products:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async getProductById(req, res) {
    try {
      const { id } = req.params;
      const data = await productService.getProductById(id);
      return res.status(200).json({ status: true, data });
    } catch (err) {
      logger.error('Error fetching loan product by ID:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  async createProduct(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const data = await productService.createProduct(req.body, userId);
      return res.status(201).json({ status: true, message: 'Loan product created successfully', data });
    } catch (err) {
      logger.error('Error creating loan product:', err);
      return res.status(400).json({ status: false, message: err.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : null;
      const data = await productService.updateProduct(id, req.body, userId);
      return res.status(200).json({ status: true, message: 'Loan product updated successfully', data });
    } catch (err) {
      logger.error('Error updating loan product:', err);
      return res.status(400).json({ status: false, message: err.message });
    }
  },

  async cloneProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : null;
      const data = await productService.cloneProduct(id, req.body, userId);
      return res.status(201).json({ status: true, message: 'Loan product cloned successfully', data });
    } catch (err) {
      logger.error('Error cloning loan product:', err);
      return res.status(400).json({ status: false, message: err.message });
    }
  }
};

module.exports = productController;
