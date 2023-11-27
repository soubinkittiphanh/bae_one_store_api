
const PaymentHeader = require('../../../models').apPaymentHeader;
const { body, validationResult } = require('express-validator');
const logger = require('../../../api/logger');
const { Op, where, literal } = require('sequelize');

// Create Payment Header
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}
exports.createPaymentHeader = async (req, res) => {
  logger.info("====>" + req.body.totalAmount)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there are validation errors, return a 400 Bad Request response with the errors
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    // ******** Remove all , thousand separater ********//
    req.body.totalAmount = replaceAll(req.body.totalAmount, ",", "");
    req.body.locking_session_id = Date.now();
    const paymentHeader = await PaymentHeader.create(req.body);
    res.status(200).json(paymentHeader);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};
exports.upload = async (req, res) => {
  try {
    for (const iterator of req.body) {
      iterator.locking_session_id = Date.now();
    }
    const paymentHeader = await PaymentHeader.bulkCreate(req.body)
    res.status(200).json(paymentHeader);
  } catch (error) {
    logger.error(` cannot upload transaction with error: ${error}`);
    res.status(500).json({ message: "Server Error" });
  }
};


// Get all Payment Headers
exports.getAllPaymentHeaders = async (req, res) => {
  try {
    const paymentHeaders = await PaymentHeader.findAll();
    res.status(200).json(paymentHeaders);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getAllPaymentHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  try {
    const paymentHeaders = await PaymentHeader.findAll({
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
      }
    });
    res.status(200).json(paymentHeaders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get Payment Header by ID
exports.getPaymentHeaderById = async (req, res) => {
  try {
    const paymentHeader = await PaymentHeader.findByPk(req.params.id);
    if (!paymentHeader) {
      return res.status(404).json({ message: "Payment Header not found" });
    }
    res.status(200).json(paymentHeader);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Update Payment Header by ID
exports.updatePaymentHeaderById = async (req, res) => {
  try {
    const paymentHeader = await PaymentHeader.findByPk(req.params.id);
    if (!paymentHeader) {
      return res.status(404).json({ message: "Payment Header not found" });
    }
    req.body.totalAmount = replaceAll(req.body.totalAmount, ",", "");
    await paymentHeader.update(req.body);
    res.status(200).json(paymentHeader);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Delete Payment Header by ID
exports.deletePaymentHeaderById = async (req, res) => {
  try {
    const paymentHeader = await PaymentHeader.findByPk(req.params.id);
    if (!paymentHeader) {
      return res.status(404).json({ message: "Payment Header not found" });
    }
    await paymentHeader.destroy();
    res.status(200).json({ message: "Payment Header deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};