

const { validateToken } = require("../api/jwtApi")
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
router
    .post("/create", controller.createOrderTable)
    .put("/update/:id", controller.updateOrderTableById)
    .delete("/find/:id", controller.deleteOrderTableById)
    .get("/find", controller.getAllOrderTables)
    .get("/find/:id", controller.getOrderTableById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router