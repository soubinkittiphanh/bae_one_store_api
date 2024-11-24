
const logger = require('../../api/logger');
const Line = require('../../models').reservationLine

const createBulk = async (lines, t) => {
    try {
        const createdLine = await Line.bulkCreate(lines, { transaction: t })
        return createdLine
    } catch (error) {
        logger.error(`Cannot create line with error ${error}`)
    }
}

// const updateBulk = async (req, res, lines, headerId) => {
//     let listOfNotFoundEntry = []

//     // ********************************************************* //
//     for (const iterator of lines) {
//         try {
//             if (iterator.id) {
//                 const poline = await RECLine.findByPk(iterator['id']);
//                 if (!poline) {
//                     logger.error("Cannot update PO line id: " + iterator['id'])
//                 } else {
//                     const updatePoline = await RECLine.update(iterator);
//                 }
//             } else {
//                 /* *********** If Entry not found then we will push to not 
//                 found list and then create once with bulk create function 
//                 *********************************************************/
//                 listOfNotFoundEntry.push(iterator)
//             }

//         } catch (err) {
//             logger.error(err);
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

const simpleUpdateBulk = async (lines, t) => {
    let listOfNotFoundEntry = []
    for (const iterator of lines) {
        try {
            if (iterator.id) {
                const poline = await Line.findByPk(iterator['id']);
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
        const newLine = await createBulk(listOfNotFoundEntry, t)
        logger.info(`New line created ${newLine.length} \n ${JSON.stringify(newLine)}`)
    }
}

// const assignHeaderId = (entry, headerId) => {
//     for (let i = 0; i < entry.length; i++) {
//         entry[i]['poHeaderId'] = headerId;
//         entry[i]['headerId'] = headerId;
//     }
//     return entry
// }

module.exports = {
    createBulk,
    // updateBulk,
    simpleUpdateBulk
}