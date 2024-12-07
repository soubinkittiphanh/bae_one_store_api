

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
router.post("/create", controller.createSPF)
    .put("/update/:id", controller.updateSPF)
    .delete("/find/:id", controller.deleteSPF)
    .get("/find", controller.getAllSPF)
    .get("/findAll", controller.getAllSPF)
    .get("/find/:id", controller.getSPFById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router