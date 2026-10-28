const { body, query, param, validationResult } = require('express-validator');
const db = require('../models');

// Helper to handle and format express-validator errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.param || e.path, message: e.msg }))
    });
  }
  next();
};

// Role Check Middleware: Admin vs Attendant
const checkRole = (allowedRoles = ['admin']) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const user = await db.user.findByPk(req.user.id, {
        include: [{ model: db.role, as: 'role' }]
      });

      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      // Group 1 or level >= 100 or role name = admin
      const isSuperAdmin = user.groupId === 1 || (user.role && user.role.level >= 100);
      const roleName = user.role ? user.role.name.toLowerCase() : (user.groupId === 1 ? 'admin' : 'staff');

      if (isSuperAdmin || allowedRoles.includes(roleName) || allowedRoles.includes('*')) {
        req.currentUser = user;
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient permissions for this parking administrative action.'
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};

const validateEntry = [
  body('plateNumber')
    .trim()
    .notEmpty()
    .withMessage('Plate number is required (ກະລຸນາປ້ອນເລກທະບຽນລົດ)'),
  body('vehicleType')
    .optional()
    .isIn(['car', 'motorbike', 'vip', 'disabled', 'truck'])
    .withMessage('Invalid vehicle type'),
  body('zoneId')
    .optional({ nullable: true })
    .isInt()
    .withMessage('zoneId must be an integer'),
  body('slotId')
    .optional({ nullable: true })
    .isInt()
    .withMessage('slotId must be an integer'),
  handleValidationErrors
];

const validateCalculateFee = [
  body().custom((value, { req }) => {
    if (!req.body.ticketId && !req.body.ticketNumber && !req.body.barcode && !req.body.plateNumber && !req.body.identifier && !req.body.query) {
      throw new Error('At least one identifier (ticketId, ticketNumber, barcode, plateNumber, or query) must be provided.');
    }
    return true;
  }),
  handleValidationErrors
];

const validatePay = [
  body('ticketId')
    .isInt()
    .withMessage('Valid ticketId is required'),
  body('paymentMethod')
    .optional()
    .isIn(['CASH', 'TRANSFER', 'QR', 'CARD', 'FREE_PASS'])
    .withMessage('Invalid payment method'),
  body('amount')
    .optional()
    .isNumeric()
    .withMessage('Amount must be a numeric value'),
  handleValidationErrors
];

const validateZone = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Zone code is required (e.g. ZONE-A)'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Zone name is required'),
  handleValidationErrors
];

const validateSlot = [
  body('zoneId')
    .isInt()
    .withMessage('Valid zoneId is required'),
  body('slotNumber')
    .trim()
    .notEmpty()
    .withMessage('Slot number is required (e.g. A-01)'),
  body('slotType')
    .optional()
    .isIn(['car', 'motorbike', 'vip', 'disabled', 'truck'])
    .withMessage('Invalid slot type'),
  handleValidationErrors
];

const validatePricingRule = [
  body('vehicleType')
    .isIn(['car', 'motorbike', 'vip', 'disabled', 'truck'])
    .withMessage('Invalid vehicle type'),
  body('dayHourlyRate')
    .isNumeric()
    .withMessage('Day hourly rate must be a valid number'),
  body('nightHourlyRate')
    .isNumeric()
    .withMessage('Night hourly rate must be a valid number'),
  handleValidationErrors
];

const validateMonthlyPass = [
  body('plateNumber')
    .trim()
    .notEmpty()
    .withMessage('Plate number is required'),
  body('customerName')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required'),
  body('startDate')
    .isISO8601()
    .withMessage('Valid start date (YYYY-MM-DD) is required'),
  body('endDate')
    .isISO8601()
    .withMessage('Valid end date (YYYY-MM-DD) is required'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  checkRole,
  validateEntry,
  validateCalculateFee,
  validatePay,
  validateZone,
  validateSlot,
  validatePricingRule,
  validateMonthlyPass
};
