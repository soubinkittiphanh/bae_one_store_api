

const validateToken = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.validateCreate, controller.create)
.put("/update/:id",validator.validateUpdate, controller.update)
.delete("/find/:id", controller.delete)
.get("/find", controller.findAll)
.get("/find/id", controller.findOne)
.get("/find/active", controller.findAllActive)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router