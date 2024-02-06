

const validateToken = require("../api/jwtApi").validateToken
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create",controller.createReservation)
    .put("/update/:id", controller.updateReservationById)
    .delete("/find/:id", controller.deleteReservationById)
    .get("/find", controller.getAllReservations)
    .get("/find/:id", controller.getReservationById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router