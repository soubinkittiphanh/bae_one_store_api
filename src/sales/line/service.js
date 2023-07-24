const logger = require("../../api/logger");

const SaleLine = require("../../models").saleLine
const Card = require('../../models').card;
const saleHeaderService = require("../service")
const createBulkSaleLine = async (res, lines, lockingSessionId) => {
    logger.info("==> Creating sale line bulk with locking id "+lockingSessionId)
    try {
        const linesCreated = await SaleLine.bulkCreate(lines)
        logger.info("===> Line created len: "+linesCreated.length)
        for (const iterator of linesCreated) {
            logger.info("===> Updating card saleLineId in card model")
            try {
                const cardUpdated = await Card.update({
                    saleLineId: iterator.id
                }, {
                    where: {
                        locking_session_id: lockingSessionId,
                        productId: iterator.productId
                    }
                })
                logger.info("Update card saleLineId successfully "+cardUpdated.id)
                res.status(200).send("Transaction completed - "+lines[0].headerId)
            } catch (error) {
                logger.error("Update card saleLineId fail "+error)
                await fullReversal(linesCreated[0]['id'])
                throw new Error("Card is not updated correctly and inventory amount will not be correctly")
            }
   
        }
    } catch (error) {
        // ********************************************
        //  Reverse SaleHeader just created before
        // ********************************************
        await saleHeaderService.saleHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
        return res.status(403).send("Server error " + error)
    }
    
}

const fullReversal = async (saleLineId) =>{
    // ********************************************
    //  Find all card  just created with saleLine id
    // ********************************************
    const allCardsInSaleLineId = await Card.findAll({
        where:{
            saleLineId: saleLineId
        }
    })
    // ********************************************
    //  Reverse all card  just created with saleLine id
    // ********************************************
    for (const iterator of allCardsInSaleLineId) {
        await saleHeaderService.cardReversal(iterator['productId'],saleLineId)
    }
    // ********************************************
    //  Reverse saleLine just created 
    // ********************************************
    await saleHeaderService.saleLineReversal(saleLineId)
}

module.exports = {
    createBulkSaleLine
}