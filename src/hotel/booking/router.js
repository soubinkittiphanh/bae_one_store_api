

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
router.post("/create", controller.createOwner)
    .put("/update/:id", controller.updateOwner)
    .delete("/find/:id", controller.deleteOwner)
    .get("/find", controller.getAllOwners)
    .get("/findAll", controller.getAllOwners)
    .get("/find/:id", controller.getOwnerById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router