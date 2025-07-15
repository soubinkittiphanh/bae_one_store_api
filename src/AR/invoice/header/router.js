const express = require('express');
const router = express.Router();
const arInvoiceController = require('./controller');

// Middleware imports (adjust based on your middleware structure)
const { authenticate } = require('../middleware/auth');
const { validateInvoice, validateInvoiceUpdate } = require('../middleware/validation');

// Apply authentication middleware to all routes
router.use(authenticate);

// GET routes
router.get('/', arInvoiceController.getAllInvoices);
router.get('/stats', arInvoiceController.getInvoiceStats);
router.get('/:id', arInvoiceController.getInvoiceById);

// POST routes
router.post('/', validateInvoice, arInvoiceController.createInvoice);

// PUT routes
router.put('/:id', validateInvoiceUpdate, arInvoiceController.updateInvoice);
router.put('/:id/status', arInvoiceController.updateInvoiceStatus);

// DELETE routes
router.delete('/:id', arInvoiceController.deleteInvoice);

module.exports = router;