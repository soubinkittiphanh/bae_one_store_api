const express = require('express');
const router = express.Router();
const { validateToken } = require('../api/jwtApi');

const taxProfileController = require('./controllers/taxProfileController');
const checklistController = require('./controllers/checklistController');
const productController = require('./controllers/productController');
const masterController = require('./controllers/masterController');

// All loan endpoints require valid authentication token
router.use(validateToken);

// --- Go-Live Checklist Routes ---
router.get('/checklist', checklistController.getChecklist);
router.post('/checklist/:itemKey/confirm', checklistController.confirmItem);

// --- Tax Profile & VAT Engine Routes ---
router.get('/tax-profile', taxProfileController.getTaxProfile);
router.put('/tax-profile', taxProfileController.updateTaxProfile);
router.post('/tax-profile/confirm', taxProfileController.confirmTaxProfile);
router.put('/components/:id/tax', taxProfileController.updateComponentTax);
router.get('/reports/vat', taxProfileController.getVatReport);

// --- Product Factory Routes ---
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProductById);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.post('/products/:id/clone', productController.cloneProduct);

// --- Master Data, Lookups & Rules Routes ---
router.get('/lookups', masterController.getLookups);
router.get('/udes', masterController.getUdes);
router.get('/components', masterController.getComponents);
router.get('/provision-rules', masterController.getProvisionRules);
router.put('/provision-rules/:id', masterController.updateProvisionRule);
router.get('/status-rules', masterController.getStatusRules);
router.get('/accounting-metadata', masterController.getAccountingMetadata);
router.get('/sequences', masterController.getSequences);
router.get('/holiday-calendars', masterController.getHolidayCalendars);

module.exports = router;
