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
        const username = config.username || '055022_1';
        const password = config.password || 'ZIvsHAQyRJ2RfvcE';

        logger.info(`[LVB Provider] Logging in to LVB API as ${username}...`);

        // Step 1: Login to get Bearer token
        const createDate = this.generateCreateDate();
        const rawLoginStr = `${privateKey}|${username}|${password}|${createDate}`;
        const loginSecureCode = crypto.createHash('md5').update(rawLoginStr).digest('hex');

        const lvbAgent = new https.Agent({
            rejectUnauthorized: false,
            lookup: (hostname, options, callback) => {
                dns.lookup(hostname, { family: 4 }, callback);
            }
        });

        const loginResponse = await axios.post(`${bankApiUrl}/v1/api/login`, {
            username,
            password,
            create_date: createDate,
            secure_code: loginSecureCode
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            httpsAgent: lvbAgent
        });

        if (loginResponse.data.Response_Code !== '000') {
            throw new Error(`LVB login failed: ${loginResponse.data.Response_Code}`);
        }

        const token = loginResponse.data.token;
        logger.info('[LVB Provider] Login successful, token obtained');

        // Step 2: Call dynamic QR Init API
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

        const initResponse = await axios.post(`${bankApiUrl}/v1/api/init/`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            httpsAgent: lvbAgent
        });

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
        const responseCode = getCaseInsensitive(callbackData, 'Response_Code') || getCaseInsensitive(callbackData, 'responseCode');
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

        if (calculatedSecureCode !== receivedSecureCode) {
            logger.error(`[LVB Provider] Callback signature mismatch. Received Secure_Code: "${receivedSecureCode}", Calculated: "${calculatedSecureCode}", Raw String: "${rawStr}"`);
            throw new Error('Callback signature verification failed');
        }

        return {
            success: responseCode === '000',
            billNumber: transId,
            txnAmount: callbackData.Amount ? parseFloat(callbackData.Amount) : 0,
            txnRefId: transId,
            paymentAccountName: callbackData.Customer_Name || 'LVB Payer',
            paymentAccount: callbackData.Custmer_Id || '',
            txnStatus: responseCode,
            message: responseCode === '000' ? 'Success' : `Failed (${responseCode})`
        };
    }
}

module.exports = LaoVietBankProvider;
