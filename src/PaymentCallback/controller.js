const logger = require('../api/logger');
const db = require('../models');
const axios = require('axios');


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
                memberId,
                txnAmount,
                purposeOfTxn,
                billNumber,
                merchantId,
                storeLabel,
                terminalLabel,
                callbackUrl
            } = req.body;

            // Validate required fields
            if (!memberId || !txnAmount || !billNumber || !merchantId || !storeLabel || !terminalLabel || !callbackUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Generate memberDateTime (YYYYMMDDHHmmss)
            const memberDateTime = generateDateTime();

            // Create QR Request record
            const qrRequest = await db.QRRequest.create({
                memberId,
                txnAmount,
                purposeOfTxn: purposeOfTxn || '',
                billNumber,
                merchantId,
                storeLabel,
                terminalLabel,
                memberDateTime,
                callbackUrl,
                requestStatus: 'PENDING'
            });

            logger.info(`QR Request created: ${billNumber}`);

            // Call Bank API to generate QR
            try {
                const bankResponse = await callBankAPI({
                    memberId,
                    txnAmount: txnAmount.toString(),
                    purposeOfTxn: purposeOfTxn || '',
                    billNumber,
                    merchantId,
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
                    rawResponse: bankResponse
                });

                // Update request status to SUCCESS
                qrRequest.requestStatus = 'SUCCESS';
                await qrRequest.save();

                logger.info(`QR generated successfully: ${billNumber}`);

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
                logger.error(`Bank API error for ${billNumber}:`, bankError.message);

                // Update request status to FAILED
                qrRequest.requestStatus = 'FAILED';
                await qrRequest.save();

                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate QR code from bank',
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
 * Helper: Call Bank API to generate QR
 */
async function callBankAPI(requestData) {
    try {
        // Bank API credentials (hardcoded for testing)
        const bankApiUrl = 'https://ibapigwuat.iblaos.com/IBInterBankServices';
        const bankMemberId = 'KOKKOKMOV';
        const bankPassword = '2RBKKUO6PHZ3XYOUSIGFH5W8Y5T71X362EWJ0DFYBYKNANABW4';

        logger.info('Attempting to login to bank API...');

        // Step 1: Login to get token
        const loginResponse = await axios.post(`${bankApiUrl}/member/login`, {
            memberId: bankMemberId,
            memberPassword: bankPassword
        });

        if (loginResponse.data.RESP_CODE !== 'IBN0000') {
            throw new Error(`Bank login failed: ${loginResponse.data.REASON}`);
        }

        const loginToken = loginResponse.data.loginToken;
        logger.info('Bank login successful, token obtained');

        // Step 2: Generate QR code
        const qrResponse = await axios.post(
            `${bankApiUrl}/member/bill/qr/generate`,
            requestData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loginToken}`
                }
            }
        );

        if (qrResponse.data.RESP_CODE !== 'IBN0000') {
            throw new Error(`QR generation failed: ${qrResponse.data.REASON}`);
        }

        return qrResponse.data;

    } catch (error) {
        logger.error('Bank API call error:', error.message);
        throw error;
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