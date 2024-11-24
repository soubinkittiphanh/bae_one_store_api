const logger = require('../api/logger');
const GL = require('../models').gl
  
const createMultiEntry = async (entries) => {

    try {
        const createdEntries = await GL.bulkCreate(entries);
        logger.info(`Create multi GL completed`)
        return createdEntries;
    } catch (error) {
        logger.error(`Cannot create GL multi error ${error}`)
        return null
    }
    
}

module.exports = {
    createMultiEntry,
}