const express = require('express');
const router = express.Router();
const ProductTempController = require('./controller'); // Adjust path as needed

// Create a new product template
router.post('/', ProductTempController.createProductTemp);

// Get all product templates
router.get('/', ProductTempController.getAllProductTemps);

// Get product template statistics
router.get('/stats', ProductTempController.getProductTempStats);

// Get product template by barcode
router.get('/barcode/:barcode', ProductTempController.getProductTempByBarcode);

// Get product template by ID
router.get('/:id', ProductTempController.getProductTempById);

// Update product template
router.put('/:id', ProductTempController.updateProductTemp);

// Restore deactivated product template
router.post('/:id/restore', ProductTempController.restoreProductTemp);

// Delete product template
router.delete('/:id', ProductTempController.deleteProductTemp);

// Bulk operations for product templates
router.post('/bulk', ProductTempController.bulkOperations);

// *** NEW ROUTE *** - Bulk update prices
router.patch('/bulk-update-prices', ProductTempController.bulkUpdatePrices);

module.exports = router;