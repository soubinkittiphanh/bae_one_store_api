

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.createPayment)
.put("/update/:id", controller.updatePayment)
.delete("/find/:id", controller.deletePayment)
.get("/find", controller.getPayments)
.get("/find/id", controller.getPaymentById)
// .post("/generate", service.createHulkPayment)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router