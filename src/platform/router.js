const express = require('express');
const router = express.Router();

const platformRouter = require('./platform/router');
const accountRouter = require('./account/router');

// Sub-routes under /api/platforms or /api/platform
router.use('/accounts', accountRouter);
router.use('/', platformRouter);

module.exports = router;
