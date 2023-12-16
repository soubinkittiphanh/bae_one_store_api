
const logger = require('../api/logger');
const Currency = require('../models').currency; 

// const PoLine = require('../models').poLine
const createBulk = async (req, res) => {
    const currencyList = [
        {
            code: 'LAK',
            name: 'Laotian Kip',
            rate: 1,
            isActive: true
        },
        {
            code: 'USD',
            name: 'United States Dollar',
            rate: 19000,
            isActive: true
        },
        {
            code: 'THB',
            name: 'Thai Baht',
            rate: 550,
            isActive: true
        }
    ]
    Currency.bulkCreate(currencyList)
        .then(() => {
            logger.info('Rows inserted successfully')
            return res.status(200).send("Transction completed")
        })
        .catch((error) => {
            logger.error('Error inserting rows:', error)
            return res.status(403).send("Server error " + error)
        });
}

// const updateBulk = async (req, res, lines, headerId) => {
//     let listOfNotFoundEntry = []

//     // ********************************************************* //
//     for (const iterator of lines) {
//         try {
//             if (iterator.id) {
//                 const poline = await PoLine.findByPk(iterator['id']);
//                 if (!poline) {
//                     logger.error("Cannot update PO line id: " + iterator['id'])
//                 } else {
//                     const updatePoline = await PoLine.update(iterator);
//                 }
//             } else {
//                 /* *********** If Entry not found then we will push to not 
//                 found list and then create once with bulk create function 
//                 *********************************************************/
//                 listOfNotFoundEntry.push(iterator)
//             }

//         } catch (err) {
//             console.error(err);
//             return res.status(201).send("Server error " + err)
//         }
//     }
//     // ************ Create those  add new entry ************ //
//     if (listOfNotFoundEntry.length > 0) {
//         await createBulk(req, res, assignHeaderId(listOfNotFoundEntry, headerId))
//     } else {
//         res.status(200).send("Transaction completed")
//     }
// }
// const assignHeaderId = (entry, headerId) => {
//     for (let i = 0; i < entry.length; i++) {
//         entry[i]['poHeaderId'] = headerId;
//         entry[i]['headerId'] = headerId;
//     }
//     return entry
// }

module.exports = {
    createBulk,
}