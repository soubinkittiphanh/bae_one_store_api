const express = require('express');
const router = express.Router();
const ministryController = require('./controller');

// Validation middleware (optional - you can use express-validator or joi)
const validateMinistryData = (req, res, next) => {
  const { ministryCode, ministryName } = req.body;
  
  if (!ministryCode || !ministryName) {
    return res.status(400).json({
      success: false,
      message: 'Ministry code and name are required'
    });
  }
  
  next();
};

// Routes
// GET /api/ministries - Get all ministries with optional filtering
router.get('/', ministryController.getAllMinistries);

// GET /api/ministries/hierarchy - Get ministry hierarchy
router.get('/hierarchy', ministryController.getMinistryHierarchy);

// GET /api/ministries/type/:type - Get ministries by type
router.get('/type/:type', ministryController.getMinisteriesByType);

// GET /api/ministries/:id - Get ministry by ID
router.get('/:id', ministryController.getMinistryById);

// POST /api/ministries - Create new ministry
router.post('/', validateMinistryData, ministryController.createMinistry);

// PUT /api/ministries/:id - Update ministry
router.put('/:id', ministryController.updateMinistry);

// DELETE /api/ministries/:id - Delete ministry (soft delete)
router.delete('/:id', ministryController.deleteMinistry);

module.exports = router;