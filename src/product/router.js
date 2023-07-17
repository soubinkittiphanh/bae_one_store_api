

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()

const validator = require("./validator")
router.use(validateToken)
// No auth 
// router.use((req,res,next)=>{
//     next()
// })
router.post("/create",validator.createReceiveHeaderValidation, controller.createProduct)
    .put("/update/:id",validator.updateReceiveHeaderValidation, controller.updateProductById)
    .delete("/find/:id", controller.deleteProductById)
    .get("/find", controller.getAllProducts)
    .get("/find/:id", controller.getProductById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router