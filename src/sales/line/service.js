const logger = require("../../api/logger");

const SaleLine = require("../model").saleLine


const createBulkSaleLine = async (res, line) => {
    Card.bulkCreate(line)
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed")
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}

module.exports = {
    createBulkSaleLine
}