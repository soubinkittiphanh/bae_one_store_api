

const {validateToken} = require("../../api/jwtApi")
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
router.post("/create", controller.createPOLine)
    .put("/update/:id", controller.updatePOLineById)
    .delete("/find/:id", controller.deletePOLineById)
    .get("/find", controller.getAllPOLines)
    .get("/find/:id", controller.getPOLineById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router