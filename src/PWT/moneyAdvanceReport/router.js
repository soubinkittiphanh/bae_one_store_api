const express = require('express');
const router = express.Router();
const { validateToken } = require('../../api').jwtApi;
const MoneyAdvanceController = require('./controller');

// Apply authentication middleware
router.use(validateToken);

// Routes - Order matters! Specific routes first, then parameterized routes

// GET routes - Specific endpoints first
router.get('/available-for-settlement', MoneyAdvanceController.getAvailableForSettlement);
router.get('/balance-report', MoneyAdvanceController.getBalanceReport);
router.get('/bank-account-balance-report', MoneyAdvanceController.getBankAccountBalanceReport);
router.get('/validate-balance-continuity', MoneyAdvanceController.validateBalanceContinuity);
router.get('/', MoneyAdvanceController.getAll);

// Parameterized routes - Must come after specific routes
router.get('/:id', MoneyAdvanceController.getById);
router.get('/:id/settlements', MoneyAdvanceController.getSettlements);

// POST routes
router.post('/', MoneyAdvanceController.create);

// PUT routes  
router.put('/:id', MoneyAdvanceController.update);
router.put('/:id/approve', MoneyAdvanceController.approve);

// DELETE routes
router.delete('/:id', MoneyAdvanceController.delete);

module.exports = router;