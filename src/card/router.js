
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
const { requirePosGrant } = require('../security/middleware')
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create", requirePosGrant("STOCK", "EDIT"), controller.create)
    .put("/update/:id", requirePosGrant("STOCK", "EDIT"), controller.updateById)
    .delete("/find/:id", requirePosGrant("STOCK", "EDIT"), controller.deleteById)
    .get("/find", controller.getAll)
    .get("/find/date", controller.getAllByDate)
    .get("/find/count/group_by_product", controller.getAllCountAndSumGroupByProduct)
    .get("/find/:id", controller.getById)
    .get("/stock-movements", controller.stockmovements)
    .get("/audit-logs", controller.auditLogs)
    .post("/rebuildStockValue", requirePosGrant("STOCK", "EDIT"), service.rebuildStockValue)
    .post("/bulkCreate", requirePosGrant("STOCK", "EDIT"), service.createHulkStockCard)
    .post("/bulkCreateV2", requirePosGrant("STOCK", "EDIT"), service.createHulkStockCardV2)
    .post("/bulkCreateV3", requirePosGrant("STOCK", "EDIT"), service.createHulkStockCardV3)
    .post("/adjustStockBulk", requirePosGrant("STOCK", "EDIT"), service.adjustStockBulk)
module.exports = router