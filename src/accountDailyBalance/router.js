const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.post('/batch', controller.runCOBBatch);
router.get('/history', controller.getHistory);

module.exports = router;
