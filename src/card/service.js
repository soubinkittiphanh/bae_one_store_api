const logger = require('../api/logger');
const dbAsync = require('../config/dbconAsync');
const Card = require('../models').card
const common = require('../common');
const { Op } = require('sequelize');

const createHulkStockCard = (req, res) => {

    const { inputter, product_id, totalCost, stockCardQty, productId, srcLocationId } = req.body;
    const costPerUnit = totalCost;
    const lockingSessionId = Date.now();
    logger.info("Product ID ===> " + productId)
    const rowsToInsert = [

    ]
    for (let index = 0; index < stockCardQty; index++) {
        const cardSequenceNumber = common.generateLockingSessionId(10)
        logger.warn(cardSequenceNumber)
        rowsToInsert.push({
            //Card object
            card_type_code: 10010,// FIX Value and No meaning
            product_id: product_id,
            productId: productId,
            cost: costPerUnit, // 50.99,
            card_number: cardSequenceNumber, //'1234-5678-9012-3456',
            card_isused: 0,
            locking_session_id: lockingSessionId,
            card_input_date: new Date(),
            inputter: inputter,
            update_user: inputter,
            update_time: new Date(),
            update_time_new: new Date(),
            isActive: true,
            locationId: srcLocationId,
        })
        logger.warn("Row insert productId ===> " + rowsToInsert[0]['productId'])
    }
    Card.bulkCreate(rowsToInsert)
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed")
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}
const rebuildStockValue = async (req, res) => {
    logger.warn("****** Rebuild stock is on going ******")
    logger.info(`************* updateProductStockCountDirect **************`);
    //**************** Script card version cardsale table logic *****************/
    // const sqlCom = `UPDATE product pro 
    // INNER JOIN (SELECT d.product_id AS card_pro_id,COUNT(d.card_number)-COUNT(cs.card_code) AS card_count 
    // FROM card d LEFT JOIN card_sale cs ON cs.card_code=d.card_number 
    // WHERE d.card_isused!=2  
    // GROUP BY d.product_id) proc ON proc.card_pro_id=pro.pro_id 
    // SET pro.stock_count=proc.card_count;`
    //**************** Script card version cardsale table logic *****************/

    //**************** Script card version without cardsale table logic *****************/
    const sqlCom = `UPDATE product pro 
    INNER JOIN (SELECT d.productId AS card_pro_id,COUNT(d.card_number) AS card_count 
    FROM card d 
    WHERE d.card_isused=0 OR d.saleLineId is null
    GROUP BY d.product_id) proc ON proc.card_pro_id=pro.id 
    SET pro.stock_count=proc.card_count;`
    //**************** Script card version without cardsale table logic *****************/
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        logger.info(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
        return res.status(200).send("Transaction completed")
    } catch (error) {
        logger.error("Cannot get product sale count");
        return res.status(401).send(error);
    }

}


const createCardFromReceiving = async (receivingLines, locationId, t) => {

    // ----------- assign receivingLineId to card ------------
    logger.info(`Receving line ${JSON.stringify(receivingLines)}`)
    let cardTemplate = {
        //Card object
        card_type_code: 10010,// FIX Value and No meaning
        product_id: null, //TO BE ASSIGNED
        productId: null, //TOBE ASSIGNED
        cost: 0, // TOBE ASSIGNED
        card_number: null, //'1234-5678-9012-3456',
        card_isused: 0,
        locking_session_id: null,
        card_input_date: null,
        inputter: 1,
        update_user: 1,
        update_time: new Date(),
        update_time_new: new Date(),
        isActive: true,
        locationId: locationId,
    }
    let cardWithReceivingLineId = []
    for (const iterator of receivingLines) {
        const cardToInsertCount = iterator['rate'] * iterator['qty']
        const cost = iterator['total'] / cardToInsertCount
        const productId = iterator['productId']
        const productCode = iterator['productCode']
        for (let index = 0; index < cardToInsertCount; index++) {
            const lockingSessionId = Date.now();
            const cardSequenceNumber = common.generateLockingSessionId(10);

            // Create a new object for each iteration
            let newCardTemplate = { ...cardTemplate };

            newCardTemplate.cost = cost;
            newCardTemplate.currencyId = iterator['currencyId'];
            newCardTemplate.productId = productId;
            newCardTemplate.product_id = productCode;
            newCardTemplate.locking_session_id = lockingSessionId;
            newCardTemplate.card_number = cardSequenceNumber;
            newCardTemplate.card_input_date = new Date();
            newCardTemplate.update = new Date();
            newCardTemplate.update_time = new Date();
            newCardTemplate.receivingLineId = iterator['id'];

            cardWithReceivingLineId.push(newCardTemplate);
        }
    }
    logger.info(`Card to be created count ${cardWithReceivingLineId.length} ${JSON.stringify(cardWithReceivingLineId)}`)
    try {
        const cardCreated = await Card.bulkCreate(cardWithReceivingLineId, { transaction: t })
        logger.info(`Card created successfully ${cardCreated.length}`)
        return cardCreated;
    } catch (error) {
        logger.error(`Cannot create card from receiving with error ${error}`)
    }

}

const findCardsByReceivingLineIdList = async (receivingLineIdList) => {
    const cards = await Card.findAll({
        where: {
            'receivingLineId': {
                [Op.in]: receivingLineIdList
            },
        }
    })
    return cards;
}

const updateCardByIdList = async (cost, locationId, currencyId, cards, t) => {
    try {
        const idList = cards.map(el => el['id'])
        logger.warn(`Cards info BEFORE change ${JSON.stringify(cards)}`)
        const updatedCard = await Card.update({ cost, locationId, currencyId }, { where: { 'id': { [Op.in]: idList } } }, { transaction: t })

        logger.info(`Cards info AFTER change ${JSON.stringify(updatedCard)}`)
        return updatedCard;
    } catch (error) {
        logger.error(`Cannot update card id ${cards.id} with error ${error}`)

    }
}

const deleteNotUseByIdList = async (cards, t) => {
    try {
        const cardIdList = cards.map(el => el.id)
        const result = await Card.destroy({ where: { id: { [Op.in]: cardIdList } } })
        logger.info(`Cards has been deleted ${JSON.stringify(result)}`)
    } catch (error) {
        logger.error(`Cannot delete card with error ${error}`)
    }
}

module.exports = {
    createHulkStockCard,
    rebuildStockValue,
    createCardFromReceiving,
    findCardsByReceivingLineIdList,
    updateCardByIdList,
    deleteNotUseByIdList
}