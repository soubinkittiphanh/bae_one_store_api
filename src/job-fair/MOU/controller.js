// ===============================================================
// MOU CONTROLLER - FIXED VERSION
// ===============================================================
const { MOU, Agency, user, currency, image, sequelize,JobBatch,Applicant } = require('../../models');
const logger = require('../../api/logger');
const { Op, ValidationError, DatabaseError, QueryTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class MOUController {
  // ===============================================================
  // CREATE MOU WITH FILES
  // ===============================================================
  static async createMOU(req, res) {
    try {
      logger.info('Creating new MOU with files', {
        body: req.body,
        files: req.files ? Object.keys(req.files) : []
      });

      const {
        jobCode,
        mouNumber,
        pmCharge,
        projectAmount,
        exchangeRate,
        agencyId,
        employerCompany,
        workLocation,
        jobTitle,
        numberOfWorkers,
        workerType,
        jobStatus,
        notes,
        currencyId
      } = req.body;

      // Validation
      if (!jobCode) {
        await MOUController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Job code is required'
        });
      }

      if (!jobTitle) {
        await MOUController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Job title is required'
        });
      }

      if (!numberOfWorkers || numberOfWorkers < 1) {
        await MOUController.cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'Number of workers must be at least 1'
        });
      }

      // Check if jobCode already exists
      const existingMOU = await MOU.findOne({ where: { jobCode } });
      if (existingMOU) {
        await MOUController.cleanupUploadedFiles(req.files);
        return res.status(409).json({
          success: false,
          message: 'Job code already exists'
        });
      }

      // Verify agency exists if provided
      if (agencyId) {
        const agency = await Agency.findByPk(agencyId);
        if (!agency) {
          await MOUController.cleanupUploadedFiles(req.files);
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
          await MOUController.cleanupUploadedFiles(req.files);
          return res.status(404).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      // Process document files
      let documentsData = [];
      if (req.files && req.files.documents) {
        documentsData = req.files.documents.map(file => ({
          name: file.originalname,
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        }));
      }

      // Create MOU
      const newMOU = await MOU.create({
        jobCode,
        mouNumber,
        pmCharge: pmCharge || 0,
        projectAmount: projectAmount || 0,
        exchangeRate: exchangeRate || 1,
        agencyId,
        employerCompany,
        workLocation,
        jobTitle,
        numberOfWorkers,
        workerType: workerType || 'Any',
        jobStatus: jobStatus || 'draft',
        documents: documentsData,
        notes,
        currencyId,
        makerId: req.user?.id,
        isActive: true
      });

      // Process and save images to image table
      if (req.files && req.files.images) {
        const imagePromises = req.files.images.map(file => {
          return image.create({
            orgName: file.originalname,
            img_name: file.filename,
            img_path: file.path,
            MOUID: newMOU.id,
          });
        });
        await Promise.all(imagePromises);
      }

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
      if (req.files) {
        await MOUController.cleanupUploadedFiles(req.files);
      }

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

// Complete MOU Statistics Controller Method
static async getStatistics(req, res) {
  try {
    // Get total MOUs count
    const totalMOUs = await MOU.count({
      where: { isActive: true }
    });

    // Get MOU status breakdown
    const statusBreakdown = await MOU.findAll({
      where: { isActive: true },
      attributes: [
        'jobStatus',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['jobStatus'],
      raw: true
    });

    // Convert status breakdown to object
    const statusCounts = {
      draft: 0,
      open: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0
    };

    statusBreakdown.forEach(item => {
      if (statusCounts.hasOwnProperty(item.jobStatus)) {
        statusCounts[item.jobStatus] = parseInt(item.count);
      }
    });

    // Get JobBatch statistics
    const jobBatchStats = await JobBatch.findAll({
      where: { isActive: true },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalJobBatches'],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'active' THEN 1 END`)
          ), 
          'activeJobBatches'
        ],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'completed' THEN 1 END`)
          ), 
          'completedJobBatches'
        ],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'draft' THEN 1 END`)
          ), 
          'draftJobBatches'
        ]
      ],
      raw: true
    });

    // Get Applicant statistics
    const applicantStats = await Applicant.findAll({
      where: { isActive: true },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalApplicants'],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'INTERVIEW' THEN 1 END`)
          ), 
          'interviewApplicants'
        ],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'REGISTER' THEN 1 END`)
          ), 
          'registerApplicants'
        ],
        [
          sequelize.fn('COUNT', 
            sequelize.literal(`CASE WHEN status = 'CONFIRM' THEN 1 END`)
          ), 
          'confirmApplicants'
        ]
      ],
      raw: true
    });

    // Extract data from query results
    const batchData = jobBatchStats[0] || {};
    const applicantData = applicantStats[0] || {};

    // Build complete statistics object
    const statistics = {
      totalMOUs,
      totalJobBatches: parseInt(batchData.totalJobBatches) || 0,
      activeJobBatches: parseInt(batchData.activeJobBatches) || 0,
      completedJobBatches: parseInt(batchData.completedJobBatches) || 0,
      draftJobBatches: parseInt(batchData.draftJobBatches) || 0,
      totalApplicants: parseInt(applicantData.totalApplicants) || 0,
      totalInterviewApplicants: parseInt(applicantData.interviewApplicants) || 0,
      totalRegisterApplicants: parseInt(applicantData.registerApplicants) || 0,
      totalConfirmedApplicants: parseInt(applicantData.confirmApplicants) || 0,
      statusBreakdown: statusCounts
    };

    // Send successful response
    res.json({
      success: true,
      message: 'Statistics retrieved successfully',
      data: statistics
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

// Don't forget to add the route in your routes file:
// router.get('/statistics', MouController.getStatistics);

  // ===============================================================
  // UPDATE MOU WITH FILES
  // ===============================================================
  static async updateMOU(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      updateData.updateUserId = req.user?.id;

      const mou = await MOU.findByPk(id);
      if (!mou) {
        await MOUController.cleanupUploadedFiles(req.files);
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
          await MOUController.cleanupUploadedFiles(req.files);
          return res.status(409).json({
            success: false,
            message: 'Job code already exists'
          });
        }
      }

      // Verify agency and currency if provided
      if (updateData.agencyId) {
        const agency = await Agency.findByPk(updateData.agencyId);
        if (!agency) {
          await MOUController.cleanupUploadedFiles(req.files);
          return res.status(404).json({
            success: false,
            message: 'Agency not found'
          });
        }
      }

      if (updateData.currencyId) {
        const currencyRecord = await currency.findByPk(updateData.currencyId);
        if (!currencyRecord) {
          await MOUController.cleanupUploadedFiles(req.files);
          return res.status(404).json({
            success: false,
            message: 'Currency not found'
          });
        }
      }

      // Handle document updates
      if (req.files && req.files.documents) {
        const newDocuments = req.files.documents.map(file => ({
          name: file.originalname,
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        }));

        const existingDocuments = mou.documents || [];
        updateData.documents = [...existingDocuments, ...newDocuments];
      }

      // Update MOU
      await mou.update(updateData);

      // Handle new images
      if (req.files && req.files.images) {
        const imagePromises = req.files.images.map(file => {
          return image.create({
            orgName: file.originalname,
            img_name: file.filename,
            img_path: file.path,
            MOUID: id,
          });
        });
        await Promise.all(imagePromises);
      }

      // Fetch updated MOU with associations
      const updatedMOU = await MOU.findByPk(id, {
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'] },
          { model: user, as: 'updateUser', attributes: ['cus_id', 'cus_name', 'cus_email'] },
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
      if (req.files) {
        await MOUController.cleanupUploadedFiles(req.files);
      }

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
  // DELETE IMAGE
  // ===============================================================
  static async deleteImage(req, res) {
    try {
      const { imageId } = req.params;

      const imageRecord = await image.findByPk(imageId);
      if (!imageRecord) {
        return res.status(404).json({
          success: false,
          message: 'Image not found'
        });
      }

      // Delete physical file - use correct field name
      if (fs.existsSync(imageRecord.img_path)) {
        fs.unlinkSync(imageRecord.img_path);
      }

      await imageRecord.destroy();

      res.json({
        success: true,
        message: 'Image deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting image:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // DELETE DOCUMENT
  // ===============================================================
  static async deleteDocument(req, res) {
    try {
      const { mouId, documentIndex } = req.params;

      const mou = await MOU.findByPk(mouId);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      const documents = mou.documents || [];
      const docIndex = parseInt(documentIndex);

      if (docIndex < 0 || docIndex >= documents.length) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      const documentToDelete = documents[docIndex];

      // Delete physical file
      if (documentToDelete.path && fs.existsSync(documentToDelete.path)) {
        fs.unlinkSync(documentToDelete.path);
      }

      // Create new array to ensure Sequelize detects change
      const updatedDocuments = documents.filter((doc, index) => index !== docIndex);
      mou.changed('documents', true);
      await mou.update({ documents: updatedDocuments });

      res.json({
        success: true,
        message: 'Document deleted successfully',
        data: {
          remainingDocuments: updatedDocuments.length,
          deletedDocument: documentToDelete.name
        }
      });

    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // ===============================================================
  // DOWNLOAD FUNCTIONS
  // ===============================================================
  static async downloadDocument(req, res) {
    try {
      const { mouId, documentIndex } = req.params;

      const mou = await MOU.findByPk(mouId);
      if (!mou) {
        return res.status(404).json({
          success: false,
          message: 'MOU not found'
        });
      }

      const documents = mou.documents || [];
      const docIndex = parseInt(documentIndex);

      if (docIndex < 0 || docIndex >= documents.length) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      const document = documents[docIndex];
      const filePath = document.path;

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on disk'
        });
      }

      // Sanitize filename
      let fileName = document.name || path.basename(filePath);
      fileName = MOUController.sanitizeFilename(fileName);

      // Set headers safely
      MOUController.setDownloadHeaders(res, fileName);

      res.sendFile(path.resolve(filePath));

    } catch (error) {
      logger.error('Error downloading document:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async downloadImage(req, res) {
    try {
      const { imageId } = req.params;

      const imageRecord = await image.findByPk(imageId);
      if (!imageRecord) {
        return res.status(404).json({
          success: false,
          message: 'Image not found'
        });
      }

      const filePath = imageRecord.img_path;

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on disk'
        });
      }

      let fileName = imageRecord.orgName || path.basename(filePath);
      fileName = MOUController.sanitizeFilename(fileName);

      MOUController.setDownloadHeaders(res, fileName);
      res.sendFile(path.resolve(filePath));

    } catch (error) {
      logger.error('Error downloading image:', error);
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

      if (search) {
        whereClause[Op.or] = [
          { jobCode: { [Op.iLike]: `%${search}%` } },
          { jobTitle: { [Op.iLike]: `%${search}%` } },
          { employerCompany: { [Op.iLike]: `%${search}%` } },
          { workLocation: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (status) whereClause.jobStatus = status;
      if (agencyId) whereClause.agencyId = agencyId;
      if (workerType) whereClause.workerType = workerType;

      // First, get MOUs with basic includes
      const { count, rows } = await MOU.findAndCountAll({
        where: whereClause,
        include: [
          { model: Agency, as: 'agency' },
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'] },
          { model: currency, as: 'currency' },
          { model: image, as: 'images' }
        ],
        limit: parseInt(limit),
        offset,
        order: [[sortBy, sortOrder.toUpperCase()]],
        distinct: true
      });

      // Get MOU IDs for statistics queries
      const mouIds = rows.map(mou => mou.id);

      let jobBatchStats = {};
      let applicantStats = {};

      if (mouIds.length > 0) {
        // Get JobBatch statistics for each MOU
        const batchStats = await JobBatch.findAll({
          where: {
            mouId: {
              [Op.in]: mouIds
            },
            isActive: true
          },
          attributes: [
            'mouId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalJobBatches'],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'active' THEN 1 END`)
              ),
              'activeJobBatches'
            ],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'completed' THEN 1 END`)
              ),
              'completedJobBatches'
            ],
            [
              sequelize.fn('COUNT',
                sequelize.literal(`CASE WHEN status = 'draft' THEN 1 END`)
              ),
              'draftJobBatches'
            ],
            [
              sequelize.fn('SUM', sequelize.col('totalPositions')),
              'totalPositions'
            ]
          ],
          group: ['mouId'],
          raw: true
        });

        // Convert to object for easy lookup
        batchStats.forEach(stat => {
          jobBatchStats[stat.mouId] = {
            totalJobBatches: parseInt(stat.totalJobBatches) || 0,
            activeJobBatches: parseInt(stat.activeJobBatches) || 0,
            completedJobBatches: parseInt(stat.completedJobBatches) || 0,
            draftJobBatches: parseInt(stat.draftJobBatches) || 0,
            totalPositions: parseInt(stat.totalPositions) || 0
          };
        });

        // Get applicant statistics through JobBatch -> Applicant relationship
        const applicantStatsQuery = await sequelize.query(`
        SELECT 
          jb.mouId,
          COUNT(a.id) as totalApplicants,
          COUNT(CASE WHEN a.status = 'INTERVIEW' THEN 1 END) as interviewCount,
          COUNT(CASE WHEN a.status = 'REGISTER' THEN 1 END) as registerCount,
          COUNT(CASE WHEN a.status = 'CONFIRM' THEN 1 END) as confirmCount
        FROM JobBatch jb
        LEFT JOIN Applicant a ON jb.id = a.jobBatchId AND a.isActive = true
        WHERE jb.mouId IN (${mouIds.join(',')}) AND jb.isActive = true
        GROUP BY jb.mouId
      `, {
          type: QueryTypes.SELECT
        });

        // Convert applicant stats to object
        applicantStatsQuery.forEach(stat => {
          applicantStats[stat.mouId] = {
            totalApplicants: parseInt(stat.totalApplicants) || 0,
            interview: parseInt(stat.interviewCount) || 0,
            register: parseInt(stat.registerCount) || 0,
            confirm: parseInt(stat.confirmCount) || 0
          };
        });
      }

      // Combine MOU data with statistics
      const mousWithStats = rows.map(mou => {
        const mouData = mou.get({ plain: true });
        const mouId = mou.id;

        return {
          ...mouData,
          jobBatchStatistics: jobBatchStats[mouId] || {
            totalJobBatches: 0,
            activeJobBatches: 0,
            completedJobBatches: 0,
            draftJobBatches: 0,
            totalPositions: 0
          },
          applicantStatistics: applicantStats[mouId] || {
            totalApplicants: 0,
            interview: 0,
            register: 0,
            confirm: 0
          }
        };
      });

      const totalPages = Math.ceil(count / parseInt(limit));

      res.json({
        success: true,
        message: 'MOUs retrieved successfully',
        data: {
          mous: mousWithStats,
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
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'] },
          { model: user, as: 'updateUser', attributes: ['cus_id', 'cus_name', 'cus_email'] },
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

      await mou.update({
        isActive: false,
        updateUserId: req.user?.id
      });

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
          { model: user, as: 'maker', attributes: ['cus_id', 'cus_name', 'cus_email'] },
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

  // ===============================================================
  // HELPER METHODS (MOVED INSIDE CLASS)
  // ===============================================================

  // Clean up uploaded files
  static async cleanupUploadedFiles(files) {
    if (!files) return;

    try {
      const allFiles = [];
      if (files.images) allFiles.push(...files.images);
      if (files.documents) allFiles.push(...files.documents);

      for (const file of allFiles) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          logger.info(`Cleaned up uploaded file: ${file.path}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up uploaded files:', error);
    }
  }

  // Sanitize filename
  static sanitizeFilename(filename) {
    if (!filename) return 'document';

    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 255);
  }

  // Set download headers safely
  static setDownloadHeaders(res, filename) {
    try {
      const safeFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    } catch (error) {
      console.error('Error setting headers:', error);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="document"');
    }
  }

  // Get file URL for frontend access
  static getFileUrl(req, type, filename) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return `${baseUrl}/uploads/${type}/${filename}`;
  }
}

module.exports = MOUController;