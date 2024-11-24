

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
router.post("/create", controller.createVendor)
    .put("/update/:id", controller.updateVendorById)
    .delete("/find/:id", controller.deleteVendorById)
    .get("/find", controller.getAllActiveVendors)
    .get("/findAll", controller.getAllVendors)
    .get("/find/:id", controller.getVendorById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router