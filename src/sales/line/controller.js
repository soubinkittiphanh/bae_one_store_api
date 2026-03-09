
const SaleLine = require('../../models').saleLine;
const headerService = require('../service');
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');


exports.createSaleLine = async (req, res) => {
  try {
    const { quantity, isGift, unitRate, taxRate, taxAmount, taxType, price, discount, total, isActive, unitId, productId } = req.body;

    const newSaleLine = await SaleLine.create({
      quantity,
      isGift,
      unitRate,
      taxRate,
      taxAmount,
      taxType,
      price,
      discount,
      total,
      isActive,
      unitId,
      productId
    });

    res.status(200).json(newSaleLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getSaleLines = async (req, res) => {
  try {
    const saleLines = await SaleLine.findAll({ include: ['product'] });

    res.status(200).json(saleLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getSaleLineById = async (req, res) => {
  try {
    const { id } = req.params;

    const saleLine = await SaleLine.findByPk(id);

    if (!saleLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    res.status(200).json(saleLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateSaleLine = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, isGift, unitRate, taxRate, taxAmount, taxType, price, discount, total, isActive } = req.body;

    const saleLine = await SaleLine.findByPk(id);

    if (!saleLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    await saleLine.update({
      quantity: quantity || saleLine.quantity,
      unitRate: unitRate || saleLine.unitRate,
      taxRate: taxRate !== undefined ? taxRate : saleLine.taxRate,
      taxAmount: taxAmount !== undefined ? taxAmount : saleLine.taxAmount,
      taxType: taxType || saleLine.taxType,
      price: price || saleLine.price,
      discount: discount || saleLine.discount,
      total: total || saleLine.total,
      isActive: isActive !== undefined ? isActive : saleLine.isActive,
      isGift: isGift !== undefined ? isGift : saleLine.isGift,
    });

    res.status(200).json(saleLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteSaleLine = async (req, res) => {
  try {
    const { id } = req.params;

    const saleLine = await SaleLine.findByPk(id, { include: ['product'], });

    if (!saleLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }
    logger.info("Sale line detail " + saleLine)
    // ************* Reverse card ************* //
    await headerService.cardReversal(saleLine.productId, id)
    // ************* Delete saleLine ************* //
    await saleLine.destroy();

    res.status(200).json();
  } catch (error) {
    console.error("Error delete line " + error);
    res.status(500).json({ message: 'Server Error' });
  }
};
