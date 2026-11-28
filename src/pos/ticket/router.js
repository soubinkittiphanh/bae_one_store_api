

const { validateToken } = require("../../api/jwtApi")
const { requirePosGrant } = require('../../security/middleware')
const ticketController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
// Basic CRUD - GET ALL (must be first)
router.get('/find', ticketController.getAllTickets);

// Special query routes (BEFORE /:id)
router.get('/table/:tableId', ticketController.getTicketsByTable);
router.get('/table/:tableId/pending', ticketController.getTicketsByTableAndStatus);
router.get('/table/:tableId/current', ticketController.getCurrentTicketByTable);
router.get('/filter/pending', ticketController.getPendingTickets);
router.get('/reports/sales', ticketController.getSalesReport);
router.get('/reports/top-products', ticketController.getTopProductsReport);
router.get('/reports/payment-methods', ticketController.getPaymentMethodsReport);
router.get('/reports/daily-summary', ticketController.getDailySummaryReport);
router.get('/reports/hourly-sales', ticketController.getHourlySalesReport);
router.get('/reports/staff-performance', ticketController.getStaffPerformanceReport);

// Status management routes (BEFORE /:id routes!)
// Cancelling / voiding a ticket needs POS_TICKET VOID (before, any logged-in user could)
router.patch('/:id/status', requirePosGrant('POS_TICKET', 'VOID', {
    noGroup: 'deny',
    when: req => ['cancel', 'void'].includes(String((req.body && req.body.status) || '').toLowerCase())
}), ticketController.updateTicketStatus);
router.patch('/:id/payment-status', ticketController.updatePaymentStatus);
router.patch('/:id/notes', ticketController.updateTicketNotes);
// Basic CRUD - Specific ID routes (AFTER all specific routes)
router.get('/:id', ticketController.getTicketById);
router.post('/', ticketController.createTicket);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', requirePosGrant('POS_TICKET', 'VOID', { noGroup: 'deny' }), ticketController.deleteTicket);

module.exports = router