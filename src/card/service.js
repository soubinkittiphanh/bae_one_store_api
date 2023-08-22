const logger = require('../api/logger');
const dbAsync = require('../config/dbconAsync');
const Card = require('../models').card
const common = require('../common')

const createHulkStockCard = (req, res) => {

    const { inputter, product_id, totalCost, stockCardQty,productId,srcLocationId } = req.body;
    const costPerUnit = totalCost ;
    const lockingSessionId = Date.now();
    logger.info("Product ID ===> "+productId)
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
        logger.warn("Row insert productId ===> "+rowsToInsert[0]['productId'])
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

module.exports = {
    createHulkStockCard,
    rebuildStockValue,
}