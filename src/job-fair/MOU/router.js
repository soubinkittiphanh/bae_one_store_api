const express = require('express');
const router = express.Router();
const JobBatchController = require('./controller');
const logger = require("../../api/logger");

// Middleware for authentication (uncomment and customize as needed)
// const authMiddleware = require('../middleware/auth');
// router.use(authMiddleware);

// Middleware to log all requests
router.use((req, res, next) => {
  logger.info(`JobBatch API: ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'anonymous'}`);
  next();
});

/**
 * @route   GET /api/job-batch/dashboard-stats
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/dashboard-stats', JobBatchController.getDashboardStats);

/**
 * @route   GET /api/job-batch/active
 * @desc    Get all active job batches
 * @access  Private
 */
router.get('/active', JobBatchController.getActiveBatches);

/**
 * @route   GET /api/job-batch
 * @desc    Get all job batches with pagination and filtering
 * @access  Private
 * @query   page, limit, status, priority, search, sortBy, sortOrder
 */
router.get('/', JobBatchController.getAll);

/**
 * @route   GET /api/job-batch/:id
 * @desc    Get job batch by ID
 * @access  Private
 */
router.get('/:id', JobBatchController.getById);

/**
 * @route   POST /api/job-batch
 * @desc    Create new job batch
 * @access  Private
 * @body    batchName, runningNo, jobDescription, totalPositions, dates, status, priority, notes
 */
router.post('/', JobBatchController.create);

/**
 * @route   PUT /api/job-batch/:id
 * @desc    Update job batch
 * @access  Private
 * @body    batchName, runningNo, jobDescription, totalPositions, dates, status, priority, notes
 */
router.put('/:id', JobBatchController.update);

/**
 * @route   PATCH /api/job-batch/:id/status
 * @desc    Update job batch status only
 * @access  Private
 * @body    status
 */
router.patch('/:id/status', JobBatchController.updateStatus);

/**
 * @route   DELETE /api/job-batch/:id
 * @desc    Soft delete job batch (set isActive to false)
 * @access  Private
 */
router.delete('/:id', JobBatchController.delete);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('JobBatch Router Error:', error);
  
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

module.exports = router;