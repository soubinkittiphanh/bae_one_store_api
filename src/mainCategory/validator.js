const { body } = require('express-validator');

const createCategoryValidation = [
  body('categoryName').notEmpty().withMessage('Category name is required').isString(),
  body('categoryDesc').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const updateCategoryValidation = [
  body('categoryName').optional().isString(),
  body('categoryDesc').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

module.exports = {
  createCategoryValidation,
  updateCategoryValidation,
};
