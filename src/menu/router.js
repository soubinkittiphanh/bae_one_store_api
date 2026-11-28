

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
router
.post("/create", requirePosGrant("MENU", "EDIT"), controller.createMenuHeader)
.post("/generate", requirePosGrant("MENU", "EDIT"), controller.generateMenuHeader)
    .put("/update/:id", requirePosGrant("MENU", "EDIT"), controller.updateMenuHeader)
    .delete("/find/:id", requirePosGrant("MENU", "EDIT"), controller.deleteMenuHeader)
    .get("/find", controller.getMenuHeaders)
    .get("/find/:id", controller.getMenuHeaderById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router