

const {validateToken} = require("../../api/jwtApi")
const ticketLineController = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })

router.post('/ticket-lines', ticketLineController.createTicketLine);
router.get('/ticket-lines', ticketLineController.getAllTicketLines);
router.get('/ticket-lines/:id', ticketLineController.getTicketLineById);
router.put('/ticket-lines/:id', ticketLineController.updateTicketLine);
router.delete('/ticket-lines/:id', ticketLineController.deleteTicketLine);

    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router