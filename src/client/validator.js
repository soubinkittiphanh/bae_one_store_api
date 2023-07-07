
const { body, validationResult } = require("express-validator");

// Validate create request
exports.validateCreate = [
 ("name")
    .notEmpty()
    .withMessage("Name can not be empty!")
    .isLength({ max: 50 })
    .withMessage("Name can not exceed 50 characters"),
  body("company")
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .withMessage("Company can not exceed 50 characters"),
  body("address")
    .optional({ nullable: true })
    .isLength({ max: 255 })
    .withMessage("Address can not exceed 255 characters"),
  body("telephone")
    .optional({ nullable: true })
    .isLength({ max: 20 })
    .withMessage("Telephone can not exceed20 characters"),
  body("credit")
    .optional({ nullable: true })
    .isNumeric()
    .withMessage("Credit must be a number"),
  body("lateChargePercent")
    .optional({ nullable: true })
    .isNumeric()
    .withMessage("Late charge percent must be a number"),
  body("grade")
    .optional({ nullable: true })
    .isIn(["A", "B", "C", "D", "E"])
    .withMessage("Grade must be one of A, B, C, D, E"),
  body("isActive")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("isActive must be a boolean")
];

// Validate update request
exports.validateUpdate = [
  body("name")
    .optional({ nullable: true })
    .notEmpty()
    .withMessage("Name can not be empty!")
    .isLength({ max: 50 })
    .withMessage("Name can not exceed 50 characters"),
  body("company")
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .withMessage("Company can not exceed 50 characters"),
  body("address")
    .optional({ nullable: true })
    .isLength({ max: 255 })
    .withMessage("Address can not exceed 255 characters"),
  body("telephone")
    .optional({ nullable: true })
    .isLength({ max: 20 })
    .withMessage("Telephone can not exceed 20 characters"),
  body("credit")
    .optional({ nullable: true })
    .isNumeric()
    .withMessage("Credit must be a number"),
  body("lateChargePercent")
    .optional({ nullable: true })
    .isNumeric()
    .withMessage("Late charge percent must be a number"),
  body("grade")
    .optional({ nullable: true })
    .isIn(["A", "B", "C", "D", "E"])
    .withMessage("Grade must be one of A, B, C, D, E"),
  body("isActive")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("isActive must be a boolean")
];
