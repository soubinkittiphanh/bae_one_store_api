

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.createSaleHeaderValidator, controller.createSaleHeader)
.put("/update/:id",validator.updateSaleHeaderValidator, controller.updateSaleHeader)
.put("/postToInvoice/:id",validator.updateSaleHeaderValidator, controller.updateSaleHeaderPostToInvoice)
.delete("/find/:id", controller.deleteSaleHeader)
.get("/find", controller.getSaleHeaders)
.get("/findByDate", controller.getSaleHeadersByDate)
.get("/find/:id", controller.getSaleHeaderById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router