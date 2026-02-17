const express = require('express');
const router = express.Router();
const printerController = require('./controller');
// const { verifyToken } = require('../middleware/auth'); // Add if you use auth

// Get all printer settings
router.get('/', printerController.getPrinters);

// Create or Update a printer setting
router.post('/upsert', printerController.upsertPrinter);

module.exports = router;