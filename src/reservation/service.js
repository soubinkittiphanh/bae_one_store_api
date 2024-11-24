const logger = require("../api/logger")

const assignLineHeaderId = (headerId, lines) => {
    for (const iterator of lines) {
        iterator.reservationId = headerId
        iterator.reservationHeaderId = headerId
    }
    logger.warn(`Lines with header ${JSON.stringify(lines)}`)
    return lines;
}

module.exports = {
    assignLineHeaderId
}