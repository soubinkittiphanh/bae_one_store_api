const express = require('express');
const router = express.Router();
const schoolInvoiceController = require('./controller');

router.post('/', schoolInvoiceController.create);
router.post('/bulk', schoolInvoiceController.createBulk);
router.get('/', schoolInvoiceController.getAll);
router.get('/:id', schoolInvoiceController.getOne);

module.exports = router;
