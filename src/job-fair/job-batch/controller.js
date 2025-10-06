const logger = require("../../api/logger");
const { JobBatch, user, MOU, Applicant, sequelize } = require("../../models"); // Added MOU import
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
        batchDeliveryDate,
        deploymentDate,
        status,
        priority,
        notes,
        mouId // NEW: MOU association
      } = req.body;

      // Get user ID from request (assuming it's set by auth middleware)
      const makerId = req.user?.id || req.userId;

      // NEW: Validate MOU exists if mouId is provided
      if (mouId) {
        const mouExists = await MOU.findByPk(mouId);
        if (!mouExists) {
          return res.status(400).json({
            success: false,
            message: "Invalid MOU ID provided"
          });
        }
      }

      const jobBatch = await JobBatch.create({
        batchName,
        runningNo, // Will be auto-generated if not provided
        jobDescription,
        totalPositions: totalPositions || 0,
        batchStartDate,
        batchEndDate,
        batchDeliveryDate,
        deploymentDate,
        status: status || 'draft',
        priority: priority || 'medium',
        notes,
        mouId, // NEW: Include MOU ID
        makerId,
        updateUserId: makerId
      });

      // NEW: Fetch created job batch with associations for response
      const createdJobBatch = await JobBatch.findByPk(jobBatch.id, {
        include: [
          {
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'numberOfWorkers', 'workerType', 'jobStatus']
          }
        ]
      });

      logger.info(`Job batch created with ID: ${jobBatch.id} by user: ${makerId}`);

      return res.status(201).json({
        success: true,
        message: "Job batch created successfully",
        data: createdJobBatch
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

      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
          success: false,
          message: "Invalid MOU reference"
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get all job batches with pagination and filtering
  // Get all job batches with pagination, filtering, and applicant statistics
  // Get all job batches with pagination, filtering, and applicant statistics
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        mouId,
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
      if (mouId) whereClause.mouId = mouId;

      if (search) {
        whereClause[Op.or] = [
          { batchName: { [Op.iLike]: `%${search}%` } },
          { runningNo: { [Op.iLike]: `%${search}%` } },
          { jobDescription: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // First, get the job batches with basic includes
      const { count, rows } = await JobBatch.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email'],
            required: false
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['cus_id', 'cus_name', 'cus_email'],
            required: false
          },
          {
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode','pmCharge','currencyId', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'numberOfWorkers', 'workerType', 'jobStatus'],
            required: false
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        distinct: true
      });

      // Then, get applicant statistics for each job batch
      const jobBatchIds = rows.map(batch => batch.id);

      let applicantStats = {};
      if (jobBatchIds.length > 0) {
        // Get applicant statistics using a separate query
        const stats = await Applicant.findAll({
          where: {
            jobBatchId: {
              [Op.in]: jobBatchIds
            },
            isActive: true // Only count active applicants
          },
          attributes: [
            'jobBatchId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalApplicants'],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'INTERVIEW' THEN 1 END`)
              ),
              'interviewCount'
            ],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'REGISTER' THEN 1 END`)
              ),
              'registerCount'
            ],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'CONFIRM' THEN 1 END`)
              ),
              'confirmCount'
            ]
          ],
          group: ['jobBatchId'],
          raw: true
        });

        // Convert to object for easy lookup
        stats.forEach(stat => {
          applicantStats[stat.jobBatchId] = {
            total: parseInt(stat.totalApplicants) || 0,
            interview: parseInt(stat.interviewCount) || 0,
            register: parseInt(stat.registerCount) || 0,
            confirm: parseInt(stat.confirmCount) || 0
          };
        });
      }

      // Combine job batch data with applicant statistics
      const jobBatchesWithStats = rows.map(batch => {
        const batchData = batch.get({ plain: true });
        const batchId = batch.id;

        return {
          ...batchData,
          applicantStatistics: applicantStats[batchId] || {
            total: 0,
            interview: 0,
            register: 0,
            confirm: 0
          }
        };
      });

      return res.status(200).json({
        success: true,
        message: "Job batches retrieved successfully",
        data: {
          jobBatches: jobBatchesWithStats,
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
      const activeBatches = await JobBatch.findAll({
        where: {
          status: 'active',
          isActive: true
        },
        include: [
          {
            // NEW: Include MOU in active batches
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'jobStatus'],
            required: false
          }
        ],
        order: [['priority', 'DESC'], ['batchStartDate', 'ASC']]
      });

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
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            // NEW: Include full MOU details for single record
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'numberOfWorkers', 'workerType', 'jobStatus', 'pmCharge', 'exchangeRate', 'documents', 'notes']
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
        batchDeliveryDate,
        deploymentDate,
        status,
        priority,
        notes,
        mouId // NEW: MOU ID for updates
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

      // NEW: Validate MOU exists if mouId is being updated
      if (mouId !== undefined && mouId !== null) {
        const mouExists = await MOU.findByPk(mouId);
        if (!mouExists) {
          return res.status(400).json({
            success: false,
            message: "Invalid MOU ID provided"
          });
        }
      }

      const updatedJobBatch = await jobBatch.update({
        batchName: batchName || jobBatch.batchName,
        runningNo: runningNo || jobBatch.runningNo,
        jobDescription: jobDescription !== undefined ? jobDescription : jobBatch.jobDescription,
        totalPositions: totalPositions !== undefined ? totalPositions : jobBatch.totalPositions,
        batchStartDate: batchStartDate !== undefined ? batchStartDate : jobBatch.batchStartDate,
        batchEndDate: batchEndDate !== undefined ? batchEndDate : jobBatch.batchEndDate,
        batchDeliveryDate: batchDeliveryDate !== undefined ? batchDeliveryDate : jobBatch.batchDeliveryDate,
        deploymentDate: deploymentDate !== undefined ? deploymentDate : jobBatch.deploymentDate,
        status: status || jobBatch.status,
        priority: priority || jobBatch.priority,
        notes: notes !== undefined ? notes : jobBatch.notes,
        mouId: mouId !== undefined ? mouId : jobBatch.mouId, // NEW: Update MOU ID
        updateUserId
      });

      // NEW: Fetch updated job batch with associations for response
      const jobBatchWithAssociations = await JobBatch.findByPk(updatedJobBatch.id, {
        include: [
          {
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'jobStatus']
          }
        ]
      });

      logger.info(`Job batch updated with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Job batch updated successfully",
        data: jobBatchWithAssociations
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

      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
          success: false,
          message: "Invalid MOU reference"
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
  // In JobBatchController.js, add this method:

  static async getNextRunningNo(req, res) {
    try {
      const { mouId } = req.params;

      if (!mouId) {
        return res.status(400).json({
          success: false,
          message: "MOU ID is required"
        });
      }

      // Get the MOU to get jobCode
      const mou = await MOU.findByPk(mouId);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: "MOU not found"
        });
      }

      // Count existing batches for this MOU
      const batchCount = await JobBatch.count({
        where: { mouId }
      });

      // Generate next running number
      const nextNumber = batchCount + 1;
      const paddedNumber = String(nextNumber).padStart(2, '0');
      const nextRunningNo = `${mou.jobCode}-${paddedNumber}`;

      return res.status(200).json({
        success: true,
        message: "Next running number retrieved successfully",
        data: {
          nextRunningNo,
          currentCount: batchCount
        }
      });

    } catch (error) {
      logger.error("Error getting next running number:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
  // Enhanced dashboard statistics with MOU data
  static async getDashboardStats(req, res) {
    try {
      const [
        totalBatches,
        activeBatches,
        completedBatches,
        overdueBatches,
        draftBatches,
        batchesWithMOU, // NEW: Count batches with MOU
        batchesWithoutMOU // NEW: Count batches without MOU
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
        JobBatch.count({ where: { status: 'draft', isActive: true } }),
        // NEW: MOU-related statistics
        JobBatch.count({ where: { mouId: { [Op.ne]: null }, isActive: true } }),
        JobBatch.count({ where: { mouId: null, isActive: true } })
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
          totalPositions,
          // NEW: MOU statistics
          batchesWithMOU,
          batchesWithoutMOU
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

  // NEW: Get job batches by MOU
  static async getByMOU(req, res) {
    try {
      const { mouId } = req.params;
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = {
        mouId,
        isActive: true
      };

      if (status) {
        whereClause.status = status;
      }

      const { count, rows } = await JobBatch.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: MOU,
            as: 'mou',
            attributes: ['id', 'jobCode', 'mouNumber', 'jobTitle', 'employerCompany', 'workLocation', 'jobStatus']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: `Job batches for MOU retrieved successfully`,
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
      logger.error("Error retrieving job batches by MOU:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // NEW: Get MOU statistics for a specific MOU
  static async getMOUStats(req, res) {
    try {
      const { mouId } = req.params;

      const [
        totalBatches,
        activeBatches,
        completedBatches,
        draftBatches,
        cancelledBatches,
        totalPositions
      ] = await Promise.all([
        JobBatch.count({ where: { mouId, isActive: true } }),
        JobBatch.count({ where: { mouId, status: 'active', isActive: true } }),
        JobBatch.count({ where: { mouId, status: 'completed', isActive: true } }),
        JobBatch.count({ where: { mouId, status: 'draft', isActive: true } }),
        JobBatch.count({ where: { mouId, status: 'cancelled', isActive: true } }),
        JobBatch.sum('totalPositions', { where: { mouId, isActive: true } }) || 0
      ]);

      return res.status(200).json({
        success: true,
        message: "MOU statistics retrieved successfully",
        data: {
          mouId,
          totalBatches,
          activeBatches,
          completedBatches,
          draftBatches,
          cancelledBatches,
          totalPositions
        }
      });

    } catch (error) {
      logger.error("Error retrieving MOU statistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}

module.exports = JobBatchController;