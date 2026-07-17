const logger = require('../api/logger');
const dbAsync = require('../config/dbconAsync');
const Card = require('../models').card;
const Product = require('../models').product;
const common = require('../common');
const { Op } = require('sequelize');
const productService = require('./../product/service')

const createHulkStockCard = async (req, res) => {
    let {
        inputter,
        product_id,
        totalCost,
        stockCardQty,
        productId,
        srcLocationId,
        currencyId,
        exchangeRate,
        costLCY,
        // New fields
        colorId,
        sizeId,
        serialNo,
        lotNumber,
        expiryDate,
        hasExpiry,
        hasLot
    } = req.body;

    if (stockCardQty < 0) {
        const whereCondition = {
            productId,
            card_isused: 0,
            saleLineId: null, // Ensure card is not sold/linked to a sale line
            isActive: true,
        }
        if (srcLocationId) {
            whereCondition.locationId = srcLocationId;
        }
        await adjustStock(whereCondition, stockCardQty, inputter)
        await productService.updateProductCountById(productId)
        return res.status(200).send("Transaction completed")
    }

    const costPerUnit = totalCost / stockCardQty;
    costLCY = costPerUnit * exchangeRate
    const lockingSessionId = Date.now();
    logger.info("Product ID ===> " + productId)

    const rowsToInsert = []

    for (let index = 0; index < stockCardQty; index++) {
        const cardSequenceNumber = common.generateLockingSessionId(10)
        logger.warn(cardSequenceNumber)

        rowsToInsert.push({
            //Card object
            card_type_code: 10010,// FIX Value and No meaning
            product_id: product_id,
            productId: productId,
            cost: costPerUnit, // 50.99,
            costLCY: costPerUnit, // 50.99,
            card_number: cardSequenceNumber, //'1234-5678-9012-3456',
            card_isused: 0,
            locking_session_id: lockingSessionId,
            card_input_date: new Date(),
            inputter: inputter,
            update_user: inputter,
            update_time: new Date(),
            update_time_new: new Date(),
            isActive: true,
            currencyId: currencyId ?? 1,
            exchangeRate: exchangeRate ?? 1,
            locationId: srcLocationId,
            costLCY: costLCY ?? 0,

            // New enhanced fields
            colorId: colorId || null,
            sizeId: sizeId || null,
            serialNo: serialNo ? `${serialNo}_${index + 1}` : null, // Create unique serial numbers
            lotNumber: lotNumber || null,
            expiryDate: expiryDate || null,
            hasExpiry: hasExpiry || !!expiryDate,
            hasLot: hasLot || !!lotNumber,
        })
        logger.warn("Row insert productId ===> " + rowsToInsert[0]['productId'])
    }

    try {
        await Card.bulkCreate(rowsToInsert);
        logger.info('Rows inserted successfully');

        // Update product's costCurrencyId
        if (productId) {
            await Product.update(
                { costCurrencyId: currencyId ?? 1 },
                { where: { id: productId } }
            );
            logger.info(`Updated product costCurrencyId to ${currencyId ?? 1} for productId ${productId}`);
        } else if (product_id) {
            await Product.update(
                { costCurrencyId: currencyId ?? 1 },
                { where: { pro_id: product_id } }
            );
            logger.info(`Updated product costCurrencyId to ${currencyId ?? 1} for product_id ${product_id}`);
        }
        if (productId) {
            await productService.updateProductCountById(productId)
        }
        return res.status(200).send("Transaction completed");
    } catch (error) {
        logger.error('Error in createHulkStockCard:', error);
        return res.status(403).send("Server error " + error);
    }
}

// TODO: Lets continues here for stock adjustment 
const adjustStock = async (whereCondition, stockCardQty, inputter = null) => {
    try {
        // Step 1: Find the rows to deactivate
        const limit = Math.abs(stockCardQty);
        const rowsToDelete = await Card.findAll({
            where: whereCondition,
            order: [['createdAt', 'ASC']], // Adjust the column for sorting - deactivate oldest first
            limit: limit,
        });

        // Step 2: Extract IDs of rows to deactivate
        const idsToDelete = rowsToDelete.map(row => row.id); // Assuming 'id' is the primary key

        if (idsToDelete.length > 0) {
            // Step 3: Perform the update (soft deactivation: card_isused = 2, isActive = false)
            await Card.update({
                card_isused: 2,
                isActive: false,
                update_user: inputter,
                update_time: new Date()
            }, {
                where: {
                    id: {
                        [Op.in]: idsToDelete,
                    },
                },
            });
            logger.info(`Deactivated (marked inactive/used=2) ${idsToDelete.length} rows.`);
        } else {
            logger.error('No rows found to deactivate.');
        }
    } catch (error) {
        logger.error('Error deactivating rows:', error);
    }
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
LEFT JOIN (
    SELECT productId, COUNT(card_number) AS card_count
    FROM card
    WHERE card_isused = 0 
      AND saleLineId IS NULL 
      AND isActive = 1
    GROUP BY productId
) proc ON proc.productId = pro.id
SET pro.stock_count = IFNULL(proc.card_count, 0);`
    //**************** Script card version without cardsale table logic *****************/
    try {
        const [rows, fields] = await dbAsync.execute(sqlCom);
        logger.info(`*********** ${new Date()} PROCESSED RECORD: ${rows.affectedRows}`);
        return res.status(200).send("Transaction completed")
    } catch (error) {
        logger.error(`Cannot get product sale count ${error}`);
        return res.status(401).send(error);
    }
}

const createCardFromReceiving = async (receivingLines, locationId, currencyId, t, additionalData = {}) => {
    // ----------- assign receivingLineId to card ------------
    logger.info(`Receiving line ${JSON.stringify(receivingLines)}`)

    const {
        colorId = null,
        sizeId = null,
        serialNo = null,
        lotNumber = null,
        expiryDate = null,
        hasExpiry = false,
        hasLot = false
    } = additionalData;

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

        // New enhanced fields
        colorId: colorId,
        sizeId: sizeId,
        serialNo: null, // Will be assigned per card
        lotNumber: lotNumber,
        expiryDate: expiryDate,
        hasExpiry: hasExpiry || !!expiryDate,
        hasLot: hasLot || !!lotNumber,
    }

    let cardWithReceivingLineId = []
    let serialIndex = 0; // Counter for serial numbers

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
            newCardTemplate.currencyId = currencyId;
            newCardTemplate.productId = productId;
            newCardTemplate.product_id = productCode;
            newCardTemplate.locking_session_id = lockingSessionId;
            newCardTemplate.card_number = cardSequenceNumber;
            newCardTemplate.card_input_date = new Date();
            newCardTemplate.update = new Date();
            newCardTemplate.update_time = new Date();
            newCardTemplate.receivingLineId = iterator['id'];

            // Assign unique serial number if provided
            if (serialNo) {
                newCardTemplate.serialNo = `${serialNo}_${serialIndex + 1}`;
                serialIndex++;
            }

            cardWithReceivingLineId.push(newCardTemplate);
        }
    }

    logger.info(`Card to be created count ${cardWithReceivingLineId.length}`)
    try {
        const cardCreated = await Card.bulkCreate(cardWithReceivingLineId, { transaction: t })
        logger.info(`Card created successfully ${cardCreated.length}`)
        return cardCreated;
    } catch (error) {
        logger.error(`Cannot create card from receiving with error ${error}`)
        throw error;
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

const updateCardByIdList = async (cost, locationId, currencyId, cards, t, additionalFields = {}) => {
    try {
        const idList = cards.map(el => el['id'])
        logger.warn(`Cards info BEFORE change ${JSON.stringify(cards.slice(0, 2))}`) // Log only first 2 for brevity

        const updateData = {
            cost,
            locationId,
            currencyId,
            ...additionalFields // Include any additional fields like colorId, sizeId, etc.
        };

        const updatedCard = await Card.update(updateData, {
            where: { 'id': { [Op.in]: idList } },
            transaction: t
        });

        logger.info(`Cards updated count: ${updatedCard[0]}`)
        return updatedCard;
    } catch (error) {
        logger.error(`Cannot update cards with error ${error}`)
        throw error;
    }
}

const deleteNotUseByIdList = async (cards, t) => {
    try {
        const cardIdList = cards.map(el => el.id)
        const result = await Card.destroy({
            where: { id: { [Op.in]: cardIdList } },
            transaction: t
        })
        logger.info(`Cards deleted count: ${result}`)
        return result;
    } catch (error) {
        logger.error(`Cannot delete card with error ${error}`)
        throw error;
    }
}

const cardUtility = async (receiveLines, locationId, currencyId, t, additionalData = {}) => {
    const productIdList = receiveLines.map(el => el.productId);
    const productIdAndCodeList = await productService.findProductCodeFromProductId(productIdList);

    // ----------- Assign productCode to receiving line -----------
    for (const iterator of receiveLines) {
        iterator['productCode'] = productIdAndCodeList.find(el => el.id == iterator['productId'])['pro_id']
    }

    const cardCreated = await createCardFromReceiving(receiveLines, locationId, currencyId, t, additionalData)
    if (!cardCreated) {
        throw new Error(`Cannot created cards`)
    }
    return cardCreated;
}

const cardUtilityReceivingLineChangesReflect = async (lines, locationId, currencyId, t, additionalData = {}) => {
    //TODO: The cost is not correct, after card updated, please check logic 
    const receivingIdList = lines.map(el => el['id'])
    const oldCardList = await findCardsByReceivingLineIdList(receivingIdList)
    const newRecevingLineList = []

    for (const iterator of lines) {
        // ---------- Need to compare if receivingLine qty has change or not, if change it will 
        // ---------- impact card line, so we need to update card line qty based on receiving line
        const newCardCount = iterator['rate'] * iterator['qty']
        const oldCardCountList = oldCardList.filter(el => el.receivingLineId == iterator['id'])
        const oldCardCount = oldCardCountList.length
        const costPerCard = iterator['total'] / (iterator['qty'] * iterator['rate'])

        // Prepare additional fields for updates
        const updateFields = {
            ...additionalData,
            update_time: new Date(),
            update_time_new: new Date()
        };

        // --------- ReceivingLine qty increase case -----------
        if (newCardCount > oldCardCount) {
            // ------- check if the cost has change 
            // ------- check how many increase
            const additionalUpCount = newCardCount - oldCardCount
            // ------- Update old cards -------//
            const updatedCards = await updateCardByIdList(costPerCard, locationId, currencyId, oldCardCountList, t, updateFields)
            logger.info(`Update cards successfully ${JSON.stringify(updatedCards)}`)

            // ------- Create additional cards -------//
            let newReceivingLine = { ...iterator }
            newReceivingLine.qty = additionalUpCount
            newReceivingLine.cost = 0 //costPerCard  * additionalUpCount
            newReceivingLine.total = costPerCard * additionalUpCount
            newReceivingLine.rate = 1 // to ensure that new line card has exact number of new card need
            newRecevingLineList.push(newReceivingLine)
        }
        else if (newCardCount < oldCardCount) {
            // ------- check if the cost has change 
            // ------- check how many decrease
            const additionalDownCount = oldCardCount - newCardCount
            // ------- the main scenario we have to know is, we cannot delete card already linked with saleLine
            const cardTobeDelete = oldCardCountList.filter(el => el['card_isused'] == 0 && el['saleLineId'] == null).slice(0, additionalDownCount)

            if (cardTobeDelete.length >= additionalDownCount) {
                // -------- only this case we expect since all card to be delete not yet linked to saleLine
                await deleteNotUseByIdList(cardTobeDelete, t)

                // we also need to update cards, since the other field may changes like cost, location, currency
                if (oldCardCount - newCardCount > 0) {
                    // -------- that's mean, still some old card available --------//
                    // ------- and we will update those cards any way weather any field has change or not
                    const idsInCardTobeDelete = cardTobeDelete.map(item => item.id);
                    const updateCardList = oldCardCountList.filter(oldEl => !idsInCardTobeDelete.includes(oldEl['id']))
                    const updatedCard = await updateCardByIdList(costPerCard, locationId, currencyId, updateCardList, t, updateFields);
                    logger.info(`Card decrease update successfully ${JSON.stringify(updatedCard)}`)
                }
            } else {
                // -------- We cannot delete card which is already sole out, since those will lead error with stock mismatch 
                logger.error(`Cannot delete cards which is already sold out ${JSON.stringify(cardTobeDelete)}`)
                throw new Error(`Unable to delete card which already sold out !!!`)
            }
        }
        else { // qty still same, need to check is also the cost has change ?
            const updatedCardForce = await updateCardByIdList(costPerCard, locationId, currencyId, oldCardCountList, t, updateFields);
            logger.info(`receiving same qty update ${JSON.stringify(updatedCardForce)}`)
        }
    }

    if (newRecevingLineList.length > 0) {
        const createdCards = await cardUtility(newRecevingLineList, locationId, currencyId, t, additionalData)
        logger.info(`Create cards successfully count: ${createdCards.length}`)
    }
}

const createAutoHulkStockCard = async (line) => {
    const {
        inputter,
        product_id,
        totalCost,
        stockCardQty,
        productId,
        srcLocationId,
        // New fields
        colorId,
        sizeId,
        serialNo,
        lotNumber,
        expiryDate,
        hasExpiry,
        hasLot
    } = line;

    const costPerUnit = totalCost;
    const lockingSessionId = Date.now();
    logger.info("Product ID ===> " + productId)

    const rowsToInsert = []

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

            // New enhanced fields
            colorId: colorId || null,
            sizeId: sizeId || null,
            serialNo: serialNo ? `${serialNo}_${index + 1}` : null,
            lotNumber: lotNumber || null,
            expiryDate: expiryDate || null,
            hasExpiry: hasExpiry || !!expiryDate,
            hasLot: hasLot || !!lotNumber,
        })
        logger.warn("Row insert productId ===> " + rowsToInsert[0]['productId'])
    }

    try {
        const dbCards = await Card.bulkCreate(rowsToInsert)
        logger.info(`Auto bulk stock cards created successfully: ${dbCards.length}`)
        return dbCards
    } catch (error) {
        logger.error('Error inserting rows:', error)
        throw new Error("Server error " + error)
    }
}

const adjustStockCard = async (productId, stockCount, product_code) => {
    try {
        const currentStock = await Card.count({
            where: { productId, card_isused: 0, saleLineId: null, isActive: true }
        });

        // If the current stock is greater than the desired stock count, delete excess entries
        if (currentStock > stockCount) {
            const excess = currentStock - stockCount;

            await Card.destroy({
                where: { productId, card_isused: 0, isActive: true },
                order: [['id', 'ASC']], // Ensuring older records are deleted first
                limit: excess // Deleting only the excess amount
            });

            logger.info(`Deleted ${excess} excess stock entries for productId ${productId}`);
        } else {
            logger.info(`No adjustment needed for productId ${productId}`);
        }
    } catch (error) {
        logger.error('Error adjusting stock:', error);
        throw error;
    }
};

const adjustStockBulk = async (req, res) => {
    const { inputter, locationId, adjustments } = req.body;

    if (!locationId) {
        return res.status(400).json({ success: false, message: "Location ID is required" });
    }

    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
        return res.status(400).json({ success: false, message: "No adjustments data provided" });
    }

    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();

    try {
        const results = [];

        for (const adj of adjustments) {
            let { productId, pro_id, actualQty } = adj;
            actualQty = parseInt(actualQty);
            if (isNaN(actualQty) || actualQty < 0) {
                results.push({
                    productId,
                    pro_id,
                    success: false,
                    message: "Invalid quantity specified"
                });
                continue;
            }

            // Find product in DB to verify and get cost/currency
            let product = null;
            if (productId) {
                product = await Product.findOne({ where: { id: productId }, transaction });
            } else if (pro_id) {
                product = await Product.findOne({ where: { pro_id: pro_id }, transaction });
            }

            if (!product) {
                results.push({
                    productId,
                    pro_id,
                    success: false,
                    message: "Product not found"
                });
                continue;
            }

            const dbProductId = product.id;
            const dbProductCode = product.pro_id;

            // Get current stock count for this product at this location
            const currentStock = await Card.count({
                where: {
                    productId: dbProductId,
                    locationId: locationId,
                    card_isused: 0,
                    saleLineId: null,
                    isActive: true
                },
                transaction
            });

            const diff = actualQty - currentStock;

            if (diff > 0) {
                // Add diff cards
                const rowsToInsert = [];
                const lockingSessionId = Date.now();
                const cost = product.cost_price || 0;
                // Get currency info
                const Currency = require('../models').currency;
                const currencyId = product.costCurrencyId || 1;
                let exchangeRate = 1;
                if (Currency) {
                    const curr = await Currency.findOne({ where: { id: currencyId }, transaction });
                    if (curr) {
                        exchangeRate = curr.rate || 1;
                    }
                }
                const costLCY = cost * exchangeRate;

                for (let i = 0; i < diff; i++) {
                    const cardSequenceNumber = common.generateLockingSessionId(10);
                    rowsToInsert.push({
                        card_type_code: 10010, // Stock adjustment in
                        product_id: dbProductCode,
                        productId: dbProductId,
                        cost: cost,
                        costLCY: costLCY,
                        card_number: cardSequenceNumber,
                        card_isused: 0,
                        locking_session_id: lockingSessionId,
                        card_input_date: new Date(),
                        inputter: inputter,
                        update_user: inputter,
                        update_time: new Date(),
                        update_time_new: new Date(),
                        isActive: true,
                        currencyId: currencyId,
                        exchangeRate: exchangeRate,
                        locationId: locationId
                    });
                }
                await Card.bulkCreate(rowsToInsert, { transaction });
            } else if (diff < 0) {
                // Remove (deactivate) Math.abs(diff) cards
                const limit = Math.abs(diff);
                const rowsToDelete = await Card.findAll({
                    where: {
                        productId: dbProductId,
                        locationId: locationId,
                        card_isused: 0,
                        saleLineId: null,
                        isActive: true
                    },
                    order: [['createdAt', 'ASC']], // deactivate oldest first
                    limit: limit,
                    transaction
                });

                const idsToDelete = rowsToDelete.map(row => row.id);

                if (idsToDelete.length > 0) {
                    await Card.update({
                        card_isused: 2, // Stock adjustment out (2)
                        isActive: false,
                        update_user: inputter,
                        update_time: new Date()
                    }, {
                        where: {
                            id: {
                                [Op.in]: idsToDelete,
                            },
                        },
                        transaction
                    });
                }
            }

            // Update product counts
            await productService.updateProductCountById(dbProductId);

            results.push({
                productId: dbProductId,
                pro_id: dbProductCode,
                pro_name: product.pro_name,
                previousQty: currentStock,
                actualQty: actualQty,
                adjusted: diff,
                success: true
            });
        }

        // Commit transaction
        await transaction.commit();

        // Also run the global stock value rebuild to be absolutely safe (rebuildStockValue updates product table stock_count)
        const sqlCom = `UPDATE product pro
LEFT JOIN (
    SELECT productId, COUNT(card_number) AS card_count
    FROM card
    WHERE card_isused = 0 
      AND saleLineId IS NULL 
      AND isActive = 1
    GROUP BY productId
) proc ON proc.productId = pro.id
SET pro.stock_count = IFNULL(proc.card_count, 0);`;
        await dbAsync.execute(sqlCom);

        return res.status(200).json({
            success: true,
            message: `Successfully adjusted stock for ${results.filter(r => r.success).length} products`,
            results
        });

    } catch (error) {
        await transaction.rollback();
        logger.error('Error in adjustStockBulk:', error);
        return res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
};

// New utility functions for enhanced features

const findCardsByColorAndSize = async (productId, colorId, sizeId) => {
    try {
        const whereCondition = {
            productId: productId,
            card_isused: 0,
            isActive: true
        };

        if (colorId) whereCondition.colorId = colorId;
        if (sizeId) whereCondition.sizeId = sizeId;

        const cards = await Card.findAll({
            where: whereCondition,
            order: [['createdAt', 'ASC']]
        });

        return cards;
    } catch (error) {
        logger.error('Error finding cards by color and size:', error);
        throw error;
    }
};

const findCardsByLotNumber = async (lotNumber) => {
    try {
        const cards = await Card.findAll({
            where: {
                lotNumber: lotNumber,
                isActive: true
            },
            order: [['createdAt', 'ASC']]
        });

        return cards;
    } catch (error) {
        logger.error('Error finding cards by lot number:', error);
        throw error;
    }
};

const findCardsBySerialNumber = async (serialNo) => {
    try {
        const cards = await Card.findAll({
            where: {
                serialNo: {
                    [Op.like]: `%${serialNo}%`
                },
                isActive: true
            },
            order: [['createdAt', 'ASC']]
        });

        return cards;
    } catch (error) {
        logger.error('Error finding cards by serial number:', error);
        throw error;
    }
};

const getExpiringCards = async (days = 30) => {
    try {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const cards = await Card.findAll({
            where: {
                expiryDate: {
                    [Op.between]: [new Date(), futureDate]
                },
                card_isused: 0,
                isActive: true
            },
            order: [['expiryDate', 'ASC']]
        });

        return cards;
    } catch (error) {
        logger.error('Error finding expiring cards:', error);
        throw error;
    }
};

const getExpiredCards = async () => {
    try {
        const cards = await Card.findAll({
            where: {
                expiryDate: {
                    [Op.lt]: new Date()
                },
                card_isused: 0,
                isActive: true
            },
            order: [['expiryDate', 'ASC']]
        });

        return cards;
    } catch (error) {
        logger.error('Error finding expired cards:', error);
        throw error;
    }
};

module.exports = {
    createHulkStockCard,
    rebuildStockValue,
    createCardFromReceiving,
    findCardsByReceivingLineIdList,
    updateCardByIdList,
    deleteNotUseByIdList,
    cardUtility,
    cardUtilityReceivingLineChangesReflect,
    createAutoHulkStockCard,
    adjustStock,
    adjustStockCard,
    adjustStockBulk,

    // New enhanced functions
    findCardsByColorAndSize,
    findCardsByLotNumber,
    findCardsBySerialNumber,
    getExpiringCards,
    getExpiredCards,
}