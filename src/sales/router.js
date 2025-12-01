const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")

router.use(validateToken)

router
  .post("/create", validator.createSaleHeaderValidator, controller.createSaleHeader)
  .post("/create-header-only", validator.createSaleHeaderValidator, controller.createSaleHeaderOnly) // NEW: Multi-payment support
  .put("/complete-sale/:saleHeaderId", controller.completeSaleWithLines) // NEW: Complete sale after payments
  .put("/update/:id", validator.updateSaleHeaderValidator, controller.updateSaleHeader)
  .put("/settle/:id", controller.settlement)
  .put("/reverse/:id", controller.reverseSaleHeader)
  .put("/postToInvoice/:id", validator.updateSaleHeaderValidator, controller.updateSaleHeaderPostToInvoice)
  .delete("/find/:id", controller.deleteSaleHeader)
  .get("/find", controller.getSaleHeaders)
  .get("/findByDate", controller.getSaleHeadersByDate)
  .get("/findDetailByDate", controller.getSaleHeadersDetailByDate)
  .get("/findByDateAndUser", controller.getSaleHeadersByDateAndUser)
  .get("/findByDateAndCustomer", controller.getSaleHeadersByDateAndCustomer)
  .get("/findByDateAndProduct", controller.getSaleHeadersByDateAndProduct)
  .get("/sumsaleDaily", controller.sumSaleToday)
  .get("/sumsaleMonthly", controller.sumSaleCurrentMonth)
  .get("/sumsaleYearly", controller.sumSaleCurrentYear)
  .get("/find/:id", controller.getSaleHeaderById)
  .post("/report/summary", controller.getSaleHeaderByPaymentType)
  .post("/report/detail", controller.getSaleHeaderById)

module.exports = router