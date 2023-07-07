

const validateToken = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.validateUnitModel, controller.createUnitModel)
.put("/update/:id",validator.validateUnitModel, controller.updateUnitModel)
.delete("/find/:id", controller.deleteUnitModel)
.get("/find", controller.getUnitModels)
.get("/find/id", controller.getUnitModelById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router