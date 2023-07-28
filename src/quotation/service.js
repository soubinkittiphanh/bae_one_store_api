
const logger = require('../api/logger');
const QuotationHeader = require('../models').quotationHeader
const QuotationLine = require('../models').quotationLine

const quotationHeaderReversal = async (headerId)=>{
    logger.info("Reversal quotation header "+headerId)
    try {
        const header = await QuotationHeader.findByPk(headerId)
        logger.info("before set isActive")
        const reversedQuotationHeader = await header.update({
            isActive:false
        })
        logger.info("after set isActive")
        logger.info("QuotationHeader id "+headerId +" has been reserved "+reversedQuotationHeader.isActive)
        
    } catch (error) {
        logger.error("QuotationHeader id "+headerId +" cannot be reserved "+error)
        throw new Error("QuotationHeader id "+headerId +" cannot be reserved "+error)
    }
}
const quotationLineReversal = async (lineId)=>{
    const line = QuotationLine.findByPk(lineId)

    if (!line) {
        logger.error("Cannot find QuotationLine id "+lineId)
        throw new Error("Cannot find QuotationLine id "+lineId)
    }
    try {
        const updatedLine = await line.update({isActive:false})
        logger.warn("Transaction QuotationLine id "+lineId +" has been reversed status: " +updatedLine.isActive)
        
    } catch (error) {
        logger.error("Cannot reverse QuotationLine id "+ lineId +" with error "+error)
        throw new Error("Can not revesse QuotationLine id "+error)
    }
}

module.exports = {
    quotationHeaderReversal,
    quotationLineReversal
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