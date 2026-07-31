const BasePaymentProvider = require('./BaseProvider');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
const logger = require('../../api/logger');

class LaoVietBankProvider extends BasePaymentProvider {
    // Generate date string in format YYYYMMDDHHmmss
    generateCreateDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    // Generate date string in format YYMMDD
    generateTranDate() {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
    }

    async generateQR(config, requestData) {
        const bankApiUrl = config.apiUrl || 'https://laovietbank.com.la:5678';
        const privateKey = config.privateKey || 'eaYKHfjmy9UZ4KqdEs2uIpXgsEKYqj';

        const lvbAgent = new https.Agent({
            rejectUnauthorized: false,
            lookup: (hostname, options, callback) => {
                dns.lookup(hostname, { family: 4 }, callback);
            }
        });

        // Call dynamic QR Init API
        const serviceId = config.serviceId || '055022';
        const merchantId = config.merchantId || '055022_1';
        const merchantName = config.merchantName || 'SATHAPHONE MINI MART';
        const trandate = this.generateTranDate();
        const transId = requestData.billNumber; // unique transId
        const transDesc = requestData.purposeOfTxn || 'Test Description';
        const amount = requestData.txnAmount.toString();
        const curr = 'LAK';
        const type = '809'; // QR Generator
        const callbackUrl = requestData.callbackUrl;

        // MD5 signature fields:
        // PRIVATE_KEY|Service_Id|Merchant_Id|Merchant_Name|Trandate|Trans_Id|Trans_Desc|Amount|Curr|Payer_Id|Payer_Name|Payer_Addr|Type|Custmer_Id|Customer_Name|IssueDate|Callback_URL
        const rawInitStr = `${privateKey}|${serviceId}|${merchantId}|${merchantName}|${trandate}|${transId}|${transDesc}|${amount}|${curr}||||${type}|||${trandate}|${callbackUrl}`;
        const initSecureCode = crypto.createHash('md5').update(rawInitStr).digest('hex');

        const payload = {
            Service_Id: serviceId,
            Merchant_Id: merchantId,
            Merchant_Name: merchantName,
            Trandate: trandate,
            Trans_Id: transId,
            Trans_Desc: transDesc,
            Amount: amount,
            Curr: curr,
            Payer_Id: '',
            Payer_Name: '',
            Payer_Addr: '',
            Type: type,
            Custmer_Id: '',
            Customer_Name: '',
            IssueDate: trandate,
            Callback_URL: callbackUrl,
            Secure_Code: initSecureCode
        };

        logger.info(`[LVB Provider] Sending QR Init Request Payload: ${JSON.stringify(payload)}`);

        const initResponse = await axios.post(`${bankApiUrl}/v1/api/init/`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            httpsAgent: lvbAgent
        });

        logger.info(`[LVB Provider] Received QR Init Response: ${JSON.stringify(initResponse.data)}`);

        if (initResponse.data.Response_Code !== '000') {
            throw new Error(`LVB QR Init failed: ${initResponse.data.Response_Code}`);
        }

        const rawData = initResponse.data;
        return {
            RESP_CODE: rawData.Response_Code,
            REASON: 'Success',
            qrInformation: {
                qrId: rawData.Trans_Id,
                qrString: rawData.Redirect_Url, // LVB Redirect_Url contains the raw EMV string
                txnAmount: parseFloat(amount),
                txnCurrency: curr,
                merchantId: rawData.Merchant_Id,
                billNumber: rawData.Trans_Id,
                storeLabel: merchantName,
                terminalLabel: 'POS'
            },
            rawResponse: rawData
        };
    }

    async verifyCallback(config, callbackData) {
        // Log callbackData explicitly as a string so Winston simple format doesn't omit it
        logger.info(`[LVB Provider] Received callback payload: ${JSON.stringify(callbackData)}`);

        const privateKey = config.privateKey || 'eaYKHfjmy9UZ4KqdEs2uIpXgsEKYqj';

        // Support case-insensitive lookup for callback properties
        const getCaseInsensitive = (obj, targetKey) => {
            if (obj[targetKey] !== undefined) return obj[targetKey];
            const lowerTarget = targetKey.toLowerCase();
            for (const key of Object.keys(obj)) {
                if (key.toLowerCase() === lowerTarget) {
                    return obj[key];
                }
            }
            return '';
        };

        const serviceId = getCaseInsensitive(callbackData, 'Service_Id') || getCaseInsensitive(callbackData, 'serviceId');
        const merchantId = getCaseInsensitive(callbackData, 'Merchant_Id') || getCaseInsensitive(callbackData, 'merchantId');
        
        // LVB callback might send Trandate or InitTrandate
        const trandate = getCaseInsensitive(callbackData, 'InitTrandate') || 
                         getCaseInsensitive(callbackData, 'Trandate') || 
                         getCaseInsensitive(callbackData, 'init_trandate') || 
                         getCaseInsensitive(callbackData, 'trandate');

        const transId = getCaseInsensitive(callbackData, 'Trans_Id') || getCaseInsensitive(callbackData, 'transId');
        
        // Map responseCode from Response_Code, responseCode, or transaction_status
        const responseCode = getCaseInsensitive(callbackData, 'Response_Code') || 
                             getCaseInsensitive(callbackData, 'responseCode') ||
                             getCaseInsensitive(callbackData, 'transaction_status');

        const responseTxnCode = getCaseInsensitive(callbackData, 'Response_TxnCode') || getCaseInsensitive(callbackData, 'responseTxnCode');
        const list = getCaseInsensitive(callbackData, 'List') || getCaseInsensitive(callbackData, 'list');
        const redirectUrl = getCaseInsensitive(callbackData, 'Redirect_Url') || getCaseInsensitive(callbackData, 'redirectUrl');

        const rawStr = `${privateKey}|${serviceId}|${merchantId}|${trandate}|${transId}|${responseCode}|${responseTxnCode}|${list}|${redirectUrl}`;
        const calculatedSecureCode = crypto.createHash('md5').update(rawStr).digest('hex');

        const receivedSecureCode = getCaseInsensitive(callbackData, 'Secure_Code') || 
                                   getCaseInsensitive(callbackData, 'SecureCode') || 
                                   getCaseInsensitive(callbackData, 'secure_code') || 
                                   getCaseInsensitive(callbackData, 'secureCode') || 
                                   getCaseInsensitive(callbackData, 'signature');

        // Only enforce signature verification if a signature or secure code is present in the request
        if (receivedSecureCode) {
            if (calculatedSecureCode !== receivedSecureCode) {
                logger.error(`[LVB Provider] Callback signature mismatch. Received Secure_Code: "${receivedSecureCode}", Calculated: "${calculatedSecureCode}", Raw String: "${rawStr}"`);
                throw new Error('Callback signature verification failed');
            }
        } else {
            logger.warn('[LVB Provider] No Secure_Code or signature found in callback data. Skipping signature verification.');
        }

        const amountVal = getCaseInsensitive(callbackData, 'Amount') || getCaseInsensitive(callbackData, 'amount');
        const payerName = getCaseInsensitive(callbackData, 'customer_name') || getCaseInsensitive(callbackData, 'Customer_Name') || 'LVB Payer';
        const payerAccount = getCaseInsensitive(callbackData, 'customer_account') || getCaseInsensitive(callbackData, 'Custmer_Id') || getCaseInsensitive(callbackData, 'customerAccount') || '';

        return {
            success: responseCode === '000',
            billNumber: transId,
            txnAmount: amountVal ? parseFloat(amountVal) : 0,
            txnRefId: transId,
            paymentAccountName: payerName,
            paymentAccount: payerAccount,
            txnStatus: responseCode,
            message: responseCode === '000' ? 'Success' : `Failed (${responseCode})`
        };
    }
}

module.exports = LaoVietBankProvider;
