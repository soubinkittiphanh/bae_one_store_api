
const TransferLine = require('../../models').transferLine;
const headerService = require('../service');
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');


exports.createtransferLine = async (req, res) => {
  try {
    const { quantity, unitRate, price, discount, total, isActive, unitId, productId } = req.body;

    const transferLine = await TransferLine.create({
      quantity,
      unitRate,
      price,
      discount,
      total,
      isActive,
      unitId,
      productId
    });

    res.status(200).json(transferLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getTransferLine = async (req, res) => {
  try {
    const transferLine = await TransferLine.findAll({ include: ['product'] });

    res.status(200).json(transferLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getTransferLineById = async (req, res) => {
  try {
    const { id } = req.params;

    const transferLine = await TransferLine.findByPk(id);

    if (!transferLine) {
      return res.status(404).json({ message: 'Transfer line not found' });
    }

    res.status(200).json(transferLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateTransferLine = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, unitRate, price, discount, total, isActive } = req.body;

    const transferLine = await TransferLine.findByPk(id);

    if (!transferLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }

    await TransferLine.update({
      quantity: quantity || TransferLine.quantity,
      unitRate: unitRate || TransferLine.unitRate,
      price: price || TransferLine.price,
      discount: discount || TransferLine.discount,
      total: total || TransferLine.total,
      isActive: isActive || TransferLine.isActive,
    });

    res.status(200).json(transferLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteTransferLine = async (req, res) => {
  try {
    const { id } = req.params;

    const transferLine = await TransferLine.findByPk(id,{include: ['product'],});

    if (!transferLine) {
      return res.status(404).json({ message: 'Sale line not found' });
    }
    logger.info("Sale line detail "+transferLine)
    // ************* Reverse card ************* //
    await headerService.cardReversal(TransferLine.productId,id)
    // ************* Delete transferLine ************* //
    await TransferLine.destroy();

    res.status(200).json();
  } catch (error) {
    console.error("Error delete line "+error);
    res.status(500).json({ message: 'Server Error' });
  }
};
