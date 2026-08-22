const BasePaymentProvider = require('./BaseProvider');
const axios = require('axios');
const logger = require('../../api/logger');

class BcelProvider extends BasePaymentProvider {
    constructor() {
        super();
        this.tokenCache = {
            token: null,
            expiry: null,
            mcid: null
        };
    }

    /**
     * Retrieve a valid JWT bearer token from BCEL pos/authen or authen API.
     * Implements in-memory caching to avoid rate limit (5 req / 60 s).
     */
    async getAccessToken(config, requestData = {}) {
        const now = new Date();
        
        // If token exists and is valid (with 5-minute buffer)
        if (this.tokenCache.token && this.tokenCache.expiry && (this.tokenCache.expiry - now > 5 * 60 * 1000)) {
            return this.tokenCache.token;
        }

        const authUrl = config.apiUrl || 'https://bcel.la:8093/onepayservice';
        
        // requestData parameters from SPF UI take precedence and should not be mixed with default database configurations
        const isRequestOverride = !!requestData.memberId;
        const clientId = isRequestOverride ? requestData.memberId : (config.clientId || config.memberId);
        const clientSecret = isRequestOverride ? requestData.password : (config.clientSecret || config.password);
        const mcid = isRequestOverride ? requestData.merchantId : config.merchantId;

        if (!clientId || !clientSecret) {
            throw new Error('BCEL Provider: Missing configuration credentials (username/clientId and password/clientSecret)');
        }

        // Remove trailing slashes from API URL
        const cleanAuthUrl = authUrl.replace(/\/+$/, '');

        let authResponse;
        if (clientId && clientSecret && mcid && mcid.trim() !== '') {
            logger.info(`[BCEL Provider] Authenticating POS terminal for mcid: ${mcid} using /pos/authen...`);
            authResponse = await axios.post(`${cleanAuthUrl}/pos/authen`, {
                id: clientId,
                secret: clientSecret,
                mcid: mcid
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
        } else {
            logger.info(`[BCEL Provider] Authenticating merchant user: ${clientId} using /authen...`);
            authResponse = await axios.post(`${cleanAuthUrl}/authen`, {
                username: clientId,
                password: clientSecret
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
        }

        if (!authResponse.data || !authResponse.data.jwt) {
            throw new Error(`BCEL Authentication failed: ${authResponse.data?.message || 'No JWT token received'}`);
        }

        this.tokenCache.token = authResponse.data.jwt;
        // Parse expiry from response (e.g., "2025-06-22T12:00:00Z")
        this.tokenCache.expiry = authResponse.data.expire ? new Date(authResponse.data.expire) : new Date(now.getTime() + 24 * 60 * 60 * 1000); // fallback to 24h
        this.tokenCache.mcid = authResponse.data.user?.MCID || mcid || '';
        
        logger.info(`[BCEL Provider] Authentication successful. Token expires at: ${this.tokenCache.expiry}, MCID: ${this.tokenCache.mcid}`);
        return this.tokenCache.token;
    }

    /**
     * Generate dynamic QR string from BCEL
     */
    async generateQR(config, requestData) {
        const token = await this.getAccessToken(config, requestData);
        const apiUrl = config.apiUrl || 'https://bcel.la:8093/onepayservice';
        const amount = requestData.txnAmount.toString();
        const uuid = requestData.billNumber;
        const invoiceid = requestData.billNumber;
        const desc = requestData.purposeOfTxn || `POS Order ${requestData.storeLabel || ''}`;
        const terminalid = config.terminalId || requestData.terminalLabel || 'ONEPAYPOS';
        
        const payload = {
            amount,
            uuid,
            invoiceid,
            desc,
            expire: 10, // default 10 minutes
            terminalid
        };

        const cleanApiUrl = apiUrl.replace(/\/+$/, '');
        logger.info(`[BCEL Provider] Generating dynamic QR. Payload: ${JSON.stringify(payload)}`);
        
        const qrResponse = await axios.post(`${cleanApiUrl}/genonepayqr`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            timeout: 15000
        });

        logger.info(`[BCEL Provider] Received generate QR response: ${JSON.stringify(qrResponse.data)}`);

        if (qrResponse.data.result !== 0) {
            throw new Error(`BCEL QR generation failed: ${qrResponse.data.message}`);
        }

        const rawData = qrResponse.data;
        return {
            RESP_CODE: rawData.result.toString(),
            REASON: rawData.message,
            qrInformation: {
                qrId: uuid,
                qrString: rawData.data.qrc,
                txnAmount: parseFloat(amount),
                txnCurrency: 'LAK',
                merchantId: this.tokenCache.mcid || config.merchantId || requestData.merchantId || '',
                billNumber: uuid,
                storeLabel: requestData.storeLabel,
                terminalLabel: requestData.terminalLabel
            },
            rawResponse: {
                ...rawData,
                bankCode: 'BCEL' // Flag this response as generated by BCEL for checking status later
            }
        };
    }

    /**
     * Query payment status directly from BCEL
     */
    async checkPaymentStatus(config, billNumber) {
        const token = await this.getAccessToken(config);
        const apiUrl = config.apiUrl || 'https://bcel.la:8093/onepayservice';

        const cleanApiUrl = apiUrl.replace(/\/+$/, '');
        logger.info(`[BCEL Provider] Checking status for billNumber: ${billNumber}`);
        
        const statusResponse = await axios.post(`${cleanApiUrl}/checkonepayqr`, {
            uuid: billNumber
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            timeout: 10000
        });

        logger.info(`[BCEL Provider] Received status check response: ${JSON.stringify(statusResponse.data)}`);

        const rawData = statusResponse.data;
        
        // result = 0 means success (paid)
        // result = 2 means pending
        const isPaid = rawData.result === 0;
        const isPending = rawData.result === 2;

        return {
            success: isPaid,
            pending: isPending,
            billNumber: billNumber,
            txnAmount: isPaid && rawData.data ? parseFloat(rawData.data.AMOUNT) : 0,
            txnRefId: isPaid && rawData.data ? rawData.data.TICKET : null,
            paymentAccountName: isPaid && rawData.data ? rawData.data.NAME : null,
            paymentAccount: isPaid && rawData.data ? rawData.data.PHONE : null,
            rawResponse: rawData
        };
    }

    /**
     * Stub callback verifier since BCEL doesn't send push webhooks.
     */
    async verifyCallback(config, callbackData) {
        logger.warn('[BCEL Provider] verifyCallback invoked, but BCEL does not support callback webhooks.');
        return {
            success: false,
            message: 'Callbacks not supported by BCEL provider'
        };
    }
}

module.exports = BcelProvider;
