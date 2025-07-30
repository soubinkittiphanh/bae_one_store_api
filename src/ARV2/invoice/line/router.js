// ===============================================================
// AR INVOICE LINE ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const InvoiceLineController = require('./controller');

// ROUTES
// GET /api/invoice-lines - Get all invoice lines with pagination and filtering
router.get('/', InvoiceLineController.findAll);

// GET /api/invoice-lines/search - Search invoice lines
router.get('/search', InvoiceLineController.search);

// GET /api/invoice-lines/statistics - Get invoice line statistics
router.get('/statistics', InvoiceLineController.getStatistics);

// GET /api/invoice-lines/by-header/:invoiceHeaderId - Get lines by invoice header ID
router.get('/by-header/:invoiceHeaderId', InvoiceLineController.findByInvoiceHeader);

// GET /api/invoice-lines/:id - Get single invoice line by ID
router.get('/:id', InvoiceLineController.findById);

// POST /api/invoice-lines - Create new invoice line
router.post('/', InvoiceLineController.create);

// PUT /api/invoice-lines/:id - Update invoice line
router.put('/:id', InvoiceLineController.update);

// DELETE /api/invoice-lines/:id - Delete invoice line
router.delete('/:id', InvoiceLineController.delete);

module.exports = router;

// Usage example in your main app file:
/*
const invoiceLineRoutes = require('./routes/invoiceLineRoutes');

// Use the routes
app.use('/api/invoice-lines', invoiceLineRoutes);
*/