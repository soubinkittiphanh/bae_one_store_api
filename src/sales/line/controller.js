
const SaleLine = require('../../models').saleLine;
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');

const { SaleLine } = require('../models');

exports.createSaleLine = async (req, res) => {
  try {
    const { quantity, unitRate, price, discount, total, isActive } = req.body;

    const newSaleLine = await SaleLine.create({
      quantity,
      unitRate,
      price,
      discount,
      total,
      isActive,
    });

    res.status(200).json(newSaleLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getSaleLines = async (req, res) => {
  try {
    const saleLines = await SaleLine.findAll();

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
    const { quantity, unitRate, price, discount, total, isActive } = req.body;

    const saleLine = await SaleLine.findByPk(id);

    if (!saleLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    await saleLine.update({
      quantity: quantity || saleLine.quantity,
      unitRate: unitRate || saleLine.unitRate,
      price: price || saleLine.price,
      discount: discount || saleLine.discount,
      total: total || saleLine.total,
      isActive: isActive || saleLine.isActive,
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

    const saleLine = await SaleLine.findByPk(id);

    if (!saleLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    await saleLine.destroy();

    res.status(200).json();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
