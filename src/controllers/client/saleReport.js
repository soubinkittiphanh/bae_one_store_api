
const dbAsync = require('../../config/dbconAsync');
const interalResponse = require('../../common')
const logger = require('../../api/logger')
const common = require("../../common")
const topSaleByMonth = async (req, res) => {
    let { month, top } = req.query;
    if (!top) top = 10

    const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
    const sql = `SELECT o.product_id,SUM(o.product_amount) AS sale_count,
    o.product_price,SUM(o.order_price_total) as total_sale,
    o.txn_date,o.record_status, 
    p.outlet,p.pro_name ,p.name 
    FROM user_order o 
    LEFT JOIN (SELECT p.pro_id,p.outlet,p.pro_name,u.name FROM product p LEFT JOIN outlet u ON u.id = p.outlet) p 
    ON p.pro_id = o.product_id 
    WHERE  o.txn_date BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59'
    AND o.record_status = 1
    GROUP BY o.product_id LIMIT ${top} `
    logger.info(sql)
    try {
        const [rows, fields] = await dbAsync.query(sql);
        res.status(200).send(rows)
    } catch (error) {
        logger.error('Server error with mysql, ' + error)
    }

}
const codAndCash = async (req, res) => {
    let { month, top } = req.query;
    if (!top) top = 10
    const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
    const sqlCmd = `SELECT d.*,SUM(o.order_price_total) AS cart_total,
    d.payment_code,
    p.payment_status,
    o.order_id,
    d.record_status
    FROM dynamic_customer d
    LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
    LEFT JOIN order_payment p ON p.locking_session_id = d.locking_session_id
    WHERE d.txn_date BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59' 
    
    GROUP BY d.locking_session_id
    `
    // AND d.record_status = 1

    logger.info(sqlCmd)
    try {
        const [rows, fields] = await dbAsync.query(sqlCmd);
        logger.info('Record count => ' + rows.length)
        // countCOD(rows)
        logger.info("Cal finish")
        res.status(200).send(countCOD(rows))
    } catch (error) {
        logger.error('Server error with mysql, ' + error)
    }

}

const countCOD = (rows) => {
    let series=[];
    let COD = 0;
    let cancel = 0;
    let allOrder = 0;
    let saleValue = 0;
    let labels = ["All order","COD","Sale value","Cancel/return"]
    rows.forEach(element=>{
        if(+element['record_status']===1 && !element["payment_status"] && element["payment_code"].includes('COD')){
            COD++
            allOrder++
            saleValue+=element["cart_total"]
        }else if(+element['record_status']!==1){
            cancel++
        }else{
            allOrder++
            saleValue+=element["cart_total"]
        }
    })
    // series.concat(allOrder,COD,saleValue,cancel)
    series.push(allOrder)
    series.push(COD)
    series.push(saleValue)
    series.push(cancel)
    return {series,labels};
}

const dailySaleStatistic = async (req, res) => {
    const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
    const sql = `SELECT SUM(o.product_amount) AS sale_count,
    SUM(o.order_price_total) as total_sale,
    o.txn_date,
    SUBSTR(o.txn_date, 1, 10) AS txn_date_short
    FROM user_order o 
    WHERE  o.txn_date BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59' 
    AND o.record_status = 1
    GROUP BY txn_date_short`
    logger.info(sql)
    try {
        const [rows, fields] = await dbAsync.query(sql)
        return res.status(200).send(rows)
    } catch (error) {
        logger.error('Server error ' + error)
        return res.status(201).send('Server error ' + error)
    }
}
module.exports = {
    topSaleByMonth,
    dailySaleStatistic,
    codAndCash,
}