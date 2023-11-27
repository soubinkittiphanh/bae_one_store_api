

const {validateToken} = require("../../../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create",validator.createReceiveHeaderValidation, controller.createReceiveHeader)
    .put("/update/:id",validator.updateReceiveHeaderValidation, controller.updateReceiveHeader)
    .delete("/find/:id", controller.deleteReceiveHeader)
    .get("/find", controller.getAllReceiveHeaders)
    .get("/findByDate", controller.getAllReceiveHeadersByDate)
    .get("/find/:id", controller.getReceiveHeaderById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router