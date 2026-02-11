const logger = require("../../api/logger");
const productService = require('../../product/service')
const SaleLine = require("../../models").saleLine
const Card = require('../../models').card;
const saleHeaderService = require("../service")
const createBulkSaleLine = async (res, lines, lockingSessionId) => {
  try {
    const linesCreated = await SaleLine.bulkCreate(lines);
    
    for (const iterator of linesCreated) {
      await Card.update({
        saleLineId: iterator.id,
        card_isused: 1,
        locking_session_id: '' 
      }, {
        where: {
          locking_session_id: lockingSessionId,
          productId: iterator.productId
        }
      });
    }

    const productIdList = linesCreated.map(item => item.productId);
    await productService.updateProductCountGroup(productIdList);

    if (res && !res.headersSent) res.status(200).send("Transaction completed");
    return linesCreated;
  } catch (error) {
    logger.error('Error in createBulkSaleLine: ' + error);
    const headerId = (lines && lines.length > 0) ? lines[0].headerId : null;
    if (headerId) await saleHeaderService.saleHeaderReversal(headerId);
    throw error;
  }
};

const createBulkSaleLineWithoutRes = async (lines, lockingSessionId) => {
    logger.info("==> Creating sale line bulk with locking id " + lockingSessionId)
    try {
        const linesCreated = await SaleLine.bulkCreate(lines)
        logger.info("===> Line created len: " + linesCreated.length)
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
        await saleHeaderService.saleHeaderReversal(lines[0]['headerId'])
        logger.error('Error inserting rows:', error)
        // return res.status(403).send("Server error " + error)
    }

}

const updateBulkSaleLine = async (lines, lockingSessionId, locationId) => {
  for (const incomingLine of lines) {
    // 1. Find the DB record
    const dbLine = await SaleLine.findByPk(incomingLine.id);
    if (!dbLine) continue;

    // 2. Save metadata (qty, price)
    await dbLine.update(incomingLine);

    // 3. Link the cards we reserved in assignHeaderId
    await Card.update({
      saleLineId: incomingLine.id,
      card_isused: 1,
      locking_session_id: '' // Use '' to satisfy NotNull
    }, {
      where: {
        locking_session_id: lockingSessionId,
        productId: incomingLine.productId,
        locationId: locationId,
        saleLineId: null // Link only the new ones
      }
    });
  }
};
const updateSaleLine = async (line) => {
    try {
        const saleLine = await SaleLine.findByPk(line.id);
        if (!saleLine) {
            throw new Error(`SaleLineId ${line.id} is not found`)
        }
        await saleLine.update(line);
        logger.info(`Updated saleLineId ${line.id} completed ${saleLine}`)
    } catch (error) {
        logger.error(`Cannot update saleLine id ${line.id} with error ${error}`);
        throw new Error(`Cannot update saleLine id ${line.id} with error ${error}`)
    }
};

const fullReversal = async (saleLineId) => {
    // ********************************************
    //  Find all card  just created with saleLine id
    // ********************************************
    const allCardsInSaleLineId = await Card.findAll({
        where: {
            saleLineId: saleLineId
        }
    })
    // ********************************************
    //  Reverse all card  just created with saleLine id
    // ********************************************
    for (const iterator of allCardsInSaleLineId) {
        await saleHeaderService.cardReversal(iterator['productId'], saleLineId)
    }
    // ********************************************
    //  Reverse saleLine just created 
    // ********************************************
    await saleHeaderService.saleLineReversal(saleLineId)
}

module.exports = {
    createBulkSaleLine,
    updateBulkSaleLine,
    createBulkSaleLineWithoutRes,
    updateSaleLine,
}