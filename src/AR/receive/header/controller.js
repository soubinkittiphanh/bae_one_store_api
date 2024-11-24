
const ReceiveHeader = require('../../../models').arReceiveHeader;
const { body, validationResult } = require('express-validator');
const logger = require('../../../api/logger');
const { Op, where, literal } = require('sequelize');

// Create Payment Header
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}
const createReceiveHeader = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there are validation errors, return a 400 Bad Request response with the errors
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    req.body.totalAmount = replaceAll(req.body.totalAmount, ",", "");
    req.body.locking_session_id = Date.now();
    const receiveHeader = await ReceiveHeader.create(req.body);
    res.status(200).json(receiveHeader);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getAllReceiveHeaders = async (req, res) => {
  try {
    const receiveHeaders = await ReceiveHeader.findAll();
    res.status(200).json(receiveHeaders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
const getAllReceiveHeadersByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  try {
    const receiveHeaders = await ReceiveHeader.findAll({
      where: {
        bookingDate: {
          [Op.between]: [date.startDate, date.endDate]
        },
      }, include: ['payment','currency']
    });
    res.status(200).json(receiveHeaders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getReceiveHeaderById = async (req, res) => {
  try {
    const { id } = req.params;
    const receiveHeader = await ReceiveHeader.findByPk(id);
    if (!receiveHeader) {
      return res.status(404).json({ message: 'Receive header not found' });
    }
    res.status(200).json(receiveHeader);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const updateReceiveHeader = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there are validation errors, return a 400 Bad Request response with the errors
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { id } = req.params;
    const receiveHeader = await ReceiveHeader.findByPk(id);
    if (!receiveHeader) {
      return res.status(404).json({ message: 'Receive header not found' });
    }
    req.body.totalAmount = replaceAll(req.body.totalAmount, ",", "");
    // req.body.locking_session_id = Date.now();
    const updatedReceiveHeader = await receiveHeader.update(req.body);
    res.status(200).json(updatedReceiveHeader);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const deleteReceiveHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const receiveHeader = await ReceiveHeader.findByPk(id);
    if (!receiveHeader) {
      return res.status(404).json({ message: 'Receive header not found' });
    }
    await receiveHeader.destroy();
    res.status(200).json({ message: 'Receive header deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  createReceiveHeader,
  getAllReceiveHeaders,
  getReceiveHeaderById,
  updateReceiveHeader,
  deleteReceiveHeader,
  getAllReceiveHeadersByDate
};