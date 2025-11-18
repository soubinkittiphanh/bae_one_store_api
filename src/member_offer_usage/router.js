const express = require('express');
const router = express.Router();
const MemberOfferUsageController = require('./controller');

// Import middleware if needed
// const authMiddleware = require('../middleware/auth');
// const adminMiddleware = require('../middleware/admin');

/**
 * Member Offer Usage Routes
 * Base path: /api/member-offer-usage
 */

// GET /api/member-offer-usage - Get all usage records with pagination and filtering
router.get('/', MemberOfferUsageController.getAllUsage);

// GET /api/member-offer-usage/dashboard - Get dashboard summary
router.get('/dashboard', MemberOfferUsageController.getDashboardSummary);

// GET /api/member-offer-usage/reports - Get usage reports with aggregations
router.get('/reports', MemberOfferUsageController.getUsageReports);

// GET /api/member-offer-usage/offer/:memberOfferId - Get usage records by offer ID
router.get('/offer/:memberOfferId', MemberOfferUsageController.getUsageByOffer);

// GET /api/member-offer-usage/ticket/:ticketId - Get usage records by ticket ID
router.get('/ticket/:ticketId', MemberOfferUsageController.getUsageByTicket);

// GET /api/member-offer-usage/member/:memberId/stats - Get usage statistics by member
router.get('/member/:memberId/stats', MemberOfferUsageController.getUsageStatsByMember);

// POST /api/member-offer-usage - Create new usage record
router.post('/', MemberOfferUsageController.createUsage);

// DELETE /api/member-offer-usage/:id - Delete usage record (admin only)
// router.delete('/:id', adminMiddleware, MemberOfferUsageController.deleteUsage);

module.exports = router;

/**
 * Usage in your main app.js or routes/index.js:
 * 
 * const memberOfferUsageRoutes = require('./routes/memberOfferUsageRoutes');
 * app.use('/api/member-offer-usage', memberOfferUsageRoutes);
 * 
 * Example API calls:
 * 
 * 1. Record usage when processing a sale:
 * POST /api/member-offer-usage
 * {
 *   "memberOfferId": 1,
 *   "ticketId": 123,
 *   "categoryId": 2,
 *   "itemId": 45,
 *   "qtyUsed": 2,
 *   "originalPrice": 10.50,
 *   "notes": "Free drinks with Gold membership"
 * }
 * 
 * 2. Get usage history for an offer:
 * GET /api/member-offer-usage/offer/1?startDate=2025-01-01&endDate=2025-12-31
 * 
 * 3. Get usage for a specific ticket:
 * GET /api/member-offer-usage/ticket/123
 * 
 * 4. Get member usage statistics:
 * GET /api/member-offer-usage/member/1/stats?startDate=2025-01-01
 * 
 * 5. Get dashboard summary:
 * GET /api/member-offer-usage/dashboard?memberId=1&days=30
 * 
 * 6. Get usage reports:
 * GET /api/member-offer-usage/reports?reportType=daily&startDate=2025-01-01&endDate=2025-01-31
 */