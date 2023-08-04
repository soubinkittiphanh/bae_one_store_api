

const {validateToken} = require("../../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.createSaleLine, controller.createSaleLine)
.put("/update/:id", controller.updateSaleLine)
.delete("/find/:id", controller.deleteSaleLine)
.get("/find", controller.getSaleLines)
.get("/find/id", controller.getSaleLineById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router