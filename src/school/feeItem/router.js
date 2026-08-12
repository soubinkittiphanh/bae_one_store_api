const express = require('express');
const router = express.Router();
const feeItemController = require('./controller');

router.post('/', feeItemController.create);
router.get('/', feeItemController.getAll);
router.put('/update/:id', feeItemController.update);
router.delete('/delete/:id', feeItemController.delete);

module.exports = router;
