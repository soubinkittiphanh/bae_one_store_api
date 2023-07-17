

const validateToken = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.createCustomer)
.put("/update/:id", controller.updateCustomer)
.delete("/find/:id", controller.deleteCustomer)
.get("/find", controller.getCustomers)
.get("/find/id", controller.getCustomer)
// .post("/generate", service.createHulkUnit)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router