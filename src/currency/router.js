

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
router.post("/create", controller.createCurrency)
    .put("/update/:id", controller.updateCurrency)
    .delete("/find/:id", controller.destroyCurrency)
    .get("/find", controller.findActiveCurrencies)
    .get("/findAll", controller.findCurrencies)
    .get("/find/:id", controller.findCurrency)
    .post("/generate/", controller.generate)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router