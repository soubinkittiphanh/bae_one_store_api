// ===============================================================
// APPLICANT CONTROLLER - Complete with Image Upload Support
// controllers/ApplicantController.js
// ===============================================================

const logger = require("../../api/logger");
const { Applicant, user, JobBatch } = require("../../models");
const { Op } = require("sequelize");
const path = require("path"); // ADD: Required for path operations
const fs = require("fs"); // ADD: Required for file operations

class ApplicantController {
  // ===============================================================
  // HELPER METHODS FOR IMAGE HANDLING
  // ===============================================================
  
  /**
   * Handle image uploads from multer
   * @param {Object} files - Files object from multer
   * @returns {Object} Object containing image paths
   */
  static handleImageUploads(files) {
    const imagePaths = {};
    
    if (!files) return imagePaths;
    
    // Handle passportPhoto
    if (files.passportPhoto && files.passportPhoto[0]) {
      imagePaths.passportPhoto = `/uploads/applicants/${files.passportPhoto[0].filename}`;
    }
    
    // Handle applicantPhoto
    if (files.applicantPhoto && files.applicantPhoto[0]) {
      imagePaths.applicantPhoto = `/uploads/applicants/${files.applicantPhoto[0].filename}`;
    }
    
    return imagePaths;
  }
  
  /**
   * Delete old image files from filesystem
   * @param {Object} oldImagePaths - Object containing old image paths
   */
  static deleteOldImages(oldImagePaths) {
    Object.values(oldImagePaths).forEach(imagePath => {
      if (imagePath) {
        // Extract filename from path (removing /uploads/applicants/ prefix)
        const filename = path.basename(imagePath);
        const fullPath = path.join(process.cwd(), 'uploads', 'applicants', filename);
        
        fs.unlink(fullPath, (err) => {
          if (err && err.code !== 'ENOENT') {
            logger.warn(`Failed to delete old image: ${fullPath}`, err);
          } else {
            logger.info(`Deleted old image: ${filename}`);
          }
        });
      }
    });
  }
  
  /**
   * Clean up uploaded files on error
   * @param {Object} files - Files object from multer
   */
  static cleanupUploadedFiles(files) {
    if (!files) return;
    
    ['passportPhoto', 'applicantPhoto'].forEach(fieldName => {
      if (files[fieldName] && files[fieldName][0]) {
        const filePath = path.join(process.cwd(), 'uploads', 'applicants', files[fieldName][0].filename);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            logger.warn(`Failed to cleanup uploaded file: ${filePath}`, err);
          }
        });
      }
    });
  }

  // ===============================================================
  // CONTROLLER METHODS
  // ===============================================================

  // Create new applicant with image upload support
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
        status,
        jobBatchId
      } = req.body;

      // Get user ID from request (assuming it's set by auth middleware)
      const makerId = req.user?.id || req.userId;

      // Handle image uploads
      const imagePaths = ApplicantController.handleImageUploads(req.files);

      // Log uploaded files for debugging
      if (req.files) {
        if (req.files.passportPhoto) {
          logger.info(`Uploaded passport photo: ${req.files.passportPhoto[0].filename}`);
        }
        if (req.files.applicantPhoto) {
          logger.info(`Uploaded applicant photo: ${req.files.applicantPhoto[0].filename}`);
        }
      }

      // Validate jobBatchId if provided
      if (jobBatchId) {
        const jobBatchExists = await JobBatch.findByPk(jobBatchId);
        if (!jobBatchExists) {
          // Clean up uploaded files before returning error
          ApplicantController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: "Invalid job batch ID provided"
          });
        }
      }

      const applicantData = {
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
        status: status || 'INTERVIEW',
        jobBatchId,
        makerId,
        updateUserId: makerId,
        // Include image paths
        ...imagePaths
      };

      const applicant = await Applicant.create(applicantData);

      // Fetch created applicant with associations for response
      const createdApplicant = await Applicant.findByPk(applicant.id, {
        include: [
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        message: `Applicants for job batch retrieved successfully`,
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
      logger.error("Error retrieving applicants by job batch:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get job batch statistics
  static async getJobBatchStats(req, res) {
    try {
      const { jobBatchId } = req.params;

      const [
        totalApplicants,
        interviewApplicants,
        registeredApplicants,
        rejectedApplicants,
        maleApplicants,
        femaleApplicants,
        withPassport,
        withPassportPhoto,
        withApplicantPhoto
      ] = await Promise.all([
        Applicant.count({ where: { jobBatchId, isActive: true } }),
        Applicant.count({ where: { jobBatchId, status: 'INTERVIEW', isActive: true } }),
        Applicant.count({ where: { jobBatchId, status: 'REGISTER', isActive: true } }),
        Applicant.count({ where: { jobBatchId, status: 'rejected', isActive: true } }),
        Applicant.count({ where: { jobBatchId, gender: 'male', isActive: true } }),
        Applicant.count({ where: { jobBatchId, gender: 'female', isActive: true } }),
        Applicant.count({ where: { jobBatchId, passportAvailability: true, isActive: true } }),
        // Photo statistics for job batch
        Applicant.count({ where: { jobBatchId, passportPhoto: { [Op.ne]: null }, isActive: true } }),
        Applicant.count({ where: { jobBatchId, applicantPhoto: { [Op.ne]: null }, isActive: true } })
      ]);

      return res.status(200).json({
        success: true,
        message: "Job batch statistics retrieved successfully",
        data: {
          jobBatchId,
          totalApplicants,
          interviewApplicants,
          registeredApplicants,
          rejectedApplicants,
          maleApplicants,
          femaleApplicants,
          withPassport,
          photoStats: {
            withPassportPhoto,
            withApplicantPhoto
          }
        }
      });

    } catch (error) {
      logger.error("Error retrieving job batch statistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Bulk upload applicants with photos
  static async bulkCreate(req, res) {
    const uploadedFiles = [];
    
    try {
      const { applicants } = req.body; // Expecting array of applicant data
      const updateUserId = req.user?.id || req.userId;

      if (!Array.isArray(applicants) || applicants.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No applicants data provided"
        });
      }

      const createdApplicants = [];
      const errors = [];

      for (let i = 0; i < applicants.length; i++) {
        try {
          const applicantData = {
            ...applicants[i],
            makerId: updateUserId,
            updateUserId: updateUserId,
            status: applicants[i].status || 'INTERVIEW'
          };

          // Validate jobBatchId if provided
          if (applicantData.jobBatchId) {
            const jobBatchExists = await JobBatch.findByPk(applicantData.jobBatchId);
            if (!jobBatchExists) {
              errors.push({
                index: i,
                error: `Invalid job batch ID: ${applicantData.jobBatchId}`
              });
              continue;
            }
          }

          const applicant = await Applicant.create(applicantData);
          createdApplicants.push(applicant);
          
        } catch (error) {
          errors.push({
            index: i,
            error: error.message
          });
        }
      }

      logger.info(`Bulk created ${createdApplicants.length} applicants by user: ${updateUserId}`);

      return res.status(201).json({
        success: true,
        message: `Successfully created ${createdApplicants.length} applicants`,
        data: {
          created: createdApplicants.length,
          failed: errors.length,
          errors: errors.length > 0 ? errors : undefined,
          applicants: createdApplicants
        }
      });

    } catch (error) {
      logger.error("Error in bulk create applicants:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Export applicants to CSV/Excel
  static async export(req, res) {
    try {
      const {
        format = 'csv', // 'csv' or 'excel'
        status,
        gender,
        jobBatchId,
        passportAvailability
      } = req.query;

      const whereClause = { isActive: true };

      // Add filters
      if (status) whereClause.status = status;
      if (gender) whereClause.gender = gender;
      if (jobBatchId) whereClause.jobBatchId = jobBatchId;
      if (passportAvailability !== undefined) {
        whereClause.passportAvailability = passportAvailability === 'true';
      }

      const applicants = await Applicant.findAll({
        where: whereClause,
        include: [
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['batchName']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      // Transform data for export
      const exportData = applicants.map(applicant => ({
        'ID': applicant.id,
        'First Name': applicant.firstName,
        'Last Name': applicant.lastName,
        'Gender': applicant.gender,
        'Age': applicant.age,
        'Marital Status': applicant.maritalStatus,
        'Phone': applicant.phone,
        'Emergency Contact': applicant.emergencyContactNo,
        'Address': applicant.address,
        'Village': applicant.village,
        'City': applicant.city,
        'District': applicant.district,
        'Passport Available': applicant.passportAvailability ? 'Yes' : 'No',
        'Passport No': applicant.passportNo || '',
        'Passport Expiry': applicant.passportExpiredDate || '',
        'Workplace': applicant.workPlace || '',
        'Status': applicant.status,
        'Job Batch': applicant.jobBatch?.batchName || '',
        'Has Passport Photo': applicant.passportPhoto ? 'Yes' : 'No',
        'Has Applicant Photo': applicant.applicantPhoto ? 'Yes' : 'No',
        'Registration Date': applicant.registertDate || '',
        'Interview Date': applicant.interviewExamDate || '',
        'Created At': applicant.createdAt
      }));

      // For demonstration, returning JSON
      // In production, you would use libraries like csv-writer or exceljs
      return res.status(200).json({
        success: true,
        message: `Export ready in ${format} format`,
        data: exportData,
        count: exportData.length
      });

    } catch (error) {
      logger.error("Error exporting applicants:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}

module.exports = ApplicantController;
          }
        ]
      });

      logger.info(`Applicant created with ID: ${applicant.id} by user: ${makerId}`);

      return res.status(201).json({
        success: true,
        message: "Applicant created successfully",
        data: createdApplicant
      });

    } catch (error) {
      logger.error("Error creating applicant:", error);

      // Clean up uploaded files if creation fails
      ApplicantController.cleanupUploadedFiles(req.files);

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

  // Update photos only
  static async updatePhotos(req, res) {
    try {
      const { id } = req.params;
      const updateUserId = req.user?.id || req.userId;

      const applicant = await Applicant.findOne({
        where: { id, isActive: true }
      });

      if (!applicant) {
        // Clean up uploaded files before returning error
        ApplicantController.cleanupUploadedFiles(req.files);
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      // Handle image uploads
      const imagePaths = ApplicantController.handleImageUploads(req.files);

      if (Object.keys(imagePaths).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No images provided for update"
        });
      }

      // Store old image paths for cleanup
      const oldImagePaths = {};
      if (imagePaths.passportPhoto && applicant.passportPhoto) {
        oldImagePaths.passportPhoto = applicant.passportPhoto;
      }
      if (imagePaths.applicantPhoto && applicant.applicantPhoto) {
        oldImagePaths.applicantPhoto = applicant.applicantPhoto;
      }

      // Log uploaded files for debugging
      if (req.files) {
        if (req.files.passportPhoto) {
          logger.info(`Updating passport photo for applicant ${id}: ${req.files.passportPhoto[0].filename}`);
        }
        if (req.files.applicantPhoto) {
          logger.info(`Updating applicant photo for applicant ${id}: ${req.files.applicantPhoto[0].filename}`);
        }
      }

      // Update only photo fields
      const updateData = {
        ...imagePaths,
        updateUserId
      };

      await applicant.update(updateData);

      // Clean up old images after successful update
      ApplicantController.deleteOldImages(oldImagePaths);

      logger.info(`Applicant photos updated for ID: ${id} by user: ${updateUserId}`);

      // Fetch the full image URLs for response
      const updatedApplicant = await Applicant.findByPk(id, {
        attributes: ['id', 'passportPhoto', 'applicantPhoto', 'firstName', 'lastName']
      });

      return res.status(200).json({
        success: true,
        message: "Applicant photos updated successfully",
        data: updatedApplicant
      });

    } catch (error) {
      logger.error("Error updating applicant photos:", error);

      // Clean up uploaded files if update fails
      ApplicantController.cleanupUploadedFiles(req.files);

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
        isActive = 'true',
        jobBatchId,
        search,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      const whereClause = {
        isActive: isActive === 'true' || isActive === true || isActive === 1
      };

      // Add filters
      if (status) whereClause.status = status;
      if (gender) whereClause.gender = gender;
      if (jobBatchId) whereClause.jobBatchId = jobBatchId;

      if (passportAvailability !== undefined && passportAvailability !== '') {
        whereClause.passportAvailability = passportAvailability === 'true';
      }

      if (search && search.trim()) {
        whereClause[Op.or] = [
          { firstName: { [Op.iLike]: `%${search.trim()}%` } },
          { lastName: { [Op.iLike]: `%${search.trim()}%` } },
          { phone: { [Op.iLike]: `%${search.trim()}%` } },
          { passportNo: { [Op.iLike]: `%${search.trim()}%` } }
        ];
      }

      const { count, rows } = await Applicant.findAndCountAll({
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
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate'],
            required: false
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        distinct: true
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

      const isDevelopment = process.env.NODE_ENV === 'development';

      return res.status(500).json({
        success: false,
        message: "Internal server error",
        ...(isDevelopment && {
          error: error.message,
          stack: error.stack
        })
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
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: user,
            as: 'updateUser',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']
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

  // Update applicant with image upload support
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      const updateUserId = req.user?.id || req.userId;

      const applicant = await Applicant.findOne({
        where: { id, isActive: true }
      });

      if (!applicant) {
        // Clean up uploaded files before returning error
        ApplicantController.cleanupUploadedFiles(req.files);
        return res.status(404).json({
          success: false,
          message: "Applicant not found"
        });
      }

      // Handle image uploads
      const imagePaths = ApplicantController.handleImageUploads(req.files);

      // Store old image paths for cleanup
      const oldImagePaths = {};
      if (imagePaths.passportPhoto && applicant.passportPhoto) {
        oldImagePaths.passportPhoto = applicant.passportPhoto;
      }
      if (imagePaths.applicantPhoto && applicant.applicantPhoto) {
        oldImagePaths.applicantPhoto = applicant.applicantPhoto;
      }

      // Log uploaded files for debugging
      if (req.files) {
        if (req.files.passportPhoto) {
          logger.info(`Updating passport photo for applicant ${id}: ${req.files.passportPhoto[0].filename}`);
        }
        if (req.files.applicantPhoto) {
          logger.info(`Updating applicant photo for applicant ${id}: ${req.files.applicantPhoto[0].filename}`);
        }
      }

      // Validate jobBatchId if being updated
      if (updateData.jobBatchId) {
        const jobBatchExists = await JobBatch.findByPk(updateData.jobBatchId);
        if (!jobBatchExists) {
          // Clean up uploaded files before returning error
          ApplicantController.cleanupUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: "Invalid job batch ID provided"
          });
        }
      }

      // Add updateUserId and image paths to the update data
      updateData.updateUserId = updateUserId;
      Object.assign(updateData, imagePaths);

      const updatedApplicant = await applicant.update(updateData);

      // Clean up old images after successful update
      ApplicantController.deleteOldImages(oldImagePaths);

      // Fetch updated applicant with associations for response
      const applicantWithAssociations = await Applicant.findByPk(updatedApplicant.id, {
        include: [
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']
          }
        ]
      });

      logger.info(`Applicant updated with ID: ${id} by user: ${updateUserId}`);

      return res.status(200).json({
        success: true,
        message: "Applicant updated successfully",
        data: applicantWithAssociations
      });

    } catch (error) {
      logger.error("Error updating applicant:", error);

      // Clean up uploaded files if update fails
      ApplicantController.cleanupUploadedFiles(req.files);

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

      // Optionally delete associated images when soft deleting
      // Uncomment if you want to delete images on soft delete
      /*
      const imagesToDelete = {};
      if (applicant.passportPhoto) {
        imagesToDelete.passportPhoto = applicant.passportPhoto;
      }
      if (applicant.applicantPhoto) {
        imagesToDelete.applicantPhoto = applicant.applicantPhoto;
      }
      ApplicantController.deleteOldImages(imagesToDelete);
      */

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

  // Delete applicant photo (passport or applicant photo)
  static async deletePhoto(req, res) {
    try {
      const { id } = req.params;
      const { photoType } = req.body; // 'passportPhoto' or 'applicantPhoto'
      const updateUserId = req.user?.id || req.userId;

      if (!['passportPhoto', 'applicantPhoto'].includes(photoType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid photo type. Must be 'passportPhoto' or 'applicantPhoto'"
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

      const oldImagePath = applicant[photoType];
      
      if (!oldImagePath) {
        return res.status(400).json({
          success: false,
          message: `No ${photoType} found for this applicant`
        });
      }

      // Update database to remove photo reference
      await applicant.update({
        [photoType]: null,
        updateUserId
      });

      // Delete the actual file
      const filename = path.basename(oldImagePath);
      const fullPath = path.join(process.cwd(), 'uploads', 'applicants', filename);
      
      fs.unlink(fullPath, (err) => {
        if (err && err.code !== 'ENOENT') {
          logger.warn(`Failed to delete ${photoType}: ${fullPath}`, err);
        } else {
          logger.info(`Deleted ${photoType} for applicant ${id}: ${filename}`);
        }
      });

      return res.status(200).json({
        success: true,
        message: `${photoType} deleted successfully`
      });

    } catch (error) {
      logger.error("Error deleting applicant photo:", error);
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
        workPlace,
        jobBatchId
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = { isActive: true };

      // Add filters
      if (status) whereClause.status = status;
      if (gender) whereClause.gender = gender;
      if (passportAvailability !== undefined) whereClause.passportAvailability = passportAvailability === 'true';
      if (city) whereClause.city = city;
      if (workPlace) whereClause.workPlace = { [Op.iLike]: `%${workPlace}%` };
      if (jobBatchId) whereClause.jobBatchId = jobBatchId;

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
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']
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
        femaleApplicants,
        applicantsWithJobBatch,
        applicantsWithoutJobBatch,
        withPassportPhoto,
        withApplicantPhoto,
        withBothPhotos
      ] = await Promise.all([
        Applicant.count({ where: { isActive: true } }),
        Applicant.count({ where: { status: 'INTERVIEW', isActive: true } }),
        Applicant.count({ where: { status: 'REGISTER', isActive: true } }),
        Applicant.count({ where: { status: 'rejected', isActive: true } }),
        Applicant.count({ where: { passportAvailability: true, isActive: true } }),
        Applicant.count({ where: { gender: 'male', isActive: true } }),
        Applicant.count({ where: { gender: 'female', isActive: true } }),
        Applicant.count({ where: { jobBatchId: { [Op.ne]: null }, isActive: true } }),
        Applicant.count({ where: { jobBatchId: null, isActive: true } }),
        // Photo statistics
        Applicant.count({ where: { passportPhoto: { [Op.ne]: null }, isActive: true } }),
        Applicant.count({ where: { applicantPhoto: { [Op.ne]: null }, isActive: true } }),
        Applicant.count({ 
          where: { 
            passportPhoto: { [Op.ne]: null },
            applicantPhoto: { [Op.ne]: null },
            isActive: true 
          } 
        })
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
          femaleApplicants,
          applicantsWithJobBatch,
          applicantsWithoutJobBatch,
          // Photo statistics
          photoStats: {
            withPassportPhoto,
            withApplicantPhoto,
            withBothPhotos
          }
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
      const { page = 1, limit = 10, jobBatchId } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {
        status: status.toUpperCase(),
        isActive: true
      };

      if (jobBatchId) {
        whereClause.jobBatchId = jobBatchId;
      }

      const { count, rows } = await Applicant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']
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

  // Get applicants by job batch
  static async getByJobBatch(req, res) {
    try {
      const { jobBatchId } = req.params;
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = {
        jobBatchId,
        isActive: true
      };

      if (status) {
        whereClause.status = status.toUpperCase();
      }

      const { count, rows } = await Applicant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: user,
            as: 'maker',
            attributes: ['cus_id', 'cus_name', 'cus_email']
          },
          {
            model: JobBatch,
            as: 'jobBatch',
            attributes: ['id', 'batchName', 'jobDescription', 'status', 'batchStartDate', 'batchEndDate']