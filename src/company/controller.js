
const Company = require('../models').company;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

// Get all companies
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.findAll({
      where: {
        isActive: true
      }
    });
    res.json(companies);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};
// Get all acticve companies
exports.getAllActiveCompanies = async (req, res) => {
  try {
    const companies = await Company.findAll();
    res.json(companies);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get a single company by ID
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (company) {
      res.json(company);
    } else {
      res.status(404).json({ message: 'Company not found' });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Create a new company
exports.createCompany = async (req, res) => {
  try {
    const company = await Company.create(req.body);
    res.json(company);
  } catch (err) {
    logger.error(`cannot create record, error occured ${err}`);
    res.status(500).json({ message: 'Server Error'+err });
  }
};

// Update an existing company by ID
exports.updateCompanyById = async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (company) {
      await company.update(req.body);
      res.json(company);
    } else {
      res.status(404).json({ message: 'Company not found' });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete a company by ID
exports.deleteCompanyById = async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (company) {
      await company.destroy();
      res.json({ message: 'Company deleted' });
    } else {
      res.status(404).json({ message: 'Company not found' });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};
