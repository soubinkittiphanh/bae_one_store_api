

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create",validator.createSaleHeaderValidator, controller.createTransferHeader)
.put("/update/:id",validator.updateSaleHeaderValidator, controller.updatetransfer)
.delete("/find/:id", controller.deleteTransfer)
.get("/find", controller.getTransfers)
.get("/findByDate", controller.getTransfersByDate)
.get("/find/:id", controller.getTransferById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router