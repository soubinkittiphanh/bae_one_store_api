// ===============================================================
// AR INVOICE HEADER ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const InvoiceHeaderController = require('./controller');

// ROUTES
// GET /api/invoices - Get all invoices with pagination and filtering
router.get('/', InvoiceHeaderController.findAll);

router.get('/sequence', InvoiceHeaderController.getNextInvoiceNumber);
// GET /api/invoices/search - Search invoices
router.get('/search', InvoiceHeaderController.search);

// GET /api/invoices/statistics - Get invoice statistics
router.get('/statistics', InvoiceHeaderController.getStatistics);

// GET /api/invoices/:id - Get single invoice by ID
router.get('/:id', InvoiceHeaderController.findById);
router.get('/audit/:id', InvoiceHeaderController.findAuditByHeaderId);

const { uploadFiles } = require('../../../middleware/multerConfig');

// POST /api/invoices - Create new invoice
router.post('/', uploadFiles, InvoiceHeaderController.create);

// PUT /api/invoices/:id - Update invoice
router.put('/:id', uploadFiles, InvoiceHeaderController.update);

// PATCH /api/invoices/:id/status - Update invoice status only
router.patch('/:id/status', InvoiceHeaderController.updateStatus);

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', InvoiceHeaderController.delete);

module.exports = router;

// Usage example in your main app file:
/*
const invoiceRoutes = require('./routes/invoiceRoutes');

// Use the routes
app.use('/api/invoices', invoiceRoutes);
*/