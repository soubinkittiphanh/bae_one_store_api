

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
.get("/find/active", controller.findAllActive)  // Move this BEFORE :id route
.get("/find/:id", controller.findOne)          // Put this AFTER specific routes
.post("/generate", service.createBulkClient)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router