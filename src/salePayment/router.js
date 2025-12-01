const { validateToken } = require("../api/jwtApi");
const controller = require("./controller");
const express = require("express");
const router = express.Router();
const { body } = require('express-validator');

router.use(validateToken);

// Validation middleware for bulk payment creation
const validateBulkPayment = [
  body().isArray({ min: 1 }).withMessage('Payment data must be a non-empty array'),
  body('*.saleHeaderId').notEmpty().isInt({ min: 1 }).withMessage('Sale header ID is required'),
  body('*.paymentId').notEmpty().isInt({ min: 1 }).withMessage('Payment ID is required'),
  body('*.amount').notEmpty().isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('*.referenceNo').optional().isLength({ max: 100 }).withMessage('Reference number too long')
];

router
  .post("/bulk", validateBulkPayment, controller.createBulkSalePayment) // Multi-payment endpoint
  .get("/:saleHeaderId", controller.getSalePaymentsBySaleHeader) // Get payments for specific sale
  .get("/", controller.getAllSalePayments) // Get all payments (admin)
  .put("/:id", controller.updateSalePayment) // Update payment
  .delete("/:id", controller.deleteSalePayment); // Delete payment

module.exports = router;