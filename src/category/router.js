

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", controller.createCategory)
.post("/generate", controller.generate)
.put("/update/:categ_id", controller.updateCategoryById)
.delete("/find/:categ_id", controller.deleteCategoryById)
.get("/find", controller.getAllActiveCategories)
.get("/findAll", controller.getAllCategories)
.get("/find/:categ_id", controller.getCategoryById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router