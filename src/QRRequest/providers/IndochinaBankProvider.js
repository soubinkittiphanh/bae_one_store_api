const BasePaymentProvider = require('./BaseProvider');
const axios = require('axios');
const logger = require('../../api/logger');

class IndochinaBankProvider extends BasePaymentProvider {
    async generateQR(config, requestData) {
        const bankApiUrl = config.apiUrl || 'https://ibapigwuat.iblaos.com/IBInterBankServices';
        const bankMemberId = config.memberId || requestData.memberId || 'KOKKOKMOV';
        const bankPassword = config.password || requestData.password || '2RBKKUO6PHZ3XYOUSIGFH5W8Y5T71X362EWJ0DFYBYKNANABW4';

        logger.info(`[IB Provider] Attempting login to bank API as ${bankMemberId}...`);

        // Step 1: Login to get token
        const loginResponse = await axios.post(`${bankApiUrl}/member/login`, {
            memberId: bankMemberId,
            memberPassword: bankPassword
        });

        if (loginResponse.data.RESP_CODE !== 'IBN0000') {
            throw new Error(`Bank login failed: ${loginResponse.data.REASON}`);
        }

        const loginToken = loginResponse.data.loginToken;
        logger.info('[IB Provider] Login successful, token obtained');

        // Prepare request parameters matching bank's expectations
        const bankPayload = {
            memberId: bankMemberId,
            txnAmount: requestData.txnAmount.toString(),
            purposeOfTxn: requestData.purposeOfTxn || '',
            billNumber: requestData.billNumber,
            merchantId: config.merchantId || requestData.merchantId,
            storeLabel: requestData.storeLabel,
            terminalLabel: requestData.terminalLabel,
            memberDateTime: requestData.memberDateTime,
            callbackUrl: requestData.callbackUrl
        };

        // Step 2: Generate QR code
        const qrResponse = await axios.post(
            `${bankApiUrl}/member/bill/qr/generate`,
            bankPayload,
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

        const rawData = qrResponse.data;
        return {
            RESP_CODE: rawData.RESP_CODE,
            REASON: rawData.REASON,
            qrInformation: {
                qrId: rawData.qrInformation?.qrId,
                qrString: rawData.qrInformation?.qrString,
                txnAmount: rawData.qrInformation?.txnAmount,
                txnCurrency: rawData.qrInformation?.txnCurrency || '418',
                merchantId: rawData.qrInformation?.merchantId,
                billNumber: rawData.qrInformation?.billNumber,
                storeLabel: rawData.qrInformation?.storeLabel,
                terminalLabel: rawData.qrInformation?.terminalLabel,
                receiverId: rawData.qrInformation?.receiverId
            },
            rawResponse: rawData
        };
    }

    async verifyCallback(config, callbackData) {
        return {
            success: callbackData.txnStatus === '1',
            billNumber: callbackData.billNumber || null,
            txnAmount: parseFloat(callbackData.txnAmount),
            txnRefId: callbackData.txnRefId,
            paymentAccountName: callbackData.paymentAccountName,
            paymentAccount: callbackData.paymentAccount,
            txnStatus: callbackData.txnStatus,
            message: callbackData.message
        };
    }
}

module.exports = IndochinaBankProvider;
