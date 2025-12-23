const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
const validator = require("./validator")

router.use(validateToken)

router
  // ========== SALE HEADER CRUD OPERATIONS ==========
  .post("/create", validator.createSaleHeaderValidator, controller.createSaleHeader)
  .post("/create-header-only", validator.createSaleHeaderValidator, controller.createSaleHeaderOnly) // Multi-payment support
  .post("/create-line-only", validator.createSaleHeaderValidator, controller.createSaleLineOnly) // Multi-payment support
  .put("/complete-sale/:saleHeaderId", controller.completeSaleWithLines) // Complete sale after payments
  .put("/update/:id", validator.updateSaleHeaderValidator, controller.updateSaleHeader)
  .put("/update-v2/:id", validator.updateSaleHeaderValidator, controller.updateSaleHeaderV2)
  .put("/settle/:id", controller.settlement)
  .put("/reverse/:id", controller.reverseSaleHeader)
  .put("/postToInvoice/:id", validator.updateSaleHeaderValidator, controller.updateSaleHeaderPostToInvoice)
  .delete("/find/:id", controller.deleteSaleHeader)
  
  // ========== SALE HEADER QUERIES ==========
  .get("/find", controller.getSaleHeaders)
  .get("/find/:id", controller.getSaleHeaderById)
  .get("/findByDate", controller.getSaleHeadersByDate)
  .get("/findDetailByDate", controller.getSaleHeadersDetailByDate)
  .get("/findByDateAndUser", controller.getSaleHeadersByDateAndUser)
  .get("/findByDateAndCustomer", controller.getSaleHeadersByDateAndCustomer)
  .get("/findByDateAndProduct", controller.getSaleHeadersByDateAndProduct)
  
  // ========== SALE SUMMARIES ==========
  .get("/sumsaleDaily", controller.sumSaleToday)
  .get("/sumsaleMonthly", controller.sumSaleCurrentMonth)
  .get("/sumsaleYearly", controller.sumSaleCurrentYear)
  
  // ========== SALE REPORTS ==========
  .post("/report/summary", controller.getSaleHeaderByPaymentType)
  .post("/report/detail", controller.getSaleHeaderById)
  
  // ========== GIFT REPORT ROUTES ==========
  .get('/findByDateWithGifts', controller.getSaleHeadersByDateWithGifts)
  .get('/findByDateAndUserWithGifts', controller.getSaleHeadersByDateAndUserWithGifts)
  .get('/giftStats', controller.getGiftStatsByDate)
  .get('/giftsByCustomer', controller.getGiftsByCustomer)
  .get('/giftTrends', controller.getGiftTrends)
  
  // ========== GIFT MANAGEMENT ==========
  .post('/addGift', controller.addGiftToSale)
  .delete('/removeGift/:saleLineId', controller.removeGiftFromSale)

module.exports = router