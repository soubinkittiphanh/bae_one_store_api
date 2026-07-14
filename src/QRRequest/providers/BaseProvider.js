/**
 * Base payment provider detailing standard interface
 */
class BasePaymentProvider {
    /**
     * Generate dynamic QR string from bank
     * @param {Object} config - Bank configurations from DB
     * @param {Object} requestData - Transaction payload details
     * @returns {Promise<Object>} Bank response
     */
    async generateQR(config, requestData) {
        throw new Error("generateQR not implemented");
    }

    /**
     * Verify payment confirmation callback from bank
     * @param {Object} config - Bank configurations from DB
     * @param {Object} callbackData - Callback payload from bank
     * @returns {Promise<Object>} Normalized callback results
     */
    async verifyCallback(config, callbackData) {
        throw new Error("verifyCallback not implemented");
    }
}

module.exports = BasePaymentProvider;
