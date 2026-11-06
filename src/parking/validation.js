const { body, query, param, validationResult } = require('express-validator');
const db = require('../models');
const vehicleTypeService = require('./vehicleTypeService');

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
        include: db.group ? [{ model: db.group, as: 'userGroup', required: false }] : []
      });

      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      // Group 1, Group 12, or cus_name contains admin, or groupName contains admin
      const groupName = user.userGroup ? (user.userGroup.name || user.userGroup.group_name || '').toLowerCase() : '';
      const isSuperAdmin = user.groupId === 1 || 
                           user.groupId === 12 || 
                           (user.cus_name && user.cus_name.toLowerCase().includes('admin')) ||
                           groupName.includes('admin');
      const roleName = isSuperAdmin ? 'admin' : 'staff';

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

// Vehicle type codes come from the customer-maintained parking_vehicle_types table.
// Normalizes to lowercase and rejects unknown/inactive codes.
const vehicleTypeField = (field, { required = false } = {}) => {
  let chain = body(field);
  chain = required ? chain.exists({ checkNull: true }).withMessage(`${field} is required`).bail() : chain.optional({ nullable: true });
  return chain
    .customSanitizer(v => vehicleTypeService.normalizeCode(v))
    .custom(async v => {
      await vehicleTypeService.assertActiveCode(v);
      return true;
    });
};

const validateEntry = [
  body('plateNumber')
    .trim()
    .notEmpty()
    .withMessage('Plate number is required (ກະລຸນາປ້ອນເລກທະບຽນລົດ)'),
  vehicleTypeField('vehicleType'),
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
  vehicleTypeField('slotType'),
  handleValidationErrors
];

const validateSlotUpdate = [
  vehicleTypeField('slotType'),
  handleValidationErrors
];

const validatePricingRule = [
  vehicleTypeField('vehicleType', { required: true }),
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
  vehicleTypeField('vehicleType'),
  handleValidationErrors
];

const validateVehicleTypeCreate = [
  body('code')
    .customSanitizer(v => vehicleTypeService.normalizeCode(v))
    .matches(/^[a-z0-9_]{1,30}$/)
    .withMessage('Code must be 1-30 characters: lowercase letters, numbers or underscore (e.g. van, tuk_tuk)'),
  body('nameLa')
    .trim()
    .notEmpty()
    .withMessage('Lao name is required (ກະລຸນາປ້ອນຊື່ພາສາລາວ)'),
  body('sortOrder').optional({ nullable: true }).isInt().withMessage('sortOrder must be an integer'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true/false'),
  handleValidationErrors
];

const validateVehicleTypeUpdate = [
  body('nameLa')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Lao name cannot be empty (ກະລຸນາປ້ອນຊື່ພາສາລາວ)'),
  body('sortOrder').optional({ nullable: true }).isInt().withMessage('sortOrder must be an integer'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true/false'),
  handleValidationErrors
];

const validateVehicleTypeStatus = [
  body('isActive').isBoolean().withMessage('isActive (true/false) is required'),
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
  validateSlotUpdate,
  validatePricingRule,
  validateMonthlyPass,
  validateVehicleTypeCreate,
  validateVehicleTypeUpdate,
  validateVehicleTypeStatus
};
