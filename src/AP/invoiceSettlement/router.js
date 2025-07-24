// ===============================================================
// AP SETTLEMENT ROUTES
// File: /routes/settlement.js (or /AP/settlement/routes.js)
// ===============================================================
const express = require('express');
const router = express.Router();
const APSettlementController = require('./controller'); // Adjust path as needed

// Optional: Add authentication middleware
// const authMiddleware = require('../middleware/auth');
// router.use(authMiddleware);

// ===============================================================
// BASIC CRUD OPERATIONS
// ===============================================================

// GET /api/settlements - Get all settlements with pagination and filters
router.get('/', APSettlementController.getAllSettlements);

// GET /api/settlements/:id - Get settlement by ID with full details
router.get('/:id', APSettlementController.getSettlementById);

// POST /api/settlements - Create new settlement
router.post('/', APSettlementController.createSettlement);

// PUT /api/settlements/:id - Update existing settlement
router.put('/:id', APSettlementController.updateSettlement);

// DELETE /api/settlements/:id - Delete settlement
router.delete('/:id', APSettlementController.deleteSettlement);

// ===============================================================
// WORKFLOW OPERATIONS
// ===============================================================

// POST /api/settlements/:id/approve - Approve settlement
router.post('/:id/approve', APSettlementController.approveSettlement);

// POST /api/settlements/:id/complete - Complete settlement
router.post('/:id/complete', APSettlementController.completeSettlement);

// ===============================================================
// UTILITY ENDPOINTS
// ===============================================================

// GET /api/settlements/utils/generate-number - Generate new settlement number
router.get('/utils/generate-number', APSettlementController.generateSettlementNumber);

// GET /api/settlements/invoices/outstanding - Get outstanding invoices for settlement
router.get('/invoices/outstanding', APSettlementController.getOutstandingInvoices);

module.exports = router;