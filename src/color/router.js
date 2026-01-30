const express = require('express');
const router = express.Router();
const ColorController = require('./controller'); // Adjust path as needed

// GET /api/color - Get all active colors
router.get('/', ColorController.getAllColors);

// GET /api/color/:id - Get color by ID
router.get('/:id', ColorController.getColorById);

// POST /api/color - Create new color
router.post('/', ColorController.createColor);

// PUT /api/color/:id - Update color
router.put('/:id', ColorController.updateColor);

// DELETE /api/color/:id - Delete color (soft delete)
router.delete('/:id', ColorController.deleteColor);

module.exports = router;