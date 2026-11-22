
const { Op } = require('sequelize');
const logger = require('../api/logger');
const SaleHeader = require('../models').saleHeader
const SaleLine = require('../models').saleLine
const Card = require('../models').card
const cardService = require('../card/service')

const saleHeaderReversal = async (headerId, reasonOrError = null) => {
    logger.info("Reversal sale header " + headerId)
    try {
        const header = await SaleHeader.findByPk(headerId)

        if (!header) {
            logger.warn(`Saleheader id ${headerId} could not be founded`)
            return
        }

        let reasonText = '';
        if (reasonOrError) {
            if (typeof reasonOrError === 'string') {
                reasonText = reasonOrError;
            } else if (reasonOrError.parent && (reasonOrError.parent.code === 'ER_LOCK_WAIT_TIMEOUT' || reasonOrError.parent.errno === 1205)) {
                reasonText = 'Lock wait timeout exceeded (ER_LOCK_WAIT_TIMEOUT)';
            } else if (reasonOrError.name === 'SequelizeTimeoutError' || (reasonOrError.message && reasonOrError.message.includes('Lock wait timeout'))) {
                reasonText = 'Lock wait timeout exceeded (ER_LOCK_WAIT_TIMEOUT)';
            } else if (reasonOrError.parent && (reasonOrError.parent.code === 'ER_LOCK_DEADLOCK' || reasonOrError.parent.errno === 1213)) {
                reasonText = 'Deadlock found when trying to get lock (ER_LOCK_DEADLOCK)';
            } else if (reasonOrError.message) {
                reasonText = reasonOrError.message;
            } else {
                reasonText = String(reasonOrError);
            }
        }

        const updateData = { isActive: false };

        // If no lines were ever saved, reset total to 0 to prevent ghost revenue,
        // while preserving the attempted cart total in the remark for auditing.
        const headerLines = await SaleLine.findAll({
            attributes: ['id', 'productId'],
            where: {
                [Op.or]: [
                    { headerId: header.id },
                    { saleHeaderId: header.id }
                ]
            }
        });
        const lineCount = headerLines.length;

        if (lineCount === 0) {
            const attemptedTotal = header.total || 0;
            updateData.total = 0;
            if (attemptedTotal > 0) {
                const totalNote = `Attempted Total: ${attemptedTotal}`;
                reasonText = reasonText ? `${reasonText} (${totalNote})` : totalNote;
            }
        }

        if (reasonText) {
            const formatted = `[AUTO-CANCEL: ${reasonText}]`.substring(0, 255);
            updateData.remark = header.remark 
                ? `${header.remark} ${formatted}`.substring(0, 255) 
                : formatted;
        }

        // Switch off the whole failed sale, not only the header. Before, its payments stayed active (counted
        // by anything that adds up salePayment), its lines stayed active and stock already linked to them
        // stayed "used" for a sale that does not exist.
        const db = require('../models');
        const lineIds = headerLines.map((l) => l.id);
        const reversedSaleHeader = await db.sequelize.transaction(async (t) => {
            await db.salePayment.update({ isActive: false }, { where: { saleHeaderId: header.id }, transaction: t });
            if (lineIds.length) {
                await SaleLine.update({ isActive: false }, { where: { id: { [Op.in]: lineIds } }, transaction: t });
                // give back stock the lines had taken
                await Card.update(
                    { card_isused: 0, saleLineId: null, locking_session_id: '' },
                    { where: { saleLineId: { [Op.in]: lineIds } }, transaction: t }
                );
                // stock brought in by returned-packaging lines of this sale is removed again
                await Card.update(
                    { card_isused: 2, isActive: false },
                    { where: { returnSaleLineId: { [Op.in]: lineIds }, saleLineId: null }, transaction: t }
                );
            }
            return header.update(updateData, { transaction: t });
        });
        if (lineIds.length) {
            try {
                const productService = require('../product/service');
                await productService.updateProductCountGroup([...new Set(headerLines.map((l) => l.productId))]);
            } catch (e) {
                logger.error(`SaleHeader ${header.id}: stock count refresh after auto-cancel failed: ${e.message}`);
            }
        }
        logger.info("SaleHeader id " + headerId + " has been reserved " + reversedSaleHeader.isActive + (reversedSaleHeader.remark ? ` with remark: ${reversedSaleHeader.remark}` : ''))

    } catch (error) {
        logger.error("SaleHeader id " + headerId + " cannot be reserved " + error)
        throw new Error("SaleHeader id " + headerId + " cannot be reserved " + error)
    }
}
const saleLineReversal = async (lineId) => {
    const line = await SaleLine.findByPk(lineId)

    if (!line) {
        logger.error("Cannot find saleLine id " + lineId)
        throw new Error("Cannot find saleLine id " + lineId)
    }
    try {
        const updatedLine = await line.update({ isActive: false })
        logger.warn("Transaction saleLine id " + lineId + " has been reversed status: " + updatedLine.isActive)

    } catch (error) {
        logger.error("Cannot reverse saleLine id " + lineId + " with error " + error)
        throw new Error("Can not revesse saleLine id " + error)
    }
}

const cardReversal = async (productId, saleLineId) => {
    logger.warn("Reversal cards " + productId + ' ID ' + saleLineId)
    const cards = await Card.findAll({
        where: {
            saleLineId,
            productId,
            card_isused: 1,
        }
    })

    // New update logic from soubin 20231118
    const cardIds = cards.map(card => card.id);
    try {
        const [numUpdated] = await Card.update(
            {
                card_isused: 0,
                saleLineId: null,
                isActive: true,
            },
            {
                where: {
                    id: {
                        [Op.in]: cardIds,
                    },
                },
            }
        );
        logger.info(`Reverse card completed ${numUpdated} record[s]`)
    } catch (error) {
        logger.error(`Cannot reverse card with error ${error}`)
        throw new Error("Cannot reverse card id " + updatedCard.id + " with error " + error)
    }


    // for (const iterator of cards) {
    //     try {
    //         const updatedCard = await iterator.update({
    //             card_isused: 0,
    //             saleLineId: null,
    //             isActive: true,
    //         })
    //         logger.info(`===> ****REV**** Card id +${updatedCard.id}+ has been reverse and it is now available in stock card_isused: ${updatedCard['card_isused']}`)
    //     } catch (error) {
    //         logger.error("Cannot reverse card id " + updatedCard.id + " with error " + error)
    //         throw new Error("Cannot reverse card id " + updatedCard.id + " with error " + error)
    //     }
    // }
}

const cardReversalByLockingSessionId = async (lockingSessionId) => {
    logger.warn(`Reversal cards by lockingSessionId ${lockingSessionId}`)
    const cards = await Card.findAll({
        where: {
            locking_session_id: lockingSessionId,
            card_isused: 1,
        }
    })
    logger.info('All card found for this saleLine ' + cards.length)
    for (const iterator of cards) {
        try {
            const updatedCard = await iterator.update({
                card_isused: 0,
                saleLineId: null,
                isActive: true,
            })
            logger.info(`===> ****REV**** Card id +${updatedCard.id}+ has been reverse and it is now available in stock card_isused: ${updatedCard['card_isused']}`)
        } catch (error) {
            logger.error("Cannot reverse card id " + updatedCard.id + " with error " + error)
            throw new Error("Cannot reverse card id " + updatedCard.id + " with error " + error)
        }
    }
}

const autoCreateStock = async ()=>{

}

// const assignHeaderIdToLineByUpdate = async (line, id, lockingSessionId, isUpdate) => {
//     for (const iterator of line) {
//       logger.warn(`Check if lineId is null or undifine ${iterator.id}`)
//       iterator.headerId = id
//       iterator.saleHeaderId = id
//       logger.warn("header id ===> " + iterator.headerId)
//       try {
//         // ********** If it header is fresh record then we directly reserve new card ************ //
//         // ********** If not we will have condition ************ //
//         if (!isUpdate || !iterator.id) {
//           const qty = iterator.unitRate * iterator.quantity
//           // productService.updateProductCountById(iterator.productId)
//           await reserveCard(iterator, lockingSessionId, qty)
//         } else {
//           // ********** The logic part of update existing card ************ //
//           // ********** Reverse all previous cards from this saleLineId and assign new one ************ //
//           // await headerService.cardReversal(iterator.productId, iterator.id)
//           const previousCards = await Card.findAll({
//             order: [['createdAt', 'DESC']],
//             where: {
//               saleLineId: iterator.id
//             }
//           })
//           const currentRequiredQty = iterator.unitRate * iterator.quantity
//           const qty = currentRequiredQty - previousCards.length

//           if (previousCards[0]['productId'] == iterator['productId']) {
//             logger.info(`*************Previous card productId is the same with current ProductId************`)

//             if (currentRequiredQty > previousCards.length) {
//               //************ If current require greater than previous cards logic *************/
//               await reserveCard(iterator, lockingSessionId, qty)
//               logger.info(`********* Immediatly update saleLine after reserved cards *********`)

//             } else if (currentRequiredQty == previousCards.length) {
//               //************ No need to do anything *************/
//             } else {
//               //************ Current card less than previous card logic *************/
//               //************ and we have to remove some previous card *************/

//               try {
//                 // ********** Update if already exist function ***********// 
//                 const preCardCount = previousCards.length
//                 const numberOfLastCardForPuttingBackToInventory = currentRequiredQty - preCardCount
//                 const cardsForReversBack = previousCards.slice(numberOfLastCardForPuttingBackToInventory)
//                 logger.warn(`Card previous count #${preCardCount} and cad now count #${currentRequiredQty}`)
//                 logger.warn(`cardsForReversBack count #${cardsForReversBack.length}`)
//                 for (const iterator of cardsForReversBack) {
//                   const updatedCard = await iterator.update({
//                     card_isused: 0,
//                     saleLineId: null,
//                     isActive: true
//                   })
//                   logger.info(`Reverse over cards succesfully ${updatedCard['card_isused']}`)
//                 }
//               } catch (error) {
//                 logger.error(`Reverse over cards fail ${error}`)
//                 throw new Error(`Reverse over cards fail ${error}`)
//               }
//             }
//           } else {
//             logger.info(`*************Previous card productId is not the same with current ProductId************`)
//             await reserveCard(iterator, lockingSessionId, currentRequiredQty)
//             for (const iterator of previousCards) {
//               const updatedCard = await iterator.update({
//                 card_isused: 0,
//                 saleLineId: null,
//                 isActive: true
//               })
//               logger.info(`Reverse over cards succesfully ${updatedCard['card_isused']}`)
//             }
//             //**************** Update previous card make it back available in inventory ****************/
//             logger.info(`//**************** Update previous card make it back available in inventory ****************/`)
//             productService.updateProductCountById(previousCards[0]['productId'])
//           }
//           logger.warn(`This saleLineId ${iterator.id} has previous card count ${previousCards.length}`)

//           // ************** Update saleLine entry ************** //
//           logger.info(`// ************** Update saleLine entry ************** //`)
//           await lineService.updateSaleLine(iterator)
//         }

//       } catch (error) {
//         logger.error(`Stock is not enought for productId ${iterator.productId}`)
//         if (!isUpdate) await headerService.cardReversalByLockingSessionId(lockingSessionId)
//         // await releaseTempCard(lockingSessionId)
//         throw new Error(error)
//       }
//     }
//     return line;
//   }


module.exports = {
    cardReversal,
    saleHeaderReversal,
    saleLineReversal,
    cardReversalByLockingSessionId
}