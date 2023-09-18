

const validateToken = require("../../../api/jwtApi")
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
router.post("/create",controller.createCompany)
    .put("/update/:id",controller.updateCompanyById)
    .delete("/find/:id", controller.deleteCompanyById)
    .get("/find", controller.getAllCompanies)
    .get("/find/:id", controller.getCompanyById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router