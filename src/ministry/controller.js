const  Ministry  = require('../models').ministry;
const { Op } = require('sequelize');

const ministryController = {
  // Get all ministries with optional filtering
  getAllMinistries: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 10, 
        search, 
        ministryType, 
        status, 
        isActive 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      // Build where clause
      const whereClause = {};
      
      if (search) {
        whereClause[Op.or] = [
          { ministryName: { [Op.iLike]: `%${search}%` } },
          { ministryNameEn: { [Op.iLike]: `%${search}%` } },
          { ministryCode: { [Op.iLike]: `%${search}%` } }
        ];
      }
      
      if (ministryType) {
        whereClause.ministryType = ministryType;
      }
      
      if (status) {
        whereClause.status = status;
      }
      
      if (isActive !== undefined) {
        whereClause.isActive = isActive === 'true';
      }
      
      const ministries = await Ministry.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Ministry,
            as: 'parentMinistry',
            attributes: ['id', 'ministryName', 'ministryCode']
          },
          {
            model: Ministry,
            as: 'subMinistries',
            attributes: ['id', 'ministryName', 'ministryCode', 'ministryType']
          }
        ],
        order: [['priority', 'DESC'], ['ministryName', 'ASC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.status(200).json({
        success: true,
        data: ministries.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(ministries.count / limit),
          totalCount: ministries.count,
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching ministries',
        error: error.message
      });
    }
  },

  // Get ministry by ID
  getMinistryById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const ministry = await Ministry.findByPk(id, {
        include: [
          {
            model: Ministry,
            as: 'parentMinistry',
            attributes: ['id', 'ministryName', 'ministryCode']
          },
          {
            model: Ministry,
            as: 'subMinistries',
            attributes: ['id', 'ministryName', 'ministryCode', 'ministryType']
          }
        ]
      });
      
      if (!ministry) {
        return res.status(404).json({
          success: false,
          message: 'Ministry not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: ministry
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching ministry',
        error: error.message
      });
    }
  },

  // Create new ministry
  createMinistry: async (req, res) => {
    try {
      const ministryData = req.body;
      
      const newMinistry = await Ministry.create(ministryData);
      
      res.status(201).json({
        success: true,
        message: 'Ministry created successfully',
        data: newMinistry
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Ministry code already exists',
          error: error.message
        });
      }
      
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.errors.map(err => err.message)
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error creating ministry',
        error: error.message
      });
    }
  },

  // Update ministry
  updateMinistry: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const ministry = await Ministry.findByPk(id);
      
      if (!ministry) {
        return res.status(404).json({
          success: false,
          message: 'Ministry not found'
        });
      }
      
      await ministry.update(updateData);
      
      res.status(200).json({
        success: true,
        message: 'Ministry updated successfully',
        data: ministry
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Ministry code already exists',
          error: error.message
        });
      }
      
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.errors.map(err => err.message)
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating ministry',
        error: error.message
      });
    }
  },

  // Delete ministry (soft delete by setting isActive to false)
  deleteMinistry: async (req, res) => {
    try {
      const { id } = req.params;
      
      const ministry = await Ministry.findByPk(id);
      
      if (!ministry) {
        return res.status(404).json({
          success: false,
          message: 'Ministry not found'
        });
      }
      
      // Check if ministry has sub-ministries
      const subMinistries = await Ministry.count({
        where: { parentMinistryId: id, isActive: true }
      });
      
      if (subMinistries > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete ministry with active sub-ministries'
        });
      }
      
      await ministry.update({ isActive: false, status: 'Inactive' });
      
      res.status(200).json({
        success: true,
        message: 'Ministry deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting ministry',
        error: error.message
      });
    }
  },

  // Get ministry hierarchy
  getMinistryHierarchy: async (req, res) => {
    try {
      const ministries = await Ministry.findAll({
        where: { isActive: true },
        include: [
          {
            model: Ministry,
            as: 'subMinistries',
            where: { isActive: true },
            required: false,
            include: [
              {
                model: Ministry,
                as: 'subMinistries',
                where: { isActive: true },
                required: false
              }
            ]
          }
        ],
        where: { parentMinistryId: null },
        order: [['priority', 'DESC'], ['ministryName', 'ASC']]
      });
      
      res.status(200).json({
        success: true,
        data: ministries
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching ministry hierarchy',
        error: error.message
      });
    }
  },

  // Get ministries by type
  getMinisteriesByType: async (req, res) => {
    try {
      const { type } = req.params;
      
      const ministries = await Ministry.findAll({
        where: { 
          ministryType: type,
          isActive: true 
        },
        order: [['priority', 'DESC'], ['ministryName', 'ASC']]
      });
      
      res.status(200).json({
        success: true,
        data: ministries
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching ministries by type',
        error: error.message
      });
    }
  }
};

module.exports = ministryController;