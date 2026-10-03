const express = require('express');
const router = express.Router();
const { validateToken } = require('../../api').jwtApi;
const controller = require('./controller');

router.use(validateToken);

// GET routes
router.get('/master-summary', controller.getMasterSummary);
router.get('/period-list', controller.getPeriodList);

// POST routes
router.post('/close-period', controller.closePeriod);
router.post('/reopen-period', controller.reopenPeriod);
router.post('/backfill', controller.backfillAll);

module.exports = router;
