const express = require('express');
const router = express.Router();
const nfcCardController = require('./controller');

// Fetch NFC Card by query
router.get('/find', nfcCardController.find);

// Link a physical card UID to a student ID
router.post('/register', nfcCardController.registerCard);

// Deactivate a card if a student loses it
router.put('/report-lost', nfcCardController.reportLost);

module.exports = router;