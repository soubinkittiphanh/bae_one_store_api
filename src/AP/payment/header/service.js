const logger = require('../../../api/logger');
const APHeader = require('../../../models').apPaymentHeader;


const checkDupplicate = async (receiveId) => {
    try {
        const dbAPHeader = await APHeader.findAll({
            where: {
                receivingId: receiveId
            }
        })
        return dbAPHeader;

    } catch (error) {
        logger.error(`Something went wrong finding AP Header from receivingId ${error}`)
    }
}

module.exports = {
    checkDupplicate,
}