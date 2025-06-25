

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

router.post('/ticket-lines', ticketLineController.create);
router.get('/ticket/:ticketId', ticketLineController.getByTicketId);
router.get('/:id', ticketLineController.getById);
router.get('/ticket-lines', ticketLineController.getAll);
router.get('/ticket-lines/:id', ticketLineController.getById);
router.put('/ticket-lines/:id', ticketLineController.update);
router.delete('/ticket-lines/:id', ticketLineController.delete);

    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router