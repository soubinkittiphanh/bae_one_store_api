// ===============================================================
// AGENCY CONTROLLER
// controllers/AgencyController.js
// ===============================================================

const logger = require("../../api/logger");
const { Agency, user } = require("../../models");
const User  = require("../../models").user;
const { Op } = require("sequelize");

class AgencyController {
  // Create new agency
  static async create(req, res) {
    try {
      const {
        agencyName,
        agencyCode,
        registrationNumber,
        phone,
        email,
        address,
        village,
        city,
        district,
        licenseNumber,
        registrationDate,
        licenseExpiryDate,
        contactPersonName,
        contactPersonPosition,
        contactPersonPhone,
        status,
        notes
      } = req.body;

      // Get user ID from request (assuming it's set by auth middleware)
      const makerId = req.user?.id || req.userId;

      const agency = await Agency.create({
        agencyName,
        agencyCode,
        registrationNumber,
        phone,
        email,
        address,
        village,
        city,
        district,
        licenseNumber,
        registrationDate,
        licenseExpiryDate,
        contactPersonName,
        contactPersonPosition,
        contactPersonPhone,
        status: status || 'active',
        notes,
        makerId,
        updateUserId: makerId
      });

      logger.info(`Agency created with ID: ${agency.id} by user: ${makerId}`);

      return res.status(201).json({
        success: true,
        message: "Agency created successfully",
        data: agency
      });

    } catch (error) {
      logger.error("Error creating agency:", error);

      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors.map(e => ({
            field: e.path,
            message: e.message
          }))
        });
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          success: false,
          message: "Agency code already exists"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get all agencies with pagination and filtering

  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        city,
        district,
        isActive = 'true', // Query params are strings, not booleans
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      // Convert isActive string to boolean
      const whereClause = {
        isActive: isActive === 'true' || isActive === true
      };

      // Add filters
      if (status) whereClause.status = status;
      if (city) whereClause.city = city;
      if (district) whereClause.district = district;

      if (search) {
        whereClause[Op.or] = [
          { agencyName: { [Op.iLike]: `%${search}%` } },
          { agencyCode: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { contactPersonName: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Use findAndCountAll instead of findAll to get both count and rows
      const { count, rows } = await Agency.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User, // Make sure this matches your actual User model name
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email'],
            required: false // Use left join in case no maker exists
          },
          {
            model: User, // Make sure this matches your actual User model name
            as: 'updateUser',
            attributes: ['cus_id', 'cus_name', 'cus_email'],
            required: false // Use left join in case no updateUser exists
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        distinct: true // Important when using includes to get correct count
      });
      logger.info(`Retrieved ${count} agencies`);
      logger.info(`Retrieved ${rows} agencies`);

      return res.status(200).json({
        success: true,
        message: "Agencies retrieved successfully",
        data: {
          agencies: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      console.error("Error retrieving agencies:", error);

      // Return more detailed error info in development
      const isDevelopment = process.env.NODE_ENV === 'development';

      return res.status(500).json({
        success: false,
        message: "Internal server error",
        ...(isDevelopment && { error: error.message, stack: error.stack })
      });
    }
  }
  // Get agency by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const agency = await Agency.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          }
        ]
      });

      if (!agency) {
        return res.status(404).json({
          success: false,
          message: "Agency not found"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Agency retrieved successfully",
        data: agency
      });

    } catch (error) {
      logger.error("Error retrieving agency:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update agency
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      const updateUserId = req.user?.id || req.userId;

      const agency = await Agency.findOne({
        where: { id, isActive: true }
      });

      if (!agency) {
        return res.status(404).json({
          success: false,
          message: "Agency not found"
        });
      }

      // Add updateUserId to the update data
      updateData.updateUserId = updateUserId;

      const updatedAgency = await agency.update(updateData);

      logger.info(`Agency updated with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Agency updated successfully",
        data: updatedAgency
      });

    } catch (error) {
      logger.error("Error updating agency:", error);

      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors.map(e => ({
            field: e.path,
            message: e.message
          }))
        });
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          success: false,
          message: "Agency code already exists"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Soft delete agency
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const updateUserId = req.user?.id || req.userId;

      const agency = await Agency.findOne({
        where: { id, isActive: true }
      });

      if (!agency) {
        return res.status(404).json({
          success: false,
          message: "Agency not found"
        });
      }

      await agency.update({
        isActive: false,
        updateUserId
      });

      logger.info(`Agency soft deleted with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Agency deleted successfully"
      });

    } catch (error) {
      logger.error("Error deleting agency:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Search agencies
  static async search(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        keyword,
        status,
        city,
        district
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = { isActive: true };

      // Add filters
      if (status) whereClause.status = status;
      if (city) whereClause.city = city;
      if (district) whereClause.district = district;

      // Add keyword search
      if (keyword) {
        whereClause[Op.or] = [
          { agencyName: { [Op.iLike]: `%${keyword}%` } },
          { agencyCode: { [Op.iLike]: `%${keyword}%` } },
          { phone: { [Op.iLike]: `%${keyword}%` } },
          { email: { [Op.iLike]: `%${keyword}%` } },
          { contactPersonName: { [Op.iLike]: `%${keyword}%` } },
          { address: { [Op.iLike]: `%${keyword}%` } }
        ];
      }

      const { count, rows } = await Agency.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: "Search results retrieved successfully",
        data: {
          agencies: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error searching agencies:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(req, res) {
    try {
      const [
        totalAgencies,
        activeAgencies,
        inactiveAgencies,
        suspendedAgencies,
        agenciesWithLicense,
        agenciesExpiringSoon
      ] = await Promise.all([
        Agency.count({ where: { isActive: true } }),
        Agency.count({ where: { status: 'active', isActive: true } }),
        Agency.count({ where: { status: 'inactive', isActive: true } }),
        Agency.count({ where: { status: 'suspended', isActive: true } }),
        Agency.count({
          where: {
            licenseNumber: { [Op.ne]: null },
            isActive: true
          }
        }),
        Agency.count({
          where: {
            licenseExpiryDate: {
              [Op.lte]: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            },
            status: 'active',
            isActive: true
          }
        })
      ]);

      return res.status(200).json({
        success: true,
        message: "Dashboard statistics retrieved successfully",
        data: {
          totalAgencies,
          activeAgencies,
          inactiveAgencies,
          suspendedAgencies,
          agenciesWithLicense,
          agenciesExpiringSoon
        }
      });

    } catch (error) {
      logger.error("Error retrieving dashboard statistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update agency status
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updateUserId = req.user?.id || req.userId;

      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status provided"
        });
      }

      const agency = await Agency.findOne({
        where: { id, isActive: true }
      });

      if (!agency) {
        return res.status(404).json({
          success: false,
          message: "Agency not found"
        });
      }

      await agency.update({ status, updateUserId });

      logger.info(`Agency status updated to ${status} for ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: `Agency status updated to ${status}`,
        data: { status }
      });

    } catch (error) {
      logger.error("Error updating agency status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get agencies by status
  static async getByStatus(req, res) {
    try {
      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Agency.findAndCountAll({
        where: {
          status: status.toLowerCase(),
          isActive: true
        },
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: `Agencies with status ${status} retrieved successfully`,
        data: {
          agencies: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving agencies by status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get agencies by city
  static async getByCity(req, res) {
    try {
      const { city } = req.params;
      const { page = 1, limit = 10, status = 'active' } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Agency.findAndCountAll({
        where: {
          city: city,
          status: status,
          isActive: true
        },
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: `Agencies in ${city} retrieved successfully`,
        data: {
          agencies: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving agencies by city:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}

module.exports = AgencyController;