const { validateToken } = require('../../api/jwtApi');
const controller = require('./controller');
const express = require('express');
const router = express.Router();

router.use(validateToken);

router.post('/run-eod', controller.runEOD);

module.exports = router;
