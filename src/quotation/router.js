

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.createQuotationHeaderValidator, controller.createQuotationHeader)
.put("/update/:id",validator.updateQuotationHeaderValidator, controller.updateQuotationHeader)
.put("/postToInvoice/:id",validator.updateQuotationHeaderValidator, controller.updateQuotationHeaderPostToInvoice)
.delete("/find/:id", controller.deleteQuotationHeader)
.get("/find", controller.getQuotationHeaders)
.get("/findByDate", controller.getQuotationHeadersByDate)
.get("/find/:id", controller.getQuotationHeaderById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router