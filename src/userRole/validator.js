const { body, param } = require('express-validator');

const roleValidator = {
  createRole: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Role name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('Role name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Role name can only contain letters, numbers, underscores, and hyphens'),
    
    body('level')
      .isInt({ min: 0, max: 100 })
      .withMessage('Role level must be between 0 and 100'),
    
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array'),
    
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters')
  ],

  updateRole: [
    param('id')
      .isInt()
      .withMessage('Invalid role ID'),
    
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Role name cannot be empty')
      .isLength({ min: 2, max: 50 })
      .withMessage('Role name must be between 2 and 50 characters'),
    
    body('level')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Role level must be between 0 and 100'),
    
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array')
  ],

  getRoleById: [
    param('id')
      .isInt()
      .withMessage('Invalid role ID')
  ],

  cloneRole: [
    param('id')
      .isInt()
      .withMessage('Invalid role ID'),
    
    body('name')
      .trim()
      .notEmpty()
      .withMessage('New role name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('Role name must be between 2 and 50 characters')
  ]
};

module.exports = roleValidator;