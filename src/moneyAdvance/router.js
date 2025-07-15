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
    .withMessage('Due date must be a valid date')
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
    .withMessage('Due date must be a valid date')
];

const validateApprove = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  body('checkerId')
    .isInt({ min: 1 })
    .withMessage('Valid checkerId is required')
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

// GET routes
router.get('/', validateQuery, MoneyAdvanceController.getAll);
router.get('/dashboard', validateQuery, MoneyAdvanceController.getDashboard);
router.get('/by-ministry', validateQuery, MoneyAdvanceController.getByMinistry);
router.get('/:id', validateParams, MoneyAdvanceController.getById);

// POST routes
router.post('/', validateCreate, MoneyAdvanceController.create);

// PUT routes
router.put('/:id', validateUpdate, MoneyAdvanceController.update);
router.put('/:id/approve', validateApprove, MoneyAdvanceController.approve);
router.put('/:id/settle', validateParams, MoneyAdvanceController.settle);

// DELETE routes
router.delete('/:id', validateParams, MoneyAdvanceController.delete);

module.exports = router;