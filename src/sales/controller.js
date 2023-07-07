
const SaleHeader = require('../models').saleHeader;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const lineService = require("./line/service")

exports.createSaleHeader = async (req, res) => {
  try {
    const { bookingDate, remark, discount, total, exchangeRate, isActive,line } = req.body;
    const saleHeader = await SaleHeader.create({ bookingDate, remark, discount, total, exchangeRate, isActive });
    lineService.createBulkSaleLine(res,assignHeaderId(line,saleHeader.id))
    // res.status(201).json({ success: true, data: saleHeader });
  } catch (error) {
    next(error);
  }
};
const assignHeaderId = (line,id)=>{
  for (const iterator of line) {
    line.headerId = id
  }
  return line;
}


exports.getSaleHeaders = async (req, res) => {
  try {
    const saleHeaders = await SaleHeader.findAll();

    res.status(200).json({ success: true, data: saleHeaders });
  } catch (error) {
    next(error);
  }
};

exports.getSaleHeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk();

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    res.status(200).json({ success: true, data: saleHeader });
  } catch (error) {
    next(error);
  }
};

exports.updateSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, remark, discount, total, exchangeRate, isActive } = req.body;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.update({ bookingDate, remark, discount, total, exchangeRate, isActive });

    res.status(200).json({ success: true, data: saleHeader });
  } catch (error) {
    next(error);
  }
};

exports.deleteSaleHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const saleHeader = await SaleHeader.findByPk(id);

    if (!saleHeader) {
      return res.status(404).json({ success: false, message: 'Sale header not found' });
    }

    await saleHeader.destroy();

    res.status(200).json({ success: true, message: 'Sale header deleted successfully' });
  } catch (error) {
    next(error);
  }
};
