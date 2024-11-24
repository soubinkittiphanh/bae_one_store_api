const logger = require("../api/logger");

const assignLineHeaderId = (headerId, lines) => {
    for (const iterator of lines) {
        iterator.headerId = headerId
        iterator.receivingHeaderId = headerId
    }
    logger.warn(`line tostring ${JSON.stringify(lines)}`)
    return lines;
}

module.exports = {
    assignLineHeaderId,
}