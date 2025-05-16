

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.createWashJob)
.put("/update/:id", controller.updateWashJob)
.delete("/find/:id", controller.deleteWashJob)
.get("/find", controller.getAllWashJobs)
.get("/findAll", controller.getAllWashJobs)
.get("/find/:id", controller.getWashJobById)
// .post("/generate", service.createHulkUnit)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router