const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../api/jwtApi');

router.use(validateToken);

router.get('/report', controller.getReport);
router.get('/transactions/:id', controller.getTransactionsByClient);

module.exports = router;
