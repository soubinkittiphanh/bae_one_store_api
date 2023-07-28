

const {validateToken} = require("../../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.createQuotationLine, controller.createQuotationLine)
.put("/update/:id", controller.updateQuotationLine)
.delete("/find/:id", controller.deleteQuotationLine)
.get("/find", controller.getQuotationLines)
.get("/find/id", controller.getQuotationLineById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router