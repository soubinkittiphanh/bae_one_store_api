const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');

// Apply token validation
router.use(validateToken);

// 1. Product Packaging (BOM) routes
router.get('/assets', controller.getPackagingAssets);
router.get('/product/:productId', controller.getProductPackaging);
router.post('/product/:productId', controller.saveProductPackaging);

// 2. Customer Packaging (Wholesale & Retail Debt) routes
router.get('/customer/summary', controller.getCustomerPackagingBalance);
router.get('/customer/balance/:clientId', controller.getCustomerPackagingBalance);
router.get('/customer/ledger', controller.getCustomerPackagingLedger);
router.get('/customer/ledger/:clientId', controller.getCustomerPackagingLedger);
router.post('/customer/return', controller.processWholesaleEmptiesReturn);

// 3. Supplier Packaging (Beerlao Factory) routes
router.get('/supplier/balance/:vendorId', controller.getSupplierPackagingBalance);
router.post('/supplier/truck-return', controller.processTruckEmptiesReturn);

// 4. POS Retail Returns & Deposit routes
router.post('/pos/return', controller.processPOSReturn);
router.post('/pos/sale', controller.processPOSSale);
router.post('/movement', controller.processPOSSale);

// 5. Breakage & Damage Logging routes
router.post('/damage', controller.recordDamageLog);
router.get('/damage', controller.getDamageLogs);

// 6. Master Packaging Matrix route
router.get('/matrix', controller.getMasterPackagingMatrix);

module.exports = router;
