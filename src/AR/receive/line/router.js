// ===============================================================
// AR RECEIVE LINE ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const ReceiveLineController = require('./controller');

// ROUTES
// GET /api/receive-lines - Get all receive lines with pagination and filtering
router.get('/', ReceiveLineController.findAll);

// GET /api/receive-lines/search - Search receive lines
router.get('/search', ReceiveLineController.search);

// GET /api/receive-lines/statistics - Get receive line statistics
router.get('/statistics', ReceiveLineController.getStatistics);

// GET /api/receive-lines/by-header/:receiveHeaderId - Get lines by receive header ID
router.get('/by-header/:receiveHeaderId', ReceiveLineController.findByReceiveHeader);

// GET /api/receive-lines/by-invoice-line/:invoiceLineId - Get lines by invoice line ID
router.get('/by-invoice-line/:invoiceLineId', ReceiveLineController.findByInvoiceLine);

// GET /api/receive-lines/:id - Get single receive line by ID
router.get('/:id', ReceiveLineController.findById);

// POST /api/receive-lines - Create new receive line
router.post('/', ReceiveLineController.create);

// PUT /api/receive-lines/:id - Update receive line
router.put('/:id', ReceiveLineController.update);

// DELETE /api/receive-lines/:id - Delete receive line
router.delete('/:id', ReceiveLineController.delete);

module.exports = router;

// Usage example in your main app file:
/*
const receiveLineRoutes = require('./routes/receiveLineRoutes');

// Use the routes
app.use('/api/receive-lines', receiveLineRoutes);
*/