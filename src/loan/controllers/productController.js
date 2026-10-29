const productService = require('../services/productService');
const paramService = require('../services/paramService');
const { handle, respond } = require('../errors');
const { ctxOf } = require('./paramController');

// Product reads include their children; all writes go through the maker-checker service.
const productController = {
  getProducts: handle(req => productService.getProducts(req.query)),
  getProductById: handle(req => productService.getProductById(req.params.id)),
  createProduct: handle(async req => respond(await paramService.create('product', req.body, ctxOf(req)), 'Product created; pending authorization', 201)),
  updateProduct: handle(req => paramService.update('product', req.params.id, req.body, ctxOf(req))),
  cloneProduct: handle(async req => respond(await paramService.cloneProduct(req.params.id, req.body, ctxOf(req)), 'Product cloned; pending authorization', 201))
};

module.exports = productController;
