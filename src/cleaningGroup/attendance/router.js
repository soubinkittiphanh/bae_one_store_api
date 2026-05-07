const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { validateToken } = require('../../api').jwtApi;

// Public routes for attendance

router.post('/register', controller.registerForEvent)
    .post('/verify-checkin', controller.verifyCheckIn);

module.exports = router;
