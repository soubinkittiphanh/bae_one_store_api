// ===============================================================
// BENEFIT CONTROLLER
// controllers/benefitController.js
// ===============================================================

const {  user } = require('../models');
const JobAdvertise = require('../models').jobAdvertise;
const Benefit = require('../models').benefit;
const { sequelize } = require('../models');
const logger = require('../api/logger');

const benefitController = {
  // Create new benefit
  async create(req, res) {
    try {
      const benefitData = {
        ...req.body,
        makerId: req.user?.id || req.body.makerId
      };

      const benefit = await Benefit.create(benefitData);
      
      logger.info(`Benefit created with ID: ${benefit.id}`);
      
      res.status(201).json({
        success: true,
        message: 'Benefit created successfully',
        data: benefit
      });
    } catch (error) {
      logger.error('Error creating benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create benefit',
        error: error.message
      });
    }
  },

  // Get all benefits
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, type, jobAdvertiseId, isActive } = req.query;
      const offset = (page - 1) * limit;
      
      const whereClause = {};
      if (type) whereClause.type = type;
      if (jobAdvertiseId) whereClause.jobAdvertiseId = jobAdvertiseId;
      if (isActive !== undefined) whereClause.isActive = isActive === 'true';

      const benefits = await Benefit.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          },
          {
            model: JobAdvertise,
            as: 'jobAdvertise',
            attributes: ['id', 'title', 'country']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: benefits,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(benefits.count / limit),
          totalItems: benefits.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching benefits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch benefits',
        error: error.message
      });
    }
  },

  // Get benefit by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      const benefit = await Benefit.findByPk(id, {
        include: [
          {
            model: user,
            as: 'maker',
            
          },
          {
            model: user,
            as: 'updateUser',
            
          },
          {
            model: JobAdvertise,
            as: 'jobAdvertise',
            attributes: ['id', 'title', 'country']
          }
        ]
      });

      if (!benefit) {
        return res.status(404).json({
          success: false,
          message: 'Benefit not found'
        });
      }

      res.status(200).json({
        success: true,
        data: benefit
      });
    } catch (error) {
      logger.error('Error fetching benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch benefit',
        error: error.message
      });
    }
  },

  // Update benefit
  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updateUserId: req.user?.id || req.body.updateUserId
      };

      const [updatedRowsCount] = await Benefit.update(updateData, {
        where: { id }
      });

      if (updatedRowsCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Benefit not found'
        });
      }

      const updatedBenefit = await Benefit.findByPk(id, {
        include: [
          {
            model: user,
            as: 'maker',
            
          },
          {
            model: user,
            as: 'updateUser',
            
          }
        ]
      });

      logger.info(`Benefit updated with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Benefit updated successfully',
        data: updatedBenefit
      });
    } catch (error) {
      logger.error('Error updating benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update benefit',
        error: error.message
      });
    }
  },

  // Delete benefit
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      const deletedRowsCount = await Benefit.destroy({
        where: { id }
      });

      if (deletedRowsCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Benefit not found'
        });
      }

      logger.info(`Benefit deleted with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Benefit deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete benefit',
        error: error.message
      });
    }
  },

  // Get benefits by job advertisement ID
  async getByJobAdvertiseId(req, res) {
    try {
      const { jobAdvertiseId } = req.params;
      
      const benefits = await Benefit.findAll({
        where: { 
          jobAdvertiseId: jobAdvertiseId,
          isActive: true 
        },
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        order: [['type', 'ASC'], ['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: benefits
      });
    } catch (error) {
      logger.error('Error fetching benefits by job advertisement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch benefits',
        error: error.message
      });
    }
  },

  // Get benefits statistics by type
  async getStatsByType(req, res) {
    try {
      const stats = await Benefit.findAll({
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('AVG', sequelize.col('value')), 'averageValue'],
          [sequelize.fn('SUM', sequelize.col('value')), 'totalValue']
        ],
        where: { isActive: true },
        group: ['type']
      });

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching benefit stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
};

module.exports = benefitController;