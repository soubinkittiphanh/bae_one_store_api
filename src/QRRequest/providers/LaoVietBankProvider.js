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
                'Authorization': `Bearer ${token}`
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
        // Callback verification logic for LVB
        // Check signature:
        // PRIVATE_KEY|Service_Id|Merchant_Id|InitTrandate|Trans_Id|Response_Code|Response_TxnCode|List|Redirect_Url
        const privateKey = config.privateKey || 'eaYKHfjmy9UZ4KqdEs2uIpXgsEKYqj';
        const serviceId = callbackData.Service_Id || '';
        const merchantId = callbackData.Merchant_Id || '';
        const trandate = callbackData.Trandate || '';
        const transId = callbackData.Trans_Id || '';
        const responseCode = callbackData.Response_Code || '';
        const responseTxnCode = callbackData.Response_TxnCode || '';
        const list = callbackData.List || '';
        const redirectUrl = callbackData.Redirect_Url || '';

        const rawStr = `${privateKey}|${serviceId}|${merchantId}|${trandate}|${transId}|${responseCode}|${responseTxnCode}|${list}|${redirectUrl}`;
        const calculatedSecureCode = crypto.createHash('md5').update(rawStr).digest('hex');

        if (calculatedSecureCode !== callbackData.Secure_Code) {
            logger.error('[LVB Provider] Callback signature mismatch:', {
                received: callbackData.Secure_Code,
                calculated: calculatedSecureCode
            });
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
