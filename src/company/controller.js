const Company = require('../models').company;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

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

// Get all active companies
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
    res.status(500).json({ message: 'Server Error' + err });
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

// Upload company profile image
exports.uploadProfileImage = async (req, res) => {
  try {
    const companyId = req.params.id;

    console.log('Upload request received for company:', companyId);
    console.log('Request files:', req.files);
    console.log('Request file:', req.file);

    if (!req.file) {
      console.log('No file provided in request');
      return res.status(400).json({ message: 'No image file provided' });
    }

    console.log('File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename
    });

    // Find the company
    const company = await Company.findByPk(companyId);
    if (!company) {
      console.log('Company not found:', companyId);
      // Delete uploaded file if company not found
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete old profile image if exists
    if (company.profile_image_path) {
      const oldImagePath = path.join(__dirname, '..', company.profile_image_path);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        console.log('Deleted old image:', oldImagePath);
      }
    }

    // Update company with new image path
    const imagePath = `uploads/company-profiles/${req.file.filename}`;
    await company.update({ profile_image_path: imagePath });

    console.log('Image uploaded successfully:', imagePath);

    res.json({
      message: 'Profile image uploaded successfully',
      profile_image_path: imagePath,
      company: company
    });

  } catch (err) {
    console.error('Error uploading profile image:', err);
    logger.error('Error uploading profile image:', err);

    // Delete uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
};

// NEW: Upload company bank QR image
exports.uploadBankQRImage = async (req, res) => {
  try {
    const companyId = req.params.id;

    console.log('Bank QR upload request received for company:', companyId);
    console.log('Request file:', req.file);

    if (!req.file) {
      console.log('No file provided in request');
      return res.status(400).json({ message: 'No QR image file provided' });
    }

    console.log('File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename
    });

    // Find the company
    const company = await Company.findByPk(companyId);
    if (!company) {
      console.log('Company not found:', companyId);
      // Delete uploaded file if company not found
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete old bank QR image if exists
    if (company.bank_qr_image_path) {
      const oldImagePath = path.join(__dirname, '..', company.bank_qr_image_path);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        console.log('Deleted old bank QR image:', oldImagePath);
      }
    }

    // Update company with new bank QR image path
    const imagePath = `uploads/company-qr/${req.file.filename}`;
    await company.update({ bank_qr_image_path: imagePath });

    console.log('Bank QR image uploaded successfully:', imagePath);

    res.json({
      message: 'Bank QR image uploaded successfully',
      bank_qr_image_path: imagePath,
      company: company
    });

  } catch (err) {
    console.error('Error uploading bank QR image:', err);
    logger.error('Error uploading bank QR image:', err);

    // Delete uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
};

// Update company profile image path only
exports.updateCompanyProfileImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { profile_image_path } = req.body;

    const company = await Company.findByPk(id);
    if (company) {
      await company.update({ profile_image_path });
      res.json({
        message: 'Profile image updated successfully',
        company: company
      });
    } else {
      res.status(404).json({ message: 'Company not found' });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// NEW: Update company bank QR image path only
exports.updateCompanyBankQRImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { bank_qr_image_path } = req.body;

    const company = await Company.findByPk(id);
    if (company) {
      await company.update({ bank_qr_image_path });
      res.json({
        message: 'Bank QR image updated successfully',
        company: company
      });
    } else {
      res.status(404).json({ message: 'Company not found' });
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete company profile image
exports.deleteProfileImage = async (req, res) => {
  try {
    const companyId = req.params.id;

    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete image file if exists
    if (company.profile_image_path) {
      const imagePath = path.join(__dirname, '..', company.profile_image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Remove image path from database
    await company.update({ profile_image_path: null });

    res.json({
      message: 'Profile image deleted successfully',
      company: company
    });

  } catch (err) {
    logger.error('Error deleting profile image:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// NEW: Delete company bank QR image
exports.deleteBankQRImage = async (req, res) => {
  try {
    const companyId = req.params.id;

    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete bank QR image file if exists
    if (company.bank_qr_image_path) {
      const imagePath = path.join(__dirname, '..', company.bank_qr_image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Remove bank QR image path from database
    await company.update({ bank_qr_image_path: null });

    res.json({
      message: 'Bank QR image deleted successfully',
      company: company
    });

  } catch (err) {
    logger.error('Error deleting bank QR image:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete a company by ID
exports.deleteCompanyById = async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (company) {
      // Delete associated images before deleting company
      if (company.profile_image_path) {
        const profileImagePath = path.join(__dirname, '..', company.profile_image_path);
        if (fs.existsSync(profileImagePath)) {
          fs.unlinkSync(profileImagePath);
        }
      }
      
      if (company.bank_qr_image_path) {
        const qrImagePath = path.join(__dirname, '..', company.bank_qr_image_path);
        if (fs.existsSync(qrImagePath)) {
          fs.unlinkSync(qrImagePath);
        }
      }
      
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

// Add this new method to get company theme
exports.getCompanyTheme = async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await Company.findByPk(companyId, {
      attributes: [
        'id',
        'name',
        'theme_primary_color',
        'theme_secondary_color',
        'theme_lightprimary_color',
        'theme_danger_color',
        'theme_dark_primary',
        'theme_dark_secondary',
        'theme_enabled'
      ]
    });

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Return theme data
    res.json({
      theme: {
        primary_color: company.theme_primary_color,
        secondary_color: company.theme_secondary_color,
        lightprimary_color: company.theme_lightprimary_color,
        danger_color: company.theme_danger_color,
        dark_primary: company.theme_dark_primary,
        dark_secondary: company.theme_dark_secondary,
        enabled: company.theme_enabled
      }
    });
  } catch (err) {
    logger.error('Error fetching company theme:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Add this new method to update company theme
exports.updateCompanyTheme = async (req, res) => {
  try {
    const companyId = req.params.id;
    const {
      theme_primary_color,
      theme_secondary_color,
      theme_lightprimary_color,
      theme_danger_color,
      theme_dark_primary,
      theme_dark_secondary,
      theme_enabled
    } = req.body;

    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Update theme fields
    await company.update({
      theme_primary_color,
      theme_secondary_color,
      theme_lightprimary_color,
      theme_danger_color,
      theme_dark_primary,
      theme_dark_secondary,
      theme_enabled
    });

    res.json({
      message: 'Company theme updated successfully',
      theme: {
        primary_color: company.theme_primary_color,
        secondary_color: company.theme_secondary_color,
        lightprimary_color: company.theme_lightprimary_color,
        danger_color: company.theme_danger_color,
        dark_primary: company.theme_dark_primary,
        dark_secondary: company.theme_dark_secondary,
        enabled: company.theme_enabled
      }
    });
  } catch (err) {
    logger.error('Error updating company theme:', err);
    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
};