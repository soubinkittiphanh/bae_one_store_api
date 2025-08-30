// routes/mou.js
const express = require('express');
const router = express.Router();
const MOUController = require('./controller');

router.post('/', MOUController.createMOU);
router.get('/', MOUController.getAllMOUs);
router.get('/statistics', MOUController.getMOUStatistics);
router.get('/status/:status', MOUController.getMOUsByStatus);
router.get('/:id', MOUController.getMOUById);
router.put('/:id', MOUController.updateMOU);
router.patch('/:id/status', MOUController.updateMOUStatus);
router.delete('/:id', MOUController.deleteMOU);

module.exports = router;