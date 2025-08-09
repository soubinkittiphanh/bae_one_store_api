const RevenueTarget = require('../models').revenue_target;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const { Op } = require('sequelize');

// Get all revenue targets
const getAllRevenueTargets = async (req, res) => {
  try {
    const revenueTargets = await RevenueTarget.findAll({
      include: [
        {
          model: require('../models').currency,
          as: 'currency'
        },
        {
          model: require('../models').ministry,
          as: 'subMinistries'
        },
        {
          model: require('../models').chartAccount,
          as: 'chartAccount'
        },
      ]
    });
    res.status(200).json(revenueTargets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a single revenue target by ID
const getRevenueTargetById = async (req, res) => {
  const { id } = req.params;
  try {
    const revenueTarget = await RevenueTarget.findOne({
      where: { id },
      include: [
        {
          model: require('../models').currency,
          as: 'currency'
        }
      ]
    });
    if (!revenueTarget) {
      return res.status(404).json({ message: 'Revenue target not found' });
    }
    res.status(200).json(revenueTarget);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new revenue target
const createRevenueTarget = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, year, targetAmount, exchangeRate, currencyId, remark, isActive, parentMinistryId, chartAccountId } = req.body;

  try {
    // Check if revenue target already exists for this name and year
    const existingTarget = await RevenueTarget.findOne({
      where: {
        name: name,
        year: year,
        isActive: true
      }
    });

    if (existingTarget) {
      return res.status(409).json({
        message: `Revenue target for "${name}" in year ${year} already exists`
      });
    }

    const newRevenueTarget = await RevenueTarget.create({
      name,
      year,
      targetAmount,
      exchangeRate,
      currencyId,
      remark,
      isActive,
      parentMinistryId,
      chartAccountId,
    });
    res.status(200).json(newRevenueTarget);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing revenue target by ID
const updateRevenueTargetById = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, year, targetAmount, exchangeRate, currencyId, remark, isActive, parentMinistryId, chartAccountId } = req.body;

  try {
    const revenueTarget = await RevenueTarget.findOne({ where: { id } });
    if (!revenueTarget) {
      return res.status(404).json({ message: 'Revenue target not found' });
    }

    // Check for duplicate name and year if they are being updated
    if (name !== revenueTarget.name || year !== revenueTarget.year) {
      const existingTarget = await RevenueTarget.findOne({
        where: {
          name: name || revenueTarget.name,
          year: year || revenueTarget.year,
          isActive: true,
          id: { [Op.ne]: id }
        }
      });

      if (existingTarget) {
        return res.status(409).json({
          message: `Revenue target for "${name || revenueTarget.name}" in year ${year || revenueTarget.year} already exists`
        });
      }
    }

    await RevenueTarget.update(
      {
        name,
        year,
        targetAmount,
        exchangeRate,
        currencyId,
        remark,
        isActive,
        parentMinistryId,
        chartAccountId,
      },
      { where: { id } }
    );
    res.status(200).json({ message: 'Revenue target updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete a revenue target by ID
const deleteRevenueTargetById = async (req, res) => {
  const { id } = req.params;
  try {
    const revenueTarget = await RevenueTarget.findOne({ where: { id } });
    if (!revenueTarget) {
      return res.status(404).json({ message: 'Revenue target not found' });
    }
    await RevenueTarget.destroy({ where: { id } });
    res.status(200).json({ message: 'Revenue target deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get revenue targets by year
const getRevenueTargetsByYear = async (req, res) => {
  logger.info(`REVENUE TARGET IS BEING CALLED `)
  const { year } = req.params;
  try {
    const revenueTargets = await RevenueTarget.findAll({
      where: {
        year: parseInt(year),
        isActive: true
      },
      include: [
        {
          model: require('../models').currency,
          as: 'currency'
        },
        {
          model: require('../models').ministry,
          as: 'subMinistries'
        },
        {
          model: require('../models').chartAccount,
          as: 'chartAccount'
        },
      ],
      order: [['name', 'ASC']]
    });
    logger.info(`RESPONSE DATA ${revenueTargets}`)
    res.status(200).json(revenueTargets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Soft delete revenue target (set isActive to false)
const softDeleteRevenueTargetById = async (req, res) => {
  const { id } = req.params;
  try {
    const revenueTarget = await RevenueTarget.findOne({ where: { id } });
    if (!revenueTarget) {
      return res.status(404).json({ message: 'Revenue target not found' });
    }
    await RevenueTarget.update(
      { isActive: false },
      { where: { id } }
    );
    res.status(200).json({ message: 'Revenue target deactivated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Restore soft-deleted revenue target
const restoreRevenueTargetById = async (req, res) => {
  const { id } = req.params;
  try {
    const revenueTarget = await RevenueTarget.findOne({ where: { id } });
    if (!revenueTarget) {
      return res.status(404).json({ message: 'Revenue target not found' });
    }

    if (revenueTarget.isActive) {
      return res.status(400).json({ message: 'Revenue target is already active' });
    }

    // Check for duplicate name and year
    const existingTarget = await RevenueTarget.findOne({
      where: {
        name: revenueTarget.name,
        year: revenueTarget.year,
        isActive: true,
        id: { [Op.ne]: id }
      }
    });

    if (existingTarget) {
      return res.status(409).json({
        message: `Active revenue target for "${revenueTarget.name}" in year ${revenueTarget.year} already exists`
      });
    }

    await RevenueTarget.update(
      { isActive: true },
      { where: { id } }
    );
    res.status(200).json({ message: 'Revenue target restored successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Search revenue targets
const searchRevenueTargets = async (req, res) => {
  const { name, year, isActive } = req.query;
  try {
    const where = {};

    if (name) {
      where.name = { [Op.iLike]: `%${name}%` };
    }

    if (year) {
      where.year = parseInt(year);
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const revenueTargets = await RevenueTarget.findAll({
      where,
      include: [
        {
          model: require('../models').currency,
          as: 'currency'
        }
      ],
      order: [['year', 'DESC'], ['name', 'ASC']]
    });

    res.status(200).json(revenueTargets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllRevenueTargets,
  getRevenueTargetById,
  createRevenueTarget,
  updateRevenueTargetById,
  deleteRevenueTargetById,
  getRevenueTargetsByYear,
  softDeleteRevenueTargetById,
  restoreRevenueTargetById,
  searchRevenueTargets,
};