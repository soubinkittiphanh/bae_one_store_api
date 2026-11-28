// /api/raw-materials: stock of products with stockMode = 'quantity' (see src/rawMaterial/service.js)
const express = require('express');
const { validateToken } = require('../api/jwtApi');
const { requirePosGrant } = require('../security/middleware');
const controller = require('./controller');

const router = express.Router();
router.use(validateToken);

router.get('/', controller.listStock);
router.get('/:productId/ledger', controller.ledger);
router.post('/:productId/convert', requirePosGrant('STOCK', 'EDIT'), controller.convert);
router.post('/:productId/receive', requirePosGrant('STOCK', 'EDIT'), controller.receive);
router.post('/:productId/adjust', requirePosGrant('STOCK', 'EDIT'), controller.adjust);
router.post('/:productId/count', requirePosGrant('STOCK', 'EDIT'), controller.count);

module.exports = router;
