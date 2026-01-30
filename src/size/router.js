const express = require('express');
const router = express.Router();
const SizeController = require('./controller'); // Adjust path as needed

// GET /api/size - Get all active sizes
router.get('/', SizeController.getAllSizes);

// GET /api/size/:id - Get size by ID
router.get('/:id', SizeController.getSizeById);

// POST /api/size - Create new size
router.post('/', SizeController.createSize);

// PUT /api/size/:id - Update size
router.put('/:id', SizeController.updateSize);

// DELETE /api/size/:id - Delete size (soft delete)
router.delete('/:id', SizeController.deleteSize);

module.exports = router;