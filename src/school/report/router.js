const express = require('express');
const router = express.Router();
const schoolReportController = require('./controller');

router.get('/daily-collections', schoolReportController.getDailyCollections);
router.get('/overdue-balances', schoolReportController.getOverdueBalances);
router.get('/class-room-summary', schoolReportController.getClassRoomSummary);
router.get('/fee-item-summary', schoolReportController.getFeeItemSummary);

router.get('/cash-position', schoolReportController.getCashPositionReport);

module.exports = router;
