const { body } = require('express-validator');
exports.paymentHeaderValidator = {
    create: [
      body('bookingDate').notEmpty().withMessage('Booking date is required'),
      body('paymentNumber').notEmpty().withMessage('Payment number is required'),
      body('totalAmount').notEmpty().withMessage('Total amount is required'),
    ],
    update: [
      body('bookingDate').notEmpty().withMessage('Booking date is required'),
      body('paymentNumber').notEmpty().withMessage('Payment number is required'),
      body('totalAmount').notEmpty().withMessage('Total amount is required'),
    ],
  };