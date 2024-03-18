
const { body } = require('express-validator');

const createReceiveHeaderValidation = [
  body('bookingDate').notEmpty().withMessage('Booking date is required').isDate().withMessage('Booking date must be a date'),
  body('receiveNumber').optional({ nullable: true }).isString(),
  body('notes').optional({ nullable: true }).isString(),
  body('payee').optional({ nullable: true }).isString(),
  body('paymentId').notEmpty().withMessage('Payment method is required'),
  body('currencyId').notEmpty().withMessage('Currency is required'),
  body('rate').notEmpty().withMessage('Rate is required').isNumeric().withMessage('Rate must be a number'),
  body('totalAmount').notEmpty().withMessage('Total amount is required'),
  body('drAccount').notEmpty().withMessage('DR account is required').isInt().withMessage('DR account must be an integer'),
  body('crAccount').notEmpty().withMessage('CR account is required').isInt().withMessage('CR account must be an integer'),
];

const updateReceiveHeaderValidation = [
  body('bookingDate').optional({ nullable: true }).isDate().withMessage('Booking date must be a date'),
  body('receiveNumber').optional({ nullable: true }).isString(),
  body('notes').optional({ nullable: true }).isString(),
  body('payee').optional({ nullable: true }).isString(),
  body('paymentMethod').optional({ nullable: true }).isIn(['Cash', 'Check', 'Credit Card','Bank transfer']).withMessage('Payment method must be Cash, Check, Credit Card, or Bank transfer'),
  body('currency').optional({ nullable: true }).isIn(['LAK', 'USD', 'THB']).withMessage('Currency must be LAK, USD, or THB'),
  body('rate').optional({ nullable: true }).isNumeric().withMessage('Rate must be a number'),
  body('totalAmount').notEmpty().withMessage('Total amount is required'),
  body('drAccount').optional({ nullable: true }).isInt().withMessage('DR account must be an integer'),
  body('crAccount').optional({ nullable: true }).isInt().withMessage('CR account must be an integer'),
];

module.exports = {
  createReceiveHeaderValidation,
  updateReceiveHeaderValidation,
};
