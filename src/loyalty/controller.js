const loyaltyService = require('./service');
const logger = require('../api/logger');

/**
 * Generate loyalty summary report
 */
exports.getReport = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        if (!fromDate || !toDate) {
            return res.status(400).send({ message: "fromDate and toDate are required" });
        }

        const report = await loyaltyService.getSummaryReport(fromDate, toDate);
        res.send(report);
    } catch (error) {
        logger.error(`Error in loyalty controller report: ${error.message}`);
        res.status(500).send({
            message: error.message || "Some error occurred while generating the report."
        });
    }
};

/**
 * Get transactions by client (can be moved here from client controller if desired)
 */
exports.getTransactionsByClient = async (req, res) => {
    try {
        const clientId = req.params.id;
        const transactions = await loyaltyService.getTransactionsByClient(clientId);
        res.send(transactions);
    } catch (error) {
        res.status(500).send({
            message: "Error retrieving loyalty transactions for client id=" + req.params.id
        });
    }
};
