const express = require('express');
const router = express.Router();
const feeStructureController = require('./controller');

router.post('/', feeStructureController.create);
router.get('/', feeStructureController.getAll);
router.put('/update/:id', feeStructureController.update);
router.delete('/delete/:id', feeStructureController.delete);

module.exports = router;
