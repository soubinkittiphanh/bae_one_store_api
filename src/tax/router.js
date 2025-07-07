

const {validateToken} = require("../api/jwtApi")
const TaxController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)


// Public routes (no authentication required)
router.get('/active', TaxController.getActiveTaxRates);
router.get('/default', TaxController.getDefaultTaxRate);
router.get('/code/:code', TaxController.getTaxRateByCode);
router.post('/calculate', TaxController.calculateTax);
router.get('/statistics', TaxController.getTaxStatistics);

// Protected routes (uncomment when authentication is implemented)
// router.use(authenticateToken); // Apply authentication to all routes below

// Get all tax rates (with filtering and pagination)
router.get('/', TaxController.getAllTaxRates);

// Get specific tax rate by ID
router.get('/:id', TaxController.getTaxRateById);

// Admin-only routes (uncomment when role-based auth is implemented)
// router.use(requireRole(['admin', 'manager'])); // Adjust roles as needed

// Create new tax rate
router.post('/', TaxController.createTaxRate);

// Update tax rate
router.put('/:id', TaxController.updateTaxRate);

// Set default tax rate
router.patch('/:id/default', TaxController.setDefaultTaxRate);

// Delete/deactivate tax rate
router.delete('/:id', TaxController.deleteTaxRate);
module.exports = router