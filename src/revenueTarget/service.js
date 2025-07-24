// const logger = require('../../../api/logger');
// const Card = require('../models').card
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