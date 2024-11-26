

const {validateToken} = require("../api/jwtApi")
const controller = require("./controller")
const service = require("./service")
const express = require("express")
const router = express.Router()
router.use(validateToken)

router
.post("/create", controller.createCustomer)
.post("/linkterminal/:id", controller.linkTerminal)
.post("/unlinkterminal/:id", controller.unlinkTerminal)
.put("/update/:id", controller.updateCustomer)
.delete("/find/:id", controller.deleteCustomer)
.get("/find", controller.getCustomers)
.get("/find/:id", controller.getCustomerById)

module.exports = router