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

// Create and Update routes
router.post("/create", validator.currencyValidation, controller.createCurrency)
router.put("/update/:id", validator.currencyValidation, controller.updateCurrency)

// Delete route
router.delete("/delete/:id", controller.destroyCurrency)

// Find routes
router.get("/findAll", controller.findCurrencies)
router.get("/findActive", controller.findActiveCurrencies)
router.get("/find/:id", controller.findCurrency)
router.get("/audit/:id", controller.getCurrencyAudit)

// Local currency management
router.get("/findLocalCurrency", controller.findLocalCurrency)
router.post("/switchLocalCurrency", controller.switchLocalCurrency)

// Exchange direction routes
router.get("/findByDirection/:direction", controller.findCurrenciesByDirection)
router.post("/convertRate", controller.convertRate)

// Generate route
router.post("/generate", controller.generate)

// Bulk operations (uncomment if needed)
// router.post("/bulkCreate", service.createBulkStockCard)

module.exports = router