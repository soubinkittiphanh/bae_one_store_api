// ===============================================================
// JOB ADVERTISE CONTROLLER
// controllers/jobAdvertiseController.js
// ===============================================================

const { user } = require('../../models');
const JobAdvertise = require('../../models').jobAdvertise;
const { sequelize } = require('../../models');
const logger = require('../../api/logger');

const jobAdvertiseController = {
  // Create new job advertisement
  async create(req, res) {
    try {
      const jobAdvertiseData = {
        ...req.body,
        makerId: req.user?.id || req.body.makerId
      };

      const jobAdvertise = await JobAdvertise.create(jobAdvertiseData);
      
      logger.info(`JobAdvertise created with ID: ${jobAdvertise.id}`);
      
      res.status(201).json({
        success: true,
        message: 'Job advertisement created successfully',
        data: jobAdvertise
      });
    } catch (error) {
      logger.error('Error creating job advertisement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create job advertisement',
        error: error.message
      });
    }
  },

  // Get all job advertisements
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, status, country, province } = req.query;
      const offset = (page - 1) * limit;
      
      const whereClause = {};
      if (status) whereClause.status = status;
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;

      const jobAdvertises = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobAdvertises.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobAdvertises.count / limit),
          totalItems: jobAdvertises.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisement by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      const jobAdvertise = await JobAdvertise.findByPk(id, {
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

      if (!jobAdvertise) {
        return res.status(404).json({
          success: false,
          message: 'Job advertisement not found'
        });
      }

      res.status(200).json({
        success: true,
        data: jobAdvertise
      });
    } catch (error) {
      logger.error('Error fetching job advertisement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisement',
        error: error.message
      });
    }
  },

  // Update job advertisement
  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updateUserId: req.user?.id || req.body.updateUserId
      };

      const [updatedRowsCount] = await JobAdvertise.update(updateData, {
        where: { id }
      });

      if (updatedRowsCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Job advertisement not found'
        });
      }

      const updatedJobAdvertise = await JobAdvertise.findByPk(id, {
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

      logger.info(`JobAdvertise updated with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Job advertisement updated successfully',
        data: updatedJobAdvertise
      });
    } catch (error) {
      logger.error('Error updating job advertisement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update job advertisement',
        error: error.message
      });
    }
  },

  // Delete job advertisement
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      const deletedRowsCount = await JobAdvertise.destroy({
        where: { id }
      });

      if (deletedRowsCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Job advertisement not found'
        });
      }

      logger.info(`JobAdvertise deleted with ID: ${id}`);

      res.status(200).json({
        success: true,
        message: 'Job advertisement deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting job advertisement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete job advertisement',
        error: error.message
      });
    }
  },

  // Get job advertisements statistics
  async getStats(req, res) {
    try {
      const stats = await JobAdvertise.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });

      const countryStats = await JobAdvertise.findAll({
        attributes: [
          'country',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['country'],
        where: { status: 'active' }
      });

      res.status(200).json({
        success: true,
        data: {
          statusStats: stats,
          countryStats: countryStats
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisement stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  },

  // Get active job advertisements
  async getActive(req, res) {
    try {
      const { page = 1, limit = 10, country, province } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;

      const activeJobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: activeJobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(activeJobs.count / limit),
          totalItems: activeJobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching active job advertisements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisements by country
  async getByCountry(req, res) {
    try {
      const { country } = req.params;
      const { page = 1, limit = 10, status = 'active', province } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { 
        country: country,
        status: status
      };
      if (province) whereClause.province = province;

      const jobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements by country:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisements by province
  async getByProvince(req, res) {
    try {
      const { country, province } = req.params;
      const { page = 1, limit = 10, status = 'active' } = req.query;
      const offset = (page - 1) * limit;

      const jobs = await JobAdvertise.findAndCountAll({
        where: { 
          country: country,
          province: province,
          status: status
        },
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements by province:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisements with specific requirements
  async getByRequirements(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        requiresPassport, 
        requiresGoodEyesight, 
        requiresLanguage, 
        allowsTattoos,
        country,
        province
      } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;
      if (requiresPassport !== undefined) whereClause.requiresPassport = requiresPassport === 'true';
      if (requiresGoodEyesight !== undefined) whereClause.requiresGoodEyesight = requiresGoodEyesight === 'true';
      if (requiresLanguage) whereClause.requiresLanguage = requiresLanguage;
      if (allowsTattoos !== undefined) whereClause.allowsTattoos = allowsTattoos === 'true';

      const jobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements by requirements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisements by date range
  async getByDateRange(req, res) {
    try {
      const { page = 1, limit = 10, startDate, endDate, country, province } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;
      
      if (startDate || endDate) {
        whereClause.startDate = {};
        if (startDate) whereClause.startDate[sequelize.Op.gte] = startDate;
        if (endDate) whereClause.startDate[sequelize.Op.lte] = endDate;
      }

      const jobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['startDate', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements by date range:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Get job advertisements by maximum applicants limit
  async getByApplicantLimit(req, res) {
    try {
      const { page = 1, limit = 10, maxApplicants, country, province } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;
      if (maxApplicants) whereClause.maxApplicants = { [sequelize.Op.lte]: parseInt(maxApplicants) };

      const jobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching job advertisements by applicant limit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job advertisements',
        error: error.message
      });
    }
  },

  // Search job advertisements
  async search(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        keyword, 
        country, 
        province, 
        status = 'active',
        requiresPassport,
        requiresGoodEyesight,
        requiresLanguage,
        allowsTattoos
      } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = { status };
      if (country) whereClause.country = country;
      if (province) whereClause.province = province;
      if (requiresPassport !== undefined) whereClause.requiresPassport = requiresPassport === 'true';
      if (requiresGoodEyesight !== undefined) whereClause.requiresGoodEyesight = requiresGoodEyesight === 'true';
      if (requiresLanguage) whereClause.requiresLanguage = requiresLanguage;
      if (allowsTattoos !== undefined) whereClause.allowsTattoos = allowsTattoos === 'true';

      // Add keyword search for title and job description
      if (keyword) {
        whereClause[sequelize.Op.or] = [
          { title: { [sequelize.Op.iLike]: `%${keyword}%` } },
          { jobDescription: { [sequelize.Op.iLike]: `%${keyword}%` } }
        ];
      }

      const jobs = await JobAdvertise.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({
        success: true,
        data: jobs.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(jobs.count / limit),
          totalItems: jobs.count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error searching job advertisements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search job advertisements',
        error: error.message
      });
    }
  }
};

module.exports = jobAdvertiseController;