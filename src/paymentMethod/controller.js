
const Payment = require('../models').payment;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');

exports.createPayment = async (req, res) => {
  try {
    const { payment_code, payment_name, payment_desc, isActive } = req.body;

    const newPayment = await Payment.create({
      payment_code,
      payment_name,
      payment_desc,
      isActive,
    });

    res.status(200).json(newPayment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: {
        isActive: true
      }
    });

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
exports.getActivePayments = async (req, res) => {
  try {
    const payments = await Payment.findAll();

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const { payment_code, payment_name, payment_desc, isActive } = req.body;

    await payment.update({
      payment_code,
      payment_name,
      payment_desc,
      isActive,
    });

    res.json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    await payment.destroy();

    res.json({ message: 'Payment deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
