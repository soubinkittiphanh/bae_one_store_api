

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
    .put("/update/:id", controller.updateById)
    .delete("/find/:id", controller.deleteById)
    .get("/find", controller.getAll)
    .get("/find/:id", controller.getById)
    .get("/find/poId/:id", controller.getByPOId)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router