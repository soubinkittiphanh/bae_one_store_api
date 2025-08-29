// ===============================================================
// APPLICANT CONTROLLER
// controllers/ApplicantController.js
// ===============================================================

const logger = require("../../api/logger");
const { Applicant, user } = require("../../models");
const { Op } = require("sequelize");

class ApplicantController {
  // Create new applicant
  static async create(req, res) {
    try {
      const {
        firstName,
        lastName,
        gender,
        age,
        maritalStatus,
        phone,
        emergencyContactNo,
        address,
        village,
        city,
        district,
        passportAvailability,
        passportNo,
        passportExpiredDate,
        workPlace,
        contactStartDate,
        contactEndDate,
        registertDate,
        interviewExamDate,
        passportPhoto,
        applicantPhoto,
        status
      } = req.body;

      // Get user ID from request (assuming it's set by auth middleware)
      const makerId = req.user?.id || req.userId;

      const applicant = await Applicant.create({
        firstName,
        lastName,
        gender,
        age,
        maritalStatus,
        phone,
        emergencyContactNo,
        address,
        village,
        city,
        district,
        passportAvailability: passportAvailability || false,
        passportNo,
        passportExpiredDate,
        workPlace,
        contactStartDate,
        contactEndDate,
        registertDate,
        interviewExamDate,
        passportPhoto,
        applicantPhoto,
        status: status || 'INTERVIEW',
        makerId,
        updateUserId: makerId
      });

      logger.info(`Applicant created with ID: ${applicant.id} by user: ${makerId}`);

      return res.status(201).json({
        success: true,
        message: "Applicant created successfully",
        data: applicant
      });

    } catch (error) {
      logger.error("Error creating applicant:", error);
      
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
          message: "Phone number already exists"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get all applicants with pagination and filtering
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        gender,
        passportAvailability,
        isActive = true,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = { isActive };

      // Add filters
      if (status) whereClause.status = status;
      if (gender) whereClause.gender = gender;
      if (passportAvailability !== undefined) whereClause.passportAvailability = passportAvailability === 'true';
      
      if (search) {
        whereClause[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { passportNo: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Applicant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['id', 'name', 'email']
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.status(200).json({
        success: true,
        message: "Applicants retrieved successfully",
        data: {
          applicants: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving applicants:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get applicant by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const applicant = await Applicant.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['id', 'name', 'email']
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Applicant retrieved successfully",
        data: applicant
      });

    } catch (error) {
      logger.error("Error retrieving applicant:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update applicant
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      const updateUserId = req.user?.id || req.userId;

      const applicant = await Applicant.findOne({
        where: { id, isActive: true }
      });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      // Add updateUserId to the update data
      updateData.updateUserId = updateUserId;

      const updatedApplicant = await applicant.update(updateData);

      logger.info(`Applicant updated with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Applicant updated successfully",
        data: updatedApplicant
      });

    } catch (error) {
      logger.error("Error updating applicant:", error);
      
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

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Soft delete applicant
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const updateUserId = req.user?.id || req.userId;

      const applicant = await Applicant.findOne({
        where: { id, isActive: true }
      });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      await applicant.update({
        isActive: false,
        updateUserId
      });

      logger.info(`Applicant soft deleted with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Applicant deleted successfully"
      });

    } catch (error) {
      logger.error("Error deleting applicant:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Search applicants
  static async search(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        keyword,
        status,
        gender,
        passportAvailability,
        city,
        workPlace
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = { isActive: true };

      // Add filters
      if (status) whereClause.status = status;
      if (gender) whereClause.gender = gender;
      if (passportAvailability !== undefined) whereClause.passportAvailability = passportAvailability === 'true';
      if (city) whereClause.city = city;
      if (workPlace) whereClause.workPlace = { [Op.iLike]: `%${workPlace}%` };

      // Add keyword search
      if (keyword) {
        whereClause[Op.or] = [
          { firstName: { [Op.iLike]: `%${keyword}%` } },
          { lastName: { [Op.iLike]: `%${keyword}%` } },
          { phone: { [Op.iLike]: `%${keyword}%` } },
          { passportNo: { [Op.iLike]: `%${keyword}%` } },
          { address: { [Op.iLike]: `%${keyword}%` } }
        ];
      }

      const { count, rows } = await Applicant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['id', 'name', 'email']
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
          applicants: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error searching applicants:", error);
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
        totalApplicants,
        interviewApplicants,
        registeredApplicants,
        rejectedApplicants,
        withPassport,
        maleApplicants,
        femaleApplicants
      ] = await Promise.all([
        Applicant.count({ where: { isActive: true } }),
        Applicant.count({ where: { status: 'INTERVIEW', isActive: true } }),
        Applicant.count({ where: { status: 'REGISTER', isActive: true } }),
        Applicant.count({ where: { status: 'rejected', isActive: true } }),
        Applicant.count({ where: { passportAvailability: true, isActive: true } }),
        Applicant.count({ where: { gender: 'male', isActive: true } }),
        Applicant.count({ where: { gender: 'female', isActive: true } })
      ]);

      return res.status(200).json({
        success: true,
        message: "Dashboard statistics retrieved successfully",
        data: {
          totalApplicants,
          interviewApplicants,
          registeredApplicants,
          rejectedApplicants,
          withPassport,
          maleApplicants,
          femaleApplicants
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

  // Update applicant status
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updateUserId = req.user?.id || req.userId;

      const validStatuses = ['INTERVIEW', 'REGISTER', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status provided"
        });
      }

      const applicant = await Applicant.findOne({
        where: { id, isActive: true }
      });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      await applicant.update({ status, updateUserId });

      logger.info(`Applicant status updated to ${status} for ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: `Applicant status updated to ${status}`,
        data: { status }
      });

    } catch (error) {
      logger.error("Error updating applicant status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get applicants by status
  static async getByStatus(req, res) {
    try {
      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Applicant.findAndCountAll({
        where: { 
          status: status.toUpperCase(),
          isActive: true 
        },
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['id', 'name', 'email']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: `Applicants with status ${status} retrieved successfully`,
        data: {
          applicants: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving applicants by status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}

module.exports = ApplicantController;