


// ===============================================================
// TAX CONTROLLER
// ===============================================================

// controllers/TaxController.js

const TAX = require('../models').tax;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

const TaxController = {
  
  // Get all tax rates with filtering and pagination
  getAllTaxRates: async (req, res) => {
    try {
      const {
        active = 'true',
        date,
        includeInactive = 'false',
        search,
        page = 1,
        limit = 50,
        sortBy = 'name',
        sortOrder = 'ASC'
      } = req.query;

      const whereClause = {};
      
      // Filter by active status
      if (active === 'true' && includeInactive === 'false') {
        whereClause.isActive = true;
      }
      
      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { code: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }
      
      // Filter by effective date
      const filterDate = date ? new Date(date) : new Date();
      if (active === 'true') {
        whereClause.effectiveFrom = { [Op.lte]: filterDate };
        whereClause[Op.or] = [
          { effectiveTo: null },
          { effectiveTo: { [Op.gte]: filterDate } }
        ];
      }

      const offset = (page - 1) * limit;

      // Validate sort fields
      const allowedSortFields = ['name', 'code', 'rate', 'effectiveFrom', 'isDefault', 'createdAt'];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'name';
      const sortDirection = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';

      const { count, rows } = await TAX.findAndCountAll({
        where: whereClause,
        order: [
          ['isDefault', 'DESC'],
          [sortField, sortDirection]
        ],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Add computed fields
      const taxRatesWithExtras = rows.map(rate => ({
        ...rate.toJSON(),
        displayRate: (parseFloat(rate.rate) * 100).toFixed(2) + '%',
        isValidForDate: isValidForDate(rate, filterDate),
        daysUntilExpiry: rate.effectiveTo ? 
          Math.ceil((new Date(rate.effectiveTo) - new Date()) / (1000 * 60 * 60 * 24)) : null
      }));

      res.status(200).json({
        success: true,
        data: taxRatesWithExtras,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        },
        meta: {
          filterDate: filterDate.toISOString().split('T')[0],
          activeRatesCount: taxRatesWithExtras.filter(r => r.isValidForDate).length,
          sortBy: sortField,
          sortOrder: sortDirection
        }
      });

    } catch (error) {
      console.error('Error fetching tax rates:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tax rates',
        error: error.message
      });
    }
  },

  // Get active tax rates only
  getActiveTaxRates: async (req, res) => {
    try {
      const { date } = req.query;
      const filterDate = date ? new Date(date) : new Date();
      
      const taxRates = await TAX.findAll({
        where: {
          isActive: true,
          effectiveFrom: { [Op.lte]: filterDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: filterDate } }
          ]
        },
        order: [['isDefault', 'DESC'], ['name', 'ASC']]
      });
      
      const taxRatesWithExtras = taxRates.map(rate => ({
        ...rate.toJSON(),
        displayRate: (parseFloat(rate.rate) * 100).toFixed(2) + '%'
      }));

      res.status(200).json({
        success: true,
        data: taxRatesWithExtras,
        meta: {
          count: taxRatesWithExtras.length,
          filterDate: filterDate.toISOString().split('T')[0]
        }
      });

    } catch (error) {
      console.error('Error fetching active tax rates:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching active tax rates',
        error: error.message
      });
    }
  },

  // Get default tax rate
  getDefaultTaxRate: async (req, res) => {
    try {
      const { date } = req.query;
      const filterDate = date ? new Date(date) : new Date();
      
      const defaultRate = await TAX.findOne({
        where: {
          isDefault: true,
          isActive: true,
          effectiveFrom: { [Op.lte]: filterDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: filterDate } }
          ]
        }
      });
      
      if (!defaultRate) {
        return res.status(404).json({
          success: false,
          message: 'No default tax rate found for the specified date'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          ...defaultRate.toJSON(),
          displayRate: (parseFloat(defaultRate.rate) * 100).toFixed(2) + '%'
        }
      });

    } catch (error) {
      console.error('Error fetching default tax rate:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching default tax rate',
        error: error.message
      });
    }
  },

  // Get tax rate by ID
  getTaxRateById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const taxRate = await TAX.findByPk(id);

      if (!taxRate) {
        return res.status(404).json({
          success: false,
          message: 'Tax rate not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          ...taxRate.toJSON(),
          displayRate: (parseFloat(taxRate.rate) * 100).toFixed(2) + '%',
          isValidForDate: isValidForDate(taxRate)
        }
      });

    } catch (error) {
      console.error('Error fetching tax rate:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tax rate',
        error: error.message
      });
    }
  },

  // Get tax rate by code
  getTaxRateByCode: async (req, res) => {
    try {
      const { code } = req.params;
      const { date } = req.query;
      const filterDate = date ? new Date(date) : new Date();
      
      const taxRate = await TAX.findOne({
        where: {
          code: code.toUpperCase(),
          isActive: true,
          effectiveFrom: { [Op.lte]: filterDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: filterDate } }
          ]
        }
      });
      
      if (!taxRate) {
        return res.status(404).json({
          success: false,
          message: `Tax rate with code '${code}' not found or not active for the specified date`
        });
      }

      res.status(200).json({
        success: true,
        data: {
          ...taxRate.toJSON(),
          displayRate: (parseFloat(taxRate.rate) * 100).toFixed(2) + '%'
        }
      });

    } catch (error) {
      console.error('Error fetching tax rate by code:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tax rate by code',
        error: error.message
      });
    }
  },
// Fixed createTaxRate method in TaxController.js

createTaxRate: async (req, res) => {
  try {
    const {
      name,
      rate,
      code,
      description,
      isActive = true,
      isDefault = false,
      effectiveFrom,
      effectiveTo
    } = req.body;

    // Validation
    if (!name || !rate || !code || !effectiveFrom) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, rate, code, effectiveFrom'
      });
    }

    // Validate rate range
    if (rate < 0 || rate > 1) {
      return res.status(400).json({
        success: false,
        message: 'Tax rate must be between 0 and 1 (e.g., 0.085 for 8.5%)'
      });
    }

    // Check if code already exists
    const existingRate = await TAX.findOne({
      where: { code: code.toUpperCase() }
    });

    if (existingRate) {
      return res.status(409).json({
        success: false,
        message: `Tax rate with code '${code}' already exists`
      });
    }

    // Validate dates
    if (effectiveTo && effectiveTo.trim() !== '') {
      if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
        return res.status(400).json({
          success: false,
          message: 'Effective to date must be after effective from date'
        });
      }
    }

    // Prepare tax rate data - IMPORTANT: Convert empty strings to null
    const taxRateData = {
      name: name.trim(),
      rate: parseFloat(rate),
      code: code.toUpperCase().trim(),
      description: description ? description.trim() : null,
      isActive,
      isDefault,
      effectiveFrom,
      // ✅ FIX: Convert empty string to null for effectiveTo
      effectiveTo: effectiveTo && effectiveTo.trim() !== '' ? effectiveTo : null
    };

    // If setting as default, unset other defaults first
    if (isDefault) {
      await TAX.update(
        { isDefault: false },
        { where: { isDefault: true } }
      );
    }

    const newTaxRate = await TAX.create(taxRateData);

    res.status(201).json({
      success: true,
      message: 'Tax rate created successfully',
      data: {
        ...newTaxRate.toJSON(),
        displayRate: (parseFloat(newTaxRate.rate) * 100).toFixed(2) + '%'
      }
    });

  } catch (error) {
    console.error('Error creating tax rate:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Tax rate code must be unique',
        field: 'code'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating tax rate',
      error: error.message
    });
  }
},

// Fixed updateTaxRate method
updateTaxRate: async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Find existing tax rate
    const existingTaxRate = await TAX.findByPk(id);
    if (!existingTaxRate) {
      return res.status(404).json({
        success: false,
        message: 'Tax rate not found'
      });
    }

    // Validate rate if provided
    if (updateData.rate !== undefined) {
      if (updateData.rate < 0 || updateData.rate > 1) {
        return res.status(400).json({
          success: false,
          message: 'Tax rate must be between 0 and 1'
        });
      }
      updateData.rate = parseFloat(updateData.rate);
    }

    // Uppercase code if provided
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase().trim();
      
      // Check if code conflicts with existing rates
      const existingRate = await TAX.findOne({
        where: { 
          code: updateData.code,
          id: { [Op.ne]: id }
        }
      });

      if (existingRate) {
        return res.status(409).json({
          success: false,
          message: `Tax rate with code '${updateData.code}' already exists`
        });
      }
    }

    // Clean up string fields
    if (updateData.name) {
      updateData.name = updateData.name.trim();
    }
    
    if (updateData.description !== undefined) {
      updateData.description = updateData.description ? updateData.description.trim() : null;
    }

    // ✅ FIX: Handle effectiveTo field - convert empty string to null
    if (updateData.effectiveTo !== undefined) {
      updateData.effectiveTo = updateData.effectiveTo && updateData.effectiveTo.trim() !== '' 
        ? updateData.effectiveTo 
        : null;
    }

    // Validate dates
    const effectiveFrom = updateData.effectiveFrom || existingTaxRate.effectiveFrom;
    const effectiveTo = updateData.effectiveTo !== undefined 
      ? updateData.effectiveTo 
      : existingTaxRate.effectiveTo;
    
    if (effectiveTo && new Date(effectiveTo) <= new Date(effectiveFrom)) {
      return res.status(400).json({
        success: false,
        message: 'Effective to date must be after effective from date'
      });
    }

    // If setting as default, unset other defaults first
    if (updateData.isDefault === true) {
      await TAX.update(
        { isDefault: false },
        { where: { isDefault: true, id: { [Op.ne]: id } } }
      );
    }

    const [updatedRowsCount] = await TAX.update(updateData, {
      where: { id }
    });

    if (updatedRowsCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tax rate not found or no changes made'
      });
    }

    // Fetch updated record
    const updatedTaxRate = await TAX.findByPk(id);

    res.status(200).json({
      success: true,
      message: 'Tax rate updated successfully',
      data: {
        ...updatedTaxRate.toJSON(),
        displayRate: (parseFloat(updatedTaxRate.rate) * 100).toFixed(2) + '%'
      }
    });

  } catch (error) {
    console.error('Error updating tax rate:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    res.status(500).json({
    success: false,
      message: 'Error updating tax rate',
      error: error.message
    });
  }
},
  // Delete tax rate (soft delete by setting inactive)
  deleteTaxRate: async (req, res) => {
    try {
      const { id } = req.params;
      const { force = false } = req.query;

      const taxRate = await TAX.findByPk(id);
      
      if (!taxRate) {
        return res.status(404).json({
          success: false,
          message: 'Tax rate not found'
        });
      }

      // Check if tax rate is in use (you can add this check based on your business logic)
      // const isInUse = await checkIfTaxRateInUse(id);
      // if (isInUse && force !== 'true') {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Tax rate is in use and cannot be deleted. Use force=true to override.'
      //   });
      // }

      if (force === 'true') {
        // Hard delete (use with caution)
        await taxRate.destroy();
        
        res.status(200).json({
          success: true,
          message: 'Tax rate permanently deleted'
        });
      } else {
        // Soft delete - just mark as inactive
        await taxRate.update({
          isActive: false,
          isDefault: false
        });
        
        res.status(200).json({
          success: true,
          message: 'Tax rate deactivated successfully',
          data: {
            ...taxRate.toJSON(),
            displayRate: (parseFloat(taxRate.rate) * 100).toFixed(2) + '%'
          }
        });
      }

    } catch (error) {
      console.error('Error deleting tax rate:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting tax rate',
        error: error.message
      });
    }
  },

  // Set default tax rate
  setDefaultTaxRate: async (req, res) => {
    try {
      const { id } = req.params;

      const taxRate = await TAX.findByPk(id);
      
      if (!taxRate) {
        return res.status(404).json({
          success: false,
          message: 'Tax rate not found'
        });
      }

      if (!taxRate.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set inactive tax rate as default'
        });
      }

      // Unset all other defaults first
      await TAX.update(
        { isDefault: false },
        { where: { isDefault: true } }
      );

      // Set this rate as default
      await taxRate.update({ isDefault: true });

      res.status(200).json({
        success: true,
        message: 'Default tax rate updated successfully',
        data: {
          ...taxRate.toJSON(),
          displayRate: (parseFloat(taxRate.rate) * 100).toFixed(2) + '%'
        }
      });

    } catch (error) {
      console.error('Error setting default tax rate:', error);
      res.status(500).json({
        success: false,
        message: 'Error setting default tax rate',
        error: error.message
      });
    }
  },

  // Calculate tax for given amount
  calculateTax: async (req, res) => {
    try {
      const {
        amount,
        taxCode = 'STANDARD',
        isTaxInclusive = true,
        date
      } = req.body;

      if (!amount || isNaN(amount) || amount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      const filterDate = date ? new Date(date) : new Date();
      const taxRate = await TAX.findOne({
        where: {
          code: taxCode.toUpperCase(),
          isActive: true,
          effectiveFrom: { [Op.lte]: filterDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: filterDate } }
          ]
        }
      });

      if (!taxRate) {
        return res.status(404).json({
          success: false,
          message: `Tax rate with code '${taxCode}' not found or not active`
        });
      }

      const taxCalculation = calculateTaxAmount(
        parseFloat(amount),
        parseFloat(taxRate.rate),
        isTaxInclusive
      );

      res.status(200).json({
        success: true,
        data: {
          ...taxCalculation,
          taxRate: {
            id: taxRate.id,
            name: taxRate.name,
            code: taxRate.code,
            rate: taxRate.rate,
            displayRate: (parseFloat(taxRate.rate) * 100).toFixed(2) + '%'
          },
          calculation: {
            originalAmount: parseFloat(amount),
            isTaxInclusive,
            calculationDate: filterDate.toISOString().split('T')[0]
          }
        }
      });

    } catch (error) {
      console.error('Error calculating tax:', error);
      res.status(500).json({
        success: false,
        message: 'Error calculating tax',
        error: error.message
      });
    }
  },

  // Get tax statistics
  getTaxStatistics: async (req, res) => {
    try {
      const totalRates = await TAX.count();
      const activeRates = await TAX.count({ where: { isActive: true } });
      const defaultRate = await TAX.findOne({ where: { isDefault: true, isActive: true } });
      
      const currentDate = new Date();
      const validRates = await TAX.count({
        where: {
          isActive: true,
          effectiveFrom: { [Op.lte]: currentDate },
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: currentDate } }
          ]
        }
      });

      const expiringRates = await TAX.count({
        where: {
          isActive: true,
          effectiveTo: {
            [Op.between]: [currentDate, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] // Next 30 days
          }
        }
      });

      res.status(200).json({
        success: true,
        data: {
          totalRates,
          activeRates,
          validRates,
          expiringRates,
          defaultRate: defaultRate ? {
            id: defaultRate.id,
            name: defaultRate.name,
            code: defaultRate.code,
            displayRate: (parseFloat(defaultRate.rate) * 100).toFixed(2) + '%'
          } : null,
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error fetching tax statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching tax statistics',
        error: error.message
      });
    }
  }
};

// Helper functions
function isValidForDate(taxRate, date = new Date()) {
  if (!taxRate.isActive) return false;
  if (new Date(taxRate.effectiveFrom) > date) return false;
  if (taxRate.effectiveTo && new Date(taxRate.effectiveTo) < date) return false;
  return true;
}

function calculateTaxAmount(amount, taxRate, isTaxInclusive = true) {
  const rate = parseFloat(taxRate);
  const total = parseFloat(amount);
  
  if (isTaxInclusive) {
    // Price includes tax - extract tax amount
    const priceExcludingTax = total / (1 + rate);
    const taxAmount = total - priceExcludingTax;
    
    return {
      priceExcludingTax: parseFloat(priceExcludingTax.toFixed(4)),
      priceIncludingTax: total,
      taxAmount: parseFloat(taxAmount.toFixed(4)),
      taxRate: rate
    };
  } else {
    // Price excludes tax - add tax amount
    const taxAmount = total * rate;
    const priceIncludingTax = total + taxAmount;
    
    return {
      priceExcludingTax: total,
      priceIncludingTax: parseFloat(priceIncludingTax.toFixed(4)),
      taxAmount: parseFloat(taxAmount.toFixed(4)),
      taxRate: rate
    };
  }
}

module.exports = TaxController;