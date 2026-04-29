

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
router.post("/create", controller.createProduct)
    .put("/update/:id", controller.updateProductById)
    .delete("/find/:id", controller.deleteProductById)
    .put("/disable/:id", controller.disableProductById)
    .get("/find", controller.getAllProducts)
    .get("/find/active", controller.getAllActiveProducts)
    .get("/find/:id", controller.getProductById)
    .get("/audit/:id", controller.getProductAudit)
    .put("/stockcount/:id", controller.updateProductCountById)
    .put("/stockcount", controller.updateProductCountAll)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router