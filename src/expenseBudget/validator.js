const { body, param } = require('express-validator');

const validateExpenseBudget = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 255 })
        .withMessage('Name must be between 2 and 255 characters'),

    body('year')
        .isInt({ min: 2020, max: 2100 })
        .withMessage('Year must be between 2020 and 2100'),

    body('allocatedAmount')
        .isDecimal({ decimal_digits: '0,2' })
        .withMessage('Allocated amount must be a valid decimal number')
        .custom((value) => {
            if (parseFloat(value) < 0) {
                throw new Error('Allocated amount must be greater than or equal to 0');
            }
            return true;
        }),

    body('exchangeRate')
        .optional()
        .isDecimal({ decimal_digits: '0,4' })
        .withMessage('Exchange rate must be a valid decimal number')
        .custom((value) => {
            if (value !== undefined && parseFloat(value) <= 0) {
                throw new Error('Exchange rate must be greater than 0');
            }
            return true;
        }),

    body('currencyId')
        .isInt({ min: 1 })
        .withMessage('Currency ID must be a valid integer'),

    body('thresholdWarningPercent')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Threshold warning percent must be between 1 and 100'),

    body('drAccountId')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('DR Account ID must be an integer'),

    body('ministryId')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('Ministry ID must be an integer'),

    body('remark')
        .optional({ nullable: true })
        .isString()
        .withMessage('Remark must be a string'),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value')
];

const validateUpdateExpenseBudget = [
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

    body('allocatedAmount')
        .optional()
        .isDecimal({ decimal_digits: '0,2' })
        .withMessage('Allocated amount must be a valid decimal number')
        .custom((value) => {
            if (value !== undefined && parseFloat(value) < 0) {
                throw new Error('Allocated amount must be greater than or equal to 0');
            }
            return true;
        }),

    body('exchangeRate')
        .optional()
        .isDecimal({ decimal_digits: '0,4' })
        .withMessage('Exchange rate must be a valid decimal number'),

    body('currencyId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Currency ID must be a valid integer'),

    body('thresholdWarningPercent')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Threshold warning percent must be between 1 and 100'),

    body('drAccountId')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('DR Account ID must be an integer'),

    body('ministryId')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('Ministry ID must be an integer'),

    body('remark')
        .optional({ nullable: true })
        .isString()
        .withMessage('Remark must be a string'),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value')
];

module.exports = {
    validateExpenseBudget,
    validateUpdateExpenseBudget
};
