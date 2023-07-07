
const { body, validationResult } = require("express-validator");
const { body } = require('express-validator');

exports.validateUnitModel = [
  body('name').notEmpty().withMessage('Name is required'),
  body('Rate').isNumeric().withMessage('Unit rate must be a number'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
];
