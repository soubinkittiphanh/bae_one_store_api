const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../../api').jwtApi;

router.post('/create', controller.createEvent)
    .get('/upcoming', controller.getUpcomingEvents)
    .get('/impact-stats', controller.getImpactStats);

module.exports = router;
