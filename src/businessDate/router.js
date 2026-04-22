const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.get('/current', controller.getBusinessDate);
router.post('/advance', controller.advanceBusinessDate);
router.post('/sync', controller.syncHistoricalData);

module.exports = router;
