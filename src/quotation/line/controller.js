
const QuotationLine = require('../../models').quotationLine;
const headerService = require('../service');
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');


exports.createQuotationLine = async (req, res) => {
  try {
    const { quantity, unitRate, price, discount, total, isActive, unitId, productId } = req.body;

    const newQuotationLine = await QuotationLine.create({
      quantity,
      unitRate,
      price,
      discount,
      total,
      isActive,
      unitId,
      productId
    });

    res.status(200).json(newQuotationLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getQuotationLines = async (req, res) => {
  try {
    const quotationLines = await QuotationLine.findAll({ include: ['product'] });

    res.status(200).json(quotationLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getQuotationLineById = async (req, res) => {
  try {
    const { id } = req.params;

    const quotationLines = await QuotationLine.findByPk(id);

    if (!quotationLines) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    res.status(200).json(quotationLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateQuotationLine = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, unitRate, price, discount, total, isActive } = req.body;

    const quotationLines = await QuotationLine.findByPk(id);

    if (!quotationLines) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    await quotationLines.update({
      quantity: quantity || quotationLines.quantity,
      unitRate: unitRate || quotationLines.unitRate,
      price: price || quotationLines.price,
      discount: discount || quotationLines.discount,
      total: total || quotationLines.total,
      isActive: isActive || quotationLines.isActive,
    });

    res.status(200).json(quotationLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteQuotationLine = async (req, res) => {
  try {
    const { id } = req.params;

    const quotationLines = await QuotationLine.findByPk(id);

    if (!quotationLines) {
      return res.status(404).json({ message: 'Sale line not found' });
    }
    logger.info("Sale line detail "+quotationLines)
    // ************* Delete QuotationLine ************* //
    await quotationLines.destroy();

    res.status(200).json();
  } catch (error) {
    console.error("Error delete line "+error);
    res.status(500).json({ message: 'Server Error' });
  }
};
