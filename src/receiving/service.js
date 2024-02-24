const logger = require("../api/logger");

const assignLineHeaderId = (headerId,currencyId, lines) => {
    for (const iterator of lines) {
        iterator.headerId = headerId
        iterator.receivingHeaderId = headerId
        iterator.currencyId = currencyId
    }
    logger.warn(`line tostring ${JSON.stringify(lines)}`)
    return lines;
}

module.exports = {
    assignLineHeaderId,
}