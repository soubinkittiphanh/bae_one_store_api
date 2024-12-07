
const logger = require('../api/logger');
const SPF = require('../models').spf;

// Get an SPF record by ID
const service = {
    getSPFByCode: async (code) => {
        try {
            const spfRecord = await SPF.findOne({ where: { code } });
            if (!spfRecord) {
                return { message: 'SPF not found' };
            }
            return spfRecord;
        } catch (error) {
            logger.error('Error fetching SPF by ID:', error);
            return { message: 'Failed to fetch SPF by ID', error };
        }
    },
}
module.exports = service