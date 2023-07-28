
const { body, param } = require('express-validator');

exports.createQuotationHeaderValidator = [
  body('bookingDate').notEmpty().withMessage('Booking date is required').isDate().withMessage('Booking date must be a valid date'),
  body('remark').optional().isString().withMessage('Remark must be a string').isLength({ max: 100 }).withMessage('Remark must be no more than 100 characters long'),
  body('discount').isNumeric().withMessage('Discount must be a number'),
  body('total').isNumeric().withMessage('Total must be a number'),
  body('exchangeRate').isNumeric().withMessage('Exchange rate must be a number'),
  body('isActive').isBoolean().withMessage('Is active must be a boolean'),
];

exports.updateQuotationHeaderValidator = [
  param('id').notEmpty().withMessage('ID is required').isNumeric().withMessage('ID must be a number'),
  body('bookingDate').optional().isDate().withMessage('Booking date must be a valid date'),
  body('remark').optional().isString().withMessage('Remark must be a string').isLength({ max: 100 }).withMessage('Remark must be no more than 100 characters long'),
  body('discount').optional().isNumeric().withMessage('Discount must be a number'),
  body('total').optional().isNumeric().withMessage('Total must be a number'),
  body('exchangeRate').optional().isNumeric().withMessage('Exchange rate must be a number'),
  body('isActive').optional().isBoolean().withMessage('Is active must be a boolean'),
];
