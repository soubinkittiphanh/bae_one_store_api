const express = require('express');
const router = express.Router();
const qrController = require('./controller');

/**
 * @route   POST /api/qr/generate
 * @desc    Generate QR code (create request and get response from bank)
 * @access  Private
 * @body    { memberId, txnAmount, billNumber, merchantId, storeLabel, terminalLabel, callbackUrl, purposeOfTxn }
 */
router.post('/generate', qrController.generateQR);

/**
 * @route   POST /api/qr/callback
 * @desc    Handle payment callback from bank
 * @access  Public (called by bank)
 */
router.post('/callback', qrController.handleCallback);

/**
 * @route   GET /api/qr/payment-status/:billNumber
 * @desc    Check payment status by bill number
 * @access  Private
 */
router.get('/payment-status/:billNumber', qrController.checkPaymentStatus);

/**
 * @route   GET /api/qr/request/:billNumber
 * @desc    Get QR request by bill number (with response)
 * @access  Private
 */
router.get('/request/:billNumber', qrController.getQRRequest);

/**
 * @route   GET /api/qr/response/:qrId
 * @desc    Get QR response by QR ID (with request)
 * @access  Private
 */
router.get('/response/:qrId', qrController.getQRResponse);

/**
 * @route   GET /api/qr/requests
 * @desc    Get all QR requests with filters
 * @query   ?status=PENDING&merchantId=xxx&storeLabel=xxx&startDate=2024-01-01&endDate=2024-01-31
 * @access  Private
 */
router.get('/requests', qrController.getAllQRRequests);

/**
 * @route   GET /api/qr/stats
 * @desc    Get QR statistics
 * @query   ?startDate=2024-01-01&endDate=2024-01-31
 * @access  Private
 */
router.get('/stats', qrController.getQRStats);

module.exports = router;