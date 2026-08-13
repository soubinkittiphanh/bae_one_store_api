const express = require('express');
const router = express.Router();
const cashierShiftController = require('./controller');

router.post('/open', cashierShiftController.open);
router.post('/close/:id', cashierShiftController.close);
router.get('/active', cashierShiftController.getActive);
router.get('/report/:id', cashierShiftController.getShiftReport);

module.exports = router;
