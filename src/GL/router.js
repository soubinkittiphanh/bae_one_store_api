
const controller = require("./controller")
const adbReportController = require("./adbReportController")
const service = require("./service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
router
    .post("/create", controller.createGeneralLedger)
    .post("/createMulti", controller.createMultiGeneralLedger)
    .put("/update/:id", controller.updateGeneralLedgerEntryById)
    .delete("/find/:id", controller.deleteGeneralLedgerEntryById)
    .get("/find", controller.getAllGeneralLedgerEntries)
    .get("/findByDate", controller.getAllByDate)
    .get("/find/:id", controller.getGeneralLedgerEntryById)
    .get("/posting/preview", controller.previewUnpostedBatch)
    .post("/posting/batch", controller.postBatch)
    .get("/reports/receipts-payments", adbReportController.getReceiptsAndPayments)
    .get("/reports/budget-vs-actual", adbReportController.getBudgetVsActual)
module.exports = router