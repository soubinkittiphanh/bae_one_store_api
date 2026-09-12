
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create", controller.create)
    .put("/update/:id", controller.updateById)
    .delete("/find/:id", controller.deleteById)
    .get("/find", controller.getAll)
    .get("/find/date", controller.getAllByDate)
    .get("/find/count/group_by_product", controller.getAllCountAndSumGroupByProduct)
    .get("/find/:id", controller.getById)
    .get("/stock-movements", controller.stockmovements)
    .get("/audit-logs", controller.auditLogs)
    .post("/rebuildStockValue",service.rebuildStockValue)
    .post("/bulkCreate",service.createHulkStockCard)
    .post("/bulkCreateV2",service.createHulkStockCardV2)
    .post("/bulkCreateV3",service.createHulkStockCardV3)
    .post("/adjustStockBulk", service.adjustStockBulk)
module.exports = router