// ===============================================================
// APPLICANT ROUTES WITH IMAGE UPLOAD SUPPORT
// routes/applicantRoutes.js
// ===============================================================

const express = require('express');
const router = express.Router();
const ApplicantController = require('./controller'); // FIX: Correct path
const logger = require("../../api/logger");
const multer = require('multer'); // FIX: Add multer import
const { 
  uploadApplicantPhotos, 
  handleUploadErrors 
} = require('../../middleware/multerConfigApplicant'); // FIX: Use correct middleware

// Middleware for authentication (uncomment and customize as needed)
// const authMiddleware = require('../middleware/auth');
// router.use(authMiddleware);

// Middleware to log all requests
router.use((req, res, next) => {
  logger.info(`Applicant API: ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'anonymous'}`);
  next();
});

// ===============================================================
// STATISTICS AND DASHBOARD ROUTES
// (Must come before parameterized routes)
// ===============================================================

/**
 * @route GET /api/applicant/dashboard-stats
 * @desc Get dashboard statistics for applicants
 * @access Private
 */
router.get('/dashboard-stats', ApplicantController.getDashboardStats);

/**
 * @route GET /api/applicant/export
 * @desc Export applicants data (CSV/Excel ready)
 * @access Private
 * @query format, status, gender, jobBatchId, passportAvailability
 */
// router.get('/export', ApplicantController.export);

/**
 * @route GET /api/applicant/search
 * @desc Search applicants with keyword and filters
 * @access Private
 * @query keyword, status, gender, passportAvailability, city, workPlace, page, limit
 */
router.get('/search', ApplicantController.search);

// ===============================================================
// FILTER ROUTES
// ===============================================================

/**
 * @route GET /api/applicant/status/:status
 * @desc Get applicants by status (INTERVIEW, REGISTER, rejected)
 * @access Private
 * @params status
 * @query page, limit, jobBatchId
 */
router.get('/status/:status', ApplicantController.getByStatus);

/**
 * @route GET /api/applicant/job-batch/:jobBatchId
 * @desc Get applicants by job batch
 * @access Private
 * @params jobBatchId
 * @query page, limit, status
 */
router.get('/job-batch/:jobBatchId', ApplicantController.getByJobBatch);

/**
 * @route GET /api/applicant/job-batch/:jobBatchId/stats
 * @desc Get job batch statistics
 * @access Private
 * @params jobBatchId
 */
router.get('/job-batch/:jobBatchId/stats', ApplicantController.getJobBatchStats);

// ===============================================================
// BASIC CRUD ROUTES WITH IMAGE UPLOAD
// ===============================================================

/**
 * @route GET /api/applicant
 * @desc Get all applicants with pagination and filtering
 * @access Private
 * @query page, limit, status, gender, passportAvailability, search, sortBy, sortOrder, jobBatchId
 */
router.get('/', ApplicantController.getAll);

/**
 * @route GET /api/applicant/:id
 * @desc Get applicant by ID
 * @access Private
 */
router.get('/:id', ApplicantController.getById);

/**
 * @route POST /api/applicant
 * @desc Create new applicant with image upload support
 * @access Private
 * @body firstName, lastName, gender, age, maritalStatus, phone, address, etc.
 * @files passportPhoto, applicantPhoto (multipart/form-data)
 */
router.post('/', 
  uploadApplicantPhotos, 
  handleUploadErrors,
  ApplicantController.create
);

/**
 * @route POST /api/applicant/bulk
 * @desc Bulk create applicants
 * @access Private
 * @body applicants (array of applicant data)
 */
// router.post('/bulk', ApplicantController.bulkCreate);

/**
 * @route PUT /api/applicant/:id
 * @desc Update applicant with image upload support
 * @access Private
 * @body firstName, lastName, gender, age, maritalStatus, phone, address, etc.
 * @files passportPhoto, applicantPhoto (multipart/form-data)
 */
router.put('/:id', 
  uploadApplicantPhotos,
  handleUploadErrors,
  ApplicantController.update
);

/**
 * @route PATCH /api/applicant/:id/status
 * @desc Update applicant status only
 * @access Private
 * @body status
 */
router.patch('/:id/status', ApplicantController.updateStatus);
router.patch('/:id/refund', ApplicantController.toggleRefund);
/**
 * @route PATCH /api/applicant/:id/photos
 * @desc Update applicant photos only
 * @access Private
 * @files passportPhoto, applicantPhoto (multipart/form-data)
 */
router.patch('/:id/photos', 
  uploadApplicantPhotos,
  handleUploadErrors,
  ApplicantController.updatePhotos
);

/**
 * @route DELETE /api/applicant/:id/photo
 * @desc Delete specific photo (passport or applicant photo)
 * @access Private
 * @body photoType ('passportPhoto' or 'applicantPhoto')
 */
router.delete('/:id/photo', ApplicantController.deletePhoto);

/**
 * @route DELETE /api/applicant/:id
 * @desc Soft delete applicant (set isActive to false)
 * @access Private
 */
router.delete('/:id', ApplicantController.delete);

// ===============================================================
// ERROR HANDLING MIDDLEWARE
// ===============================================================

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Applicant Router Error:', error);
  
  // Handle multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB per image'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 1 passport photo and 1 applicant photo'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field. Only passportPhoto and applicantPhoto are allowed'
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  // Handle custom file filter errors
  if (error.message.includes('Invalid field name') || 
      error.message.includes('Only image files are allowed') ||
      error.message.includes('Only JPEG, PNG, GIF, and WebP images are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(error.errors).map(e => e.message)
    });
  }
  
  // Log unexpected errors in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Unexpected error:', error);
  }
  
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      error: error.message,
      stack: error.stack 
    })
  });
});

// ===============================================================
// EXPORT ROUTER
// ===============================================================

module.exports = router;