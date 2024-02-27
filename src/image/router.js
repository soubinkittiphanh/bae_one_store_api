

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
router.post("/create", controller.create)
    .put("/update/:id", controller.update)
    .delete("/find/:id", controller.delete)
    .get("/find", controller.findAll)
    .get("/findAll", controller.findAll)
    .get("/find/:id", controller.findOne)
    // .post("/generate/", controller.generate)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router