
const Vendor = require('../models').vendor;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');

const { Op } = require('sequelize');

// Get all vendor
const getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.findAll();
    res.status(200).json(vendors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// Get all active vendor
const getAllActiveVendors = async (req, res) => {
  try {
    const vendors = await Vendor.findAll({ where: { isActive: true } });
    res.status(200).json(vendors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single vendor by ID
const getVendorById = async (req, res) => {
  const { id } = req.params;
  try {
    const vendor = await Vendor.findOne({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ message: 'vendors not found' });
    }
    res.status(200).json(vendor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new vendor
const createVendor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { name, tel, remark, isActive } = req.body;
  try {
    const newVendor = await Vendor.create({
      name,
      tel,
      remark,
      isActive,
    });
    res.status(200).json(newVendor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing vendor by ID
const updateVendorById = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { id } = req.params;
  const { name, tel, remark, isActive } = req.body;
  try {
    const vendor = await Vendor.findOne({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ message: 'vendor not found' });
    }
    await Vendor.update(
      {
        name,
        tel,
        remark,
        isActive,
      },
      { where: { id } }
    );
    res.status(200).json({ message: 'vendor updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete an Outlet by ID
const deleteVendorById = async (req, res) => {
  const { id } = req.params;
  try {
    const vendor = await Vendor.findOne({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ message: 'vendor not found' });
    }
    await Vendor.destroy({ where: { id } });
    res.status(200).json({ message: 'vendor deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendorById,
  deleteVendorById,
  getAllActiveVendors
};
