// ===============================================================
// AGENCY ROUTES
// routes/agencyRoutes.js
// ===============================================================

const express = require('express');
const router = express.Router();
const AgencyController = require('./controller');
const logger = require("../../api/logger");

// Middleware for authentication (uncomment and customize as needed)
// const authMiddleware = require('../middleware/auth');
// router.use(authMiddleware);

// Middleware to log all requests
router.use((req, res, next) => {
  logger.info(`Agency API: ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'anonymous'}`);
  next();
});

// ===============================================================
// STATISTICS AND DASHBOARD ROUTES
// (Must come before parameterized routes)
// ===============================================================

/**
 * @route GET /api/agency/dashboard-stats
 * @desc Get dashboard statistics for agencies
 * @access Private
 */
router.get('/dashboard-stats', AgencyController.getDashboardStats);

/**
 * @route GET /api/agency/search
 * @desc Search agencies with keyword and filters
 * @access Private
 * @query keyword, status, city, district, page, limit
 */
router.get('/search', AgencyController.search);

// ===============================================================
// FILTER ROUTES
// ===============================================================

/**
 * @route GET /api/agency/status/:status
 * @desc Get agencies by status (active, inactive, suspended)
 * @access Private
 * @params status
 * @query page, limit
 */
router.get('/status/:status', AgencyController.getByStatus);

/**
 * @route GET /api/agency/city/:city
 * @desc Get agencies by city
 * @access Private
 * @params city
 * @query page, limit, status
 */
router.get('/city/:city', AgencyController.getByCity);

// ===============================================================
// BASIC CRUD ROUTES
// ===============================================================

/**
 * @route GET /api/agency
 * @desc Get all agencies with pagination and filtering
 * @access Private
 * @query page, limit, status, city, district, search, sortBy, sortOrder
 */
router.get('/', AgencyController.getAll);

/**
 * @route GET /api/agency/:id
 * @desc Get agency by ID
 * @access Private
 */
router.get('/:id', AgencyController.getById);

/**
 * @route POST /api/agency
 * @desc Create new agency
 * @access Private
 * @body agencyName, agencyCode, registrationNumber, phone, email, address, etc.
 */
router.post('/', AgencyController.create);

/**
 * @route PUT /api/agency/:id
 * @desc Update agency
 * @access Private
 * @body agencyName, agencyCode, registrationNumber, phone, email, address, etc.
 */
router.put('/:id', AgencyController.update);

/**
 * @route PATCH /api/agency/:id/status
 * @desc Update agency status only
 * @access Private
 * @body status
 */
router.patch('/:id/status', AgencyController.updateStatus);

/**
 * @route DELETE /api/agency/:id
 * @desc Soft delete agency (set isActive to false)
 * @access Private
 */
router.delete('/:id', AgencyController.delete);

// ===============================================================
// ERROR HANDLING MIDDLEWARE
// ===============================================================

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Agency Router Error:', error);
  
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