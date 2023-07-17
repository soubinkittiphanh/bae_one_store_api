const logger = require("../api/logger")
const controller = require("../controllers/financial").chartAccount
const service = require("../account/service")
const express = require("express")
const router = express.Router()
const {validateToken} = require('../api').jwtApi
router.use(validateToken)

router.post("/chartAccount",controller.createAccount)
.get("/chartAccount",controller.getAccounts)
.get("/chartAccount/:id",controller.getAccountById)
.post("/generateBasicAccount",service.createBulk)
module.exports = router