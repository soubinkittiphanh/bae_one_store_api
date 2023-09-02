

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.create)
.put("/update/:id", controller.update)
.delete("/find/:id", controller.delete)
.get("/find", controller.findAll)
.get("/findWithCredit", controller.findAllWithCreditPayment)
.get("/find/:id", controller.findOne)
.get("/find/active", controller.findAllActive)
.post("/generate", service.createBulkClient)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router