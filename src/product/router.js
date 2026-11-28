

const {validateToken} = require("../api/jwtApi")
const { requirePosGrant } = require("../security/middleware")
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
router.post("/create", requirePosGrant("PRODUCT", "CREATE"), controller.createProduct)
    .post("/bulk", requirePosGrant("PRODUCT", "CREATE"), controller.bulkCreateProducts)
    .post("/bulk-price-update", requirePosGrant("PRODUCT", "EDIT"), controller.bulkUpdatePrices)
    .put("/update/:id", requirePosGrant("PRODUCT", "EDIT"), controller.updateProductById)
    .delete("/find/:id", requirePosGrant("PRODUCT", "DELETE"), controller.deleteProductById)
    .put("/disable/:id", requirePosGrant("PRODUCT", "DELETE"), controller.disableProductById)
    .get("/find", controller.getAllProducts)
    .get("/find/active", controller.getAllActiveProducts)
    .get("/find/:id", controller.getProductById)
    .get("/audit/:id", controller.getProductAudit)
    .put("/stockcount/:id", requirePosGrant("STOCK", "EDIT"), controller.updateProductCountById)
    .put("/stockcount", requirePosGrant("STOCK", "EDIT"), controller.updateProductCountAll)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router