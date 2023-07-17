const express = require('express');
const router = express.Router()
const dymicCustomerController = require("../controllers/client/dynamicCustomer")
const {validateToken} = require('../api').jwtApi
router.use(validateToken)
router
.get('/dynamicCustomer/findDymCustomerByBookingDate',dymicCustomerController.findDynamicCustomerByBookingDate)
.get('/dynamicCustomer/findDymCustomerByCOD',dymicCustomerController.findDynamicCustomerByCODPayment)

module.exports = router
