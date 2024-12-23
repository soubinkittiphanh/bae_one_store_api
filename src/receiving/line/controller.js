
const RECLine = require('../../models').receivingLine;
const service = require('./service');
const { body, validationResult } = require('express-validator');
const logger = require('../../api/logger');
const { sequelize } = require('../../models');
const { Op } = require('sequelize');

// Get all PO lines
const getAllPOLines = async (req, res) => {
  try {
    const poLines = await RECLine.findAll();
    res.status(200).json(poLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single PO line by ID
const getPOLineById = async (req, res) => {
  const { id } = req.params;
  try {
    const poLine = await RECLine.findOne({ where: { id } });
    if (!poLine) {
      return res.status(404).json({ message: 'PO line not found' });
    }
    res.status(200).json(poLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new PO line
const createPOLine = async (req, res) => {
  const { rate, qty, price, total, isActive, locking_session_id } = req.body;
  try {
    const newPOLine = await RECLine.create({
      rate,
      qty,
      price,
      total,
      isActive,
      locking_session_id,
    });
    res.status(200).json(newPOLine);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing PO line by ID
const updatePOLineById = async (req, res) => {
  const { id } = req.params;
  const { rate, qty, price, total, isActive, locking_session_id } = req.body;
  try {
    const poLine = await RECLine.findOne({ where: { id } });
    if (!poLine) {
      return res.status(404).json({ message: 'PO line not found' });
    }
    await poLine.update(
      {
        rate,
        qty,
        price,
        total,
        isActive,
        locking_session_id,
      },
      { where: { id } }
    );
    res.status(200).json({ message: 'PO line updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a PO line by ID
const deletePOLineById = async (req, res) => {
  const { id } = req.params;
  try {
    const poLine = await RECLine.findOne({ where: { id } });
    if (!poLine) {
      return res.status(404).json({ message: 'PO line not found' });
    }
    const result = await sequelize.transaction(async (t) => {
      await service.removeCardsFromRecId(id, t)
      await poLine.destroy({ where: { id }, transaction: t  });

    })
    res.status(200).json({ message: 'PO line deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllPOLines,
  getPOLineById,
  createPOLine,
  updatePOLineById,
  deletePOLineById,
};
