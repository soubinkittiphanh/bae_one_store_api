const { body } = require('express-validator');

const createCategoryValidation = [
  body('categ_name').notEmpty().withMessage('Category name is required').isString(),
  body('categ_desc').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('mainCategoryId').notEmpty().withMessage('Main Category ID is required').isInt().withMessage('Main Category ID must be an integer'),
];

const updateCategoryValidation = [
  body('categ_name').optional().isString(),
  body('categ_desc').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('mainCategoryId').optional().isInt().withMessage('Main Category ID must be an integer'),
];

module.exports = {
  createCategoryValidation,
  updateCategoryValidation,
};
