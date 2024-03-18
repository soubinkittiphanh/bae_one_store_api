
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
router
    .post("/create", controller.createGeneralLedger)
    .put("/update/:id", controller.updateGeneralLedgerEntryById)
    .delete("/find/:id", controller.deleteGeneralLedgerEntryById)
    .get("/find", controller.getAllGeneralLedgerEntries)
    .get("/findByDate", controller.getAllByDate)
    .get("/find/:id", controller.getGeneralLedgerEntryById)
    // .post("/bulkCreate",service.createHulkStockCard)
module.exports = router