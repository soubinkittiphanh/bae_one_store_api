
const logger = require('../api/logger');
const SaleHeader = require('../models').saleHeader
const SaleLine = require('../models').saleLine
const Card = require('../models').card

const saleHeaderReversal = async (headerId)=>{
    logger.info("Reversal sale header "+headerId)
    try {
        const header = await SaleHeader.findByPk(headerId)
        logger.info("before set isActive")
        const reversedSaleHeader = await header.update({
            isActive:false
        })
        logger.info("after set isActive")
        logger.info("SaleHeader id "+headerId +" has been reserved "+reversedSaleHeader.isActive)
        
    } catch (error) {
        logger.error("SaleHeader id "+headerId +" cannot be reserved "+error)
        throw new Error("SaleHeader id "+headerId +" cannot be reserved "+error)
    }
}
const saleLineReversal = async (lineId)=>{
    const line = SaleLine.findByPk(lineId)

    if (!line) {
        logger.error("Cannot find saleLine id "+lineId)
        throw new Error("Cannot find saleLine id "+lineId)
    }
    try {
        const updatedLine = await line.update({isActive:false})
        logger.warn("Transaction saleLine id "+lineId +" has been reversed status: " +updatedLine.isActive)
        
    } catch (error) {
        logger.error("Cannot reverse saleLine id "+ lineId +" with error "+error)
        throw new Error("Can not revesse saleLine id "+error)
    }
}

const cardReversal = async(productId,saleLineId)=>{
    logger.warn("Reversal cards "+productId+' ID '+saleLineId)
    const cards = await Card.findAll({
        where:{
            saleLineId,
            productId,
            card_isused:1,
            }
        })
        logger.info('All card found for this saleLine '+cards.length)
    for (const iterator of cards) {
        try {
            const updatedCard = await iterator.update({
                card_isused: 0,
                saleLineId: null,
                isActive: true,
            })
            logger.info(`===> ****REV**** Card id +${updatedCard.id}+ has been reverse and it is now available in stock card_isused: ${updatedCard['card_isused']}`)
        } catch (error) {
            logger.error("Cannot reverse card id "+updatedCard.id +" with error "+error)
            throw new Error("Cannot reverse card id "+updatedCard.id +" with error "+error)
        }
    }
}

const cardReversalByLockingSessionId = async(lockingSessionId)=>{
    logger.warn(`Reversal cards by lockingSessionId ${lockingSessionId}`)
    const cards = await Card.findAll({
        where:{
            locking_session_id:lockingSessionId,
            card_isused:1,
            }
        })
        logger.info('All card found for this saleLine '+cards.length)
    for (const iterator of cards) {
        try {
            const updatedCard = await iterator.update({
                card_isused: 0,
                saleLineId: null,
                isActive: true,
            })
            logger.info(`===> ****REV**** Card id +${updatedCard.id}+ has been reverse and it is now available in stock card_isused: ${updatedCard['card_isused']}`)
        } catch (error) {
            logger.error("Cannot reverse card id "+updatedCard.id +" with error "+error)
            throw new Error("Cannot reverse card id "+updatedCard.id +" with error "+error)
        }
    }
}

module.exports = {
    cardReversal,
    saleHeaderReversal,
    saleLineReversal,
    cardReversalByLockingSessionId
}

// function generateRandomString(length) {
//     let result = '';
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (let i = 0; i < length; i++) {
//       result += characters.charAt(Math.floor(Math.random() * charactersLength));
//     }
    
//     return result;
//   }
  
// const createHulkStockCard = (req, res) => {

//     const {inputter,product_id,totalCost,stocCardkQty} = req.body;
//     const costPerUnit = totalCost/stocCardkQty;
//     const lockingSessionId = Date.now();
//     const rowsToInsert = [

//     ]
//     for (let index = 0; index < stocCardkQty; index++) {
//         const cardSequenceNumber = Date.now().toString().concat(generateRandomString(10))
//         logger.warn(cardSequenceNumber)
//         rowsToInsert.push({
//             //Card object
//             card_type_code: 10010,// FIX Value and No meaning
//             product_id: product_id,
//             cost: costPerUnit, // 50.99,
//             card_number: cardSequenceNumber, //'1234-5678-9012-3456',
//             card_isused: 0,
//             locking_session_id: lockingSessionId,
//             card_input_date: new Date(),
//             inputter: inputter,
//             update_user: inputter,
//             update_time: new Date(),
//             update_time_new: new Date(),
//             isActive: true,
//         })
//     }
//     Card.bulkCreate(rowsToInsert)
//         .then(()=>{ 
//             logger.info('Rows inserted successfully')
//             return res.status(200).send("Transction completed")
//         })
//         .catch((error)=>{
//             logger.error('Error inserting rows:', error)
//             return res.status(403).send("Server error "+error)
//         });
// }

// module.exports = {
//     createHulkStockCard,
// }