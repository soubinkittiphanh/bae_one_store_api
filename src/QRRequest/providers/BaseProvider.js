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

    /**
     * Query payment status directly from bank (polling status checks)
     * @param {Object} config - Bank configurations from DB
     * @param {string} billNumber - The unique transaction bill number / uuid
     * @returns {Promise<Object>} Normalized status query results
     */
    async checkPaymentStatus(config, billNumber) {
        throw new Error("checkPaymentStatus not implemented");
    }
}

module.exports = BasePaymentProvider;
