const express = require("express");
const router = express.Router();
const { validateToken } = require('../api').jwtApi;
const { body } = require('express-validator');

// Import all controller modules
const SettlementController = require('./controller/SettlementController'); // Main CRUD controller
const SettlementSpecializedController = require('./controller/SettlementSpecializedController'); // Specialized queries
const SettlementDashboardController = require('./controller/SettlementDashboardController'); // Dashboard & analytics

// Apply token validation to all routes
router.use(validateToken);

// Validation middleware for creating settlements
const validateCreateSettlement = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('method')
    .isIn(['cash', 'bank_transfer', 'deduction'])
    .withMessage('Method must be one of: cash, bank_transfer, deduction'),
  
  body('userId')
    .isInt({ min: 1 })
    .withMessage('Valid userId is required'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  
  body('moneyAdvanceId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('MoneyAdvanceId must be a valid integer'),
  
  body('bankAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('BankAccountId must be a valid integer'),
  
  body('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('MinistryId must be a valid integer'),
  
  body('chartAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ChartAccountId must be a valid integer'),
  
  body('currencyId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('CurrencyId must be a valid integer'),
  
  body('exchangeRate')
    .optional()
    .isFloat({ min: 0.0001 })
    .withMessage('Exchange rate must be a positive number'),
  
  // Custom validation: bank account required for bank transfers
  body('bankAccountId').custom((value, { req }) => {
    if (req.body.method === 'bank_transfer' && !value) {
      throw new Error('Bank account is required for bank transfer settlements');
    }
    return true;
  })
];

// Validation middleware for updating settlements
const validateUpdateSettlement = [
  body('amount')
    .optional()
    .isNumeric()
    .withMessage('Amount must be a valid number')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('method')
    .optional()
    .isIn(['cash', 'bank_transfer', 'deduction'])
    .withMessage('Method must be one of: cash, bank_transfer, deduction'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  
  body('currencyId')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new Error('CurrencyId must be a valid integer or null');
      }
      return true;
    }),
  
  body('exchangeRate')
    .optional()
    .isFloat({ min: 0.0001 })
    .withMessage('Exchange rate must be a positive number'),
  
  body('moneyAdvanceId')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new Error('MoneyAdvanceId must be a valid integer or null');
      }
      return true;
    }),
  
  body('bankAccountId')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new Error('BankAccountId must be a valid integer or null');
      }
      return true;
    }),
  
  body('ministryId')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new Error('MinistryId must be a valid integer or null');
      }
      return true;
    }),
  
  body('chartAccountId')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new Error('ChartAccountId must be a valid integer or null');
      }
      return true;
    })
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// =============================================
// ROUTES DEFINITION
// =============================================

// Dashboard and Analytics routes (must come before general routes)
router.get('/dashboard', SettlementDashboardController.getDashboard);
router.get('/stats', SettlementDashboardController.getStats); // ← ADD THIS LINE
router.get('/currency-breakdown', SettlementDashboardController.getCurrencyBreakdown); // NEW ENDPOINT
router.get('/analytics/summary', SettlementDashboardController.getSummaryAnalytics);
router.get('/analytics/top-ministries', SettlementDashboardController.getTopMinistries);
router.get('/analytics/top-chart-accounts', SettlementDashboardController.getTopChartAccounts);

// Specialized query routes (must come before /:id route)
router.get('/by-advance/:moneyAdvanceId', SettlementSpecializedController.getByAdvanceId);
router.get('/by-bank-account/:bankAccountId', SettlementSpecializedController.getByBankAccountId);
router.get('/by-ministry/:ministryId', SettlementSpecializedController.getByMinistryId);
router.get('/by-chart-account/:chartAccountId', SettlementSpecializedController.getByChartAccountId);
router.get('/standalone', SettlementSpecializedController.getStandalone);

// Basic CRUD routes
router.get('/', SettlementController.getAll);
router.get('/:id', SettlementController.getById);

// POST routes with validation
router.post('/', validateCreateSettlement, handleValidationErrors, SettlementController.create);

// PUT routes with validation
router.put('/:id', validateUpdateSettlement, handleValidationErrors, SettlementController.update);

// DELETE routes
router.delete('/:id', SettlementController.delete);

module.exports = router;