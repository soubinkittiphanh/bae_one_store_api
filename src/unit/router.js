

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.createUnitModel)
.put("/update/:id", controller.updateUnitModel)
.delete("/find/:id", controller.deleteUnitModel)
.get("/find", controller.getUnitModels)
.get("/find/id", controller.getUnitModelById)
.post("/generate", service.createHulkUnit)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router