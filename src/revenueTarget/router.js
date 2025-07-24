const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  getAllRevenueTargets,
  getRevenueTargetById,
  createRevenueTarget,
  updateRevenueTargetById,
  deleteRevenueTargetById,
  getRevenueTargetsByYear,
  softDeleteRevenueTargetById,
  restoreRevenueTargetById,
  searchRevenueTargets,
} = require('./controller');

// Validation middleware
const validateRevenueTarget = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  
  body('year')
    .isInt({ min: 2020, max: 2100 })
    .withMessage('Year must be between 2020 and 2100'),
  
  body('targetAmount')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Target amount must be a valid decimal number')
    .custom((value) => {
      if (parseFloat(value) < 0) {
        throw new Error('Target amount must be greater than or equal to 0');
      }
      return true;
    }),
  
  body('exchangeRate')
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Exchange rate must be a valid decimal number')
    .custom((value) => {
      if (parseFloat(value) < 1) {
        throw new Error('Exchange rate must be greater than or equal to 1');
      }
      return true;
    }),
  
  body('currencyId')
    .isInt({ min: 1 })
    .withMessage('Currency ID must be a valid integer'),
  
  body('remark')
    .optional()
    .isString()
    .withMessage('Remark must be a string'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const validateUpdateRevenueTarget = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2100 })
    .withMessage('Year must be between 2020 and 2100'),
  
  body('targetAmount')
    .optional()
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Target amount must be a valid decimal number')
    .custom((value) => {
      if (value !== undefined && parseFloat(value) < 0) {
        throw new Error('Target amount must be greater than or equal to 0');
      }
      return true;
    }),
  
  body('exchangeRate')
    .optional()
    .isDecimal({ decimal_digits: '0,2' })
    .withMessage('Exchange rate must be a valid decimal number')
    .custom((value) => {
      if (value !== undefined && parseFloat(value) < 1) {
        throw new Error('Exchange rate must be greater than or equal to 1');
      }
      return true;
    }),
  
  body('currencyId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Currency ID must be a valid integer'),
  
  body('remark')
    .optional()
    .isString()
    .withMessage('Remark must be a string'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a valid positive integer')
];

const validateYear = [
  param('year')
    .isInt({ min: 2020, max: 2100 })
    .withMessage('Year must be between 2020 and 2100')
];

// Routes
// GET /api/revenue-targets - Get all revenue targets
router.get('/', getAllRevenueTargets);

// GET /api/revenue-targets/search - Search revenue targets
router.get('/search', searchRevenueTargets);

// GET /api/revenue-targets/year/:year - Get revenue targets by year
router.get('/year/:year', validateYear, getRevenueTargetsByYear);

// GET /api/revenue-targets/:id - Get revenue target by ID
router.get('/:id', validateId, getRevenueTargetById);

// POST /api/revenue-targets - Create new revenue target
router.post('/', validateRevenueTarget, createRevenueTarget);

// PUT /api/revenue-targets/:id - Update revenue target by ID
router.put('/:id', validateId, validateUpdateRevenueTarget, updateRevenueTargetById);

// DELETE /api/revenue-targets/:id - Delete revenue target by ID (hard delete)
router.delete('/:id', validateId, deleteRevenueTargetById);

// PATCH /api/revenue-targets/:id/deactivate - Soft delete revenue target
router.patch('/:id/deactivate', validateId, softDeleteRevenueTargetById);

// PATCH /api/revenue-targets/:id/restore - Restore soft-deleted revenue target
router.patch('/:id/restore', validateId, restoreRevenueTargetById);

module.exports = router;