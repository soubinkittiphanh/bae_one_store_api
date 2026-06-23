const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');

// Protect all shipping order routes
router.use(validateToken);

router.post('/scan-arrival', controller.scanArrival);
router.put('/:id/confirm-arrival', controller.confirmArrival);
router.post('/scan-pickup', controller.scanPickup);
router.post('/complete-pickup', controller.completePickup);
router.get('/', controller.findAll);
router.post('/', controller.create);
router.get('/checkout-batches/:id', controller.getCheckoutBatch);

module.exports = router;
