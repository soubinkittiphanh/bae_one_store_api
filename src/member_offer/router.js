const express = require('express');
const router = express.Router();
const MemberOfferController = require('./controller');

// Import middleware if needed
// const authMiddleware = require('../middleware/auth');
// const validateRequest = require('../middleware/validation');

/**
 * Member Offer Routes
 * Base path: /api/member-offers
 */

// GET /api/member-offers - Get all offers with pagination and filtering
router.get('/', MemberOfferController.getAllOffers);

// GET /api/member-offers/stats - Get offer statistics
router.get('/stats', MemberOfferController.getOfferStats);

// GET /api/member-offers/member/:memberId/active - Get active offers by member
router.get('/member/:memberId/active', MemberOfferController.getActiveOffersByMember);

// GET /api/member-offers/member/:memberId/category/:categoryId - Get valid offers by member and category
router.get('/member/:memberId/category/:categoryId', MemberOfferController.getValidOffersByMemberAndCategory);

// GET /api/member-offers/:id - Get offer by ID
router.get('/:id', MemberOfferController.getOfferById);

// POST /api/member-offers - Create new offer
router.post('/', MemberOfferController.createOffer);

// PUT /api/member-offers/:id - Update offer
router.put('/:id', MemberOfferController.updateOffer);

// DELETE /api/member-offers/:id - Delete offer
router.delete('/:id', MemberOfferController.deleteOffer);

// POST /api/member-offers/:id/use - Use offer items
router.post('/:id/use', MemberOfferController.useOffer);

// PATCH /api/member-offers/:id/toggle-status - Toggle offer status
router.patch('/:id/toggle-status', MemberOfferController.toggleOfferStatus);

module.exports = router;

/**
 * Usage in your main app.js or routes/index.js:
 * 
 * const memberOfferRoutes = require('./routes/memberOfferRoutes');
 * app.use('/api/member-offers', memberOfferRoutes);
 */