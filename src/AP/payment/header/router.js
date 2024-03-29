

const {validateToken} = require("../../../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator").paymentHeaderValidator
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create",validator.create, controller.createPaymentHeader)
    .put("/update/:id",validator.update, controller.updatePaymentHeaderById)
    .delete("/find/:id", controller.deletePaymentHeaderById)
    .get("/find", controller.getAllPaymentHeaders)
    .get("/find/:id", controller.getPaymentHeaderById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router