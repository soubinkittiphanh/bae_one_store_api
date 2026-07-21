const { validateToken } = require('../../api/jwtApi');
const controller = require('./controller');
const express = require('express');
const router = express.Router();

router.use(validateToken);

router.get('/find', controller.findAll);

module.exports = router;
