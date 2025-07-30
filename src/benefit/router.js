// ===============================================================
// BENEFIT ROUTER
// routes/benefitRoutes.js
// ===============================================================

const express = require('express');
const router = express.Router();
const benefitController = require('./controller');

// Middleware for validation
const validateBenefit = (req, res, next) => {
  const { name, type, jobAdvertiseId } = req.body;
  
  if (!name || !type || !jobAdvertiseId) {
    return res.status(400).json({
      success: false,
      message: 'Name, type, and jobAdvertiseId are required fields'
    });
  }

  // Validate type enum
  const validTypes = ['salary', 'allowance', 'insurance', 'accommodation', 'transportation', 'other'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: `Type must be one of: ${validTypes.join(', ')}`
    });
  }
  
  next();
};

// Routes
// GET /api/benefits/stats - Get statistics by type (should come before /:id)
router.get('/stats', benefitController.getStatsByType);

// GET /api/benefits/job/:jobAdvertiseId - Get benefits by job advertisement ID
router.get('/job/:jobAdvertiseId', benefitController.getByJobAdvertiseId);

// GET /api/benefits - Get all benefits
router.get('/', benefitController.getAll);

// GET /api/benefits/:id - Get benefit by ID
router.get('/:id', benefitController.getById);

// POST /api/benefits - Create new benefit
router.post('/', validateBenefit, benefitController.create);

// PUT /api/benefits/:id - Update benefit
router.put('/:id', validateBenefit, benefitController.update);

// DELETE /api/benefits/:id - Delete benefit
router.delete('/:id', benefitController.delete);

module.exports = router;