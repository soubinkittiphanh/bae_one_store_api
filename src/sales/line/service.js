const logger = require("../../api/logger");
const productService = require('../../product/service');
const SaleLine = require("../../models").saleLine;
const Card = require('../../models').card;
const saleHeaderService = require("../service");
const spfService = require('../../spf/service');
const { Op } = require('sequelize');

const createBulkSaleLine = async (res, lines, lockingSessionId) => {
  try {
    const linesCreated = await SaleLine.bulkCreate(lines);
    
    // Fetch STOCK.VAR parameter from SPF
    const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
    const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';

    for (const iterator of linesCreated) {
      const whereCondition = {
        locking_session_id: lockingSessionId,
        productId: iterator.productId,
        saleLineId: null
      };

      if (checkVariant) {
        if (iterator.colorId !== undefined && iterator.colorId !== null) {
          whereCondition.colorId = iterator.colorId;
        }
        if (iterator.sizeId !== undefined && iterator.sizeId !== null) {
          whereCondition.sizeId = iterator.sizeId;
        }
      }

      // Fetch specific reserved cards to update one-by-one/scoped
      const reservedCards = await Card.findAll({
        where: whereCondition,
        limit: Math.max(1, Math.round((iterator.unitRate || 1) * iterator.quantity))
      });

      const cardIds = reservedCards.map(c => c.id);

      if (cardIds.length > 0) {
        await Card.update({
          saleLineId: iterator.id,
          card_isused: 1,
          locking_session_id: '' 
        }, {
          where: {
            id: { [Op.in]: cardIds }
          }
        });
        logger.info(`Linked ${cardIds.length} cards to saleLine ${iterator.id}`);
      } else {
        logger.warn(`No matching cards found for saleLine ${iterator.id} with where condition: ${JSON.stringify(whereCondition)}`);
      }
    }

    const productIdList = linesCreated.map(item => item.productId);
    await productService.updateProductCountGroup(productIdList);

    if (res && !res.headersSent) res.status(200).send(`Transaction completed-${lines[0].headerId}`);
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
    const linesCreated = await SaleLine.bulkCreate(lines);
    logger.info("===> Line created len: " + linesCreated.length);

    // Fetch STOCK.VAR parameter from SPF
    const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
    const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';

    for (const iterator of linesCreated) {
      logger.info("===> Updating card saleLineId in card model");
      try {
        const whereCondition = {
          locking_session_id: lockingSessionId,
          productId: iterator.productId,
          saleLineId: null
        };

        if (checkVariant) {
          if (iterator.colorId !== undefined && iterator.colorId !== null) {
            whereCondition.colorId = iterator.colorId;
          }
          if (iterator.sizeId !== undefined && iterator.sizeId !== null) {
            whereCondition.sizeId = iterator.sizeId;
          }
        }

        const reservedCards = await Card.findAll({
          where: whereCondition,
          limit: Math.max(1, Math.round((iterator.unitRate || 1) * iterator.quantity))
        });

        const cardIds = reservedCards.map(c => c.id);

        if (cardIds.length > 0) {
          const cardUpdated = await Card.update({
            saleLineId: iterator.id,
            card_isused: 1,
            locking_session_id: '' 
          }, {
            where: {
              id: { [Op.in]: cardIds }
            }
          });
          logger.info("Update card saleLineId successfully " + cardUpdated[0]);
        } else {
          logger.warn(`No matching cards found to link for saleLine ${iterator.id}`);
        }
      } catch (error) {
        logger.error("Update card saleLineId fail " + error);
        await fullReversal(linesCreated[0]['id']);
        throw new Error("Card is not updated correctly and inventory amount will not be correctly");
      }
    }
  } catch (error) {
    // ********************************************
    //  Reverse SaleHeader just created before
    // ********************************************
    await saleHeaderService.saleHeaderReversal(lines[0]['headerId']);
    logger.error('Error inserting rows:', error);
  }
};

const updateBulkSaleLine = async (lines, lockingSessionId, locationId) => {
  // Fetch STOCK.VAR parameter from SPF
  const spfStockVarParam = await spfService.getSPFByCode('STOCK.VAR');
  const checkVariant = spfStockVarParam && spfStockVarParam.value === 'Y';

  for (const incomingLine of lines) {
    // 1. Find the DB record
    const dbLine = await SaleLine.findByPk(incomingLine.id);
    if (!dbLine) continue;

    // 2. Save metadata (qty, price)
    await dbLine.update(incomingLine);

    // 3. Link the cards we reserved in assignHeaderId
    const whereCondition = {
      locking_session_id: lockingSessionId,
      productId: incomingLine.productId,
      locationId: locationId,
      saleLineId: null // Link only the new ones
    };

    if (checkVariant) {
      if (incomingLine.colorId !== undefined && incomingLine.colorId !== null) {
        whereCondition.colorId = incomingLine.colorId;
      }
      if (incomingLine.sizeId !== undefined && incomingLine.sizeId !== null) {
        whereCondition.sizeId = incomingLine.sizeId;
      }
    }

    const reservedCards = await Card.findAll({
      where: whereCondition,
      limit: Math.max(1, Math.round((incomingLine.unitRate || 1) * incomingLine.quantity))
    });

    const cardIds = reservedCards.map(c => c.id);

    if (cardIds.length > 0) {
      await Card.update({
        saleLineId: incomingLine.id,
        card_isused: 1,
        locking_session_id: '' // Use '' to satisfy NotNull
      }, {
        where: {
          id: { [Op.in]: cardIds }
        }
      });
      logger.info(`Updated card links for updated sale line ${incomingLine.id}`);
    }
  }
};

const updateSaleLine = async (line) => {
  try {
    const saleLine = await SaleLine.findByPk(line.id);
    if (!saleLine) {
      throw new Error(`SaleLineId ${line.id} is not found`);
    }
    await saleLine.update(line);
    logger.info(`Updated saleLineId ${line.id} completed ${saleLine}`);
  } catch (error) {
    logger.error(`Cannot update saleLine id ${line.id} with error ${error}`);
    throw new Error(`Cannot update saleLine id ${line.id} with error ${error}`);
  }
};

const fullReversal = async (saleLineId) => {
  // ********************************************
  //  Find all card just created with saleLine id
  // ********************************************
  const allCardsInSaleLineId = await Card.findAll({
    where: {
      saleLineId: saleLineId
    }
  });
  // ********************************************
  //  Reverse all card just created with saleLine id
  // ********************************************
  for (const iterator of allCardsInSaleLineId) {
    await saleHeaderService.cardReversal(iterator['productId'], saleLineId);
  }
  // ********************************************
  //  Reverse saleLine just created 
  // ********************************************
  await saleHeaderService.saleLineReversal(saleLineId);
};

module.exports = {
  createBulkSaleLine,
  updateBulkSaleLine,
  createBulkSaleLineWithoutRes,
  updateSaleLine,
};