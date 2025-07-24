const controller = require("./controller")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
const { body, param, query } = require('express-validator');
router.use(validateToken);
const MoneyAdvanceController = require('./controller');

// Validation middleware
const validateCreate = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('makerId')
    .isInt({ min: 1 })
    .withMessage('Valid makerId is required'),
  body('currencyId')
    .isInt({ min: 1 })
    .withMessage('Valid currencyId is required'),
  body('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required when provided'),
  body('bankAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid bankAccountId is required when provided'),
  body('purpose')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Purpose must not exceed 255 characters'),
  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note must not exceed 500 characters'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  // 🆕 ADD: Optional reason field for audit trail
  body('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
];

const validateUpdate = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  body('amount')
    .optional()
    .isNumeric()
    .withMessage('Amount must be a number')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required when provided'),
  body('bankAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid bankAccountId is required when provided'),
  body('purpose')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Purpose must not exceed 255 characters'),
  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note must not exceed 500 characters'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  // 🆕 ADD: Optional reason field for audit trail
  body('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
];

const validateApprove = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  body('checkerId')
    .isInt({ min: 1 })
    .withMessage('Valid checkerId is required'),
  // 🆕 ADD: Optional reason field for audit trail
  body('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
];

const validateParams = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required')
];

const validateQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'settled'])
    .withMessage('Status must be pending, approved, or settled'),
  query('makerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid makerId is required when provided'),
  query('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required when provided')
];

// Report validation middleware
const validateReportQuery = [
  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('From date must be a valid date'),
  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('To date must be a valid date'),
  query('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required when provided'),
  query('currencyId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid currencyId is required when provided'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'settled'])
    .withMessage('Status must be pending, approved, or settled'),
  query('makerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid makerId is required when provided')
];

const validateBankAccountSummaryQuery = [
  query('reportMonth')
    .notEmpty()
    .withMessage('Report month is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Report month must be in YYYY-MM format'),
  query('bankAccountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid bankAccountId is required when provided')
];

const validateBankAccountDetailsQuery = [
  query('reportMonth')
    .notEmpty()
    .withMessage('Report month is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Report month must be in YYYY-MM format'),
  query('bankAccountId')
    .isInt({ min: 1 })
    .withMessage('Valid bankAccountId is required'),
  query('currencyId')
    .isInt({ min: 1 })
    .withMessage('Valid currencyId is required')
];

const validateMinistrySummaryQuery = [
  query('reportMonth')
    .notEmpty()
    .withMessage('Report month is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Report month must be in YYYY-MM format'),
  query('ministryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required when provided')
];

const validateMinistryDetailsQuery = [
  query('reportMonth')
    .notEmpty()
    .withMessage('Report month is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Report month must be in YYYY-MM format'),
  query('ministryId')
    .isInt({ min: 1 })
    .withMessage('Valid ministryId is required'),
  query('currencyId')
    .isInt({ min: 1 })
    .withMessage('Valid currencyId is required')
];

// 🆕 NEW: Audit validation middleware
const validateAuditQuery = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer')
];

const validateUserAuditQuery = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('Valid userId is required'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer')
];

const validateDateRangeAuditQuery = [
  query('startDate')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  query('endDate')
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('End date must be a valid date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Limit must be between 1 and 500'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer')
];

const validateDeleteWithReason = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  body('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
];

const validateSettleWithReason = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  body('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason must not exceed 255 characters')
];

// ============ ROUTES ============
// IMPORTANT: Order matters! Specific routes must come before parameterized routes

// GET routes - Specific endpoints first
router.get('/', validateQuery, MoneyAdvanceController.getAll);
router.get('/dashboard', validateQuery, MoneyAdvanceController.getDashboard);
router.get('/by-ministry', validateQuery, MoneyAdvanceController.getByMinistry);
router.get('/by-booking-date', validateQuery, MoneyAdvanceController.getByBookingDate);
router.get('/summary-by-date', validateQuery, MoneyAdvanceController.getSummaryByDate);

// Report routes
router.get('/report', validateReportQuery, MoneyAdvanceController.getReport);
router.get('/report/export', validateReportQuery, MoneyAdvanceController.exportReport);

// Ministry Summary Report routes
router.get('/ministry-summary', validateMinistrySummaryQuery, MoneyAdvanceController.getMinistrySummary);
router.get('/ministry-summary/export', validateMinistrySummaryQuery, MoneyAdvanceController.exportMinistrySummary);
router.get('/ministry-details', validateMinistryDetailsQuery, MoneyAdvanceController.getMinistryDetails);

// Bank Account Summary Report routes
router.get('/bank-account-summary', validateBankAccountSummaryQuery, MoneyAdvanceController.getBankAccountSummary);
router.get('/bank-account-summary/export', validateBankAccountSummaryQuery, MoneyAdvanceController.exportBankAccountSummary);
router.get('/bank-account-details', validateBankAccountDetailsQuery, MoneyAdvanceController.getBankAccountDetails);

// 🆕 NEW: Audit routes - MUST come before parameterized routes
router.get('/audit/user/:userId', validateUserAuditQuery, MoneyAdvanceController.getUserAuditTrail);
router.get('/audit/date-range', validateDateRangeAuditQuery, MoneyAdvanceController.getAuditByDateRange);

// Parameterized routes - These must come AFTER specific routes
router.get('/:id', validateParams, MoneyAdvanceController.getById);
router.get('/:id/settlements', validateParams, MoneyAdvanceController.getSettlements);
// 🆕 NEW: Individual record audit trail
router.get('/:id/audit', validateParams, validateAuditQuery, MoneyAdvanceController.getAuditTrail);

// POST routes
router.post('/', validateCreate, MoneyAdvanceController.create);

// PUT routes
router.put('/:id', validateUpdate, MoneyAdvanceController.update);
router.put('/:id/approve', validateApprove, MoneyAdvanceController.approve);
router.put('/:id/settle', validateSettleWithReason, MoneyAdvanceController.settle);

// DELETE routes
router.delete('/:id', validateDeleteWithReason, MoneyAdvanceController.delete);

module.exports = router;