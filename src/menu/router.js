

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
router
.post("/create", controller.createMenuHeader)
.post("/generate", controller.generateMenuHeader)
    .put("/update/:id", controller.updateMenuHeader)
    .delete("/find/:id", controller.deleteMenuHeader)
    .get("/find", controller.getMenuHeaders)
    .get("/find/:id", controller.getMenuHeaderById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router