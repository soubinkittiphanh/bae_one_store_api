

const {validateToken} = require("../../api/jwtApi")
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

// Status management routes (BEFORE /:id routes!)
router.patch('/:id/status', ticketController.updateTicketStatus);
router.patch('/:id/payment-status', ticketController.updatePaymentStatus);

// Basic CRUD - Specific ID routes (AFTER all specific routes)
router.get('/:id', ticketController.getTicketById);
router.post('/', ticketController.createTicket);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);

module.exports = router