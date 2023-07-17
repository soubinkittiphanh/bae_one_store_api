

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
router.post("/create", controller.createPOHeader)
    .put("/update/:id", controller.updatePOHeaderById)
    .delete("/find/:id", controller.deletePOHeaderById)
    .get("/find", controller.getAllPOHeaders)
    .get("/find/:id", controller.getPOHeaderById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router