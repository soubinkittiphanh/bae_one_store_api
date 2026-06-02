// ===============================================================
// INVOICE MIDDLEWARE & VALIDATION
// ===============================================================
const { body, param, query, validationResult } = require('express-validator');

// AUTHENTICATION MIDDLEWARE (Example - adapt to your auth system)
const authenticate = (req, res, next) => {
  // Replace this with your actual authentication logic
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  try {
    // Verify token and attach user to request
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.user = decoded;
    
    // For demo purposes, setting a mock user
    req.user = { id: 1, username: 'demo_user' };
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// VALIDATION MIDDLEWARE
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }
  next();
};

// VALIDATION RULES
const validateCreateInvoice = [
  body('invoiceNumber')
    .notEmpty()
    .withMessage('Invoice number is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number must be between 1 and 50 characters'),
  
  body('invoiceDate')
    .isISO8601()
    .withMessage('Invoice date must be a valid date (YYYY-MM-DD)'),
  
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date (YYYY-MM-DD)'),
  
  body('customerId')
    .isInt({ min: 1 })
    .withMessage('Customer ID must be a positive integer'),
  
  body('currencyId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Currency ID must be a positive integer'),
  
  body('exchangeRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Exchange rate must be a positive number'),
  
  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  
  body('taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax amount must be a positive number'),
  
  body('netAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Net amount must be a positive number'),
  
  body('status')
    .optional()
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),

  handleValidationErrors
];

const validateUpdateInvoice = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invoice ID must be a positive integer'),
  
  body('invoiceNumber')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number must be between 1 and 50 characters'),
  
  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid date (YYYY-MM-DD)'),
  
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date (YYYY-MM-DD)'),
  
  body('customerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Customer ID must be a positive integer'),
  
  body('currencyId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Currency ID must be a positive integer'),
  
  body('exchangeRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Exchange rate must be a positive number'),
  
  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  
  body('taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax amount must be a positive number'),
  
  body('netAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Net amount must be a positive number'),
  
  body('status')
    .optional()
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),

  handleValidationErrors
];

const validateUpdateStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invoice ID must be a positive integer'),
  
  body('status')
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),

  handleValidationErrors
];

const validateGetInvoice = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invoice ID must be a positive integer'),

  handleValidationErrors
];

const validateQueryParams = [
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
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),
  
  query('customerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Customer ID must be a positive integer'),
  
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Date from must be a valid date (YYYY-MM-DD)'),
  
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Date to must be a valid date (YYYY-MM-DD)'),
  
  query('sortBy')
    .optional()
    .isIn(['invoiceNumber', 'invoiceDate', 'dueDate', 'totalAmount', 'status'])
    .withMessage('Sort by must be one of: invoiceNumber, invoiceDate, dueDate, totalAmount, status'),
  
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC'),

  handleValidationErrors
];

// AUTHORIZATION MIDDLEWARE (Example)
const authorizeInvoiceAccess = async (req, res, next) => {
  try {
    // Add your authorization logic here
    // For example, check if user has permission to access invoices
    // You might check user roles, company access, etc.
    
    const userRole = req.user.role; // Assuming role is in user object
    const allowedRoles = ['admin', 'accountant', 'manager'];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to access invoices'
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking authorization',
      error: error.message
    });
  }
};

module.exports = {
  authenticate,
  authorizeInvoiceAccess,
  validateCreateInvoice,
  validateUpdateInvoice,
  validateUpdateStatus,
  validateGetInvoice,
  validateQueryParams,
  handleValidationErrors
};

// Updated routes example with middleware:
/*
const express = require('express');
const router = express.Router();
const {
  authenticate,
  authorizeInvoiceAccess,
  validateCreateInvoice,
  validateUpdateInvoice,
  validateUpdateStatus,
  validateGetInvoice,
  validateQueryParams
} = require('../middleware/invoiceMiddleware');

// Apply authentication and authorization to all routes
router.use(authenticate);
router.use(authorizeInvoiceAccess);

// Routes with validation
router.get('/', validateQueryParams, invoiceController.getAllInvoices);
router.get('/summary', validateQueryParams, invoiceController.getInvoiceSummary);
router.get('/:id', validateGetInvoice, invoiceController.getInvoiceById);
router.post('/', validateCreateInvoice, invoiceController.createInvoice);
router.put('/:id', validateUpdateInvoice, invoiceController.updateInvoice);
router.patch('/:id/status', validateUpdateStatus, invoiceController.updateInvoiceStatus);
router.delete('/:id', validateGetInvoice, invoiceController.deleteInvoice);
*/