const express = require('express');
const router = express.Router();
const schoolPaymentController = require('./controller');

router.post('/', schoolPaymentController.create);
router.get('/:id/receipt', schoolPaymentController.getReceipt);

module.exports = router;
