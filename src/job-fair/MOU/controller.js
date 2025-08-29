const logger = require("../../api/logger");
const { JobBatch, user } = require("../../models");
const { Op } = require("sequelize");

// controllers/JobBatchController.js
class JobBatchController {
  // Create new job batch
  static async create(req, res) {
    try {
      const {
        batchName,
        runningNo,
        jobDescription,
        totalPositions,
        batchStartDate,
        batchEndDate,
        deploymentDate,
        status,
        priority,
        notes
      } = req.body;

      // Get user ID from request (assuming it's set by auth middleware)
      const makerId = req.user?.id || req.userId;

      const jobBatch = await JobBatch.create({
        batchName,
        runningNo, // Will be auto-generated if not provided
        jobDescription,
        totalPositions: totalPositions || 0,
        batchStartDate,
        batchEndDate,
        deploymentDate,
        status: status || 'draft',
        priority: priority || 'medium',
        notes,
        makerId,
        updateUserId: makerId
      });

      logger.info(`Job batch created with ID: ${jobBatch.id} by user: ${makerId}`);

      return res.status(201).json({
        success: true,
        message: "Job batch created successfully",
        data: jobBatch
      });

    } catch (error) {
      logger.error("Error creating job batch:", error);
      
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
          message: "Running number already exists"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get all job batches with pagination and filtering
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        isActive = true,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = { isActive };

      // Add filters
      if (status) whereClause.status = status;
      if (priority) whereClause.priority = priority;
      
      if (search) {
        whereClause[Op.or] = [
          { batchName: { [Op.iLike]: `%${search}%` } },
          { runningNo: { [Op.iLike]: `%${search}%` } },
          { jobDescription: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await JobBatch.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            // attributes: ['id', 'name', 'email']
          },
          {
            model: user,
            as: 'updateUser',
            // attributes: ['id', 'name', 'email']
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.status(200).json({
        success: true,
        message: "Job batches retrieved successfully",
        data: {
          jobBatches: rows,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving job batches:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get active job batches (using model class method)
  static async getActiveBatches(req, res) {
    try {
      const activeBatches = await JobBatch.getActiveBatches();

      return res.status(200).json({
        success: true,
        message: "Active job batches retrieved successfully",
        data: activeBatches
      });

    } catch (error) {
      logger.error("Error retrieving active job batches:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get job batch by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const jobBatch = await JobBatch.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: user,
            as: 'maker',
            // attributes: ['id', 'name', 'email']
          },
          {
            model: user,
            as: 'updateUser',
            // attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!jobBatch) {
        return res.status(404).json({
          success: false,
          message: "Job batch not found"
        });
      }

      // Add computed properties
      const jobBatchWithExtras = {
        ...jobBatch.toJSON(),
        isOverdue: jobBatch.isOverdue()
      };

      return res.status(200).json({
        success: true,
        message: "Job batch retrieved successfully",
        data: jobBatchWithExtras
      });

    } catch (error) {
      logger.error("Error retrieving job batch:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update job batch
  static async update(req, res) {
    try {
      const { id } = req.params;
      const {
        batchName,
        runningNo,
        jobDescription,
        totalPositions,
        batchStartDate,
        batchEndDate,
        deploymentDate,
        status,
        priority,
        notes
      } = req.body;

      const updateUserId = req.user?.id || req.userId;

      const jobBatch = await JobBatch.findOne({
        where: { id, isActive: true }
      });

      if (!jobBatch) {
        return res.status(404).json({
          success: false,
          message: "Job batch not found"
        });
      }

      const updatedJobBatch = await jobBatch.update({
        batchName: batchName || jobBatch.batchName,
        runningNo: runningNo || jobBatch.runningNo,
        jobDescription: jobDescription !== undefined ? jobDescription : jobBatch.jobDescription,
        totalPositions: totalPositions !== undefined ? totalPositions : jobBatch.totalPositions,
        batchStartDate: batchStartDate !== undefined ? batchStartDate : jobBatch.batchStartDate,
        batchEndDate: batchEndDate !== undefined ? batchEndDate : jobBatch.batchEndDate,
        deploymentDate: deploymentDate !== undefined ? deploymentDate : jobBatch.deploymentDate,
        status: status || jobBatch.status,
        priority: priority || jobBatch.priority,
        notes: notes !== undefined ? notes : jobBatch.notes,
        updateUserId
      });

      logger.info(`Job batch updated with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Job batch updated successfully",
        data: updatedJobBatch
      });

    } catch (error) {
      logger.error("Error updating job batch:", error);
      
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
          message: "Running number already exists"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Soft delete job batch
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const updateUserId = req.user?.id || req.userId;

      const jobBatch = await JobBatch.findOne({
        where: { id, isActive: true }
      });

      if (!jobBatch) {
        return res.status(404).json({
          success: false,
          message: "Job batch not found"
        });
      }

      await jobBatch.update({
        isActive: false,
        updateUserId
      });

      logger.info(`Job batch soft deleted with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Job batch deleted successfully"
      });

    } catch (error) {
      logger.error("Error deleting job batch:", error);
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
        totalBatches,
        activeBatches,
        completedBatches,
        overdueBatches,
        draftBatches
      ] = await Promise.all([
        JobBatch.count({ where: { isActive: true } }),
        JobBatch.count({ where: { status: 'active', isActive: true } }),
        JobBatch.count({ where: { status: 'completed', isActive: true } }),
        JobBatch.count({
          where: {
            batchEndDate: { [Op.lt]: new Date() },
            status: { [Op.ne]: 'completed' },
            isActive: true
          }
        }),
        JobBatch.count({ where: { status: 'draft', isActive: true } })
      ]);

      const totalPositions = await JobBatch.sum('totalPositions', {
        where: { isActive: true }
      }) || 0;

      return res.status(200).json({
        success: true,
        message: "Dashboard statistics retrieved successfully",
        data: {
          totalBatches,
          activeBatches,
          completedBatches,
          overdueBatches,
          draftBatches,
          totalPositions
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

  // Update batch status
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updateUserId = req.user?.id || req.userId;

      const validStatuses = ['draft', 'active', 'completed', 'cancelled', 'on_hold'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status provided"
        });
      }

      const jobBatch = await JobBatch.findOne({
        where: { id, isActive: true }
      });

      if (!jobBatch) {
        return res.status(404).json({
          success: false,
          message: "Job batch not found"
        });
      }

      await jobBatch.update({ status, updateUserId });

      logger.info(`Job batch status updated to ${status} for ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: `Job batch status updated to ${status}`,
        data: { status }
      });

    } catch (error) {
      logger.error("Error updating job batch status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}

module.exports = JobBatchController;