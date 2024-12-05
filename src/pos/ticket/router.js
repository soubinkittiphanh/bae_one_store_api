

const {validateToken} = require("../api/jwtApi")
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

router.post('/tickets', ticketController.createTicket);
router.get('/tickets', ticketController.getAllTickets);
router.get('/tickets/:id', ticketController.getTicketById);
router.put('/tickets/:id', ticketController.updateTicket);
router.put('/tickets/:id/close', ticketController.closeTicket); // Specific route for closing tickets
router.delete('/tickets/:id', ticketController.deleteTicket);

    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router