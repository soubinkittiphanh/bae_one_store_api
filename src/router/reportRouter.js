const express = require('express')
const router = express.Router();
const controllers = require("../controllers/client/saleReport");
const logger = require('../api/logger');
const {validateToken} = require('../api').jwtApi
router.use(validateToken)

router.get("/topsale",controllers.topSaleByMonth)
router.get("/topsaleMinimart",controllers.topSaleMinimartByMonth)
.get('/dailySaleReport',controllers.dailySaleStatistic)
.get('/cod_n_cash_report',controllers.codAndCash)

module.exports = router