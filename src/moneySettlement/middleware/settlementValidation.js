const { body, param, query, validationResult } = require('express-validator');

const validate = {
  // Validation for creating settlements
  createSettlement: [
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
    
    body('glId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('GLId must be a valid integer'),
    
    // Custom validation: bank account required for bank transfers
    body('bankAccountId').custom((value, { req }) => {
      if (req.body.method === 'bank_transfer' && !value) {
        throw new Error('Bank account is required for bank transfer settlements');
      }
      return true;
    }),

    // Middleware to handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for updating settlements
  updateSettlement: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Settlement ID must be a valid integer'),
    
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
    
    body('glId')
      .optional()
      .custom((value) => {
        if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
          throw new Error('GLId must be a valid integer or null');
        }
        return true;
      }),

    // Middleware to handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for ID parameters
  validateId: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('ID must be a valid integer'),
    
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ID parameter',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for money advance ID parameter
  validateAdvanceId: [
    param('moneyAdvanceId')
      .isInt({ min: 1 })
      .withMessage('Money Advance ID must be a valid integer'),
    
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Money Advance ID parameter',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for bank account ID parameter
  validateBankAccountId: [
    param('bankAccountId')
      .isInt({ min: 1 })
      .withMessage('Bank Account ID must be a valid integer'),
    
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Bank Account ID parameter',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for ministry ID parameter
  validateMinistryId: [
    param('ministryId')
      .isInt({ min: 1 })
      .withMessage('Ministry ID must be a valid integer'),
    
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Ministry ID parameter',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for GL ID parameter
  validateGLId: [
    param('glId')
      .isInt({ min: 1 })
      .withMessage('GL ID must be a valid integer'),
    
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid GL ID parameter',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for query parameters
  validateQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    query('method')
      .optional()
      .isIn(['cash', 'bank_transfer', 'deduction'])
      .withMessage('Method must be one of: cash, bank_transfer, deduction'),
    
    query('userId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('UserId must be a valid integer'),
    
    query('moneyAdvanceId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('MoneyAdvanceId must be a valid integer'),
    
    query('bankAccountId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('BankAccountId must be a valid integer'),
    
    query('ministryId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('MinistryId must be a valid integer'),
    
    query('glId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('GLId must be a valid integer'),
    
    query('hasMoneyAdvance')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('hasMoneyAdvance must be either true or false'),

    // Middleware to handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: errors.array()
        });
      }
      next();
    }
  ],

  // Validation for date range queries (analytics)
  validateDateRange: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),

    // Custom validation: end date should be after start date
    query('endDate').custom((endDate, { req }) => {
      if (endDate && req.query.startDate) {
        const start = new Date(req.query.startDate);
        const end = new Date(endDate);
        if (end <= start) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),

    // Middleware to handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range parameters',
          errors: errors.array()
        });
      }
      next();
    }
  ]
};

module.exports = validate;