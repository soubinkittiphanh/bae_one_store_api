// ===============================================================
// MOU CONTROLLER
// ===============================================================
const { MOU, Agency, user, currency, image } = require('../../models');
const logger = require('../../api/logger');
const { Op, ValidationError, DatabaseError } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

class MOUController {
  // ===============================================================
  // CREATE MOU
  // ===============================================================
  static async createMOU(req, res) {
    try {
      logger.info('Creating new MOU', { body: req.body });
      
      const {
        jobCode,
        mouNumber,
        pmCharge,
        exchangeRate,
        agencyId,
        employerCompany,
        workLocation,
        jobTitle,
        numberOfWorkers,
        workerType,
        jobStatus,
        documents,
        notes,
        currencyId
      } = req.body;

      // Validation
      if (!jobCode) {
        return res.status(400).json({
          success: false,
          message: 'Job code is required'
        });
      }

      if (!jobTitle) {
        return res.status(400).json({
          success: false,
          message: 'Job title is required'
        });
      }

      if (!numberOfWorkers || numberOfWorkers < 1) {
        return res.status(400).json({
          success: false,
          message: 'Number of workers must be at least 1'
        });
      }

      // Check if jobCode already exists
      const existingMOU = await MOU.findOne({ where: { jobCode } });
      if (existingMOU) {
        return res.status(409).json({
          success: false,
          message: 'Job code already exists'
        });
      }

      // Verify agency exists if provided
      if (agencyId) {
        const agency = await Agency.findByPk(agencyId);
        if (!agency) {
          return res.status(404).json({
            success: false,
            message: 'Agency not found'
          });
        }
      }

      // Verify currency exists if provided
      if (currencyId) {
        const currencyRecord = await currency.findByPk(currencyId);
        if (!currencyRecord) {
          return res.status(404).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      const newMOU = await MOU.create({
        jobCode,
        mouNumber,
        pmCharge: pmCharge || 0,
        exchangeRate: exchangeRate || 1,
        agencyId,
        employerCompany,
        workLocation,
        jobTitle,
        numberOfWorkers,
        workerType: workerType || 'Any',
        jobStatus: jobStatus || 'draft',
        documents,
        notes,
        currencyId,
        makerId: req.user?.id, // Assuming user ID is available in req.user
        isActive: true
      });

      // Fetch the created MOU with associations
      const mouWithAssociations = await MOU.findByPk(newMOU.id, {
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker' },
          { model: currency, as: 'currency' },
          { model: image, as: 'images' }
        ]
      });

      logger.info('MOU created successfully', { mouId: newMOU.id });

      res.status(201).json({
        success: true,
        message: 'MOU created successfully',
        data: mouWithAssociations
      });
    } catch (error) {
      logger.error('Error creating MOU:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(e => e.message)
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // GET ALL MOUs
  // ===============================================================
  static async getAllMOUs(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        agencyId,
        workerType,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
        isActive = true
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const whereClause = { isActive };

      // Add search functionality
      if (search) {
        whereClause[Op.or] = [
          { jobCode: { [Op.iLike]: `%${search}%` } },
          { jobTitle: { [Op.iLike]: `%${search}%` } },
          { employerCompany: { [Op.iLike]: `%${search}%` } },
          { workLocation: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Add filters
      if (status) whereClause.jobStatus = status;
      if (agencyId) whereClause.agencyId = agencyId;
      if (workerType) whereClause.workerType = workerType;

      const { count, rows } = await MOU.findAndCountAll({
        where: whereClause,
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: currency, as: 'currency' },
          { model: image, as: 'images' }
        ],
        limit: parseInt(limit),
        offset,
        order: [[sortBy, sortOrder.toUpperCase()]],
        distinct: true
      });

      const totalPages = Math.ceil(count / parseInt(limit));

      res.json({
        success: true,
        message: 'MOUs retrieved successfully',
        data: {
          mous: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit),
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching MOUs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // GET MOU BY ID
  // ===============================================================
  static async getMOUById(req, res) {
    try {
      const { id } = req.params;

      const mou = await MOU.findByPk(id, {
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: user, as: 'updateUser', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: currency, as: 'currency' },
          { model: image, as: 'images' }
        ]
      });

      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      res.json({
        success: true,
        message: 'MOU retrieved successfully',
        data: mou
      });
    } catch (error) {
      logger.error('Error fetching MOU by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // UPDATE MOU
  // ===============================================================
  static async updateMOU(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      
      // Add update user ID
      updateData.updateUserId = req.user?.id;

      const mou = await MOU.findByPk(id);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      // Validate unique jobCode if it's being updated
      if (updateData.jobCode && updateData.jobCode !== mou.jobCode) {
        const existingMOU = await MOU.findOne({ 
          where: { 
            jobCode: updateData.jobCode,
            id: { [Op.ne]: id }
          } 
        });
        if (existingMOU) {
          return res.status(409).json({
            success: false,
            message: 'Job code already exists'
          });
        }
      }

      // Verify agency exists if being updated
      if (updateData.agencyId) {
        const agency = await Agency.findByPk(updateData.agencyId);
        if (!agency) {
          return res.status(404).json({
            success: false,
            message: 'Agency not found'
          });
        }
      }

      // Verify currency exists if being updated
      if (updateData.currencyId) {
        const currencyRecord = await currency.findByPk(updateData.currencyId);
        if (!currencyRecord) {
          return res.status(404).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      await mou.update(updateData);

      // Fetch updated MOU with associations
      const updatedMOU = await MOU.findByPk(id, {
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: user, as: 'updateUser', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: currency, as: 'currency' },
          { model: image, as: 'images' }
        ]
      });

      logger.info('MOU updated successfully', { mouId: id });

      res.json({
        success: true,
        message: 'MOU updated successfully',
        data: updatedMOU
      });
    } catch (error) {
      logger.error('Error updating MOU:', error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map(e => e.message)
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // DELETE MOU (SOFT DELETE)
  // ===============================================================
  static async deleteMOU(req, res) {
    try {
      const { id } = req.params;

      const mou = await MOU.findByPk(id);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      // Soft delete by setting isActive to false
      await mou.update({ 
        isActive: false,
        updateUserId: req.user?.id 
      });

      logger.info('MOU deleted successfully', { mouId: id });

      res.json({
        success: true,
        message: 'MOU deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting MOU:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // GET MOUs BY STATUS
  // ===============================================================
  static async getMOUsByStatus(req, res) {
    try {
      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows } = await MOU.findAndCountAll({
        where: { 
          jobStatus: status,
          isActive: true 
        },
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'], },
          { model: currency, as: 'currency' }
        ],
        limit: parseInt(limit),
        offset,
        order: [['createdAt', 'DESC']]
      });

      const totalPages = Math.ceil(count / parseInt(limit));

      res.json({
        success: true,
        message: `MOUs with status '${status}' retrieved successfully`,
        data: {
          mous: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching MOUs by status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // UPDATE MOU STATUS
  // ===============================================================
  static async updateMOUStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['draft', 'open', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
        });
      }

      const mou = await MOU.findByPk(id);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      await mou.update({ 
        jobStatus: status,
        updateUserId: req.user?.id 
      });

      logger.info('MOU status updated successfully', { mouId: id, newStatus: status });

      res.json({
        success: true,
        message: 'MOU status updated successfully',
        data: { id, oldStatus: mou.jobStatus, newStatus: status }
      });
    } catch (error) {
      logger.error('Error updating MOU status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // GET MOU STATISTICS
  // ===============================================================
  static async getMOUStatistics(req, res) {
    try {
      const totalMOUs = await MOU.count({ where: { isActive: true } });
      const draftMOUs = await MOU.count({ where: { jobStatus: 'draft', isActive: true } });
      const openMOUs = await MOU.count({ where: { jobStatus: 'open', isActive: true } });
      const inProgressMOUs = await MOU.count({ where: { jobStatus: 'in_progress', isActive: true } });
      const completedMOUs = await MOU.count({ where: { jobStatus: 'completed', isActive: true } });
      const cancelledMOUs = await MOU.count({ where: { jobStatus: 'cancelled', isActive: true } });

      const totalWorkers = await MOU.sum('numberOfWorkers', { where: { isActive: true } });

      res.json({
        success: true,
        message: 'MOU statistics retrieved successfully',
        data: {
          totalMOUs,
          statusBreakdown: {
            draft: draftMOUs,
            open: openMOUs,
            inProgress: inProgressMOUs,
            completed: completedMOUs,
            cancelled: cancelledMOUs
          },
          totalWorkers: totalWorkers || 0
        }
      });
    } catch (error) {
      logger.error('Error fetching MOU statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = MOUController;