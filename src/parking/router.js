const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');
const {
  checkRole,
  validateEntry,
  validateCalculateFee,
  validatePay,
  validateZone,
  validateSlot,
  validatePricingRule,
  validateMonthlyPass
} = require('./validation');

// Protect all routes with JWT token verification
router.use(validateToken);

// =============================================================================
// 1. VEHICLE ENTRY, FEE CALCULATION & CHECKOUT (EXIT/PAY)
// =============================================================================
router.post('/entry', validateEntry, controller.entry);
router.post('/exit/calculate-fee', validateCalculateFee, controller.calculateFee);
router.post('/exit/pay', validatePay, controller.pay);

// =============================================================================
// 2. TICKETS
// =============================================================================
router.get('/tickets', controller.getTickets);
router.get('/tickets/:id', controller.getTicketById);
router.post('/tickets/:id/lost', controller.markTicketLost);
router.post('/tickets/:id/cancel', checkRole(['admin', 'manager']), controller.cancelTicket);

// =============================================================================
// 3. ZONES & SLOTS
// =============================================================================
router.get('/zones', controller.getZones);
router.post('/zones', checkRole(['admin']), validateZone, controller.createZone);
router.put('/zones/:id', checkRole(['admin']), validateZone, controller.updateZone);
router.delete('/zones/:id', checkRole(['admin']), controller.deleteZone);

router.get('/slots', controller.getSlots);
router.post('/slots', checkRole(['admin']), validateSlot, controller.createSlot);
router.put('/slots/:id', checkRole(['admin']), controller.updateSlot);
router.patch('/slots/:id/status', controller.updateSlotStatus);

// =============================================================================
// 4. PRICING RULES (ADMIN)
// =============================================================================
router.get('/pricing-rules', controller.getPricingRules);
router.post('/pricing-rules', checkRole(['admin']), validatePricingRule, controller.savePricingRule);
router.put('/pricing-rules/:id', checkRole(['admin']), validatePricingRule, controller.savePricingRule);

// =============================================================================
// 5. MONTHLY PASSES
// =============================================================================
router.get('/monthly-passes', controller.getMonthlyPasses);
router.post('/monthly-passes', checkRole(['admin', 'manager']), validateMonthlyPass, controller.createMonthlyPass);
router.post('/monthly-passes/:id/renew', checkRole(['admin', 'manager']), controller.renewMonthlyPass);

// =============================================================================
// 6. DASHBOARD & REPORTS
// =============================================================================
router.get('/dashboard/stats', controller.getDashboardStats);
router.get('/reports/parked-vehicles', controller.getParkedVehicles);
router.get('/reports/revenue', controller.getRevenueReport);
router.get('/reports/peak-hours', controller.getPeakHoursReport);

module.exports = router;
