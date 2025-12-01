const SalePayment = require('../models').salePayment;
const SaleHeader = require('../models').saleHeader;
const Payment = require('../models').payment;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');
const { sequelize } = require('../models');

// Create multiple payment records for a sale (Multi-payment)
exports.createBulkSalePayment = async (req, res) => {
  try {
    const paymentData = req.body; // Array of payment objects
    
    logger.info("===== Create Bulk Sale Payment =====" + JSON.stringify(paymentData));

    if (!Array.isArray(paymentData) || paymentData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment data must be a non-empty array',
        error: 'Invalid payment data format'
      });
    }

    // Validate that all payments are for the same sale header
    const saleHeaderIds = [...new Set(paymentData.map(p => p.saleHeaderId))];
    if (saleHeaderIds.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'All payments must be for the same sale',
        error: 'Multiple sale headers not allowed'
      });
    }

    const saleHeaderId = saleHeaderIds[0];

    // Validate sale header exists
    const saleHeader = await SaleHeader.findByPk(saleHeaderId);
    if (!saleHeader) {
      return res.status(404).json({
        success: false,
        message: `Sale header with ID ${saleHeaderId} not found`,
        error: 'Sale header not found'
      });
    }

    // Validate payment methods exist
    const paymentIds = paymentData.map(p => p.paymentId);
    const existingPayments = await Payment.findAll({
      where: { id: { [Op.in]: paymentIds } }
    });

    if (existingPayments.length !== paymentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more payment methods not found',
        error: 'Invalid payment methods'
      });
    }

    // Calculate total payment amount
    const totalPaymentAmount = paymentData.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    // Validate total matches sale total
    const expectedTotal = saleHeader.total - (saleHeader.discount || 0);
    const tolerance = 0.01; // Allow small rounding differences
    
    if (Math.abs(totalPaymentAmount - expectedTotal) > tolerance) {
      return res.status(400).json({
        success: false,
        message: `Payment total (${totalPaymentAmount}) does not match sale total (${expectedTotal})`,
        error: 'Payment amount mismatch'
      });
    }

    // Start transaction
    const result = await sequelize.transaction(async (t) => {
      // Delete any existing payments for this sale (in case of retry)
      await SalePayment.destroy({
        where: { saleHeaderId: saleHeaderId },
        transaction: t
      });

      // Create new payment records
      const createdPayments = await SalePayment.bulkCreate(
        paymentData.map(payment => ({
          saleHeaderId: payment.saleHeaderId,
          paymentId: payment.paymentId,
          amount: payment.amount,
          referenceNo: payment.referenceNo || null
        })),
        { transaction: t }
      );

      return createdPayments;
    });

    logger.info(`Successfully created ${result.length} payment records for sale ${saleHeaderId}`);

    res.status(201).json({
      success: true,
      message: 'Payment records created successfully',
      data: {
        saleHeaderId: saleHeaderId,
        paymentsCreated: result.length,
        totalAmount: totalPaymentAmount,
        payments: result
      }
    });

  } catch (error) {
    logger.error(`Error creating bulk sale payment: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to create payment records: ${error.message}`,
      error: error.message
    });
  }
};

// Get all payments for a specific sale
exports.getSalePaymentsBySaleHeader = async (req, res) => {
  try {
    const { saleHeaderId } = req.params;

    logger.info(`Getting payments for sale header: ${saleHeaderId}`);

    const payments = await SalePayment.findAll({
      where: { saleHeaderId },
      include: [
        {
          model: Payment,
          as: 'payment',
          attributes: ['id', 'payment_name', 'payment_code', 'is_active']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payment records found for this sale',
        data: []
      });
    }

    // Calculate totals
    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

    res.status(200).json({
      success: true,
      saleHeaderId: parseInt(saleHeaderId),
      totalPaid: totalPaid,
      paymentCount: payments.length,
      payments: payments
    });

  } catch (error) {
    logger.error(`Error getting sale payments: ${error}`);
    res.status(500).json({
      success: false,
      message: `Failed to retrieve payment records: ${error.message}`,
      error: error.message
    });
  }
};

// Get all sale payments (admin function)
exports.getAllSalePayments = async (req, res) => {
  try {
    const payments = await SalePayment.findAll({
      include: [
        {
          model: SaleHeader,
          as: 'saleHeader',
          attributes: ['id', 'bookingDate', 'total', 'discount']
        },
        {
          model: Payment,
          as: 'payment',
          attributes: ['id', 'payment_name', 'payment_code']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments
    });

  } catch (error) {
    logger.error(`Error getting all sale payments: ${error}`);
    res.status(500).send(error);
  }
};

// Delete payment record
exports.deleteSalePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await SalePayment.findByPk(id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    await payment.destroy();

    res.status(200).json({
      success: true,
      message: 'Payment record deleted successfully'
    });

  } catch (error) {
    logger.error(`Error deleting payment: ${error}`);
    res.status(500).send(error);
  }
};

// Update payment record
exports.updateSalePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, referenceNo } = req.body;

    const payment = await SalePayment.findByPk(id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    await payment.update({ amount, referenceNo });

    res.status(200).json({
      success: true,
      message: 'Payment record updated successfully',
      data: payment
    });

  } catch (error) {
    logger.error(`Error updating payment: ${error}`);
    res.status(500).send(error);
  }
};