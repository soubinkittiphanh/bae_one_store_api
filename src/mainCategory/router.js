

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")
router.use(validateToken)

router
.post("/create", validator.createCategoryValidation, controller.createCategory)
.post("/generate", controller.generate)
.put("/update/:id", validator.updateCategoryValidation, controller.updateCategoryById)
.delete("/find/:id", controller.deleteCategoryById)
.get("/find", controller.getAllActiveCategories)
.get("/findAll", controller.getAllCategories)
.get("/find/:id", controller.getCategoryById)
// .post("/bulkCreate",service.createHulkStockCard)
module.exports = router