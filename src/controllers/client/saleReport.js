
const dbAsync = require('../../config/dbconAsync');
const interalResponse = require('../../common')
const logger = require('../../api/logger')
const common = require("../../common")
const db = require('../../models');
const { QueryTypes } = require('sequelize');
const topSaleByMonth = async (req, res) => {
    let { month, top } = req.query;
    if (!top) top = 10

    const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
    const sql = `SELECT o.product_id,SUM(o.product_amount) AS sale_count,
    o.product_price,SUM(o.order_price_total) as total_sale,
    o.txn_date,o.record_status, 
    p.companyId,p.pro_name ,p.name, p.pro_category,p.categ_name
    FROM user_order o 
    LEFT JOIN (SELECT p.pro_id,p.companyId,p.pro_name,u.name,p.pro_category,c.categ_name FROM product p 
        LEFT JOIN company u ON u.id = p.companyId
        LEFT JOIN category c on c.categ_id=p.pro_category
        ) p 
    ON p.pro_id = o.product_id 
    WHERE  o.txn_date BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59'
    AND o.record_status = 1
    GROUP BY p.pro_category LIMIT ${top} `
    logger.info(sql)
    try {
        const [rows, fields] = await dbAsync.query(sql);
        res.status(200).send(rows)
    } catch (error) {
        logger.error('Server error with mysql, ' + error)
    }

}
const topSaleMinimartByMonth = async (req, res) => {
    let { month, top } = req.query;
    if (!top) top = 10

    const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
    const sql = `SELECT o.productId, SUM(o.quantity*o.unitRate) AS sale_count, o.price,SUM(o.total-o.discount) as total_sale, 
    o.createdAt,o.isActive, p.companyId,p.pro_name ,p.name, p.pro_category,p.categ_name 
    FROM saleLine o 
    LEFT JOIN (SELECT p.id,p.pro_id,p.companyId,p.pro_name,u.name,p.pro_category,c.categ_name FROM product p 
        LEFT JOIN company u ON u.id = p.companyId LEFT JOIN category c on c.categ_id=p.pro_category ) p ON p.id = o.productId 
        WHERE o.createdAt BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59' AND o.isActive = 1 
        GROUP BY p.pro_category LIMIT ${top} `
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
    const sqlCmd = `SELECT d.*,0 AS cart_total
    FROM dynamic_customer d
    WHERE d.txn_date BETWEEN '${beginningOfMonthString} 00:00:00' AND '${lastDayOfMonthString} 23:59:59' 
    `
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
    let series = [];
    let COD = 0;
    let cancel = 0;
    let allOrder = 0;
    let saleValue = 0;
    let labels = ["All order", "COD", "Sale value", "Cancel/return"]
    rows.forEach(element => {
        if (+element['record_status'] === 1 && !element["payment_status"] && element["payment_code"].includes('COD')) {
            COD++
            allOrder++
            saleValue += element["cart_total"]
        } else if (+element['record_status'] !== 1) {
            cancel++
        } else {
            allOrder++
            saleValue += element["cart_total"]
        }
    })
    // series.concat(allOrder,COD,saleValue,cancel)
    series.push(allOrder)
    series.push(COD)
    series.push(saleValue)
    series.push(cancel)
    return { series, labels };
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
const saleByMainCategory = async (req, res) => {
    let { fromDate, toDate } = req.query
    if (!fromDate || !toDate) {
        const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
        fromDate = beginningOfMonthString
        toDate = lastDayOfMonthString
    }
    const sql = `SELECT 
        mc.id AS mainCategoryId,
        mc.categoryName AS mainCategoryName,
        SUM(sl.quantity * sl.unitRate) AS total_qty,
        SUM(sl.total - sl.discount) AS total_sale
    FROM saleLine sl
    LEFT JOIN product p ON p.id = sl.productId
    LEFT JOIN category c ON c.categ_id = p.pro_category
    LEFT JOIN mainCategory mc ON mc.id = c.mainCategoryId
    WHERE sl.isActive = 1 
    AND sl.createdAt BETWEEN '${fromDate} 00:00:00' AND '${toDate} 23:59:59'
    GROUP BY mc.id`
    logger.info(sql)
    try {
        const [rows, fields] = await dbAsync.query(sql)
        return res.status(200).send(rows)
    } catch (error) {
        logger.error('Server error ' + error)
        return res.status(201).send('Server error ' + error)
    }
}

const dailySaleSummary = async (req, res) => {
    let { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
        const { beginningOfMonthString, lastDayOfMonthString } = common.getBetweenDateInCurrentMonth()
        fromDate = beginningOfMonthString
        toDate = lastDayOfMonthString
    }

    const sql = `
        SELECT 
            sh.bookingDate, 
            c.code AS currencyCode, 
            c.symbol AS currencySymbol,
            pm.payment_name AS paymentType,
            pm.payment_code AS paymentCode,
            SUM(COALESCE(sp.amount, sh.total)) AS totalAmount,
            COUNT(DISTINCT sh.id) AS transactionCount
        FROM saleHeader sh
        LEFT JOIN salePayment sp ON sh.id = sp.saleHeaderId AND sp.isActive = 1
        LEFT JOIN payment pm ON COALESCE(sp.paymentId, sh.paymentId) = pm.id
        LEFT JOIN currency c ON sh.currencyId = c.id
        WHERE sh.isActive = 1 
        AND sh.bookingDate BETWEEN '${fromDate}' AND '${toDate}'
        GROUP BY sh.bookingDate, sh.currencyId, COALESCE(sp.paymentId, sh.paymentId)
        ORDER BY sh.bookingDate DESC, c.code ASC, pm.payment_name ASC
    `;
    
    logger.info(sql)
    try {
        const [rows, fields] = await dbAsync.query(sql);
        res.status(200).send(rows)
    } catch (error) {
        logger.error('Server error with mysql, ' + error)
        res.status(500).send('Server error: ' + error)
    }
}

const backdateStockReport = async (req, res) => {
    let { date, productId } = req.query;
    
    // Parse target date (default to current time)
    const targetDate = date ? new Date(date) : new Date();
    
    if (isNaN(targetDate.getTime())) {
        return res.status(400).json({
            success: false,
            message: "Invalid date format. Please use ISO format or YYYY-MM-DD HH:mm:ss"
        });
    }

    let productCondition = '';
    const replacements = { backdate: targetDate };

    if (productId) {
        productCondition = 'AND p.id = :productId';
        replacements.productId = productId;
    }

    const sql = `
        SELECT 
            p.id AS productId,
            p.pro_id AS productCode,
            p.pro_name AS productName,
            p.stock_count AS currentStock,
            p.pro_price AS retailPrice,
            p.cost_price AS productCostPrice,
            
            -- Stock quantity at backdate
            SUM(
                CASE 
                    -- Rule 1: Card was created at or before the backdate
                    WHEN c.card_input_date <= :backdate
                         AND (
                             -- Rule 2: Card is still available/active
                             (c.card_isused = 0 AND c.isActive = 1)
                             -- Rule 3: Card was deleted/adjusted but AFTER the backdate
                             OR (c.card_isused = 2 AND c.update_time > :backdate)
                             -- Rule 4: Card was sold via saleLine but AFTER the backdate
                             OR (c.saleLineId IS NOT NULL AND sl.createdAt > :backdate)
                             -- Rule 5: Card was sold via ticketLine but AFTER the backdate
                             OR (c.ticketLineId IS NOT NULL AND tl.createdAt > :backdate)
                             -- Rule 6: Card was transferred via transferLine but AFTER the backdate
                             OR (c.transferLineId IS NOT NULL AND tr.createdAt > :backdate)
                         )
                    THEN 1
                    ELSE 0
                END
            ) AS stockAtBackdate,

            -- Total cost value at backdate (sum of individual card costs)
            SUM(
                CASE 
                    WHEN c.card_input_date <= :backdate
                         AND (
                             (c.card_isused = 0 AND c.isActive = 1)
                             OR (c.card_isused = 2 AND c.update_time > :backdate)
                             OR (c.saleLineId IS NOT NULL AND sl.createdAt > :backdate)
                             OR (c.ticketLineId IS NOT NULL AND tl.createdAt > :backdate)
                             OR (c.transferLineId IS NOT NULL AND tr.createdAt > :backdate)
                         )
                    THEN IFNULL(c.cost, 0)
                    ELSE 0
                END
            ) AS costValueAtBackdate,

            -- Total retail value at backdate (quantity * retail price)
            SUM(
                CASE 
                    WHEN c.card_input_date <= :backdate
                         AND (
                             (c.card_isused = 0 AND c.isActive = 1)
                             OR (c.card_isused = 2 AND c.update_time > :backdate)
                             OR (c.saleLineId IS NOT NULL AND sl.createdAt > :backdate)
                             OR (c.ticketLineId IS NOT NULL AND tl.createdAt > :backdate)
                             OR (c.transferLineId IS NOT NULL AND tr.createdAt > :backdate)
                         )
                    THEN 1
                    ELSE 0
                END
            ) * p.pro_price AS retailValueAtBackdate

        FROM product p
        LEFT JOIN card c ON c.productId = p.id
        LEFT JOIN saleLine sl ON sl.id = c.saleLineId
        LEFT JOIN ticketLine tl ON tl.id = c.ticketLineId
        LEFT JOIN transferLine tr ON tr.id = c.transferLineId
        WHERE p.isActive = 1 AND p._category = 'product' ${productCondition}
        GROUP BY p.id
        ORDER BY p.pro_name ASC;
    `;

    try {
        const rows = await db.sequelize.query(sql, {
            replacements,
            type: QueryTypes.SELECT
        });
        
        return res.status(200).json({
            success: true,
            backdate: targetDate.toISOString(),
            data: rows
        });
    } catch (error) {
        logger.error('Error fetching backdate stock report: ' + error);
        return res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

module.exports = {
    topSaleByMonth,
    dailySaleStatistic,
    codAndCash,
    topSaleMinimartByMonth,
    saleByMainCategory,
    dailySaleSummary,
    backdateStockReport
}