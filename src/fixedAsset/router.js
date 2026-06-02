const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api').jwtApi;

// Require JWT Authentication for all Fixed Asset actions
router.use(validateToken);

// ==========================================
// 1. FIXED ASSET PRODUCT (Blueprints)
// ==========================================
router.post('/products', controller.createProduct);
router.get('/products', controller.listProducts);

// ==========================================
// 2. FIXED ASSET CONTRACT (Instances)
// ==========================================
router.post('/contracts', controller.createContract);
router.get('/contracts', controller.listContracts);
router.get('/contracts/:id', controller.getContractDetails);
router.post('/contracts/:id/dispose', controller.disposeContract);

// ==========================================
// 3. DEPRECIATION OPERATIONS
// ==========================================
router.get('/depreciation/preview', controller.getDepreciationPreview);
router.post('/depreciation/post', controller.runDepreciation);

module.exports = router;
