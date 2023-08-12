const logger = require("../../api/logger");
const productService = require('../../product/service')
const TransferLine = require("../../models").transferLine
const Card = require('../../models').card;
const transferHeaderService = require("../service")
const createBulkTransferLine = async (res, lines, lockingSessionId, srcLocationId, desLocationId) => {
    logger.info("==> Creating sale line bulk with locking id " + lockingSessionId)
    try {
        const linesCreated = await TransferLine.bulkCreate(lines)
        logger.info("===> Line created len: " + linesCreated.length)
        for (const iterator of linesCreated) {
            logger.info("===> Updating card transferLineId in card model")
            try {
                const cardUpdated = await Card.update({
                    transferLineId: iterator.id,
                    locationId: desLocationId,
                    isActive: true
                }, {
                    where: {
                        locking_session_id: lockingSessionId,
                        productId: iterator.productId
                    }
                })
                logger.info("Update card transferLineId successfully " + cardUpdated.id)
            } catch (error) {
                logger.error("Update card transferLineId fail " + error)
                await fullReversal(iterator['id'], srcLocationId)
                throw new Error("Card is not updated correctly and inventory amount will not be correctly")
            }


        }
        // Copy the original array to a new structure array
        const productIdList = linesCreated.map((item) => {
            return item.productId
        });
        await productService.updateProductCountGroup(productIdList)
        res.status(200).send("Transaction completed - " + lines[0].headerId)
    } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created before
        // ********************************************
        await transferHeaderService.transferHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
        return res.status(403).send("Server error " + error)
    }

}

const createBulkTransferLineWithoutRes = async (lines, lockingSessionId) => {
    logger.info("==> Creating sale line bulk with locking id " + lockingSessionId)
    try {
        const linesCreated = await TransferLine.bulkCreate(lines)
        logger.info("===> Line created len: " + linesCreated.length)
        for (const iterator of linesCreated) {
            logger.info("===> Updating card saleLineId in card model")
            try {
                const cardUpdated = await Card.update({
                    transferLineId: iterator.id
                }, {
                    where: {
                        locking_session_id: lockingSessionId,
                        productId: iterator.productId
                    }
                })
                logger.info("Update card saleLineId successfully " + cardUpdated.id)
            } catch (error) {
                logger.error("Update card saleLineId fail " + error)
                await fullReversal(linesCreated[0]['id'])
                throw new Error("Card is not updated correctly and inventory amount will not be correctly")
            }

        }
    } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created before
        // ********************************************
        await transferHeaderService.transferHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
        // return res.status(403).send("Server error " + error)
    }

}
const updateBulkTransferLine = async (lines, lockingSessionId) => {
    logger.info("==> Updating saleLine bulk with locking id " + lockingSessionId)
    try {
        for (const iterator of lines) {
            logger.info(`===> Updating card saleLineId ${iterator.id}`)
            try {
                // **************** Update saleLine entry **************** //
                await updateSaleLine(iterator)
            } catch (error) {
                throw new Error(`Cannot update saleLine ${error}`)
            }
            try {
                const cardUpdated = await Card.update({
                    transferLineId: iterator.id
                }, {
                    where: {
                        locking_session_id: lockingSessionId,
                        productId: iterator.productId
                    }
                })
                logger.info(`Update card saleLineId successfully ${cardUpdated}`)
            } catch (error) {
                logger.error("Update card saleLineId fail " + error)
                await fullReversal(linesCreated[0]['id'])
                throw new Error("Card is not updated correctly and inventory amount will not be correctly")
            }

        }
    } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created before
        // ********************************************
        await transferHeaderService.transferHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
    }

}
const updateTransferLine = async (line) => {
    try {
        const transferLine = await TransferLine.findByPk(line.id);
        if (!transferLine) {
            throw new Error(`SaleLineId ${line.id} is not found`)
        }
        await TransferLine.update(line);
        logger.info(`Updated saleLineId ${line.id} completed ${transferLine}`)
    } catch (error) {
        logger.error(`Cannot update saleLine id ${line.id} with error ${error}`);
        throw new Error(`Cannot update saleLine id ${line.id} with error ${error}`)
    }
};

const fullReversal = async (id, srcLocationId) => {
    // ********************************************
    //  Find all card  just created with saleLine id
    // ********************************************
    const allCardsInTransferLineId = await Card.findAll({
        where: {
            transferLineId: id
        }
    })
    // ********************************************
    //  Reverse all card  just created with saleLine id
    // ********************************************
    const updatedCard = await Card.update({
        transferLineId: null,
        locationId: srcLocationId,
        isActive: true,
    }, {
        where: {
            id: {
                [Op.in]: allCardsInTransferLineId.map(el => el.id)
            }
        }
    })
    logger.info(`Update card back 'REV' ${updatedCard.length} cards`)
    // ********************************************
    //  Reverse saleLine just created 
    // ********************************************
    await transferHeaderService.transferLineReversal(id)
}

module.exports = {
    createBulkTransferLine,
    updateBulkTransferLine,
    createBulkTransferLineWithoutRes,
    updateTransferLine,
}