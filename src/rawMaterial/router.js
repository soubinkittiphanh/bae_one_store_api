// /api/raw-materials: stock of products with stockMode = 'quantity' (see src/rawMaterial/service.js)
const express = require('express');
const { validateToken } = require('../api/jwtApi');
const controller = require('./controller');

const router = express.Router();
router.use(validateToken);

router.get('/', controller.listStock);
router.get('/:productId/ledger', controller.ledger);
router.post('/:productId/convert', controller.convert);
router.post('/:productId/receive', controller.receive);
router.post('/:productId/adjust', controller.adjust);
router.post('/:productId/count', controller.count);

module.exports = router;
