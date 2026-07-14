const logger = require('../api/logger');
const db = require('../models');
const axios = require('axios');
const providerFactory = require('./providers/ProviderFactory');

/**
 * QR Controller
 * Handles QR code generation requests and responses
 */
class QRController {

    /**
     * Create QR Request and Generate QR Code from Bank
     * POST /api/qr/generate
     */
    async generateQR(req, res) {
        try {
            const {
                bankCode = 'IB', // Default to Indochina Bank
                memberId,
                txnAmount,
                purposeOfTxn,
                billNumber,
                merchantId,
                password,
                storeLabel,
                terminalLabel,
                callbackUrl: requestedCallbackUrl
            } = req.body;

            // Validate required fields
            const requiredFields = ['txnAmount', 'billNumber', 'storeLabel', 'terminalLabel'];
            const missingFields = requiredFields.filter(field => !req.body[field]);

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required fields: ${missingFields.join(', ')}`
                });
            }

            if (txnAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction amount must be greater than 0'
                });
            }

            // Generate memberDateTime (YYYYMMDDHHmmss)
            const memberDateTime = generateDateTime();

            // Auto-set callback URL from body or default fallback
            const callbackUrl = requestedCallbackUrl || `http://150.95.31.23:8921/api/v1/direct/callback`;

            logger.info(`Using callback URL for bankCode ${bankCode}: ${callbackUrl}`);

            // Fetch Bank Configuration from Database
            let config = {};
            try {
                const bankRecord = await db.bank.findOne({
                    where: {
                        code: bankCode.toUpperCase(),
                        isActive: true
                    }
                });
                if (bankRecord && bankRecord.config) {
                    config = typeof bankRecord.config === 'string'
                        ? JSON.parse(bankRecord.config)
                        : bankRecord.config;
                    logger.info(`Loaded secure configuration for bank: ${bankCode}`);
                } else {
                    logger.warn(`No active database config found for bank: ${bankCode}. Using request parameter defaults.`);
                }
            } catch (dbError) {
                logger.warn(`Failed to fetch bank configuration from database: ${dbError.message}. Falling back to request parameter defaults.`);
            }

            // Create QR Request record
            const qrRequest = await db.QRRequest.create({
                memberId: memberId || config.memberId || 'KOKKOKMOV',
                txnAmount,
                purposeOfTxn: purposeOfTxn || '',
                billNumber,
                merchantId: merchantId || config.merchantId || '',
                storeLabel,
                terminalLabel,
                memberDateTime,
                callbackUrl,
                requestStatus: 'PENDING'
            });

            logger.info(`QR Request record created: ${billNumber}`);

            // Call Bank API using selected Provider
            try {
                const provider = providerFactory.getProvider(bankCode);
                const bankResponse = await provider.generateQR(config, {
                    memberId,
                    txnAmount,
                    purposeOfTxn,
                    billNumber,
                    merchantId,
                    password,
                    storeLabel,
                    terminalLabel,
                    memberDateTime,
                    callbackUrl
                });

                // Save Bank Response
                const qrResponse = await db.QRResponse.create({
                    qrRequestId: qrRequest.id,
                    respCode: bankResponse.RESP_CODE,
                    reason: bankResponse.REASON,
                    qrId: bankResponse.qrInformation?.qrId || null,
                    qrString: bankResponse.qrInformation?.qrString || null,
                    txnAmount: bankResponse.qrInformation?.txnAmount || txnAmount,
                    txnCurrency: bankResponse.qrInformation?.txnCurrency || '418',
                    merchantId: bankResponse.qrInformation?.merchantId || merchantId,
                    billNumber: bankResponse.qrInformation?.billNumber || billNumber,
                    storeLabel: bankResponse.qrInformation?.storeLabel || storeLabel,
                    terminalLabel: bankResponse.qrInformation?.terminalLabel || terminalLabel,
                    receiverId: bankResponse.qrInformation?.receiverId || null,
                    rawResponse: bankResponse.rawResponse || bankResponse
                });

                // Update request status to SUCCESS
                qrRequest.requestStatus = 'SUCCESS';
                await qrRequest.save();

                logger.info(`QR generated successfully: ${billNumber} for bank ${bankCode}`);

                return res.status(201).json({
                    success: true,
                    message: 'QR code generated successfully',
                    data: {
                        requestId: qrRequest.id,
                        responseId: qrResponse.id,
                        billNumber: qrRequest.billNumber,
                        qrId: qrResponse.qrId,
                        qrString: qrResponse.qrString,
                        txnAmount: qrResponse.txnAmount,
                        status: qrRequest.requestStatus
                    }
                });

            } catch (bankError) {
                // Bank API call failed
                const responseData = bankError.response ? JSON.stringify(bankError.response.data) : '';
                logger.error(`Bank API error for ${billNumber} (${bankCode}): ${bankError.message} - Response: ${responseData}`);

                // Update request status to FAILED
                qrRequest.requestStatus = 'FAILED';
                await qrRequest.save();

                return res.status(500).json({
                    success: false,
                    message: `Failed to generate QR code from bank: ${bankCode}`,
                    error: bankError.message
                });
            }

        } catch (error) {
            logger.error('Error in generateQR:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Handle payment callback from bank
     * POST /api/qr/callback
     */
    async handleCallback(req, res) {
        try {
            const callbackData = req.body;
            logger.info('Received payment callback:', JSON.stringify(callbackData));

            // Determine Bank Code from callback payload structure
            let bankCode = 'IB';
            if (callbackData.Service_Id || callbackData.Trans_Id) {
                bankCode = 'LVB';
            }

            // Fetch Bank Config
            let config = {};
            try {
                const bankRecord = await db.bank.findOne({
                    where: {
                        code: bankCode,
                        isActive: true
                    }
                });
                if (bankRecord && bankRecord.config) {
                    config = typeof bankRecord.config === 'string'
                        ? JSON.parse(bankRecord.config)
                        : bankRecord.config;
                }
            } catch (err) {
                logger.warn(`Failed to retrieve bank config for callback: ${err.message}`);
            }

            // Verify signature/callback using provider
            const provider = providerFactory.getProvider(bankCode);
            const verified = await provider.verifyCallback(config, callbackData);

            // Find matching QR request
            let qrRequest = null;
            if (bankCode === 'LVB') {
                // LVB sends Trans_Id which is the billNumber itself
                qrRequest = await db.QRRequest.findOne({
                    where: {
                        billNumber: verified.billNumber,
                        requestStatus: 'SUCCESS'
                    }
                });
            } else {
                // Indochina Bank does not send billNumber, match by store, terminal and amount
                qrRequest = await db.QRRequest.findOne({
                    where: {
                        storeLabel: callbackData.storeLabel,
                        terminalLabel: callbackData.terminalLabel,
                        txnAmount: parseFloat(verified.txnAmount),
                        requestStatus: 'SUCCESS'
                    },
                    order: [['createdAt', 'DESC']]
                });
            }

            if (!qrRequest) {
                logger.error(`QR request not found for callback matching billNumber/details:`, verified);
                return res.status(404).json({
                    success: false,
                    message: 'QR request not found'
                });
            }

            // Save payment callback
            const paymentCallback = await db.PaymentCallback.create({
                instId: callbackData.instId || 'LVB',
                txnAmount: verified.txnAmount,
                txnRefId: verified.txnRefId,
                additionalInfo: callbackData.additionalInfo || '',
                paymentAccount: verified.paymentAccount,
                paymentAccountName: verified.paymentAccountName,
                callbackRegDate: callbackData.callbackRegDate ? new Date(callbackData.callbackRegDate) : new Date(),
                callBackConfirmDate: callbackData.callBackConfirmDate ? new Date(callbackData.callBackConfirmDate) : new Date(),
                txnStatus: verified.txnStatus,
                message: verified.message,
                storeLabel: callbackData.storeLabel || qrRequest.storeLabel,
                terminalLabel: callbackData.terminalLabel || qrRequest.terminalLabel,
                billNumber: qrRequest.billNumber,
                isPaymentSuccess: verified.success,
                rawCallbackData: callbackData
            });

            logger.info(`Payment callback saved: ${paymentCallback.txnRefId}, Success: ${verified.success}`);

            // Respond to bank
            return res.status(200).json({
                success: true,
                message: 'Callback received and processed',
                billNumber: qrRequest.billNumber
            });

        } catch (error) {
            logger.error('Error handling callback:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to process callback',
                error: error.message
            });
        }
    }

    /**
     * Check payment status by bill number
     * GET /api/qr/payment-status/:billNumber
     */
    async checkPaymentStatus(req, res) {
        try {
            const { billNumber } = req.params;

            // Get QR request with payment callbacks
            const qrRequest = await db.QRRequest.findOne({
                where: { billNumber },
                include: [
                    {
                        model: db.QRResponse,
                        as: 'response'
                    },
                    {
                        model: db.PaymentCallback,
                        as: 'callbacks',
                        order: [['createdAt', 'DESC']],
                        limit: 1
                    }
                ]
            });

            if (!qrRequest) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            // Check if payment has been made
            const latestCallback = qrRequest.callbacks && qrRequest.callbacks.length > 0
                ? qrRequest.callbacks[0]
                : null;

            const paymentStatus = {
                billNumber: qrRequest.billNumber,
                qrId: qrRequest.response?.qrId,
                amount: qrRequest.txnAmount,
                requestStatus: qrRequest.requestStatus,
                isPaid: latestCallback ? latestCallback.isPaymentSuccess : false,
                paymentDetails: latestCallback ? {
                    txnRefId: latestCallback.txnRefId,
                    paymentAccountName: latestCallback.paymentAccountName,
                    paymentAccount: latestCallback.paymentAccount,
                    paidAt: latestCallback.callBackConfirmDate,
                    message: latestCallback.message
                } : null
            };

            return res.status(200).json({
                success: true,
                data: paymentStatus
            });

        } catch (error) {
            logger.error('Error checking payment status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }

    /**
     * Get QR Request by Bill Number
     * GET /api/qr/request/:billNumber
     */
    async getQRRequest(req, res) {
        try {
            const { billNumber } = req.params;

            const qrRequest = await db.QRRequest.findOne({
                where: { billNumber },
                include: [{
                    model: db.QRResponse,
                    as: 'response'
                }]
            });

            if (!qrRequest) {
                return res.status(404).json({
                    success: false,
                    message: 'QR request not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: qrRequest
            });

        } catch (error) {
            logger.error('Error in getQRRequest:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get QR Response by QR ID
     * GET /api/qr/response/:qrId
     */
    async getQRResponse(req, res) {
        try {
            const { qrId } = req.params;

            const qrResponse = await db.QRResponse.findOne({
                where: { qrId },
                include: [{
                    model: db.QRRequest,
                    as: 'request'
                }]
            });

            if (!qrResponse) {
                return res.status(404).json({
                    success: false,
                    message: 'QR response not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: qrResponse
            });

        } catch (error) {
            logger.error('Error in getQRResponse:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get all QR Requests with filters
     * GET /api/qr/requests?status=PENDING&merchantId=xxx
     */
    async getAllQRRequests(req, res) {
        try {
            const { status, merchantId, storeLabel, startDate, endDate } = req.query;

            const where = {};
            if (status) where.requestStatus = status;
            if (merchantId) where.merchantId = merchantId;
            if (storeLabel) where.storeLabel = storeLabel;
            if (startDate && endDate) {
                where.createdAt = {
                    [db.Sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
                };
            }

            const qrRequests = await db.QRRequest.findAll({
                where,
                include: [{
                    model: db.QRResponse,
                    as: 'response'
                }],
                order: [['createdAt', 'DESC']],
                limit: 100
            });

            return res.status(200).json({
                success: true,
                count: qrRequests.length,
                data: qrRequests
            });

        } catch (error) {
            logger.error('Error in getAllQRRequests:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get QR Statistics
     * GET /api/qr/stats
     */
    async getQRStats(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const where = {};
            if (startDate && endDate) {
                where.createdAt = {
                    [db.Sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
                };
            }

            const [totalRequests, successfulRequests, failedRequests, pendingRequests] = await Promise.all([
                db.QRRequest.count({ where }),
                db.QRRequest.count({ where: { ...where, requestStatus: 'SUCCESS' } }),
                db.QRRequest.count({ where: { ...where, requestStatus: 'FAILED' } }),
                db.QRRequest.count({ where: { ...where, requestStatus: 'PENDING' } })
            ]);

            // Get total amount
            const requests = await db.QRRequest.findAll({
                where: { ...where, requestStatus: 'SUCCESS' },
                attributes: ['txnAmount']
            });

            const totalAmount = requests.reduce((sum, req) => sum + parseFloat(req.txnAmount), 0);

            return res.status(200).json({
                success: true,
                data: {
                    totalRequests,
                    successfulRequests,
                    failedRequests,
                    pendingRequests,
                    totalAmount: totalAmount.toFixed(2),
                    successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) : 0
                }
            });

        } catch (error) {
            logger.error('Error in getQRStats:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

}

/**
 * Helper: Generate memberDateTime in format YYYYMMDDHHmmss
 */
function generateDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

module.exports = new QRController();