// ===============================================================
// AR RECEIVE HEADER ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const ReceiveHeaderController = require('./controller');

// ROUTES
// GET /api/receive-headers - Get all receive headers with pagination and filtering
router.get('/', ReceiveHeaderController.findAll);

// GET /api/receive-headers/search - Search receive headers
router.get('/search', ReceiveHeaderController.search);

// GET /api/receive-headers/statistics - Get receive header statistics
router.get('/statistics', ReceiveHeaderController.getStatistics);

// GET /api/receive-headers/by-invoice/:invoiceHeaderId - Get receipts by invoice header ID
router.get('/by-invoice/:invoiceHeaderId', ReceiveHeaderController.findByInvoiceHeader);

// GET /api/receive-headers/:id - Get single receive header by ID
router.get('/:id', ReceiveHeaderController.findById);

// POST /api/receive-headers - Create new receive header
router.post('/', ReceiveHeaderController.create);

// PUT /api/receive-headers/:id - Update receive header
router.put('/:id', ReceiveHeaderController.update);

// DELETE /api/receive-headers/:id - Delete receive header
router.delete('/:id', ReceiveHeaderController.delete);

module.exports = router;

// Usage example in your main app file:
/*
const receiveHeaderRoutes = require('./routes/receiveHeaderRoutes');

// Use the routes
app.use('/api/receive-headers', receiveHeaderRoutes);
*/