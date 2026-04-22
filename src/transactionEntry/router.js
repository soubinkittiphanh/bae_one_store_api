const express = require('express');
const router = express.Router();
const transactionController = require('./controller');

// Process the money move from Student Wallet to Shop Revenue
router.post('/settlement', transactionController.processSettlement);

// Route for Top-ups (Adding money to a card)
router.post('/topup', transactionController.processTopup);

// Route for Withdrawals (Taking money out)
router.post('/withdraw', transactionController.processWithdrawal);

// Route for Account Statement
router.get('/statement/:accountId', transactionController.getAccountStatement);

// Route for User activity (Staff Report)
router.get('/user-activity/:userId', transactionController.getUserActivity);

module.exports = router;