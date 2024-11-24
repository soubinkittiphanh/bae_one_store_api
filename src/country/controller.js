
const Country = require('../models').country;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');

const { Op } = require('sequelize');

// Get all outlets
const getAllOutlets = async (req, res) => {
  try {
    const countries = await Country.findAll();
    res.status(200).json(countries);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single Outlet by ID
const getOutletById = async (req, res) => {
  const { id } = req.params;
  try {
    const country = await Country.findOne({ where: { id } });
    if (!country) {
      return res.status(404).json({ message: 'country not found' });
    }
    res.status(200).json(country);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new Outlet
const createOutlet = async (req, res) => {
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) {
  //   return res.status(400).json({ errors: errors.array() });
  // }
  try {
    const country = await Country.create(req.body);
    res.status(200).json(country);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing Outlet by ID
const updateOutletById = async (req, res) => {

  const { id } = req.params;
  try {
    const country = await Country.findOne({ where: { id } });
    if (!country) {
      return res.status(404).json({ message: 'Country not found' });
    }
    await Country.update(
      req.body,
      { where: { id } }
    );
    res.status(200).json({ message: 'Outlet updated successfully' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete an Outlet by ID
const deleteOutletById = async (req, res) => {
  const { id } = req.params;
  try {
    const country = await Country.findOne({ where: { id } });
    if (!country) {
      return res.status(404).json({ message: 'Outlet not found' });
    }
    await Country.destroy({ where: { id } });
    res.status(200).json({ message: 'Outlet deleted successfully' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllOutlets,
  getOutletById,
  createOutlet,
  updateOutletById,
  deleteOutletById,
};
