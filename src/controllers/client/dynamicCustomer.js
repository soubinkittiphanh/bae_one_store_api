const db = require('../../config/dbcon')
const dbAsync = require('../../config/dbconAsync');


const findDynamicCustomerByBookingDate = async(req,res)=>{
    const {fdate,tdate} = req.query;
    // const sql = `SELECT d.*,SUM(o.order_price_total) AS cart_total,u.name as outlet_name ,o.order_id
    // FROM dynamic_customer d
    // LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
    // LEFT JOIN outlet u on d.shop_name = u.id
    // WHERE d.txn_date BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59' 
    // AND d.record_status = 1
    // AND d.locking_session_id NOT IN(SELECT locking_session_id FROM order_payment)
    // GROUP BY d.locking_session_id
    // `
    const sql = `SELECT d.*,SUM(o.order_price_total) AS cart_total,u.name as outlet_name ,o.order_id,
    r.name as rider,g.abbr as geoname, g.description as geodesc
        FROM dynamic_customer d
        LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
        LEFT JOIN outlet u on d.shop_name = u.id
        LEFT JOIN geography g ON g.id=d.geoId
        LEFT JOIN rider r ON r.id = d.riderId
        WHERE d.txn_date BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59' 
        AND d.locking_session_id NOT IN(SELECT locking_session_id FROM order_payment)
        GROUP BY d.locking_session_id
    `
    console.log( sql);
    let codPaid = [];
    let allOrder = [];
    try {
        let [rows,fields] = await dbAsync.query(sql);
        console.log("Fields",fields.forEach(el=>{
            console.log(el.name);
        }));
        allOrder = rows;
        const sqlCODPaid = `SELECT d.*,SUM(o.order_price_total) AS cart_total,u.name as outlet_name ,o.order_id,
        r.name as rider,g.abbr as geoname, g.description as geodesc
        FROM dynamic_customer d
        LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
        LEFT JOIN outlet u on d.shop_name = u.id
        LEFT JOIN geography g ON g.id=d.geoId
        LEFT JOIN rider r ON r.id = d.riderId
        WHERE d.txn_date BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59' 
        AND d.locking_session_id IN(SELECT locking_session_id FROM order_payment)
        GROUP BY d.locking_session_id`

        let [rows1,fields1] =await dbAsync.query(sqlCODPaid)
        codPaid = rows1;
        const finalOrder = {
            allOrder,
            codPaid,
        }
        console.log(finalOrder);
        res.status(200).send(finalOrder);
        
    } catch (error) {
        res.status(201).send('Server error '+error);
    }

}
const findDynamicCustomerByCODPayment = async(req,res)=>{
    const {fdate,tdate} = req.query;
    const sql = `SELECT d.*,SUM(o.order_price_total) AS cart_total,u.name as outlet_name ,o.order_id,
    r.name as rider,g.abbr as geoname, g.description as geodesc
    FROM dynamic_customer d
    LEFT JOIN user_order o ON o.locking_session_id = d.locking_session_id
    LEFT JOIN outlet u on d.shop_name = u.id
    LEFT JOIN geography g ON g.id=d.geoId
    LEFT JOIN rider r ON r.id = d.riderId
    WHERE d.txn_date BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59' 
    AND d.locking_session_id NOT IN(SELECT locking_session_id FROM order_payment)
    GROUP BY d.locking_session_id
    `
    console.log( sql);
    // const sql = `SELECT  * FROM dynamic_customer WHERE txn_date BETWEEN '${fdate} 00:00:00' AND '${tdate} 23:59:59'`
    try {
        const [row,fields] = await dbAsync.query(sql);
        console.log("Fields",fields.forEach(el=>{
            console.log(el.name);
        }));
        res.status(200).send(row);
        
    } catch (error) {
        res.status(201).send('Server error '+error);
    }

}

module.exports ={
    findDynamicCustomerByBookingDate,
    findDynamicCustomerByCODPayment
}