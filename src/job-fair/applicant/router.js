// ===============================================================
// APPLICANT ROUTES
// routes/applicantRoutes.js
// ===============================================================

const express = require('express');
const router = express.Router();
const ApplicantController = require('./controller');
const logger = require("../../api/logger");

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
 * @query page, limit
 */
router.get('/status/:status', ApplicantController.getByStatus);

// ===============================================================
// BASIC CRUD ROUTES
// ===============================================================

/**
 * @route GET /api/applicant
 * @desc Get all applicants with pagination and filtering
 * @access Private
 * @query page, limit, status, gender, passportAvailability, search, sortBy, sortOrder
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
 * @desc Create new applicant
 * @access Private
 * @body firstName, lastName, gender, age, maritalStatus, phone, address, etc.
 */
router.post('/', ApplicantController.create);

/**
 * @route PUT /api/applicant/:id
 * @desc Update applicant
 * @access Private
 * @body firstName, lastName, gender, age, maritalStatus, phone, address, etc.
 */
router.put('/:id', ApplicantController.update);

/**
 * @route PATCH /api/applicant/:id/status
 * @desc Update applicant status only
 * @access Private
 * @body status
 */
router.patch('/:id/status', ApplicantController.updateStatus);

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
  
  return res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ===============================================================
// EXPORT ROUTER
// ===============================================================

module.exports = router;