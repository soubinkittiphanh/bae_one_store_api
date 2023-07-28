const logger = require("../../api/logger");

const QuotationLine = require("../../models").quotationLine
const quotationHeaderService = require("../service")
const createBulkQuotationLine = async (res, lines) => {
    logger.info("==> Creating Quotation line bulk ")
    try {
        const linesCreated = await QuotationLine.bulkCreate(lines)
        logger.info("===> Line created len: " + linesCreated.length)
        res.status(200).send("Transaction completed - " + lines[0].headerId)
    } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created before
        // ********************************************
        await quotationHeaderService.quotationHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
        return res.status(403).send("Server error " + error)
    }

}

const createBulkQuotationLineWithoutRes = async (lines) => {
    logger.info("==> Creating sale line bulk with locking id ")
    try {
        const linesCreated = await QuotationLine.bulkCreate(lines)
        logger.info("===> Line created len: " + linesCreated.length)
    } catch (error) {
        logger.error('Error inserting quotation entry:', error)
        // return res.status(403).send("Server error " + error)
    }

}
const updateQuotationLine = async (line) => {
    try {
        const { quantity, unitRate, price, discount, total, isActive,productId } = line;

        const quotationLine = await QuotationLine.findByPk(line.id);

        if (!quotationLine) {
            throw new Error(`QuotationLineId ${line.id} is not found`)
        }

        await quotationLine.update(line);
        logger.info(`Updated QuotationLineId ${line.id} completed ${quotationLine}`)
    } catch (error) {
        logger.error(`Cannot update QuotationLine id ${line.id} with error ${error}`);
        throw new Error(`Cannot update QuotationLine id ${line.id} with error ${error}`)
    }
};

module.exports = {
    createBulkQuotationLine,
    createBulkQuotationLineWithoutRes,
    updateQuotationLine,
}