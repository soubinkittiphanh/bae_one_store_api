
const { Op } = require('sequelize');
const logger = require('../../api/logger');
const cardService = require('./../../card/service')
const Card = require('../../models').card

const RECLine = require('../../models').receivingLine
const createBulk = async (req, res, lines, headerId) => {
    RECLine.bulkCreate(assignHeaderId(lines, headerId))
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed")
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}

const updateBulk = async (req, res, lines, headerId) => {
    let listOfNotFoundEntry = []

    // ********************************************************* //
    for (const iterator of lines) {
        try {
            if (iterator.id) {
                const poline = await RECLine.findByPk(iterator['id']);
                if (!poline) {
                    logger.error("Cannot update PO line id: " + iterator['id'])
                } else {
                    const updatePoline = await RECLine.update(iterator);
                }
            } else {
                /* *********** If Entry not found then we will push to not 
                found list and then create once with bulk create function 
                *********************************************************/
                listOfNotFoundEntry.push(iterator)
            }

        } catch (err) {
            logger.error(err);
            return res.status(201).send("Server error " + err)
        }
    }
    // ************ Create those  add new entry ************ //
    if (listOfNotFoundEntry.length > 0) {
        await createBulk(req, res, assignHeaderId(listOfNotFoundEntry, headerId))
    } else {
        res.status(200).send("Transaction completed")
    }
}

const simpleUpdateBulk = async (lines, locationId, currencyId, t) => {
    let listOfNotFoundEntry = []
    const listOfFoundEntry = lines.filter(el => el['id'] != null)
    // --------- Update card info, cost, location, currency --------- //
    await cardService.cardUtilityReceivingLineChangesReflect(listOfFoundEntry, locationId, currencyId, t)
    for (const iterator of lines) {
        try {
            if (iterator.id) {
                const poline = await RECLine.findByPk(iterator['id']);
                if (!poline) {
                    logger.error("Cannot update PO line id: " + iterator['id'])
                } else {
                    const updatePoline = await poline.update(iterator, {
                        transaction: t
                    });
                    logger.info(`PO Line ${iterator.id} has been updated ${JSON.stringify(updatePoline)}`)
                }
            } else {
                /* *********** If Entry not found then we will push to not 
                found list and then create once with bulk create function 
                *********************************************************/
                listOfNotFoundEntry.push(iterator)
            }
        } catch (err) {
            logger.error(`Simple update bulk fail with error ${err}`);
        }
    }
    // ************ Create those  add new entry ************ //
    if (listOfNotFoundEntry.length > 0) {
        const newReceiveLineCreated = await RECLine.bulkCreate(listOfNotFoundEntry, { transaction: t })
        logger.info(`New line created ${newReceiveLineCreated.length}`)
        // -------- create card for receiving line
        const cardCreated = await cardService.cardUtility(newReceiveLineCreated, locationId, currencyId, t)
        logger.info(`New card created   ${cardCreated.length} \n ${JSON.stringify(cardCreated)}`)
    }
}

const assignHeaderId = (entry, headerId) => {
    for (let i = 0; i < entry.length; i++) {
        entry[i]['poHeaderId'] = headerId;
        entry[i]['headerId'] = headerId;
    }
    return entry
}

const removeCardsFromRecId = async (receiveId, t) => {
    try {
        const cards = await cardService.findCardsByReceivingLineIdList([receiveId])
        if (cards) {
            logger.info(`Cards founds: ${JSON.stringify(cards)}`)
            const usedCard = validateUsedCards(cards)
            if (usedCard.length > 0) {
                throw new Error(`Already some cards is used, operation fail ${JSON.stringify(usedCard)}`)
            } else {
                logger.info(`Cards is being removed`)
                const deleteResult = await Card.destroy({ where: { id: { [Op.in]: cards.map(card => card.id) } } }, { transaction: t });
                logger.info(`Deleted ${deleteResult} cards`);
            }
        } else {
            logger.error(`No cards found from this receiving line id ${receiveId}`)
        }
    } catch (error) {
        logger.error(`Cannot load card by recieving id ${error}`)
    }


}

const validateUsedCards = (cardList) => {

    const usedCard = cardList.filter(card => card.saleLineId != null)
    return usedCard;
}

module.exports = {
    createBulk,
    updateBulk,
    simpleUpdateBulk,
    removeCardsFromRecId
}