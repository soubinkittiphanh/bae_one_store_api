// routes/promotion.js
const express = require('express');
const router = express.Router();
const promotionController = require('./controller');
// const { authenticateToken } = require('../../middleware/auth'); // Assuming you have auth middleware
const {validateToken} = require("../../api/jwtApi")
// Public routes (for POS system)
router.get('/active', promotionController.getActivePromotions);
router.post('/calculate', promotionController.calculatePromotions);
router.post('/apply', promotionController.applyPromotion);

// Admin routes (require authentication)
router.use(validateToken); // Apply authentication to all routes below

router.get('/', promotionController.getAllPromotions);
router.post('/', promotionController.createPromotion);
router.put('/:id', promotionController.updatePromotion);
router.delete('/:id', promotionController.deletePromotion);

module.exports = router;