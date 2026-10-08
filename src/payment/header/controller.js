
const PaymentHeader = require('../../models').apPaymentHeader;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { Op, where, literal } = require('sequelize');
const service = require('./service')
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
    if (req.body.totalAmount && typeof req.body.totalAmount === 'string') {
      req.body.totalAmount = req.body.totalAmount.replace(/,/g, '');
    }
    req.body.locking_session_id = Date.now();
    req.body.expenseSource = req.body.expenseSource || 'POS_SALE';
    if (req.body.expenseSource === 'BUDGET' && req.body.budgetId && !req.body.budgetImpactYear) {
      const budget = await require('../../models').annualExpenseBudget.findByPk(req.body.budgetId);
      if (budget) {
        req.body.budgetImpactYear = budget.year;
      }
    }
    const paymentHeader = await PaymentHeader.create(req.body);
    res.status(200).json(paymentHeader);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.createPaymentHeaderApi = async (req, res) => {
  logger.info("====>" + req.body.totalAmount)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there are validation errors, return a 400 Bad Request response with the errors
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    // ******** Remove all , thousand separater ********//
    if (req.body.totalAmount && typeof req.body.totalAmount === 'string') {
      req.body.totalAmount = req.body.totalAmount.replace(/,/g, '');
    }
    req.body.locking_session_id = Date.now();
    req.body.expenseSource = req.body.expenseSource || 'POS_SALE';
    // const dbAPHeader = await service.checkDupplicate(req.body.receivingId)
    const dbAPHeader = await PaymentHeader.findAll({
      where: {
        receivingId: req.body.receivingId
      }
    })
    if (!dbAPHeader) {
      const paymentHeader = await PaymentHeader.create(req.body);
      logger.warn(`Not yet found`)
      return res.status(200).json(paymentHeader);
    } else {
      logger.warn(`Found it `)
      await PaymentHeader.update(req.body, { where: { receivingId: req.body.receivingId } });
      // await dbAPHeader.update(req.body);
      return res.status(200).json(dbAPHeader);
    }
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
    const paymentHeaders = await PaymentHeader.findAll({
      include: ['payment', 'currency', 'drAccount', 'crAccount', 'budget']
    });
    res.status(200).json(paymentHeaders);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getAllPaymentHeadersByDate = async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? JSON.parse(req.query.date) : req.query.date;
    const whereClause = {
      bookingDate: {
        [Op.between]: [date.startDate, date.endDate]
      }
    };

    if (req.query.expenseSource) {
      whereClause.expenseSource = req.query.expenseSource;
    }
    if (req.query.budgetId) {
      whereClause.budgetId = parseInt(req.query.budgetId);
    }

    const paymentHeaders = await PaymentHeader.findAll({
      where: whereClause,
      include: ['payment', 'currency', 'drAccount', 'crAccount', 'budget']
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
    const paymentHeader = await PaymentHeader.findByPk(req.params.id, {
      include: ['payment', 'currency', 'drAccount', 'crAccount', 'budget']
    });
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

    // Clean totalAmount safely
    if (typeof req.body.totalAmount === 'string') {
      req.body.totalAmount = Number(
        req.body.totalAmount.replaceAll(',', '')
      );
    }

    if (req.body.expenseSource === 'BUDGET' && req.body.budgetId && !req.body.budgetImpactYear) {
      const budget = await require('../../models').annualExpenseBudget.findByPk(req.body.budgetId);
      if (budget) {
        req.body.budgetImpactYear = budget.year;
      }
    }

    await paymentHeader.update(req.body);
    const updated = await PaymentHeader.findByPk(req.params.id, {
      include: ['payment', 'currency', 'drAccount', 'crAccount', 'budget']
    });
    res.status(200).json(updated);
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