const logger = require("../../api/logger");

const SaleLine = require("../../models").saleLine


const createBulkSaleLine = async (res, line) => {
    SaleLine.bulkCreate(line)
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed -"+line[0].headerId)
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}

module.exports = {
    createBulkSaleLine
}