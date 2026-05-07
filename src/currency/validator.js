const { body } = require('express-validator');

const currencyValidation = [
  body('code')
    .notEmpty().withMessage('Currency code is required')
    .isString().withMessage('Currency code must be a string')
    .isLength({ min: 2, max: 10 }).withMessage('Currency code must be between 2 and 10 characters'),
  body('name')
    .notEmpty().withMessage('Currency name is required')
    .isString().withMessage('Currency name must be a string')
    .isLength({ max: 50 }).withMessage('Currency name must be at most 50 characters'),
  body('rate')
    .notEmpty().withMessage('Exchange rate is required')
    .isNumeric().withMessage('Exchange rate must be a number')
    .custom(value => value > 0).withMessage('Exchange rate must be a positive number'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
  body('isLocalCCY')
    .optional()
    .isBoolean().withMessage('isLocalCCY must be a boolean'),
  body('exchangeDirection')
    .optional()
    .isIn(['local_to_foreign', 'foreign_to_local']).withMessage('Invalid exchange direction'),
  body('symbol')
    .optional()
    .isString().withMessage('Symbol must be a string')
    .isLength({ max: 5 }).withMessage('Symbol must be at most 5 characters'),
];

module.exports = {
  currencyValidation,
};
